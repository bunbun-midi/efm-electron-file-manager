// One shared, persisted appearance profile for the app's own chrome —
// distinct from TerminalSettings, which only affects terminal windows.
// Opened via File > Settings… (Cmd/Ctrl+,) in the native menu bar.

const APP_SETTINGS_DEFAULTS = {
  historyExtensions: '',
  iconSize: 30,
  useNativeIcons: false,
  searchHighlightColor: '#00ffff',
  favoriteHighlightColor: '#00ffff',
  showHashCalc: true,
  labelBackgroundColor: '#ffffff',
  labelBackgroundAlpha: 0.88,
  fontSize: 12,
  fontFamily: 'Tahoma, Verdana, "Segoe UI", sans-serif',
  desktopColor: '#0c3a3a',
  desktopImage: null,
  titlebarColor: '#8a8a8a',
};

/** Derives a darker/lighter pair from one color, for the titlebar's bevel gradient. */
function shadeColorPair(hex) {
  const clean = (hex || APP_SETTINGS_DEFAULTS.titlebarColor).replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  const safe = Number.isNaN(num) ? 0x8a8a8a : num;
  const r = (safe >> 16) & 255;
  const g = (safe >> 8) & 255;
  const b = safe & 255;
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const toHex = (rr, gg, bb) =>
    '#' + [rr, gg, bb].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
  return [toHex(r - 22, g - 22, b - 22), toHex(r + 35, g + 35, b + 35)];
}

const AppSettings = {
  current: { ...APP_SETTINGS_DEFAULTS },
  manager: null,
  el: null,

  async init(manager) {
    this.manager = manager;
    try {
      const saved = await window.fm.getAppSettings();
      if (saved) this.current = { ...APP_SETTINGS_DEFAULTS, ...saved };
    } catch {
      /* fall back to defaults */
    }
    this.buildModal();
    this.apply(this.current);
  },

  // Pushes the current settings onto the page: CSS custom properties for
  // the simple cases, direct style writes for the desktop background
  // (which needs different CSS properties depending on color vs. image).
  apply(settings) {
    const root = document.documentElement;
    root.style.setProperty('--icon-size', `${Math.max(16, Math.min(3840, Number(settings.iconSize) || 30))}px`);
    root.style.setProperty('--ui-font-size', `${settings.fontSize}px`);
    root.style.setProperty('--ui-font-family', settings.fontFamily);
    root.style.setProperty('--icon-label-background', this.labelBackground(settings));
    root.style.setProperty('--search-highlight-color', settings.searchHighlightColor || APP_SETTINGS_DEFAULTS.searchHighlightColor);
    root.style.setProperty('--favorite-highlight-color', settings.favoriteHighlightColor || APP_SETTINGS_DEFAULTS.favoriteHighlightColor);
    NativeFileIcons.setEnabled(settings.useNativeIcons === true);

    const [dark, light] = shadeColorPair(settings.titlebarColor);
    root.style.setProperty('--titlebar-color-dark', dark);
    root.style.setProperty('--titlebar-color-light', light);
    WindowAppearance.apply(settings);

    if (settings.desktopImage) {
      document.body.style.backgroundImage = `url("${window.fm.toFileUrl(settings.desktopImage)}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
    } else if (settings.desktopColor && settings.desktopColor !== APP_SETTINGS_DEFAULTS.desktopColor) {
      document.body.style.backgroundImage = 'none';
      document.body.style.background = settings.desktopColor;
    } else {
      // Untouched default: let the original CSS gradient show through
      // rather than flattening it into one solid color.
      document.body.style.backgroundImage = '';
      document.body.style.background = '';
    }
  },

  labelBackground(settings) {
    const color = /^#[0-9a-f]{6}$/i.test(settings.labelBackgroundColor)
      ? settings.labelBackgroundColor : APP_SETTINGS_DEFAULTS.labelBackgroundColor;
    const alpha = Number.isFinite(settings.labelBackgroundAlpha)
      ? Math.max(0, Math.min(1, settings.labelBackgroundAlpha)) : APP_SETTINGS_DEFAULTS.labelBackgroundAlpha;
    const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
    return `rgba(${rgb.join(', ')}, ${alpha})`;
  },

  readLabelSettings() {
    const input = this.el.querySelector('.app-label-opacity');
    return {
      labelBackgroundColor: this.el.querySelector('.app-label-color').value,
      labelBackgroundAlpha: Number.isFinite(input.valueAsNumber)
        ? Math.max(0, Math.min(100, input.valueAsNumber)) / 100 : APP_SETTINGS_DEFAULTS.labelBackgroundAlpha,
    };
  },

  updateLabelPreview() {
    this.el.querySelector('.app-label-preview').style.setProperty('--icon-label-background', this.labelBackground(this.readLabelSettings()));
  },

  buildModal() {
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay hidden';
    this.el.innerHTML = `
      <div class="modal-box app-settings-box">
        <div class="settings-titlebar"><span>Settings</span><button type="button" class="settings-close" aria-label="Close Settings">×</button></div>
        <div class="settings-columns">
        <section class="settings-general" aria-label="General settings">
        <div class="settings-section-heading"><h2>General</h2><button type="button" class="term-reset-btn">Defaults</button></div>
        <label class="term-settings-row">
          <span>Icon size</span>
          <input type="number" class="app-icon-size" min="16" max="3840" step="2" />
        </label>
        <div class="term-settings-row">
          <span>Native size presets</span>
          <div><button class="app-icon-preset" data-size="16" type="button">16 px</button> <button class="app-icon-preset" data-size="32" type="button">32 px</button></div>
        </div>
        <label class="term-settings-row">
          <span>Use file/folder icons</span>
          <input type="checkbox" class="app-native-icons" />
        </label>
        <div class="app-setting-help">Unchecked: color blocks. Uses the custom folder artwork and OS file icons. All available icon sizes are cached together. Minimum size: 16 px.</div>
        <label class="term-settings-row">
          <span>Icon label background</span>
          <input type="color" class="app-label-color" />
        </label>
        <label class="term-settings-row">
          <span>Label opacity (0–100%)</span>
          <input type="number" class="app-label-opacity" min="0" max="100" step="1" />
        </label>
        <div class="app-label-preview"><span class="icon-label-text">Example image.png</span></div>
        <label class="term-settings-row">
          <span>Search highlight color</span>
          <input type="color" class="app-search-highlight-color" />
        </label>
        <label class="term-settings-row">
          <span>Favorite highlight color</span>
          <input type="color" class="app-favorite-highlight-color" />
        </label>
        <label class="term-settings-row">
          <span>Show Hash Calc in Context Menu</span>
          <input type="checkbox" class="app-show-hash-calc" />
        </label>
        <label class="term-settings-row">
          <span>UI font size</span>
          <input type="number" class="app-font-size" min="9" max="20" step="1" />
        </label>
        <label class="term-settings-row">
          <span>UI font</span>
          <input type="text" class="app-font-family" list="app-font-suggestions" spellcheck="false" />
        </label>
        <datalist id="app-font-suggestions">
          <option value='Tahoma, Verdana, "Segoe UI", sans-serif'></option>
          <option value='"Segoe UI", Tahoma, sans-serif'></option>
          <option value='"Helvetica Neue", Helvetica, Arial, sans-serif'></option>
          <option value='"SF Pro Text", -apple-system, sans-serif'></option>
          <option value='Verdana, sans-serif'></option>
          <option value='sans-serif'></option>
        </datalist>
        <label class="term-settings-row">
          <span>Desktop color</span>
          <input type="color" class="app-desktop-color" />
        </label>
        <div class="term-settings-row">
          <span>Background image</span>
          <div class="app-bg-image-controls">
            <button class="app-bg-choose-btn">Choose\u2026</button>
            <button class="app-bg-clear-btn">Clear</button>
          </div>
        </div>
        <div class="app-bg-image-name"></div>
        <label class="term-settings-row"><span>History filetypes</span><input class="app-history-extensions" type="text" placeholder="jpg, png, txt" /></label>
        <div class="app-setting-help">Comma-separated extensions to record when opened, moved or renamed. Blank disables new entries. View: vdir://history.</div>
        </section>
        <section class="settings-appearance" aria-label="Window appearance">
          <div class="settings-section-heading"><h2>Window appearance</h2><button type="button" class="window-defaults-btn">Defaults</button></div>
          <div class="app-setting-help">Live preview. Sizes are in pixels unless marked otherwise.</div>
          <div class="window-settings-fields"></div>
        </section>
        </div>
        <div class="modal-buttons">
          <button class="settings-import-btn">Import JSON</button>
          <button class="settings-export-btn">Export JSON</button>
          <button class="modal-cancel-btn">Cancel</button>
          <button class="modal-ok-btn">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);
    const message = document.createElement('div'); message.className = 'settings-io-message'; message.setAttribute('role', 'status');
    this.el.querySelector('.modal-buttons').before(message);
    this.el.querySelector('.settings-export-btn').onclick = async () => {
      try { if (await window.fm.exportSettings(this.readForm())) message.textContent = 'Settings exported.'; }
      catch (error) { message.textContent = `Export failed: ${error.message}`; }
    };
    this.el.querySelector('.settings-import-btn').onclick = async () => {
      try {
        const imported = await window.fm.importSettings(); if (!imported) return;
        const settings = { ...APP_SETTINGS_DEFAULTS, ...imported };
        this.populateForm(settings); WindowAppearance.apply(settings);
        message.textContent = 'Imported settings loaded. Review them and click Save to apply.';
      } catch (error) { message.textContent = `Import failed: ${error.message}`; }
    };
    WindowAppearance.build(this.el.querySelector('.window-settings-fields'));
    this.el.querySelector('.window-settings-fields').addEventListener('input', () => {
      WindowAppearance.apply({ windowAppearance: WindowAppearance.read(this.el) });
    });
    this.el.querySelector('.window-defaults-btn').onclick = () => {
      const defaults = { windowAppearance: WindowAppearance.defaults() };
      WindowAppearance.populate(this.el, defaults); WindowAppearance.apply(defaults);
    };
    this.el.querySelector('.settings-close').onclick = () => this.close();
    this.wireDragging();

    this._pendingDesktopImage = this.current.desktopImage;

    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });

    this.el.querySelector('.app-bg-choose-btn').onclick = async () => {
      const picked = await window.fm.pickImage();
      if (picked) {
        this._pendingDesktopImage = picked;
        this.updateImageNameLabel();
      }
    };
    this.el.querySelector('.app-bg-clear-btn').onclick = () => {
      this._pendingDesktopImage = null;
      this.updateImageNameLabel();
    };
    this.el.querySelector('.term-reset-btn').onclick = () => this.populateForm(APP_SETTINGS_DEFAULTS, false);
    this.el.querySelectorAll('.app-icon-preset').forEach(button => {
      button.onclick = () => { this.el.querySelector('.app-icon-size').value = button.dataset.size; };
    });
    for (const selector of ['.app-label-color', '.app-label-opacity']) {
      this.el.querySelector(selector).addEventListener('input', () => this.updateLabelPreview());
    }
    this.el.querySelector('.modal-cancel-btn').onclick = () => this.close();
    this.el.querySelector('.modal-ok-btn').onclick = () => this.save();
  },

  updateImageNameLabel() {
    const label = this.el.querySelector('.app-bg-image-name');
    label.textContent = this._pendingDesktopImage ? window.fm.basename(this._pendingDesktopImage) : 'None \u2014 using desktop color';
  },

  populateForm(settings, includeAppearance = true) {
    this.el.querySelector('.app-history-extensions').value=settings.historyExtensions||'';
    if (includeAppearance) WindowAppearance.populate(this.el, settings);
    this.el.querySelector('.app-icon-size').value = settings.iconSize;
    this.el.querySelector('.app-native-icons').checked = settings.useNativeIcons === true;
    this.el.querySelector('.app-show-hash-calc').checked = settings.showHashCalc !== false;
    this.el.querySelector('.app-favorite-highlight-color').value = settings.favoriteHighlightColor || APP_SETTINGS_DEFAULTS.favoriteHighlightColor;
    this.el.querySelector('.app-search-highlight-color').value = settings.searchHighlightColor || APP_SETTINGS_DEFAULTS.searchHighlightColor;
    this.el.querySelector('.app-label-color').value = settings.labelBackgroundColor ?? APP_SETTINGS_DEFAULTS.labelBackgroundColor;
    this.el.querySelector('.app-label-opacity').value = Math.round((settings.labelBackgroundAlpha ?? APP_SETTINGS_DEFAULTS.labelBackgroundAlpha) * 100);
    this.updateLabelPreview();
    this.el.querySelector('.app-font-size').value = settings.fontSize;
    this.el.querySelector('.app-font-family').value = settings.fontFamily;
    this.el.querySelector('.app-desktop-color').value = settings.desktopColor;
    this._pendingDesktopImage = settings.desktopImage;
    this.updateImageNameLabel();
  },

  open() {
    this.populateForm(this.current);
    this.el.classList.remove('hidden');
    this.keepOnScreen();
    this.el.querySelector('.app-icon-size').focus();
  },

  close() {
    this.stopSettingsDrag?.();
    WindowAppearance.apply(this.current);
    this.el.classList.add('hidden');
  },

  keepOnScreen() {
    const box = this.el.querySelector('.app-settings-box');
    if (!box.style.left || this.el.classList.contains('hidden')) return;
    const rect = box.getBoundingClientRect();
    box.style.left = `${Math.max(0, Math.min(innerWidth - rect.width, rect.left))}px`;
    box.style.top = `${Math.max(0, Math.min(innerHeight - rect.height, rect.top))}px`;
  },

  wireDragging() {
    const title = this.el.querySelector('.settings-titlebar');
    const box = this.el.querySelector('.app-settings-box');
    title.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button')) return;
      event.preventDefault();
      this.stopSettingsDrag?.();
      const rect = box.getBoundingClientRect(), x = event.clientX, y = event.clientY;
      try { title.setPointerCapture(event.pointerId); } catch { /* synthetic test input */ }
      const move = e => {
        box.style.left = `${Math.max(0, Math.min(innerWidth - box.offsetWidth, rect.left + e.clientX - x))}px`;
        box.style.top = `${Math.max(0, Math.min(innerHeight - box.offsetHeight, rect.top + e.clientY - y))}px`;
      };
      const finish = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish);
        try { title.releasePointerCapture(event.pointerId); } catch {}
        this.stopSettingsDrag = null;
      };
      this.stopSettingsDrag = finish;
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish); window.addEventListener('blur', finish);
    });
    window.addEventListener('resize', () => this.keepOnScreen());
  },

  readForm() {
    return {
      windowAppearance: WindowAppearance.read(this.el),
      showHashCalc: this.el.querySelector('.app-show-hash-calc').checked,
      favoriteHighlightColor: this.el.querySelector('.app-favorite-highlight-color').value,
      iconSize: Math.max(16, Math.min(3840, parseInt(this.el.querySelector('.app-icon-size').value, 10) || APP_SETTINGS_DEFAULTS.iconSize)),
      ...this.readLabelSettings(),
      useNativeIcons: this.el.querySelector('.app-native-icons').checked,
      historyExtensions:this.el.querySelector('.app-history-extensions').value.trim(),
      searchHighlightColor: this.el.querySelector('.app-search-highlight-color').value,
      fontSize: Math.max(9, Math.min(20, parseInt(this.el.querySelector('.app-font-size').value, 10) || APP_SETTINGS_DEFAULTS.fontSize)),
      fontFamily: this.el.querySelector('.app-font-family').value.trim() || APP_SETTINGS_DEFAULTS.fontFamily,
      titlebarColor: this.current.titlebarColor,
      desktopColor: this.el.querySelector('.app-desktop-color').value,
      desktopImage: this._pendingDesktopImage || null,
    };
  },
  async save() {
    const previousIconSize = this.current.iconSize;
    const next = this.readForm();
    this.current = next;
    this.close();
    this.apply(next);
    try {
      await window.fm.setAppSettings(next);
    } catch {
      /* still applied locally even if persisting failed */
    }
    // Icon size changes the icon-view grid math (computed in fileView.js,
    // not pure CSS), so open directory windows need an actual re-render.
    if (this.manager && next.iconSize !== previousIconSize) this.manager.refreshAllDirectoryWindows();
  },
};
