// Desktop shortcuts live directly on #desktop (the app's own background
// area, not any FMWindow), created by holding Alt/Option while dropping a
// file there. They're lightweight references — removing one never touches
// the real file — and persist across restarts via the main process.

const DesktopShortcuts = {
  assetBase: new URL('assets/', document.currentScript.src).href,
  manager: null,
  items: [],

  async init(manager) {
    this.manager = manager;
    try {
      this.items = await window.fm.listShortcuts();
    } catch {
      this.items = [];
    }
    this.appearances = await window.fm.getLayout('desktop://shortcuts').catch(() => ({}));
    this.items.forEach((s) => this.renderOne(s));
    this.wireDesktopDrop();
    this.wireDesktopContextMenu();
  },

  renderOne(shortcut, desktop = document.getElementById('desktop'), preview = false) {
    const el = document.createElement('div');
    el.className = 'icon-item desktop-shortcut';
    el.dataset.shortcutId = shortcut.id;
    el.style.left = `${shortcut.x}px`;
    el.style.top = `${shortcut.y}px`;
    el.innerHTML = `
      <div class="icon-square" style="background:${shortcut.color}"></div>
      <div class="icon-label"><span class="icon-label-text"></span></div>
    `;
    el.querySelector('.icon-label-text').textContent = shortcut.appearance?.displayName || shortcut.name;
    desktop.appendChild(el);

    const appearance = preview ? { size: 64 } : this.appearances[shortcut.id] || (shortcut.builtin ? { size: 48 } : {});
    if (!preview) this.appearances[shortcut.id] = appearance;
    const iconImage = shortcut.appearance?.iconImage || (shortcut.builtin ? `${this.assetBase}${shortcut.builtin}.svg` : null);
    IconAppearance.attach(el, iconImage ? { ...shortcut, kind: 'image', dataUrl: iconImage } : shortcut, appearance, (patch) => {
      if (preview) return;
      window.fm.setLayoutPos('desktop://shortcuts', shortcut.id, patch).catch(() => {
        el.title = 'Could not save icon appearance.';
      });
    });
    if (typeof DesktopIconAppearance !== 'undefined') el._disposeLabel = DesktopIconAppearance.apply(el, shortcut.appearance);
    if (preview) { el.style.pointerEvents = 'none'; return el; }

    el.addEventListener('dblclick', () => this.open(shortcut));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ContextMenu.showAt(
        [
          { label: 'Open', action: () => this.open(shortcut) },
          { label: 'Appearance', action: () => DesktopIconAppearance.open(shortcut) },
          ...(!shortcut.builtin ? [
          { label: 'Reveal in Finder', action: () => window.fm.showInFolder(shortcut.targetPath) },
          { label: 'Properties', action: async () => {
            try { await window.fm.showFileProperties(shortcut.targetPath); }
            catch (error) { await Dialog.alertText({ title: 'Properties', message: error.message }); }
          } },
          { separator: true },
          { label: 'Remove Shortcut', action: () => this.remove(shortcut.id) },
          ] : []),
        ],
        e.clientX,
        e.clientY
      );
    });
    this.wireDrag(el, shortcut);
    this.wireApplicationDrop(el, shortcut);
    if(shortcut.builtin==='background')HtmlBackground.decorate(el,shortcut);
    return el;
  },

  async open(shortcut) {
    try {
      if (shortcut.builtin === 'trash') await window.fm.openTrash();
      else if(shortcut.builtin==='background')return;
      else if (shortcut.builtin === 'media') MediaPlayer.open(this.manager);
      else if(shortcut.kind==='image'){
        const entry=await window.fm.statEntry(shortcut.targetPath),directory=window.fm.dirname(shortcut.targetPath),listing=await window.fm.listDir(directory);
        await FileView.openEntry({manager:this.manager,path:directory,entries:listing.entries||[entry],setStatus:message=>Dialog.alertText({title:'Image',message})},entry);
      }
      else if (shortcut.kind === 'directory' && !/\.app$/i.test(shortcut.targetPath)) this.manager.open(shortcut.targetPath);
      else { const error = await window.fm.openFile(shortcut.targetPath); if (error) throw new Error(error); }
    } catch (error) { await Dialog.alertText({ title: 'Could not open shortcut', message: error.message }); }
  },

  refresh(shortcut) {
    const previous = document.querySelector(`.desktop-shortcut[data-shortcut-id="${CSS.escape(shortcut.id)}"]`);
    previous?._disposeLabel?.(); previous?.remove(); return this.renderOne(shortcut);
  },

  canLaunch(shortcut) {
    if (shortcut.builtin) return false;
    return /\.(exe|com|bat|cmd|ps1|app|sh|bash|zsh|command)$/i.test(shortcut.targetPath) ||
      (window.fm.platform !== 'win32' && shortcut.kind !== 'directory' && !/\.[^/]+$/.test(shortcut.targetPath));
  },
  wireApplicationDrop(el, shortcut) {
    if (!this.canLaunch(shortcut)) return;
    el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('application-drop-target'); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('application-drop-target'); });
    el.addEventListener('drop', async e => {
      e.preventDefault(); e.stopPropagation(); el.classList.remove('application-drop-target');
      let paths = [];
      try { paths = JSON.parse(e.dataTransfer.getData('application/x-fm-paths')).paths || []; } catch {}
      if (!paths.length) paths = [...(e.dataTransfer.files || [])].map(file => file.path).filter(Boolean);
      if (!paths.length) return;
      try { await window.fm.launchShortcut(shortcut.targetPath, paths); }
      catch (error) { await Dialog.alertText({ title: 'Could not launch shortcut', message: error.message }); }
    });
  },

  async remove(id) {
    try {
      await window.fm.removeShortcut(id);
    } catch {
      /* non-fatal */
    }
    this.items = this.items.filter((s) => s.id !== id);
    const el = document.querySelector(`.desktop-shortcut[data-shortcut-id="${CSS.escape(id)}"]`);
    if (el) { el._disposeLabel?.(); el.remove(); }
  },

  // Shared by drag-drop, the path-prompt dialog, and the "Create Desktop
  // Shortcut" context-menu item — takes an already-resolved entry (from
  // statEntry) and a desktop-relative position, and does the rest.
  async addShortcutFor(entry, x, y) {
    const shortcut = {
      id: Utils.uid('shortcut'),
      name: entry.name,
      targetPath: entry.path,
      kind: entry.kind,
      color: entry.color,
      x: Math.max(0, x),
      y: Math.max(0, y),
    };
    await window.fm.addShortcut(shortcut);
    this.items.push(shortcut);
    this.renderOne(shortcut);
    return shortcut;
  },

  /** Strips a single matching pair of surrounding "" or '' quotes, e.g. from a
   * copied Windows path like "C:\Users\Name\Documents" — leaves internal
   * whitespace/quotes alone, and leaves mismatched or unquoted input as-is. */
  stripQuotes(str) {
    if (str.length >= 2) {
      const first = str[0];
      const last = str[str.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return str.slice(1, -1).trim();
      }
    }
    return str;
  },

  // Right-click empty desktop background -> "Create Shortcut..." -> a path
  // prompt (handles a pasted path with or without surrounding quotes).
  async createViaDialog(clientX, clientY) {
    const raw = await Dialog.promptText({
      title: 'Create Shortcut',
      placeholder: 'Paste or type a file or folder path\u2026',
    });
    if (raw === null) return; // cancelled
    const cleaned = this.stripQuotes(raw.trim());
    if (!cleaned) return;

    try {
      const entry = await window.fm.statEntry(cleaned);
      const desktop = document.getElementById('desktop');
      const rect = desktop.getBoundingClientRect();
      await this.addShortcutFor(entry, clientX - rect.left - 25, clientY - rect.top - 20);
    } catch (err) {
      await Dialog.alertText({
        title: 'Couldn\u2019t Create Shortcut',
        message: `"${cleaned}" isn't a file or folder Claude can find:\n${err.message}`,
      });
    }
  },

  // Right-click a file/folder icon in any window -> "Create Desktop
  // Shortcut" — the path's already known, so no prompt needed.
  async createForEntry(entry) {
    const desktop = document.getElementById('desktop');
    const rect = desktop.getBoundingClientRect();
    const cascade = (this.items.length % 6) * 22;
    try {
      await this.addShortcutFor(entry, rect.width / 2 - 25 + cascade, rect.height / 2 - 20 + cascade);
    } catch (err) {
      await Dialog.alertText({ title: 'Couldn\u2019t Create Shortcut', message: err.message });
    }
  },

  // Right-click the bare desktop background itself (not a window, not an
  // existing shortcut — those have their own context menus that stop here).
  wireDesktopContextMenu() {
    const desktop = document.getElementById('desktop');
    desktop.addEventListener('contextmenu', (e) => {
      if (e.target !== desktop) return;
      e.preventDefault();
      ContextMenu.showAt(
        [
          { label: 'New Terminal', action: () => this.manager.openTerminal(window.__homeDir) },
          { label: 'Create Shortcut\u2026', action: () => this.createViaDialog(e.clientX, e.clientY) },
        ],
        e.clientX,
        e.clientY
      );
    });
  },

  // Same lightweight mousedown-drag pattern the icon view uses, kept
  // independent since shortcuts live outside any window's icon canvas.
  wireDrag(el, shortcut) {
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      let moved = false;
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = parseInt(el.style.left, 10);
      const origTop = parseInt(el.style.top, 10);

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        if (!moved) return;
        el.style.left = `${Math.max(0, origLeft + dx)}px`;
        el.style.top = `${Math.max(0, origTop + dy)}px`;
      };
      const onUp = async () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!moved) return;
        const pos = { x: parseInt(el.style.left, 10), y: parseInt(el.style.top, 10) };
        el._lastDrag=Date.now();if(shortcut.builtin==='background'){localStorage.setItem('efm-background-moved','true');HtmlBackground.position();pos.x=parseInt(el.style.left,10);pos.y=parseInt(el.style.top,10);}
        shortcut.x = pos.x;
        shortcut.y = pos.y;
        try {
          await window.fm.setShortcutPos(shortcut.id, pos);
        } catch {
          /* non-fatal */
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  },

  // Only Alt/Option+drop onto the bare desktop background creates a
  // shortcut. Drops that land on an FMWindow are handled (and stopped from
  // bubbling here) by that window's own drop target — see attachDropTarget
  // in windowManager.js.
  wireDesktopDrop() {
    const desktop = document.getElementById('desktop');

    desktop.addEventListener('dragover', (e) => {
      if (!e.altKey) return;
      e.preventDefault();
      desktop.classList.add('desktop-drop-target');
    });
    desktop.addEventListener('dragleave', (e) => {
      if (!desktop.contains(e.relatedTarget)) desktop.classList.remove('desktop-drop-target');
    });
    desktop.addEventListener('drop', async (e) => {
      desktop.classList.remove('desktop-drop-target');
      if (!e.altKey) return;
      e.preventDefault();

      let paths = [];
      const internalRaw = e.dataTransfer.getData('application/x-fm-paths');
      if (internalRaw) {
        try {
          paths = JSON.parse(internalRaw).paths || [];
        } catch {
          /* ignore malformed payload */
        }
      }
      if (paths.length === 0) {
        paths = [...(e.dataTransfer.files || [])].map((f) => f.path).filter(Boolean);
      }
      if (paths.length === 0) return;

      const desktopRect = desktop.getBoundingClientRect();
      for (const [i, filePath] of paths.entries()) {
        try {
          const entry = await window.fm.statEntry(filePath);
          await this.addShortcutFor(
            entry,
            e.clientX - desktopRect.left - 25 + i * 20,
            e.clientY - desktopRect.top - 20 + i * 20
          );
        } catch (err) {
          console.error('Could not create a shortcut for', filePath, err);
        }
      }
    });
  },
};
