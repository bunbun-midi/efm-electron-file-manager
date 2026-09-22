const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const testRoot = path.join(__dirname, '.electron-test-data', 'features');
app.setPath('userData', path.join(testRoot, 'profile'));
const handlers = new Map();
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, handler) => { handlers.set(name, handler); originalHandle(name, handler); };
require('../main');
const call = (name, ...args) => handlers.get(name)({}, ...args);
const {NativeClipboard}=require('../lib/nativeClipboard');
const clipboardBackup=process.platform==='win32'?new NativeClipboard():null;
app.whenReady().then(async () => {
  try {
    await clipboardBackup?.request({action:'checkpoint'});
    const work = await fs.mkdtemp(path.join(testRoot, 'files-'));
    assert.notEqual(app.getPath('sessionData'), app.getPath('userData'), 'Chromium cache is separate from saved preferences');
    const settingsPath = path.join(work, 'settings.json');
    const oldSaveDialog = dialog.showSaveDialog, oldOpenDialog = dialog.showOpenDialog;
    dialog.showSaveDialog = async () => ({ filePath: settingsPath, canceled: false });
    dialog.showOpenDialog = async () => ({ filePaths: [settingsPath], canceled: false });
    await call('settings:export', { iconSize: 64, windowAppearance: { frame: '#123456' } });
    assert.equal((await call('settings:import')).iconSize, 64);
    dialog.showSaveDialog = oldSaveDialog; dialog.showOpenDialog = oldOpenDialog;
    const desktopItems = await call('shortcuts:list');
    assert.equal(desktopItems.filter(s => s.builtin).length, 5);
    assert.ok(desktopItems.some(s => s.targetPath === 'vdir://favorites_'));
    const customAppearance = { fontSize: 18, backgroundAlpha: 0.4, textColor: '#123456', anchor: 'ne', outside: true };
    await call('shortcuts:appearance', 'builtin-favorite-images', customAppearance);
    assert.equal((await call('shortcuts:list')).find(s => s.id === 'builtin-favorite-images').appearance.fontSize, 18);
    console.log('Settings JSON disk round-trip, four built-in desktop links, appearance persistence, and separate cache path passed.');
    const a = path.join(work, 'a'), b = path.join(work, 'b');
    await fs.mkdir(a); await fs.mkdir(b);
    const file = path.join(a, 'same.txt'), other = path.join(b, 'same.txt');
    await fs.writeFile(file, 'abc'); await fs.writeFile(other, 'other');
    await call('metadata:edit', file, 'bookmarked', true);
    await call('metadata:edit', other, 'bookmarked', true);
    await call('metadata:edit', a, 'bookmarked', true);
    await call('metadata:edit', file, 'note', 'persistent note');
    const digest = await call('metadata:hash', file, 'md5');
    assert.equal(digest.md5, '900150983cd24fb0d6963f7d28e17f72');
    const listing = await call('dir:list', a);
    assert.equal(listing.entries[0].note, 'persistent note');
    assert.equal(listing.entries[0].md5, digest.md5);
    let bookmarks = await call('dir:list', 'vdir://favorites_');
    assert.ok(bookmarks.entries.some(e => e.path === a && e.kind === 'directory'));
    assert.equal(new Set(bookmarks.entries.map(e => e.id)).size, bookmarks.entries.length, 'same-name bookmarks have unique IDs');
    const renamed = await call('file:rename', file, 'renamed.txt');
    bookmarks = await call('dir:list', 'vdir://favorites_');
    assert.ok(bookmarks.entries.some(e => e.path === renamed && e.origName === 'same.txt'));
    const roots = await call('dir:list', 'vdir://');
    assert.ok(roots.entries.some(e => e.path === 'vdir://favorites_'));
    console.log('Main IPC: metadata, hashes, bookmark directory, duplicate names, and rename tracking passed.');
    await fs.mkdir(path.join(a, 'bundle'));
    await fs.writeFile(path.join(a, 'bundle', 'nested.txt'), 'nested');
    await fs.writeFile(path.join(a, 'extra.txt'), 'extra');

    const win = BrowserWindow.getAllWindows()[0];
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    await win.webContents.executeJavaScript(`new Promise(resolve => { const timer = setInterval(() => { if (window.__homeDir) { clearInterval(timer); resolve(); } }, 20); })`);
    await win.webContents.executeJavaScript(`(async () => {
      const manager = WindowSystemMenu.manager;
      const source = manager.open(${JSON.stringify(a)});
      const destination = manager.open(${JSON.stringify(b)});
      await source.navigate(${JSON.stringify(a)}); await destination.navigate(${JSON.stringify(b)});
      source.selection = new Set(source.entries.map(e => e.id));
      manager.focus(source.id);
      document.activeElement?.blur();
      window.__clipboardTest = { manager, source, destination };
    })()`);
    // Let the renderer's keyboard-mode IPC reach main before sending real keys.
    await new Promise(resolve => setTimeout(resolve, 100));
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'C', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'C', modifiers: ['control'] });
    await new Promise(resolve => setTimeout(resolve, 100));
    const clipboard = await win.webContents.executeJavaScript('JSON.stringify(Clipboard.paths)');
    assert.ok(JSON.parse(clipboard).includes(renamed), 'Native menu must not swallow Ctrl+C');
    await win.webContents.executeJavaScript('window.__clipboardTest.manager.focus(window.__clipboardTest.destination.id)');
    await new Promise(resolve => setTimeout(resolve, 100));
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
    for (let i = 0; i < 100; i++) {
      try { await fs.stat(path.join(b, 'renamed.txt')); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await fs.readFile(path.join(b, 'renamed.txt'), 'utf8'), 'abc');
    // Await metadata/timestamp completion as well as file creation.
    for (let i = 0; i < 100; i++) {
      if (!await win.webContents.executeJavaScript('!!Clipboard.pasting')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await fs.readFile(path.join(b, 'bundle', 'nested.txt'), 'utf8'), 'nested');
    assert.equal(await fs.readFile(path.join(b, 'extra.txt'), 'utf8'), 'extra');
    console.log('Real Electron Ctrl+C / Ctrl+V copied multiple files and a folder with its contents.');
    await win.webContents.executeJavaScript(`(async () => {
      const { source, destination } = window.__clipboardTest;
      await FileView.handleDrop(destination, { ctrlKey: false, dataTransfer: {
        getData: () => JSON.stringify({ sourceWindowId: source.id, paths: [${JSON.stringify(path.join(a, 'extra.txt'))}] })
      } });
    })()`);
    await assert.rejects(fs.stat(path.join(a, 'extra.txt')));
    assert.equal(await fs.readFile(path.join(b, 'extra copy 2.txt'), 'utf8'), 'extra');
    console.log('Unmodified drop moved the file through renderer and main IPC without overwriting a collision.');
    if(clipboardBackup){
      const external=path.join(work,'native-copy-folder');await fs.mkdir(external);await fs.writeFile(path.join(external,'nested.txt'),'external');
      await clipboardBackup.request({action:'write',paths:[external],mode:'copy'});
      await win.webContents.executeJavaScript('Clipboard.paste(window.__clipboardTest.destination)');
      assert.equal(await fs.readFile(path.join(b,'native-copy-folder','nested.txt'),'utf8'),'external');
      assert.equal(await fs.readFile(path.join(external,'nested.txt'),'utf8'),'external');
      const cut=path.join(work,'native-cut.txt'),missing=path.join(work,'unavailable.txt');await fs.writeFile(cut,'cut safely');
      await clipboardBackup.request({action:'write',paths:[cut,missing],mode:'cut'});
      await win.webContents.executeJavaScript('Clipboard.paste(window.__clipboardTest.destination)');
      assert.equal(await fs.readFile(path.join(b,'native-cut.txt'),'utf8'),'cut safely');await assert.rejects(fs.stat(cut));
      const remaining=await clipboardBackup.request({action:'read'});assert.deepEqual(remaining.paths,[missing]);assert.equal(remaining.mode,'cut');
      console.log('Native clipboard imports folders, moves successful cut items, and retains failed cut items for retry.');
    }
    const count = await win.webContents.executeJavaScript('WindowSystemMenu.manager.windows.length');
    for (const modifier of ['alt', 'meta']) {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'E', modifiers: [modifier] });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'E', modifiers: [modifier] });
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    const homes = await win.webContents.executeJavaScript('WindowSystemMenu.manager.windows.length');
    assert.equal(homes, count + 2, 'Both Home shortcuts must open new folder windows');
    const helpItem = Menu.getApplicationMenu().items.find(item => item.label === 'Help').submenu.items[0];
    helpItem.click(helpItem, win);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await win.webContents.executeJavaScript('ShortcutsHelp.win?.type'), 'utility');
    assert.equal(await win.webContents.executeJavaScript('document.querySelectorAll(".desktop-shortcut[data-shortcut-id^=builtin-]").length'), 5);
    console.log('Real Alt+E / Command+E Home shortcuts, Help menu, and built-in desktop icon rendering passed.');
    await clipboardBackup?.request({action:'restore'});clipboardBackup?.stop();app.exit(0);
  } catch (error) { console.error(error);await clipboardBackup?.request({action:'restore'}).catch(()=>{});clipboardBackup?.stop();app.exit(1); }
});

