const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');

class EntryMetadata {
  constructor(filename) { this.filename = filename; this.loading = null; this.writes = Promise.resolve(); this.hashJobs = new Map(); }
  key(p) { return path.resolve(p); }
  async load() {
    if (!this.loading) this.loading = fs.readFile(this.filename(), 'utf8').then(raw => new Map(Object.entries(JSON.parse(raw)))).catch(() => new Map());
    return this.loading;
  }
  async save() {
    const snapshot = JSON.stringify(Object.fromEntries(await this.load()));
    this.writes = this.writes.catch(() => {}).then(async () => {
      const file = this.filename();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp', snapshot);
      await fs.rename(file + '.tmp', file);
    });
    return this.writes;
  }
  async get(p, stat) {
    let record = (await this.load()).get(this.key(p)) || {};
    if (stat && record.identity && record.identity !== `${stat.dev}:${stat.ino}`) record = {};
    const result = { order: '', note: '', prevName: '', origName: '', bookmarked: false, ...record };
    for (const algorithm of ['md5', 'sha256', 'sha512']) {
      const hash = record.hashes?.[algorithm];
      result[algorithm] = hash && (!stat || (hash.size === stat.size && hash.mtime === stat.mtimeMs)) ? hash.value : '';
    }
    return result;
  }
  async patch(p, patch) {
    const data = await this.load(), key = this.key(p);
    let previous = data.get(key) || {};
    if (patch.identity && previous.identity && patch.identity !== previous.identity) previous = {};
    data.set(key, { ...previous, ...patch, ...(patch.hashes ? { hashes: { ...previous.hashes, ...patch.hashes } } : {}) });
    await this.save();
    return this.get(p);
  }
  async edit(p, field, value) {
    if (!['order', 'note', 'bookmarked'].includes(field)) throw new Error('Unknown metadata field.');
    const stat = await fs.lstat(p);
    if (field === 'bookmarked') value = value === true;
    else {
      if (typeof value !== 'string' || value.length > (field === 'order' ? 256 : 10000)) throw new Error('Value is too long.');
      if (field === 'order' && !/^[\p{L}\p{N} ]*$/u.test(value)) throw new Error('# accepts letters, numbers, and spaces.');
    }
    const data = await this.load(), previous = data.get(this.key(p));
    if (previous?.identity && previous.identity !== `${stat.dev}:${stat.ino}`) data.delete(this.key(p));
    return this.patch(p, { [field]: value, identity: `${stat.dev}:${stat.ino}` });
  }
  async snapshot(root) {
    const records = [];
    const pending = [root];
    while (pending.length) {
      const current = pending.pop(), stat = await fs.lstat(current);
      const metadata = await this.get(current, stat);
      records.push({ relative: path.relative(root, current), metadata: { ...metadata, created: metadata.created ?? stat.birthtimeMs }, link: stat.isSymbolicLink(), directory:stat.isDirectory() });
      if (stat.isDirectory() && !stat.isSymbolicLink()) for (const name of await fs.readdir(current)) pending.push(path.join(current, name));
    }
    return records;
  }
  async relocate(source, destination, records, copy, renamed = false) {
    const data = await this.load();
    for (const record of records) {
      const oldPath = this.key(path.join(source, record.relative));
      const newPath = this.key(path.join(destination, record.relative));
      const meta = { ...record.metadata };
      const stat = await fs.lstat(newPath);
      meta.identity = `${stat.dev}:${stat.ino}`;
      if (copy) meta.bookmarked = false;
      if (renamed && !record.relative) {
        meta.prevName = path.basename(source);
        meta.origName = meta.origName || path.basename(source);
      }
      if (!copy) data.delete(oldPath);
      data.set(newPath, meta);
    }
    await this.save();
  }
  async hash(p, algorithm) {
    if (!['md5', 'sha256', 'sha512'].includes(algorithm)) throw new Error('Unknown hash algorithm.');
    const key = this.key(p) + ':' + algorithm;
    if (this.hashJobs.has(key)) return this.hashJobs.get(key);
    const job = (async () => {
      const before = await fs.stat(p);
      if (!before.isFile()) throw new Error('Select a file to calculate its hash.');
      const hash = createHash(algorithm);
      for await (const chunk of createReadStream(p)) hash.update(chunk);
      const after = await fs.stat(p);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('File changed during hashing. Please try again.');
      const current = await this.get(p, after);
      return this.patch(p, { identity: `${after.dev}:${after.ino}`, hashes: { ...current.hashes, [algorithm]: { value: hash.digest('hex'), size: after.size, mtime: after.mtimeMs } } });
    })();
    this.hashJobs.set(key, job);
    try { return await job; } finally { this.hashJobs.delete(key); }
  }
  async forget(root) {
    const data = await this.load(), key = this.key(root);
    for (const name of data.keys()) if (name === key || name.startsWith(key + path.sep)) data.delete(name);
    await this.save();
  }
}
module.exports = { EntryMetadata };
