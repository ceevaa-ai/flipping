import { supabase } from './supabase-client.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_COLS = 22;
const ROWS = 5;

function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export class PhoneMode {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.code = generateCode();
    this.sessionId = null;
    this._debounceTimer = null;
    this._inputs = [];
  }

  async init() {
    // Try inserting a session; retry on code collision
    let attempts = 0;
    while (attempts < 5) {
      const { data, error } = await supabase
        .from('sessions')
        .insert({ code: this.code, message: Array(ROWS).fill('') })
        .select()
        .single();

      if (!error) {
        this.sessionId = data.id;
        break;
      }

      // Code collision or other error — regenerate and retry
      this.code = generateCode();
      attempts++;
    }

    if (!this.sessionId) {
      this._renderError();
      return;
    }

    this._render();
  }

  async _sendMessage() {
    const lines = this._inputs.map(input => input.value);
    this._setStatus('updating');

    const { error } = await supabase
      .from('sessions')
      .update({ message: lines, updated_at: new Date().toISOString() })
      .eq('id', this.sessionId);

    this._setStatus(error ? 'error' : 'sent');
  }

  _scheduleUpdate() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._sendMessage(), 400);
  }

  _setStatus(state) {
    const el = this.containerEl.querySelector('.phone-status');
    if (!el) return;
    const map = {
      idle:     { text: 'Ready', cls: 'status-idle' },
      updating: { text: 'Updating…', cls: 'status-updating' },
      sent:     { text: 'Display updated', cls: 'status-sent' },
      error:    { text: 'Update failed — check connection', cls: 'status-error' },
    };
    const { text, cls } = map[state] || map.idle;
    el.textContent = text;
    el.className = `phone-status ${cls}`;
  }

  _render() {
    this.containerEl.innerHTML = `
      <div class="phone-ui">
        <button class="back-btn" id="phone-back">&#8592; Back</button>

        <div class="code-section">
          <p class="code-label">Your pairing code</p>
          <div class="code-badge">${this.code}</div>
          <p class="code-hint">Enter this on the TV to connect</p>
        </div>

        <div class="inputs-section">
          <p class="inputs-label">Edit display content</p>
          ${Array.from({ length: ROWS }, (_, i) => `
            <div class="row-input-wrap">
              <label class="row-label">Row ${i + 1}</label>
              <input
                class="row-input"
                type="text"
                maxlength="${MAX_COLS}"
                placeholder="${'·'.repeat(MAX_COLS)}"
                data-row="${i}"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="characters"
                spellcheck="false"
              />
            </div>
          `).join('')}
          <button class="send-btn" id="phone-send">Send to Display</button>
          <div class="phone-status status-idle">Ready</div>
        </div>
      </div>
    `;

    this._inputs = Array.from(this.containerEl.querySelectorAll('.row-input'));

    this._inputs.forEach(input => {
      input.addEventListener('input', () => {
        input.value = input.value.toUpperCase();
        this._scheduleUpdate();
      });
    });

    this.containerEl.querySelector('#phone-send').addEventListener('click', () => {
      clearTimeout(this._debounceTimer);
      this._sendMessage();
    });

    this.containerEl.querySelector('#phone-back').addEventListener('click', () => {
      this.destroy();
      document.getElementById('mode-selector').classList.remove('hidden');
      this.containerEl.classList.add('hidden');
    });
  }

  _renderError() {
    this.containerEl.innerHTML = `
      <div class="phone-ui">
        <p class="error-msg">Could not create a session. Please refresh and try again.</p>
        <button class="back-btn" id="phone-back">&#8592; Back</button>
      </div>
    `;
    this.containerEl.querySelector('#phone-back').addEventListener('click', () => {
      document.getElementById('mode-selector').classList.remove('hidden');
      this.containerEl.classList.add('hidden');
    });
  }

  destroy() {
    clearTimeout(this._debounceTimer);
    if (this.sessionId) {
      // Best-effort cleanup — don't await
      supabase.from('sessions').delete().eq('id', this.sessionId);
    }
  }
}
