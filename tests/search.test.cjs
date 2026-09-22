const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchDirectory } = require('../lib/searchDirectory');
const entry = (name, parent, kind = 'file') => ({ name, id: `${parent}/${name}`, path: `${parent}/${name}`, kind });
const tree = {
  '/root': [entry('Photo.JPG', '/root'), entry('child', '/root', 'directory'), entry('denied', '/root', 'directory')],
  '/root/child': [entry('another-photo.png', '/root/child'), entry('notes.txt', '/root/child')],
};
const list = async path => { if (!tree[path]) throw new Error('denied'); return { path, entries: tree[path] }; };
test('progress publishes partial matches before traversal completes and supports cancellation', async()=>{
  const controller=new AbortController();let progress;
  await assert.rejects(searchDirectory({root:'/root',query:'photo',recursive:true,signal:controller.signal,onProgress:value=>{progress=value;controller.abort();}},list));
  assert.equal(progress.scanned,1);assert.equal(progress.pending,2);assert.equal(progress.entries.length,1);
});
test('filename substring search is case insensitive and shallow by default', async () => {
  const result = await searchDirectory({ root: '/root', query: 'PHOTO' }, list);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].parentDirectory, '/root');
});
test('recursive search includes descendants, parent paths and permission reporting', async () => {
  const result = await searchDirectory({ root: '/root', query: 'photo', recursive: true }, list);
  assert.deepEqual(result.entries.map(e => e.parentDirectory), ['/root', '/root/child']);
  assert.equal(result.skipped, 1);
});
test('cancellation, empty queries, root errors and result limits', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchDirectory({ root: '/root', query: 'a', signal: controller.signal }, list));
  await assert.rejects(searchDirectory({ root: '/root', query: ' ' }, list));
  await assert.rejects(searchDirectory({ root: '/missing', query: 'a' }, list));
  const limited = await searchDirectory({ root: '/root', query: 'photo', recursive: true, maxResults: 1 }, list);
  assert.equal(limited.entries.length, 1); assert.equal(limited.truncated, true);
});
test('virtual traversal revisits no directory twice', async () => {
  let count = 0;
  const result = await searchDirectory({ root: 'vdir://test', query: 'test', recursive: true }, async path => {
    count++;
    return { path, entries: [{ name: 'test', path, id: path, kind: 'directory' }] };
  });
  assert.equal(count, 1); assert.equal(result.entries.length, 1);
});
