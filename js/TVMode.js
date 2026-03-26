import { supabase } from './supabase-client.js';

export class TVMode {
  constructor(board, overlayEl) {
    this.board = board;
    this.overlayEl = overlayEl;
    this.subscription = null;
    this.sessionId = null;
    this._renderCodeEntry();
  }

  _renderCodeEntry() {
    this.overlayEl.innerHTML = `
      <div class="tv-overlay">
        <form class="code-form" id="tv-code-form" autocomplete="off">
          <label class="tv-overlay-label">Enter phone code to connect</label>
          <div class="code-input-row">
            <input
              id="tv-code-input"
              class="tv-code-input"
              type="text"
              maxlength="6"
              placeholder="A3F7K2"
              autocorrect="off"
              autocapitalize="characters"
              spellcheck="false"
            />
            <button type="submit" class="tv-connect-btn">Connect</button>
          </div>
          <p class="tv-error hidden" id="tv-error">Invalid code — try again</p>
        </form>
      </div>
    `;

    const input = this.overlayEl.querySelector('#tv-code-input');
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.overlayEl.querySelector('#tv-error').classList.add('hidden');
    });

    this.overlayEl.querySelector('#tv-code-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.trim();
      if (code.length < 6) return;
      await this._connect(code);
    });
  }

  async _connect(code) {
    const btn = this.overlayEl.querySelector('.tv-connect-btn');
    btn.textContent = 'Connecting…';
    btn.disabled = true;

    const { data, error } = await supabase
      .from('sessions')
      .select()
      .eq('code', code)
      .single();

    if (error || !data) {
      btn.textContent = 'Connect';
      btn.disabled = false;
      this.overlayEl.querySelector('#tv-error').classList.remove('hidden');
      return;
    }

    this.sessionId = data.id;

    // Display current message if there's content
    if (Array.isArray(data.message) && data.message.some(l => l.trim())) {
      this.board.displayMessage(data.message);
    }

    this._renderConnected(code);
    this._subscribe();
  }

  _subscribe() {
    this.subscription = supabase
      .channel(`session-${this.sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${this.sessionId}`,
        },
        (payload) => {
          if (Array.isArray(payload.new?.message)) {
            this.board.displayMessage(payload.new.message);
          }
        }
      )
      .subscribe();
  }

  _renderConnected(code) {
    this.overlayEl.innerHTML = `
      <div class="tv-overlay tv-connected">
        <span class="connected-badge">&#10003; Connected via <strong>${code}</strong></span>
        <button class="tv-disconnect-btn" id="tv-disconnect">Disconnect</button>
      </div>
    `;

    this.overlayEl.querySelector('#tv-disconnect').addEventListener('click', () => {
      this.disconnect();
    });
  }

  disconnect() {
    if (this.subscription) {
      supabase.removeChannel(this.subscription);
      this.subscription = null;
    }
    this.sessionId = null;
    this._renderCodeEntry();
  }
}
