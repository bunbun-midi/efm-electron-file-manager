const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validateSettings } = require('../lib/settingsJson');
const { normalizeAppearance } = require('../lib/desktopAppearance');
const { launchSpec, launchShortcut } = require('../lib/shortcutLaunch');

test('settings JSON round-trip and validation', () => {
  const defaults = { iconSize: 30, fontSize: 12, labelBackgroundAlpha: 0.88, desktopImage: null, useNativeIcons: false, desktopColor: '#ffffff' };
  const settings = { ...defaults, windowAppearance: { frame: '#123456', 'border-width': 3 } };
  assert.deepEqual(validateSettings(JSON.parse(JSON.stringify({ format: 'efm-settings', version: 1, settings })), defaults), settings);
  for (const invalid of [{ iconSize: 'huge' }, { iconSize: 5000 }, { desktopColor: 'red' }, { windowAppearance: [] }, { format: 'efm-settings', version: 99 }]) assert.throws(() => validateSettings(invalid, defaults));
  assert.equal(normalizeAppearance({ fontSize: 200, backgroundAlpha: -1, anchor: 'c', outside: true }).fontSize, 96);
  assert.equal(normalizeAppearance({ anchor: 'c', outside: true }).outside, false);
});

test('macOS apps use document opening and shell scripts receive separate arguments', () => {
  assert.deepEqual(launchSpec('/Applications/App.app', ['/tmp/a b'], 'darwin').args, ['-a', '/Applications/App.app', '/tmp/a b']);
  assert.deepEqual(launchSpec('/tmp/script.sh', ['/tmp/$(literal)'], 'darwin').args, ['/tmp/script.sh', '/tmp/$(literal)']);
});

test('Windows batch launch preserves spaces and shell metacharacters in file arguments', { skip: process.platform !== 'win32' }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'efm-drop-'));
  try {
    const logger = path.join(root, 'logger.js'), output = path.join(root, 'output.json');
    const script = path.join(root, 'app %literal% & ! ^.bat');
    const file = path.join(root, 'file %PATH% & ! ^ (test).txt');
    await fs.writeFile(logger, 'require("fs").writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));');
    await fs.writeFile(script, `@"${process.execPath}" "${logger}" %*\r\n`);
    await fs.writeFile(output, ''); await fs.writeFile(file, 'unchanged');
    await launchShortcut(script, [output, file]);
    let result;
    for (let i = 0; i < 60; i++) {
      try { result = JSON.parse(await fs.readFile(output, 'utf8')); break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.deepEqual(result, [file]);
    assert.equal(await fs.readFile(file, 'utf8'), 'unchanged');
  } finally { assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('efm-drop-'));await fs.rm(root, { recursive: true, force: true, maxRetries:10, retryDelay:50 }); }
});
