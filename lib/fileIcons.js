const path = require('node:path');
const { platformIconImages } = require('./platformIconImages');
const families = new Map();
let cacheBytes = 0;

async function getFileIcon(app, filePath, options = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return null;
  const requested = ['small', 'normal', 'large'].includes(options.size) ? options.size : 'normal';
  const size = process.platform === 'darwin' && requested === 'large' ? 'normal' : requested;
  try {
    const icon = await app.getFileIcon(filePath, { size });
    if (icon.isEmpty()) return null;
    const wantedScale = Number.isFinite(options.scaleFactor) ? Math.max(1, Math.min(4, options.scaleFactor)) : 1;
    const scales = icon.getScaleFactors().sort((a, b) => a - b);
    const scaleFactor = scales.find(scale => scale >= wantedScale) || scales.at(-1) || 1;
    return icon.toDataURL({ scaleFactor });
  } catch {
    return null; // Keep the colored fallback for missing files or unavailable icons.
  }
}

async function getFileIconFamily(app, filePath, revision = 0, platformReader = platformIconImages) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return [];
  const key = JSON.stringify([filePath, revision]);
  const cached = families.get(key);
  if (cached) { families.delete(key); families.set(key, cached); return cached.promise; }
  const record = { bytes: 0, promise: null };
  record.promise = (async () => {
    const variants = new Map();
    const add = item => {
      if (item.width > 0 && item.height > 0 && item.width <= 2048 && item.height <= 2048 &&
          item.dataUrl?.startsWith('data:image/png;base64,')) {
        const dimensions = `${item.width}x${item.height}`;
        if (!variants.has(dimensions)) variants.set(dimensions, item);
      }
    };
    // Export every scale representation from every size offered by Electron.
    const sizes = process.platform === 'darwin' ? ['small', 'normal'] : ['small', 'normal', 'large'];
    await Promise.all(sizes.map(async size => {
      try {
        const image = await app.getFileIcon(filePath, { size });
        if (image.isEmpty()) return;
        for (const scaleFactor of image.getScaleFactors()) {
          const dataUrl = image.toDataURL({ scaleFactor });
          const png = Buffer.from(dataUrl.split(',')[1], 'base64');
          if (png.length >= 24) add({ width: png.readUInt32BE(16), height: png.readUInt32BE(20), dataUrl });
        }
      } catch { /* other sizes/platform extraction may still work */ }
    }));
    try { for (const item of await platformReader(filePath)) add(item); } catch { /* Electron fallback remains available */ }
    return [...variants.values()].sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height));
  })();
  families.set(key, record);
  const result = await record.promise;
  if (families.get(key) === record) {
    if (!result.length) families.delete(key);
    else {
      record.bytes = result.reduce((sum, item) => sum + item.dataUrl.length * 2, 0);
      cacheBytes += record.bytes;
      // Cache complete families, never evict just the large images from one.
      while (cacheBytes > 64 * 1024 * 1024 || families.size > 256) {
        const oldest = families.keys().next().value;
        cacheBytes -= families.get(oldest).bytes;
        families.delete(oldest);
      }
    }
  }
  return result;
}

module.exports = { getFileIcon, getFileIconFamily };
