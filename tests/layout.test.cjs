const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('layout IPC preserves legacy positions and merges concurrent appearance/move patches', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'efm-layout-test-'));
  try {
    await fs.writeFile(path.join(directory, 'icon-layout.json'), JSON.stringify({ folder: { 'old.png': { x: 12, y: 34 } } }));
    const handlers = new Map();
    const main = await fs.readFile(path.join(__dirname, '../main.js'), 'utf8');
    const start = main.indexOf('const layoutFile =');
    const end = main.indexOf('// IPC: open a terminal', start);
    vm.runInNewContext(main.slice(start, end), {
      fs, path, app: { getPath: () => directory },
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    });
    const set = (...args) => handlers.get('layout:set')(null, ...args);
    const get = (...args) => handlers.get('layout:get')(null, ...args);
    await Promise.all([
      set('folder', 'old.png', { size: 120, scaling: 'bilinear' }),
      set('folder', 'old.png', { x: 50, y: 60 }),
      set('folder', 'new.png', { size: 75 }),
    ]);
    const stored = JSON.parse(await fs.readFile(path.join(directory, 'icon-layout.json'), 'utf8'));
    assert.deepEqual(stored.folder['old.png'], { x: 50, y: 60, size: 120, scaling: 'bilinear' });
    assert.deepEqual(stored.folder['new.png'], { size: 75 });
    await set('folder', '__proto__', { size: 80 });
    assert.equal(Object.hasOwn(await get('folder'), '__proto__'), true);
    await set('folder', 'old.png', { size: 100000, scaling: 'invalid', x: NaN });
    const current = (await get('folder'))['old.png'];
    assert.equal(current.size, 3840);
    assert.equal(current.scaling, 'bilinear');
    assert.equal(current.x, 50);
    await set('folder', 'old.png', null);
    assert.equal(Object.hasOwn(await get('folder'), 'old.png'), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
