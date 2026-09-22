// Closes the right-click context menu on Escape, independent of window
// focus state (the menu can be open with no window active at all).
function initContextMenuEscape() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ContextMenu.el.classList.contains('hidden')) {
      ContextMenu.hide();
    }
  });
}

function initFloatingToolbar(manager) {
  const toolbar = document.getElementById('floating-toolbar');
  const grip = toolbar.querySelector('.toolbar-grip');
  const label = document.getElementById('toolbar-active-label');
  const btnBack = document.getElementById('btn-back');
  const btnForward = document.getElementById('btn-forward');
  const btnUp = document.getElementById('btn-up');
  const btnToggle = document.getElementById('btn-toggle-view');
  const btnNewFolder = document.getElementById('btn-new-folder');
  const btnNewWindow = document.getElementById('btn-new-window');
  const btnNewTerminal = document.getElementById('btn-new-terminal');

  manager.onChange((active) => {
    const isDirWindow = active && active.type === 'directory';
    label.textContent = active ? (active.type === 'terminal' ? `Terminal \u2014 ${active.shortCwd()}` : active.path) : 'No active window';
    btnBack.disabled = !isDirWindow || active.historyIndex <= 0;
    btnForward.disabled = !isDirWindow || active.historyIndex >= active.history.length - 1;
    btnUp.disabled = !isDirWindow || !active.canGoUp;
    btnToggle.disabled = !isDirWindow;
    btnNewFolder.disabled = !isDirWindow || active.path.startsWith('vdir://');
  });

  btnBack.onclick = () => manager.getActive()?.goBack();
  btnForward.onclick = () => manager.getActive()?.goForward();
  btnUp.onclick = () => manager.getActive()?.goUp();
  btnToggle.onclick = () => manager.getActive()?.toggleView();
  btnNewFolder.onclick = () => manager.getActive()?.newFolderInActive();
  btnNewWindow.onclick = () => manager.open(window.__homeDir || '/');
  btnNewTerminal.onclick = () => manager.openTerminal(window.__homeDir || '/');

  // Floating toolbar is itself draggable around the desktop.
  grip.addEventListener('mousedown', (e) => {
    const rect = toolbar.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    toolbar.style.right = 'auto';
    const onMove = (ev) => {
      toolbar.style.left = `${startLeft + (ev.clientX - startX)}px`;
      toolbar.style.top = `${startTop + (ev.clientY - startY)}px`;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function initKeyboardShortcuts(manager) {
  const syncKeyboardMode = () => {
    const active = document.activeElement;
    const editing = active && (['INPUT', 'TEXTAREA'].includes(active.tagName) || active.isContentEditable);
    const win = manager.getActive();
    window.fm.setFileKeyboardMode?.(!editing && !!win && ['directory', 'search-results'].includes(win.type));
  };
  manager.onChange?.(syncKeyboardMode);
  document.addEventListener('focusin', syncKeyboardMode);
  document.addEventListener('focusout', () => queueMicrotask(syncKeyboardMode));
  syncKeyboardMode();
  document.addEventListener('keydown', async (e) => {
    if (!e.ctrlKey && !e.shiftKey && (e.altKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault(); if (!e.repeat) manager.open(window.__homeDir || await window.fm.getHome()); return;
    }
    const win = manager.getActive();
    if (!win) return;
    if (FolderSearch.shortcut(e, manager)) return;
    if (win.type !== 'directory' && win.type !== 'search-results') return;
    if ((e.ctrlKey && e.key.toLowerCase()==='l') || (e.altKey && e.key.toLowerCase()==='d')) {
      e.preventDefault();win.el.classList.remove('minimized');const location=win.el.querySelector('.fm-location-input');location?.focus();location?.select();return;
    }
    if (e.key === 'Enter' && win.renaming) { e.preventDefault(); return; }
    // Search results are a read-only snapshot, never a destination directory.
    if (win.type === 'search-results' && (['F2', 'Delete', 'Backspace'].includes(e.key) ||
        ((e.ctrlKey || e.metaKey) && ['x', 'v'].includes(e.key.toLowerCase())))) {
      e.preventDefault(); return;
    }
    const active = document.activeElement;
    if (active && (['INPUT', 'TEXTAREA'].includes(active.tagName) || active.isContentEditable)) return;

    if ((e.metaKey || e.ctrlKey) && (e.key === 'Backspace' || e.key === 'Delete')) {
      // Cmd/Ctrl+Delete (Backspace) moves to Trash — matches macOS Finder's
      // actual shortcut. Plain Backspace/Delete are reserved for navigation
      // below, so they never delete anything by accident.
      if (win.selection.size === 0) return;
      e.preventDefault();
      await FileView.trashSelection(win);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      await win.goUp();
    } else if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      if (e.repeat || win.selection.size !== 1) return;
      const entry = win.entries.find((en) => win.selection.has(en.id));
      if (entry) await FileView.showProperties(win, entry);
    } else if (e.key === 'Enter') {
      if (win.selection.size !== 1) return;
      const entry = win.entries.find((en) => en.id === [...win.selection][0]);
      if (entry) FileView.openEntry(win, entry);
    } else if (e.key === 'F2') {
      if (win.selection.size !== 1) return;
      const entry = win.entries.find((en) => en.id === [...win.selection][0]);
      if (entry && FileView.hasNativeProperties(entry)) FileView.startRename(win, entry);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      win.selection = new Set(win.entries.map((en) => en.id));
      FileView.refreshSelectionClasses(win);
      FileView.updateStatus(win);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      if (win.selection.size === 0) return;
      e.preventDefault();
      Clipboard.copy(win);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
      if (win.selection.size === 0) return;
      e.preventDefault();
      Clipboard.cut(win);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      await Clipboard.paste(win);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Three different jobs share the arrow keys, resolved in priority order:
      // Alt/Option+Up always goes up a directory; while an image preview is
      // open, Left/Right step through it; otherwise, in icon view, arrows
      // move the selection to whichever icon is actually nearest on screen.
      if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        await win.goUp();
      } else if (win.preview && !win.preview.isText) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          FileView.stepPreview(win, e.key === 'ArrowRight' ? 1 : -1);
        }
      } else if (win.viewMode === 'icon') {
        e.preventDefault();
        const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
        FileView.moveSelectionInDirection(win, direction);
      }
    } else if ((e.ctrlKey && e.key.toLowerCase() === 'l') || (e.altKey && e.key.toLowerCase() === 'd')) {
      // Focus the active window's location bar — Ctrl+L or Alt/Option+D.
      e.preventDefault();
      win.el.classList.remove('minimized'); // un-shade first, or the field isn't visible to focus
      const input = win.el.querySelector('.fm-location-input');
      if (input) {
        input.focus();
        input.select();
      }
    } else if (e.key === 'Escape') {
      if (win.preview) {
        win.preview = null;
        FileView.render(win);
      }
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !win.preview) {
      // Windows-Explorer-style type-to-select: any other single printable
      // character jumps to the matching item. Deliberately last, so every
      // more specific shortcut above gets first refusal.
      e.preventDefault();
      FileView.typeAheadSelect(win, e.key);
    }
  });
}

// Mouse "side" buttons (Back/Forward, typically buttons 3 and 4) navigate
// the active window's directory history, same as a browser's back/forward.
function initMouseNavigation(manager) {
  document.addEventListener('mouseup', (e) => {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault();
    const win = manager.getActive();
    if (!win || win.type !== 'directory') return;
    if (e.button === 3) win.goBack();
    else win.goForward();
  });
}

async function bootstrap() {
  ContextMenu.init();
  initContextMenuEscape();
  Dialog.init();
  await TerminalSettings.init();

  const manager = new WindowManager();
  let metadataTimer;
  window.fm.onMetadataChanged(() => {
    clearTimeout(metadataTimer);
    metadataTimer = setTimeout(() => FileView.refreshMetadata(manager), 100);
  });
  WindowSystemMenu.init(manager);
  initFloatingToolbar(manager);
  initKeyboardShortcuts(manager);
  initMouseNavigation(manager);

  await AppSettings.init(manager);

  const home = await window.fm.getHome();
  window.__homeDir = home;
  manager.open(home);

  await DesktopShortcuts.init(manager);
  await HtmlBackground.init();
  let historyTimer;window.fm.onHistoryChanged(()=>{clearTimeout(historyTimer);historyTimer=setTimeout(()=>manager.refreshWindowsShowingPath('vdir://history'),150);});

  window.fm.onNewWindowRequest((p) => { if (WindowSystemMenu.operation) WindowSystemMenu.finish(true); WindowSystemMenu.hide(); manager.open(p || home); });
  window.fm.onOpenSettingsRequest(() => AppSettings.open());
  window.fm.onShortcutsRequest(() => ShortcutsHelp.open(manager));
  window.fm.onMediaPlayerRequest(() => MediaPlayer.open(manager));
}

document.addEventListener('DOMContentLoaded', bootstrap);
