// FMWindow represents one directory window inside the app's own internal
// "desktop". It is NOT a real OS window — it's a styled, draggable,
// resizable <div>, giving the whole app a Windows-98-like MDI feel while
// staying inside a single Electron BrowserWindow.

class FMWindow {
  constructor(manager, { path: dirPath, x, y, width, height }) {
    this.manager = manager;
    this.id = Utils.uid('win');
    this.path = dirPath;
    this.type = 'directory'; // distinguishes from TerminalWindow in shared manager/toolbar/shortcut code
    this.viewMode = 'icon'; // 'icon' | 'detail'
    this.selection = new Set();
    this.searchHighlights = new Set();
    this.entries = [];
    this.layout = null; // per-directory icon positions, lazy-loaded
    this.sortKey = 'name';
    this.sortDir = 1;
    this.preview = null; // entry currently shown full-viewport (image/text)
    this.canGoUp = false;
    this.maximized = false;
    this.history = []; // visited paths, browser-style back/forward stack
    this.historyIndex = -1;
    this.columnWidths = null; // per-window detail-view column widths, lazy-initialized
    this.typeAheadBuffer = '';
    this.typeAheadLast = 0;
    this.typeAheadCycle = 0;

    this.el = this.buildDom();
    this.setBounds(x, y, width, height);
    this.attachEvents();
    WindowSystemMenu.attach(this);
  }

  buildDom() {
    const win = document.createElement('div');
    win.className = 'fm-window';
    win.innerHTML = `
      <div class="fm-titlebar">
        <span class="fm-title-text">Loading…</span>
        <div class="fm-title-buttons">
          <button class="fm-btn-min" title="Minimize">_</button>
          <button class="fm-btn-max" title="Maximize">▢</button>
          <button class="fm-btn-close" title="Close">✕</button>
        </div>
      </div>
      <div class="fm-locationbar">
        <input class="fm-location-input" type="text" spellcheck="false" />
        <button class="fm-go-btn">Go</button>
        <button class="fm-search-btn" title="Search this folder" aria-label="Search this folder">S</button>
      </div>
      <div class="fm-content"></div>
      <div class="fm-statusbar"></div>
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

  updateTitle() {
    const el = this.el.querySelector('.fm-title-text');
    let label = this.path;
    if (this.path.startsWith('vdir://')) {
      label = this.path === 'vdir://' ? 'Virtual Directories' : this.path.replace('vdir://', '');
    } else {
      const parts = this.path.split(/[\\/]/).filter(Boolean);
      label = parts.length ? parts[parts.length - 1] : this.path;
    }
    el.textContent = label;
  }

  setStatus(text) {
    this.el.querySelector('.fm-statusbar').textContent = text;
  }

  async navigate(dirPath, opts = {}) {
    if(['vdir://metadata','vdir://history'].includes(dirPath)&&this.path!==dirPath)this.viewMode='detail';
    this.searchHighlights.clear();
    this.searchDialog?.cancel();
    const { fromHistory = false } = opts;
    this.setStatus('Loading…');
    const result = await window.fm.listDir(dirPath);
    if (result.error) {
      this.setStatus(`Error: ${result.error}`);
      if(opts.preserveOnError)return;
      this.entries = [];
      this.path = result.path;
    } else {
      this.path = result.path;
      this.entries = result.entries;
      this.canGoUp = result.canGoUp;
    }
    if (!fromHistory) {
      // A fresh navigation (not a Back/Forward replay) records a new stop,
      // browser-tab style — but skip it if we're just refreshing the same
      // directory after a file operation (rename/trash/drop/new folder all
      // call navigate(this.path)), so those don't spam the history stack.
      const last = this.history[this.historyIndex];
      if (last !== this.path) {
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(this.path);
        this.historyIndex = this.history.length - 1;
      }
    }
    this.el.querySelector('.fm-location-input').value = this.displayPath(this.path);
    this.layout = null; // reload layout for the new directory on next icon render
    this.layoutOptionsPath = null;
    this.selection.clear();
    this.preview = null;
    this.updateTitle();
    this.searchDialog?.updateScope();
    await FileView.render(this);
    this.manager.emit();
  }

  // Real directories get a trailing separator in the location bar (matching
  // the current platform: "/" on macOS/Linux, "\" on Windows) so you can
  // start typing a subfolder name right after it without adding one
  // yourself. vdir:// URIs are left alone — they're not filesystem paths.
  displayPath(p) {
    if (!p || p.startsWith('vdir://')) return p;
    const sep = window.fm.pathSep;
    return p.endsWith(sep) ? p : p + sep;
  }

  async goUp() {
    if (!this.canGoUp) return;
    const parent = await window.fm.goUp(this.path);
    if (parent) await this.navigate(parent);
  }

  async goBack() {
    if (this.historyIndex <= 0) return;
    this.historyIndex -= 1;
    await this.navigate(this.history[this.historyIndex], { fromHistory: true });
  }

  async goForward() {
    if (this.historyIndex >= this.history.length - 1) return;
    this.historyIndex += 1;
    await this.navigate(this.history[this.historyIndex], { fromHistory: true });
  }

  async toggleView() {
    this.viewMode = this.viewMode === 'icon' ? 'detail' : 'icon';
    await FileView.render(this);
  }

  async newFolderInActive() {
    if (this.path.startsWith('vdir://')) {
      this.setStatus("Can't create folders inside a virtual directory.");
      return;
    }
    const existing = new Set(this.entries.map((e) => e.name));
    let name = 'New Folder';
    let n = 1;
    while (existing.has(name)) {
      n++;
      name = `New Folder ${n}`;
    }
    try {
      await window.fm.newFolder(this.path, name);
      await this.navigate(this.path);
    } catch (err) {
      this.setStatus(`Couldn't create folder: ${err.message}`);
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
        this.setBounds(
          startLeft + (ev.clientX - startX),
          Math.max(0, startTop + (ev.clientY - startY)),
          this.width,
          this.height
        );
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
        const minWidth = parseFloat(getComputedStyle(this.el).minWidth) || 300;
        const minHeight = parseFloat(getComputedStyle(this.el).minHeight) || 220;
        const onMove = (ev) => {
          let x = startLeft;
          let y = startTop;
          let width = startW;
          let height = startH;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (d.includes('e')) width = Math.max(minWidth, startW + dx);
          if (d.includes('s')) height = Math.max(minHeight, startH + dy);
          if (d.includes('w')) {
            width = Math.max(minWidth, startW - dx);
            x = startLeft + (startW - width);
          }
          if (d.includes('n')) {
            height = Math.max(minHeight, startH - dy);
            y = startTop + (startH - height);
          }
          this.setBounds(x, y, width, height);
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          if (['directory', 'search-results'].includes(this.type)) FileView.render(this);
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
    this.el.querySelector('.fm-search-btn').onclick = () => FolderSearch.open(this);

    this.attachLocationBar();
    this.attachDropTarget();

    this.el.querySelector('.fm-content').addEventListener('contextmenu', (e) => {
      if (e.target.closest('.icon-item, .detail-row')) return;
      e.preventDefault();
      this.manager.focus(this.id);
      ContextMenu.showForEmpty(this, e.clientX, e.clientY);
    });
  }

  attachLocationBar() { LocationBar.attach(this); }

  // Lets real files/folders be dropped onto this window — from another
  // FMWindow, from the OS (Finder/Explorer), or back onto itself to reposition.
  attachDropTarget() {
    const content = this.el.querySelector('.fm-content');
    content.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't let #desktop's Alt+drop shortcut handler also see this
      e.dataTransfer.dropEffect = FileView.dropEffect(e);
      if(![...(e.dataTransfer.types||[])].includes('application/x-fm-paths'))this.setStatus(e.ctrlKey?'Drop to copy files here.':'Drop to move files here; hold Ctrl to copy.');
      content.classList.add('drop-target');
    });
    content.addEventListener('dragleave', (e) => {
      if (!content.contains(e.relatedTarget)) content.classList.remove('drop-target');
    });
    content.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      content.classList.remove('drop-target');
      this.manager.focus(this.id);
      await FileView.handleDrop(this, e);
    });
  }
}

class WindowManager {
  constructor() {
    this.windows = [];
    this.activeId = null;
    this.nextZ = 10;
    this.listeners = [];
  }

  open(dirPath, opts = {}) {
    const offset = (this.windows.length % 8) * 26;
    const win = new FMWindow(this, {
      path: dirPath,
      x: opts.x ?? 60 + offset,
      y: opts.y ?? 50 + offset,
      width: opts.width ?? 640,
      height: opts.height ?? 440,
    });
    this.windows.push(win);
    if(['vdir://metadata','vdir://history'].includes(dirPath))win.viewMode='detail';
    if(dirPath==='vdir://history'){win.sortKey='time';win.sortDir=-1;}
    this.focus(win.id);
    win.navigate(dirPath);
    return win;
  }

  openTerminal(cwd, opts = {}) {
    const offset = (this.windows.length % 8) * 26;
    const win = new TerminalWindow(this, {
      cwd,
      x: opts.x ?? 90 + offset,
      y: opts.y ?? 80 + offset,
      width: opts.width ?? 640,
      height: opts.height ?? 400,
    });
    this.windows.push(win);
    this.focus(win.id);
    win.spawn();
    return win;
  }

  focus(id) {
    this.activeId = id;
    for (const w of this.windows) {
      const isActive = w.id === id;
      w.el.classList.toggle('active', isActive);
      if (isActive) w.el.style.zIndex = ++this.nextZ;
    }
    this.emit();
  }

  close(id) {
    const idx = this.windows.findIndex((w) => w.id === id);
    if (idx === -1) return;
    if (this.windows[idx].beforeClose?.() === false) return;
    if (this.windows[idx].searchDialog) this.close(this.windows[idx].searchDialog.id);
    if (WindowSystemMenu.operation?.win.id === id) WindowSystemMenu.finish(true);
    if (WindowSystemMenu.target?.id === id) WindowSystemMenu.hide();
    this.windows[idx].destroy?.(); // type-specific cleanup (TerminalWindow kills its pty, disposes xterm)
    this.windows[idx].el.remove();
    this.windows.splice(idx, 1);
    if (this.activeId === id) {
      const next = this.windows[this.windows.length - 1];
      this.activeId = next ? next.id : null;
      if (next) this.focus(next.id);
    }
    this.emit();
  }

  getActive() {
    return this.windows.find((w) => w.id === this.activeId) || null;
  }

  // Re-navigates any open window currently showing dirPath, so a move/cut
  // that just emptied it out (from a different window) reflects live. This
  // is a background refresh, not a user navigation, so it doesn't touch
  // that window's own back/forward history.
  refreshWindowsShowingPath(dirPath) {
    for (const w of this.windows) {
      if (w.path === dirPath) w.navigate(dirPath, { fromHistory: true });
    }
  }

  // Re-navigates every open directory window — used after a global setting
  // that affects how entries are displayed (e.g. a per-extension icon
  // color change) rather than one specific directory's contents.
  refreshAllDirectoryWindows() {
    for (const w of this.windows) {
      if (w.type === 'directory') w.navigate(w.path, { fromHistory: true });
    }
  }

  onChange(cb) {
    this.listeners.push(cb);
  }

  emit() {
    this.listeners.forEach((cb) => cb(this.getActive()));
  }
}
