// One shared, persisted appearance profile applied to every open (and
// future) terminal window — font, size, colors, cursor blink. Changing it
// here updates every currently-open terminal immediately.

const TERMINAL_SETTINGS_DEFAULTS = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  foreground: '#f0f0f0',
  background: '#1c1c1c',
  cursorBlink: true,
};

const TerminalSettings = {
  current: { ...TERMINAL_SETTINGS_DEFAULTS },
  el: null,
  listeners: [],

  async init() {
    try {
      const saved = await window.fm.getTerminalSettings();
      if (saved) this.current = { ...TERMINAL_SETTINGS_DEFAULTS, ...saved };
    } catch {
      /* fall back to defaults */
    }
    this.buildModal();
  },

  buildModal() {
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay hidden';
    this.el.innerHTML = `
      <div class="modal-box term-settings-box">
        <div class="modal-title">Terminal Settings</div>
        <label class="term-settings-row">
          <span>Font family</span>
          <input type="text" class="term-font-family" list="term-font-suggestions" spellcheck="false" />
        </label>
        <datalist id="term-font-suggestions">
          <option value='Menlo, Monaco, "Courier New", monospace'></option>
          <option value='Consolas, "Courier New", monospace'></option>
          <option value='"SF Mono", Menlo, monospace'></option>
          <option value='"Cascadia Code", Consolas, monospace'></option>
          <option value='"Courier New", monospace'></option>
          <option value='monospace'></option>
        </datalist>
        <label class="term-settings-row">
          <span>Font size</span>
          <input type="number" class="term-font-size" min="8" max="32" step="1" />
        </label>
        <label class="term-settings-row">
          <span>Text color</span>
          <input type="color" class="term-fg-color" />
        </label>
        <label class="term-settings-row">
          <span>Background</span>
          <input type="color" class="term-bg-color" />
        </label>
        <label class="term-settings-row term-settings-checkbox-row">
          <input type="checkbox" class="term-cursor-blink" />
          <span>Blinking cursor</span>
        </label>
        <div class="modal-buttons">
          <button class="term-reset-btn">Reset to Defaults</button>
          <button class="modal-cancel-btn">Cancel</button>
          <button class="modal-ok-btn">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') this.save();
    });

    this.el.querySelector('.term-reset-btn').onclick = () => this.populateForm(TERMINAL_SETTINGS_DEFAULTS);
    this.el.querySelector('.modal-cancel-btn').onclick = () => this.close();
    this.el.querySelector('.modal-ok-btn').onclick = () => this.save();
  },

  populateForm(settings) {
    this.el.querySelector('.term-font-family').value = settings.fontFamily;
    this.el.querySelector('.term-font-size').value = settings.fontSize;
    this.el.querySelector('.term-fg-color').value = settings.foreground;
    this.el.querySelector('.term-bg-color').value = settings.background;
    this.el.querySelector('.term-cursor-blink').checked = settings.cursorBlink;
  },

  open() {
    this.populateForm(this.current);
    this.el.classList.remove('hidden');
    this.el.querySelector('.term-font-family').focus();
  },

  close() {
    this.el.classList.add('hidden');
  },

  async save() {
    const next = {
      fontFamily: this.el.querySelector('.term-font-family').value.trim() || TERMINAL_SETTINGS_DEFAULTS.fontFamily,
      fontSize: Math.max(8, Math.min(32, parseInt(this.el.querySelector('.term-font-size').value, 10) || TERMINAL_SETTINGS_DEFAULTS.fontSize)),
      foreground: this.el.querySelector('.term-fg-color').value,
      background: this.el.querySelector('.term-bg-color').value,
      cursorBlink: this.el.querySelector('.term-cursor-blink').checked,
    };
    this.current = next;
    this.close();
    try {
      await window.fm.setTerminalSettings(next);
    } catch {
      /* still apply locally even if persisting failed */
    }
    this.listeners.forEach((cb) => cb(this.current));
  },

  onChange(cb) {
    this.listeners.push(cb);
  },

  offChange(cb) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  },
};
