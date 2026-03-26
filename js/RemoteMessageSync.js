export class RemoteMessageSync {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.ws = null;
    this.reconnectTimer = null;
    this.isStopped = false;
  }

  fetchConfig() {
    return this._fetchJson('/api/config');
  }

  fetchMessageState() {
    return this._fetchJson('/api/message');
  }

  connect() {
    if (!this._canUseNetwork() || this.isStopped) {
      return;
    }

    this._clearReconnect();

    this.ws = new WebSocket(this._getWebSocketUrl());
    this.ws.addEventListener('message', (event) => this._handleMessage(event));
    this.ws.addEventListener('close', () => this._scheduleReconnect());
    this.ws.addEventListener('error', () => {
      if (this.ws) {
        this.ws.close();
      }
    });
  }

  stop() {
    this.isStopped = true;
    this._clearReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      if (data && data.type && data.payload) {
        this.onEvent(data);
      }
    } catch {
      // Ignore malformed messages and wait for the next valid update.
    }
  }

  _scheduleReconnect() {
    if (this.isStopped || !this._canUseNetwork()) {
      return;
    }

    this._clearReconnect();
    this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _canUseNetwork() {
    return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  }

  async _fetchJson(path) {
    if (!this._canUseNetwork()) {
      return null;
    }

    try {
      const response = await fetch(path);
      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  _getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
}
