class UtilityWindow extends FMWindow {
  constructor(manager, title, width = 610, height = 560) {
    super(manager, { path: '', x: 80, y: 55, width, height });
    this.type = 'utility'; this.el.classList.add('utility-window');
    this.el.querySelector('.fm-title-text').textContent = title;
    this.content = this.el.querySelector('.fm-content');
    this.content.addEventListener('contextmenu', e => { e.stopImmediatePropagation(); e.preventDefault(); }, true);
    for (const type of ['dragover', 'drop']) this.content.addEventListener(type, e => { e.stopPropagation(); e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'; });
    manager.windows.push(this); manager.focus(this.id);
  }
  attachDropTarget() {}
  navigate() {} goUp() {} goBack() {} goForward() {} toggleView() {}
}

const ShortcutsHelp = {
  open(manager) {
    if (this.win?.el.isConnected) { this.win.el.classList.remove('minimized'); manager.focus(this.win.id); return this.win; }
    const win = this.win = new UtilityWindow(manager, 'Shortcuts', 650, 570);
    win.content.classList.add('shortcuts-help');
    const groups = [
      ['Windows and navigation', [
        ['Alt+E / Command+E', 'Open a new Home window'], ['Ctrl/Command+N', 'Open a new Home window'],
        ['Ctrl/Command+Shift+N', 'Open Virtual Directories'], ['Ctrl/Command+,', 'Open Settings'],
        ['Ctrl+F / Ctrl+E', 'Search the active folder'], ['Ctrl+L / Alt+D', 'Focus the address bar'],
        ['Enter in address bar', 'Open the file/folder, or first matching folder for an incomplete path'], ['Tab / Down; Shift+Tab / Up in address bar', 'Cycle folder suggestions forward/backward'],
        ['Escape in address bar', 'Dismiss suggestions and focus the folder view'],
        ['Backspace / Alt+Up', 'Go to parent folder'], ['Mouse Back / Forward', 'Navigate folder history'],
      ]],
      ['Files, selections, and editing', [
        ['Enter', 'Open the selected item'], ['Alt+Enter', 'Native file/folder Properties'], ['F2', 'Rename the selected item'],
        ['Enter / Escape while renaming', 'Finish / cancel rename; do not open the file'],
        ['Ctrl/Command+A', 'Select all items'], ['Ctrl/Command+C / X / V', 'Copy / cut / paste files and folders'],
        ['Ctrl/Command+Delete or Backspace', 'Move selection to Trash'], ['Ctrl/Command-click / Shift-click', 'Toggle items in the selection'],
        ['Arrow keys in icon view', 'Select the nearest icon in that direction'], ['Type a filename prefix', 'Jump to matching names; repeat a letter to cycle'],
        ['Enter / Escape in # or Note', 'Save / cancel the edit'], ['Ctrl/Command+C / X / V / A in text fields', 'Normal text editing'],
        ['Ctrl/Command+Z; Ctrl+Y or Command+Shift+Z', 'Undo / redo text editing (native Edit menu)'],
      ]],
      ['Icons, images, and dragging', [
        ['Ctrl+mousewheel over an icon', 'Resize it (16–3840 px)'], ['Alt+click an image icon', 'Toggle default/bilinear thumbnail scaling'],
        ['Double-click an image', 'Open the internal viewer (unless a custom Open With association overrides it)'],
        ['Left / Right in image viewer', 'Previous / next image'], ['Mousewheel in image viewer', 'Previous / next image'],
        ['Ctrl/Command+mousewheel in image viewer', 'Zoom the image'], ['Escape in image viewer', 'Close the viewer; keep its source folder'],
        ['Drag between folders', 'Move selected files/folders'], ['Ctrl+drag between folders', 'Copy selected files/folders'],
        ['Drag within the same icon view', 'Reposition icons'], ['Alt+drop on desktop', 'Create desktop shortcuts'],
        ['Drop onto an application/script shortcut', 'Launch it with the dropped paths'], ['Drag empty icon-view space', 'Marquee selection'],
        ['Shift+drag files/folders', 'Native drag to Explorer/Finder; Ctrl requests copy on Windows'],
        ['Ctrl/Command+C / X / V', 'Native file clipboard; Finder uses Command+Option+V to move copied files'],
      ]],
      ['Titlebar menu and geometry', [
        ['Alt+Q; Command+Space on macOS', 'Open the active internal window’s titlebar menu (if the OS delivers the key)'],
        ['R / M / S / N / X / C in titlebar menu', 'Restore / Move / Size / Minimize / Maximize / Close'],
        ['Up / Down; Home / End in titlebar menu', 'Choose a command'], ['Enter / Space', 'Run the chosen titlebar command'],
        ['Arrows during Move', 'Move 8 px; hold Ctrl for 1 px'], ['Arrows during Size', 'Choose an edge/corner, then resize; Ctrl uses 1 px steps'],
        ['Enter / left click during Move or Size', 'Keep the new bounds'], ['Escape / right click during Move or Size', 'Cancel and restore previous bounds'],
        ['Alt+F4', 'Close the active internal window'], ['Double-click titlebar', 'Maximize/restore; a collapsed titlebar restores its viewport'],
        ['Escape', 'Dismiss the current menu/dialog; Settings discards previews'],
      ]],
      ['Desktop label positioning', [['Arrows on the label offset joystick', 'Nudge by 1 px; hold Shift for 0.1 px'], ['Shift while dragging the joystick', 'Extra-fine continuous positioning']]],
      ['Media Player', [['Z / X / C / V / B / N / M', 'Previous / next / stop / play-pause / record / reverse / loop; active player only'], ['Enter / double-click a playlist item', 'Play selected track'], ['Delete in playlist', 'Remove selected track from the playlist only'], ['Drag / Ctrl+drag playlist items', 'Reorder / duplicate playlist entries'], ['Up / Down on display resize border', 'Resize the LCD display by 5 px']]],
      ['Terminal', [['Terminal keyboard input', 'Keys go to the shell: e.g. Ctrl+C interrupts, Ctrl+D sends EOF; behavior depends on the shell. Global Home/titlebar shortcuts still apply.']]],
    ];
    for (const [title, rows] of groups) {
      const heading = document.createElement('h3'); heading.textContent = title; win.content.appendChild(heading);
      const table = document.createElement('table');
      for (const row of rows) { const tr = document.createElement('tr'); for (const text of row) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); } table.appendChild(tr); }
      win.content.appendChild(table);
    }
    win.setStatus('Nonmodal reference — keep working in other windows. Alt+Space is reserved for the OS.');
    return win;
  },
};
