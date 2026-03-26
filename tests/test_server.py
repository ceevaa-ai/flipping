import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from aiohttp.test_utils import AioHTTPTestCase

from server import DISPLAY_CONFIG_KEY, create_app


class FlipOffServerTests(AioHTTPTestCase):
    async def get_application(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = Path(self.temp_dir.name) / 'flipoff.config.json'
        self.messages_path = Path(self.temp_dir.name) / 'flipoff.messages.json'
        return create_app(
            admin_password='secret-password',
            config_path=self.config_path,
            messages_path=self.messages_path,
        )

    def tearDown(self):
        super().tearDown()
        self.temp_dir.cleanup()

    async def authenticate(self):
        response = await self.client.post(
            '/api/admin/session',
            json={'password': 'secret-password'},
        )
        self.assertEqual(response.status, 200)

    async def test_get_public_config_returns_defaults(self):
        response = await self.client.get('/api/config')
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(payload['cols'], 18)
        self.assertEqual(payload['rows'], 5)
        self.assertEqual(payload['apiMessageDurationSeconds'], 30)
        self.assertGreater(len(payload['defaultMessages']), 0)

    async def test_get_message_returns_default_state(self):
        response = await self.client.get('/api/message')
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(
            payload,
            {
                'hasOverride': False,
                'lines': ['', '', '', '', ''],
                'updatedAt': None,
            },
        )

    async def test_post_message_wraps_and_centers_single_string(self):
        response = await self.client.post(
            '/api/message',
            json={'message': 'hello from the backend api'},
        )
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertTrue(payload['hasOverride'])
        self.assertEqual(
            payload['lines'],
            ['', 'HELLO FROM THE', 'BACKEND API', '', ''],
        )
        self.assertIsNotNone(payload['updatedAt'])

    async def test_post_lines_pads_to_full_board_height(self):
        response = await self.client.post(
            '/api/message',
            json={'lines': ['hello world', 'remote mode']},
        )
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(
            payload['lines'],
            ['HELLO WORLD', 'REMOTE MODE', '', '', ''],
        )

    async def test_post_rejects_overlong_lines(self):
        response = await self.client.post(
            '/api/message',
            json={'lines': ['X' * 19]},
        )
        self.assertEqual(response.status, 400)

        payload = await response.json()
        self.assertEqual(payload['error'], 'Line 1 exceeds 18 characters.')

    async def test_post_rejects_message_that_cannot_fit(self):
        response = await self.client.post(
            '/api/message',
            json={
                'message': (
                    'alpha bravo charlie delta echo foxtrot golf hotel india juliet '
                    'kilo lima mike november oscar papa quebec romeo sierra tango '
                    'uniform victor whiskey xray yankee zulu'
                )
            },
        )
        self.assertEqual(response.status, 400)

        payload = await response.json()
        self.assertEqual(
            payload['error'],
            "'message' must fit within 5 lines of 18 characters.",
        )

    async def test_api_message_expires_back_to_default_rotation(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/config',
            json={
                'cols': 18,
                'rows': 5,
                'apiMessageDurationSeconds': 1,
                'defaultMessages': [['', 'HELLO', '', '', '']],
            },
        )
        self.assertEqual(response.status, 200)

        post_response = await self.client.post('/api/message', json={'lines': ['timed override']})
        self.assertEqual(post_response.status, 200)

        await asyncio.sleep(1.2)
        current_state = await self.client.get('/api/message')
        payload = await current_state.json()
        self.assertFalse(payload['hasOverride'])
        self.assertEqual(payload['lines'], ['', '', '', '', ''])

    async def test_admin_config_requires_authentication(self):
        response = await self.client.get('/api/admin/config')
        self.assertEqual(response.status, 401)

    async def test_admin_config_update_changes_public_config(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/config',
            json={
                'cols': 16,
                'rows': 4,
                'apiMessageDurationSeconds': 45,
                'defaultMessages': [
                    ['welcome home', 'simon'],
                    ['server room', 'all green'],
                ],
            },
        )
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(payload['cols'], 16)
        self.assertEqual(payload['rows'], 4)
        self.assertEqual(payload['apiMessageDurationSeconds'], 45)
        self.assertEqual(payload['defaultMessages'][0], ['WELCOME HOME', 'SIMON', '', ''])

        public_config = await self.client.get('/api/config')
        public_payload = await public_config.json()
        self.assertEqual(public_payload['cols'], 16)
        self.assertEqual(public_payload['rows'], 4)

    async def test_admin_config_update_persists_messages_to_dedicated_file(self):
        await self.authenticate()
        response = await self.client.put(
            '/api/admin/config',
            json={
                'cols': 18,
                'rows': 5,
                'apiMessageDurationSeconds': 30,
                'defaultMessages': [
                    ['welcome home', 'simon'],
                    ['maintenance', 'window'],
                ],
            },
        )
        self.assertEqual(response.status, 200)
        self.assertTrue(self.messages_path.exists())
        self.assertEqual(
            json.loads(self.messages_path.read_text(encoding='utf-8')),
            [
                ['WELCOME HOME', 'SIMON'],
                ['MAINTENANCE', 'WINDOW'],
            ],
        )

        reloaded_app = create_app(
            admin_password='secret-password',
            config_path=self.config_path,
            messages_path=self.messages_path,
        )
        self.assertEqual(
            reloaded_app[DISPLAY_CONFIG_KEY].default_messages,
            [
                ['WELCOME HOME', 'SIMON', '', '', ''],
                ['MAINTENANCE', 'WINDOW', '', '', ''],
            ],
        )

    async def test_delete_message_clears_override(self):
        await self.client.post('/api/message', json={'lines': ['remote message']})

        response = await self.client.delete('/api/message')
        self.assertEqual(response.status, 200)

        payload = await response.json()
        self.assertEqual(
            payload,
            {
                'hasOverride': False,
                'lines': ['', '', '', '', ''],
                'updatedAt': None,
            },
        )

    async def test_websocket_receives_config_message_and_clear_events(self):
        ws = await self.client.ws_connect('/ws')

        config_event = await ws.receive_json()
        self.assertEqual(config_event['type'], 'config_state')
        self.assertEqual(config_event['payload']['cols'], 18)

        initial_message_event = await ws.receive_json()
        self.assertEqual(initial_message_event['type'], 'message_state')
        self.assertFalse(initial_message_event['payload']['hasOverride'])

        create_response = await self.client.post(
            '/api/message',
            json={'lines': ['live update']},
        )
        self.assertEqual(create_response.status, 200)

        created_event = await ws.receive_json()
        self.assertTrue(created_event['payload']['hasOverride'])
        self.assertEqual(
            created_event['payload']['lines'],
            ['LIVE UPDATE', '', '', '', ''],
        )

        clear_response = await self.client.delete('/api/message')
        self.assertEqual(clear_response.status, 200)

        cleared_event = await ws.receive_json()
        self.assertFalse(cleared_event['payload']['hasOverride'])
        self.assertEqual(cleared_event['payload']['lines'], ['', '', '', '', ''])

        await self.authenticate()
        await self.client.put(
            '/api/admin/config',
            json={
                'cols': 12,
                'rows': 3,
                'apiMessageDurationSeconds': 20,
                'defaultMessages': [['hello', 'world']],
            },
        )

        updated_config_event = await ws.receive_json()
        self.assertEqual(updated_config_event['type'], 'config_state')
        self.assertEqual(updated_config_event['payload']['cols'], 12)

        await ws.close()


if __name__ == '__main__':
    unittest.main()
