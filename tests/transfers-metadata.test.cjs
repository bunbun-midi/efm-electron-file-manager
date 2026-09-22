const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { EntryMetadata } = require('../lib/entryMetadata');
const { FileTransfers } = require('../lib/fileTransfers');

test('copies/moves folders recursively, preserves dates and metadata, and tracks rename history', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'efm-transfers-'));
  try {
    const source = path.join(root, 'source'), destination = path.join(root, 'destination');
    await fs.mkdir(path.join(source, 'nested'), { recursive: true }); await fs.mkdir(destination);
    const file = path.join(source, 'nested', 'a.txt');
    await fs.writeFile(file, 'hash fixture');
    const storeFile = () => path.join(root, 'metadata.json');
    const metadata = new EntryMetadata(storeFile);
    const transfers = new FileTransfers(metadata);
    await metadata.edit(file, 'note', 'remember me');
    await metadata.edit(file, 'order', 'A10');
    await metadata.edit(file, 'bookmarked', true);
    const date = Date.UTC(2001, 1, 3);
    await metadata.patch(file, { created: date });
    await Promise.all(['md5', 'sha256', 'sha512'].map(a => metadata.hash(file, a)));
    for (const algorithm of ['md5', 'sha256', 'sha512']) assert.equal((await metadata.get(file))[algorithm], createHash(algorithm).update('hash fixture').digest('hex'));
    const copied = await transfers.transfer(source, destination, true);
    assert.deepEqual(copied.warnings, []);
    const copiedFile = path.join(copied.path, 'nested', 'a.txt');
    assert.equal(await fs.readFile(copiedFile, 'utf8'), 'hash fixture');
    assert.equal((await metadata.get(copiedFile)).created, date);
    assert.equal((await metadata.get(copiedFile)).note, 'remember me');
    assert.equal((await metadata.get(copiedFile)).bookmarked, false);
    if (process.platform === 'win32') assert.ok(Math.abs((await fs.stat(copiedFile)).birthtimeMs - date) < 2, 'Windows native creation date restored');
    const renamed = await transfers.rename(file, 'b.txt');
    const renamedAgain = await transfers.rename(renamed, 'c.txt');
    const record = await metadata.get(renamedAgain);
    assert.equal(record.prevName, 'b.txt'); assert.equal(record.origName, 'a.txt');
    assert.equal(record.bookmarked, true);
    const moved = await transfers.transfer(source, destination, false);
    assert.notEqual(moved.path, copied.path, 'collision creates a unique destination');
    const movedFile = path.join(moved.path, 'nested', 'c.txt');
    assert.equal((await new EntryMetadata(storeFile).get(movedFile)).origName, 'a.txt');
    assert.equal((await metadata.get(movedFile)).bookmarked, true);
    await assert.rejects(fs.stat(source));
    await assert.rejects(transfers.transfer(destination, path.join(destination, 'source'), true), /into itself/);
    await fs.writeFile(movedFile, 'changed bytes');
    assert.equal((await metadata.get(movedFile, await fs.stat(movedFile))).md5, '', 'changed files hide outdated hashes');
    await assert.rejects(transfers.rename(movedFile, '../escape.txt'), /filename/);
    await assert.rejects(metadata.edit(movedFile, 'order', 'A!'), /letters/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('cross-volume fallback copies before removing its source and keeps annotations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'efm-cross-volume-'));
  const originalRename = fs.rename;
  try {
    const source = path.join(root, 'source.txt'), destination = path.join(root, 'dest');
    await fs.mkdir(destination); await fs.writeFile(source, 'cross volume');
    const metadata = new EntryMetadata(() => path.join(root, 'meta.json'));
    await metadata.edit(source, 'note', 'cross-volume note');
    fs.rename = async (from, to) => {
      if (from === source) throw Object.assign(new Error('cross volume'), { code: 'EXDEV' });
      return originalRename(from, to);
    };
    const moved = await new FileTransfers(metadata, async () => []).transfer(source, destination, false);
    assert.equal(await fs.readFile(moved.path, 'utf8'), 'cross volume');
    assert.equal((await metadata.get(moved.path)).note, 'cross-volume note');
    await assert.rejects(fs.stat(source));
  } finally { fs.rename = originalRename; await fs.rm(root, { recursive: true, force: true }); }
});
