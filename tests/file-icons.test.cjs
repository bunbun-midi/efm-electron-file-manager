const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { getFileIcon, getFileIconFamily } = require('../lib/fileIcons');
test('native icon requests use requested size and an appropriate high-DPI representation', async () => {
  let requested, exported;
  const app = { getFileIcon: async (file, options) => {
    requested = { file, ...options };
    return { isEmpty: () => false, getScaleFactors: () => [1, 2], toDataURL: options => { exported = options; return 'data:image/png;base64,test'; } };
  } };
  const file = path.resolve(__filename);
  assert.match(await getFileIcon(app, file, { size: 'small', scaleFactor: 1.25 }), /^data:image/);
  assert.equal(requested.size, 'small');
  assert.equal(exported.scaleFactor, 2);
  await getFileIcon(app, file, { size: 'normal', scaleFactor: 1 });
  assert.equal(requested.size, 'normal'); assert.equal(exported.scaleFactor, 1);
});
test('native icon failures and synthetic paths safely return a colored fallback', async () => {
  const broken = { getFileIcon: async () => { throw new Error('Unavailable'); } };
  assert.equal(await getFileIcon(broken, path.resolve(__filename)), null);
  assert.equal(await getFileIcon(broken, 'vdir://synthetic'), null);
  assert.equal(await getFileIcon({ getFileIcon: async () => ({ isEmpty: () => true }) }, path.resolve(__filename)), null);
});
test('a complete resolution family is prefetched and shared across size changes', async () => {
  let requests = 0, shellCalls = 0;
  const encoded = size => {
    const png = Buffer.alloc(24); png.writeUInt32BE(size, 16); png.writeUInt32BE(size, 20);
    return 'data:image/png;base64,' + png.toString('base64');
  };
  const app = { getFileIcon: async (_, { size }) => {
    requests++;
    const pixels = size === 'small' ? 16 : size === 'normal' ? 32 : 48;
    return { isEmpty: () => false, getScaleFactors: () => [1, 2], toDataURL: ({ scaleFactor }) => encoded(pixels * scaleFactor) };
  } };
  const reader = async () => { shellCalls++; return [{ width: 256, height: 256, dataUrl: encoded(256) }]; };
  const file = path.resolve('family-test.txt');
  const first = await getFileIconFamily(app, file, 1, reader);
  assert(first.some(icon => icon.width === 16)); assert(first.some(icon => icon.width === 256));
  const count = requests;
  const second = await getFileIconFamily(app, file, 1, reader);
  assert.equal(requests, count); assert.equal(shellCalls, 1); assert.strictEqual(first, second);
  await getFileIconFamily(app, file, 2, reader);
  assert(requests > count); assert.equal(shellCalls, 2);
});
