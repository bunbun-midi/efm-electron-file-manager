// Run with Electron: electron tests/icon-appearance.cjs
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { getFileIconFamily } = require('../lib/fileIcons');
const { stopIconWorker } = require('../lib/platformIconImages');
app.setPath('userData', path.join(__dirname, '.electron-test-data'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1000, height: 800,
    webPreferences: { backgroundThrottling: false } });
  try {
    await win.loadFile(path.join(__dirname, 'icon-appearance.html'));
    const result = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'icon-appearance.browser.js'), 'utf8'));
    console.log(JSON.stringify(result, null, 2));
    const menuResult = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'window-menu.browser.js'), 'utf8'));
    console.log(JSON.stringify(menuResult, null, 2));
    const searchResult = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'folder-search.browser.js'), 'utf8'));
    console.log(JSON.stringify(searchResult, null, 2));
    const detailResult = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'detail-view.browser.js'), 'utf8'));
    console.log(JSON.stringify(detailResult, null, 2));
    const metadataResult = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'metadata.browser.js'), 'utf8'));
    console.log(JSON.stringify(metadataResult, null, 2));
    const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
    await win.webContents.executeJavaScript(renderer.slice(renderer.indexOf('function initKeyboardShortcuts('), renderer.indexOf('// Mouse "side" buttons')));
    const propertiesResult = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'file-properties.browser.js'), 'utf8'));
    console.log(JSON.stringify(propertiesResult.results, null, 2));
    win.focus(); win.webContents.focus();
    for (const clickCount of [1, 2]) {
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', x: propertiesResult.x, y: propertiesResult.y, clickCount });
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', x: propertiesResult.x, y: propertiesResult.y, clickCount });
    }
    const imageOpened = await win.webContents.executeJavaScript(`new Promise(resolve => setTimeout(() => resolve(Boolean(!window.__imageClickTest.win.preview && window.__imageClickTest.manager.windows.some(w=>w.type==='image-viewer'&&w.preview?.id==='real'))), 100))`);
    if (!imageOpened) throw new Error('Browser mouse double-click failed to open internal image viewer');
    console.log('Browser mouse double-click opens internal image viewer');
    await win.webContents.executeJavaScript('window.__imageClickTest.manager.close(window.__imageClickTest.win.id); delete window.__imageClickTest;');
    const nativeFamily = await getFileIconFamily(app, process.execPath);
    if (!nativeFamily.length) throw new Error('Native OS icon extraction failed');
    console.log('Native icon sizes:', nativeFamily.map(icon => icon.width).join(', '));
    if (process.platform === 'win32' && !nativeFamily.some(icon => icon.width >= 256)) throw new Error('Windows high-resolution icon extraction failed');
    await win.webContents.executeJavaScript(`window.__nativeTestFamily = ${JSON.stringify(nativeFamily)}; window.__nativeTestPath = ${JSON.stringify(process.execPath)}; window.__nativePlatform = ${JSON.stringify(process.platform)};`);
    const nativeResult = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'native-icons.browser.js'), 'utf8'));
    console.log(JSON.stringify(nativeResult, null, 2));
    const settingsResult = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'settings-appearance.browser.js'), 'utf8'));
    console.log(JSON.stringify(settingsResult, null, 2));
    const desktopResult = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'desktop-features.browser.js'), 'utf8'));
    console.log(JSON.stringify(desktopResult, null, 2));
    console.log(await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'layout-options.browser.js'),'utf8')));
    await win.webContents.executeJavaScript('AppSettings.open()');
    win.setContentSize(640, 520);
    await new Promise(resolve => setTimeout(resolve, 150));
    const compactLayout = await win.webContents.executeJavaScript(`(() => {
      const first = AppSettings.el.querySelector('.settings-general').getBoundingClientRect();
      const second = AppSettings.el.querySelector('.settings-appearance').getBoundingClientRect();
      const footer = AppSettings.el.querySelector('.modal-buttons').getBoundingClientRect();
      return first.left >= 0 && first.width > 150 && second.width > 200 && second.right <= innerWidth && footer.bottom <= innerHeight;
    })()`);
    if (!compactLayout) throw new Error('Settings columns or footer are clipped at 640 × 520');
    console.log('Both Settings columns and Save/Cancel remain visible at 640 × 520.');
    win.setContentSize(1000, 800);
    await new Promise(resolve => setTimeout(resolve, 100));
    if (process.env.ICON_TEST_SCREENSHOT) {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(__dirname, 'icon-appearance.png'), image.toPNG());
    }
    if (process.env.DESKTOP_TEST_SCREENSHOT) {
      await win.webContents.executeJavaScript(`AppSettings.close(); DesktopIconAppearance.open({ id: 'visual-preview', name: 'Favorite images', targetPath: 'vdir://favorites', builtin: 'images', kind: 'directory', color: '#e4bb42' }); void 0;`);
      await new Promise(resolve => setTimeout(resolve, 200));
      fs.writeFileSync(path.join(__dirname, 'desktop-appearance.png'), (await win.webContents.capturePage()).toPNG());
    }
    stopIconWorker(); app.exit(0);
  } catch (error) {
    console.error(error);
    stopIconWorker(); app.exit(1);
  }
});
