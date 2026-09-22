const fs = require('node:fs/promises');
const path = require('node:path');

// Logical file bytes, including hidden files. Do not follow symlinks/junctions:
// their targets may escape the tree or form cycles.
async function calculateFolderSize(root, io = fs) {
  const stat = await io.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Choose a real folder.');
  let bytes = 0, files = 0, skipped = 0, links = 0;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    let children;
    try { children = await io.readdir(directory); }
    catch (error) { if (directory === root) throw error; skipped++; continue; }
    for (const name of children) {
      const full = path.join(directory, name);
      try {
        const child = await io.lstat(full);
        if (child.isSymbolicLink()) links++;
        else if (child.isDirectory()) pending.push(full);
        else if (child.isFile()) { bytes += child.size; files++; }
      } catch { skipped++; }
    }
  }
  return { bytes, files, skipped, links, calculatedAt: Date.now() };
}

class FolderSizeStore {
  constructor(filename) {
    this.filename = filename;
    this.loading = null;
    this.writes = Promise.resolve();
    this.jobs = new Map();
  }
  key(folder) { return path.resolve(folder); }
  async load() {
    if (!this.loading) this.loading = fs.readFile(this.filename(), 'utf8').then(raw => {
      const data = JSON.parse(raw);
      return new Map(Object.entries(data).filter(([, value]) =>
        value && Number.isFinite(value.bytes) && value.bytes >= 0 && Number.isFinite(value.calculatedAt)));
    }).catch(() => new Map());
    return this.loading;
  }
  async get(folder) { return (await this.load()).get(this.key(folder)); }
  async calculate(folder) {
    if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('Choose a real folder.');
    const key = this.key(folder);
    if (this.jobs.has(key)) return this.jobs.get(key);
    const job = (async () => {
      const result = await calculateFolderSize(key);
      const cache = await this.load();
      cache.set(key, result);
      const snapshot = JSON.stringify(Object.fromEntries(cache));
      this.writes = this.writes.catch(() => {}).then(async () => {
        const filename = this.filename();
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename + '.tmp', snapshot);
        await fs.rename(filename + '.tmp', filename);
      });
      await this.writes;
      return result;
    })();
    this.jobs.set(key, job);
    try { return await job; } finally { this.jobs.delete(key); }
  }
}

module.exports = { calculateFolderSize, FolderSizeStore };
