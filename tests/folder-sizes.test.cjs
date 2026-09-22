const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { calculateFolderSize, FolderSizeStore } = require('../lib/folderSizes');

test('recursive totals include hidden files, persist, and can be refreshed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'efm-size-'));
  try {
    const folder = path.join(root, 'folder');
    await fs.mkdir(path.join(folder, 'nested'), { recursive: true });
    await fs.writeFile(path.join(folder, '.hidden'), '123');
    await fs.writeFile(path.join(folder, 'nested', 'file'), '1234567');
    const filename = () => path.join(root, 'cache.json');
    const store = new FolderSizeStore(filename);
    const [first, duplicate] = await Promise.all([store.calculate(folder), store.calculate(folder)]);
    assert.deepEqual(first, duplicate);
    assert.equal(first.bytes, 10);
    assert.equal(first.files, 2);
    assert.equal(first.skipped, 0);
    assert.deepEqual(await new FolderSizeStore(filename).get(folder), first);
    await fs.writeFile(path.join(folder, 'nested', 'file'), '1');
    assert.equal((await store.get(folder)).bytes, 10);
    assert.equal((await store.calculate(folder)).bytes, 4);
    await assert.rejects(store.calculate(path.join(root, 'missing')));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('unreadable children are partial and directory links are not traversed', async () => {
  const root = path.resolve('fixture');
  const io = {
    readdir: async () => ['good', 'denied', 'loop'],
    lstat: async name => {
      if (path.basename(name) === 'denied') throw new Error('Access denied');
      return { isDirectory: () => name === root, isFile: () => path.basename(name) === 'good', isSymbolicLink: () => path.basename(name) === 'loop', size: 12 };
    },
  };
  const result = await calculateFolderSize(root, io);
  assert.equal(result.bytes, 12);
  assert.equal(result.skipped, 1);
  assert.equal(result.links, 1);
});

test('concurrent different folders keep both persisted totals', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'efm-sizes-'));
  try {
    const a = path.join(root, 'a'), b = path.join(root, 'b');
    await fs.mkdir(a); await fs.mkdir(b);
    const filename = () => path.join(root, 'cache.json');
    const store = new FolderSizeStore(filename);
    await Promise.all([store.calculate(a), store.calculate(b)]);
    const reopened = new FolderSizeStore(filename);
    assert.equal((await reopened.get(a)).bytes, 0);
    assert.equal((await reopened.get(b)).bytes, 0);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
