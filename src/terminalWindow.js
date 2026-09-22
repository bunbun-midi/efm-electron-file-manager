// A terminal window is a sibling to FMWindow in the same WindowManager
// (same focus/z-index/teal-highlight system), but hosts a real xterm.js
// terminal wired to a node-pty pseudo-terminal in the main process,
// instead of a directory listing. See main.js's terminal:* IPC handlers
// for the other half of this.

// Routes terminal:data / terminal:exit events (tagged by pty id) to
// whichever TerminalWindow owns that id. Wired once, lazily, since the
// preload API isn't needed until the first terminal actually opens.
const terminalDispatch = new Map(); // ptyId -> { onData, onExit }
let terminalDispatcherWired = false;
function ensureTerminalDispatcherWired() {
  if (terminalDispatcherWired) return;
  terminalDispatcherWired = true;
  window.fm.onTerminalData((id, data) => terminalDispatch.get(id)?.onData(data));
  window.fm.onTerminalExit((id, exitCode, signal) => terminalDispatch.get(id)?.onExit(exitCode, signal));
}

class TerminalWindow {
  constructor(manager, { cwd, x, y, width, height }) {
    ensureTerminalDispatcherWired();
    this.manager = manager;
    this.id = Utils.uid('term-win');
    this.type = 'terminal'; // lets shared code (toolbar, shortcuts) tell this apart from FMWindow
    this.cwd = cwd;
    this.ptyId = null;
    this.term = null;
    this.fitAddon = null;
    this.resizeObserver = null;
    this.maximized = false;

    this.el = this.buildDom();
    this.setBounds(x, y, width, height);
    this.attachEvents();
    WindowSystemMenu.attach(this);

    this._onSettingsChange = (settings) => this.applySettings(settings);
    TerminalSettings.onChange(this._onSettingsChange);
  }

  buildDom() {
    const win = document.createElement('div');
    win.className = 'fm-window terminal-window';
    win.innerHTML = `
      <div class="fm-titlebar">
        <span class="fm-title-text">Terminal</span>
        <div class="fm-title-buttons">
          <button class="fm-btn-min" title="Minimize">_</button>
          <button class="fm-btn-max" title="Maximize">▢</button>
          <button class="fm-btn-close" title="Close">✕</button>
        </div>
      </div>
      <div class="terminal-toolbar">
        <button class="term-settings-btn" title="Font and color settings">⚙ Settings</button>
        <button class="term-clear-btn" title="Clear the screen">Clear</button>
        <span class="term-status"></span>
      </div>
      <div class="terminal-surface"></div>
      <div class="resize-handle n"></div><div class="resize-handle s"></div>
      <div class="resize-handle e"></div><div class="resize-handle w"></div>
      <div class="resize-handle ne"></div><div class="resize-handle nw"></div>
      <div class="resize-handle se"></div><div class="resize-handle sw"></div>
    `;
    document.getElementById('desktop').appendChild(win);
    return win;
  }

  setBounds(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.width = `${width}px`;
    this.el.style.height = `${height}px`;
  }

  setStatus(text) {
    const el = this.el.querySelector('.term-status');
    if (el) el.textContent = text;
  }

  shortCwd() {
    if (!this.cwd || this.cwd.startsWith('vdir://')) return '~';
    const parts = this.cwd.split(/[\\/]/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : this.cwd;
  }

  escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async spawn() {
    this.setStatus('Starting\u2026');
    let result;
    try {
      result = await window.fm.spawnTerminal(this.cwd);
    } catch (err) {
      this.setStatus('');
      const surface = this.el.querySelector('.terminal-surface');
      surface.innerHTML = `<div class="terminal-error">${this.escapeHtml(err.message)}</div>`;
      return;
    }
    this.ptyId = result.id;
    this.el.querySelector('.fm-title-text').textContent = `Terminal \u2014 ${this.shortCwd()}`;
    this.setStatus((result.shell || '').split(/[\\/]/).pop());

    const settings = TerminalSettings.current;
    this.term = new Terminal({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      theme: { foreground: settings.foreground, background: settings.background },
      cursorBlink: settings.cursorBlink,
      scrollback: 5000,
      allowProposedApi: true,
    });
    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);

    const surface = this.el.querySelector('.terminal-surface');
    this.term.open(surface);
    this.fitAddon.fit();
    window.fm.resizeTerminal(this.ptyId, this.term.cols, this.term.rows);

    // Keystrokes/paste typed into xterm.js go straight to the pty's stdin.
    this.term.onData((data) => window.fm.writeTerminal(this.ptyId, data));

    // Copy-on-select and right-click-to-paste — standard terminal conveniences.
    this.term.onSelectionChange(() => {
      const sel = this.term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    });
    surface.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text && this.ptyId) window.fm.writeTerminal(this.ptyId, text);
      } catch {
        /* clipboard read denied or empty; ignore */
      }
    });

    terminalDispatch.set(this.ptyId, {
      onData: (data) => this.term && this.term.write(data),
      onExit: (exitCode, signal) => this.handleExit(exitCode, signal),
    });

    // Keeps the pty's dimensions in sync with the window's actual on-screen
    // size, regardless of why it changed (drag-resize, maximize, restore).
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.term || !this.fitAddon) return;
      this.fitAddon.fit();
      if (this.ptyId) window.fm.resizeTerminal(this.ptyId, this.term.cols, this.term.rows);
    });
    this.resizeObserver.observe(surface);

    this.term.focus();
  }

  handleExit(exitCode) {
    if (this.term) {
      this.term.write(`\r\n\x1b[90m[Process exited${exitCode != null ? ' with code ' + exitCode : ''}]\x1b[0m\r\n`);
    }
    this.setStatus('exited');
    const titleEl = this.el.querySelector('.fm-title-text');
    if (titleEl) titleEl.textContent = `Terminal \u2014 ${this.shortCwd()} (exited)`;
    this.ptyId = null; // further input has nowhere to go; writeTerminal on a dead id is already a safe no-op
  }

  applySettings(settings) {
    if (!this.term) return;
    this.term.options.fontFamily = settings.fontFamily;
    this.term.options.fontSize = settings.fontSize;
    this.term.options.theme = { foreground: settings.foreground, background: settings.background };
    this.term.options.cursorBlink = settings.cursorBlink;
    if (this.fitAddon) {
      this.fitAddon.fit();
      if (this.ptyId) window.fm.resizeTerminal(this.ptyId, this.term.cols, this.term.rows);
    }
  }

  toggleMaximize() {
    if (this.maximized && !this.el.classList.contains('minimized')) WindowSystemMenu.restore(this);
    else WindowSystemMenu.maximize(this);
  }

  toggleMinimize() {
    this.el.classList.toggle('minimized');
  }

  attachTitlebarDrag() {
    const titlebar = this.el.querySelector('.fm-titlebar');
    titlebar.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('.fm-title-buttons, .fm-system-button')) return;
      this.manager.focus(this.id);
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = this.x;
      const startTop = this.y;
      const onMove = (ev) => {
        this.setBounds(startLeft + (ev.clientX - startX), Math.max(0, startTop + (ev.clientY - startY)), this.width, this.height);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.fm-title-buttons, .fm-system-button')) return;
      if (this.el.classList.contains('minimized')) this.toggleMinimize();
      else this.toggleMaximize();
    });
  }

  attachResize() {
    const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    for (const d of dirs) {
      const handle = this.el.querySelector('.resize-handle.' + d);
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.manager.focus(this.id);
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = this.x;
        const startTop = this.y;
        const startW = this.width;
        const startH = this.height;
        const onMove = (ev) => {
          let x = startLeft;
          let y = startTop;
          let width = startW;
          let height = startH;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (d.includes('e')) width = Math.max(320, startW + dx);
          if (d.includes('s')) height = Math.max(180, startH + dy);
          if (d.includes('w')) {
            width = Math.max(320, startW - dx);
            x = startLeft + (startW - width);
          }
          if (d.includes('n')) {
            height = Math.max(180, startH - dy);
            y = startTop + (startH - height);
          }
          this.setBounds(x, y, width, height);
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }
  }

  attachEvents() {
    this.attachTitlebarDrag();
    this.attachResize();
    this.el.addEventListener('mousedown', () => this.manager.focus(this.id));
    this.el.querySelector('.fm-btn-close').onclick = () => this.manager.close(this.id);
    this.el.querySelector('.fm-btn-max').onclick = () => this.toggleMaximize();
    this.el.querySelector('.fm-btn-min').onclick = () => this.toggleMinimize();
    this.el.querySelector('.term-settings-btn').onclick = () => TerminalSettings.open();
    this.el.querySelector('.term-clear-btn').onclick = () => this.term && this.term.clear();
  }

  // Called by WindowManager.close() before it removes the DOM element.
  destroy() {
    if (this.ptyId) {
      window.fm.killTerminal(this.ptyId);
      terminalDispatch.delete(this.ptyId);
    }
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.term) this.term.dispose();
    TerminalSettings.offChange(this._onSettingsChange);
  }
}
