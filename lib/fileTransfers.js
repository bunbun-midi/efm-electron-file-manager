const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function preserveCreationDates(destination, records) {
  if (process.platform !== 'win32') return [];
  const items = records.filter(r => !r.link).map(r => ({ path: path.join(destination, r.relative), created: r.metadata.created }));
  return new Promise(resolve => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    let child;
    try { child = spawn(executable, ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'setCreationDates.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { resolve(['Creation dates retained in app metadata; OS timestamps could not be set.']); return; }
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => resolve(['Creation dates retained in app metadata; OS timestamps could not be set.']));
    child.on('close', code => {
      try { const failed = JSON.parse(output); resolve(failed.length ? [`${failed.length} OS creation dates could not be set; originals retained in app metadata.`] : []); }
      catch { resolve(['Creation dates retained in app metadata; OS timestamps could not be set.']); }
    });
    child.stdin.end(JSON.stringify(items));
  });
}

class FileTransfers {
  constructor(metadata, timestamps = preserveCreationDates) { this.metadata = metadata; this.timestamps = timestamps; this.queue = Promise.resolve(); }
  serial(action) { const next = this.queue.catch(() => {}).then(action); this.queue = next; return next; }
  async unique(directory, name) {
    const ext = path.extname(name), stem = path.basename(name, ext);
    for (let n = 1; ; n++) {
      const dest = path.join(directory, n === 1 ? name : `${stem} copy ${n}${ext}`);
      try { await fs.lstat(dest); } catch (error) { if (error.code === 'ENOENT') return dest; throw error; }
    }
  }
  transfer(source, directory, copy) {
    return this.serial(async () => {
      source = path.resolve(source); directory = await fs.realpath(directory);
      const stat = await fs.lstat(source);
      if (!copy && path.dirname(source) === directory) return { path: source, skipped: true, warnings: [] };
      if (stat.isDirectory()) {
        const real = await fs.realpath(source), relative = path.relative(real, directory);
        if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Cannot transfer a folder into itself or a child folder.');
      }
      const dest = await this.unique(directory, path.basename(source));
      const records = await this.metadata.snapshot(source);
      let copied = copy;
      if (!copy) {
        try { await fs.rename(source, dest); }
        catch (error) { if (error.code !== 'EXDEV') throw error; copied = true; }
      }
      if (copied) await fs.cp(source, dest, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false, verbatimSymlinks: true });
      const warnings = copied ? await this.timestamps(dest, records) : [];
      // Persist the original dates and annotations before removing a cross-volume source.
      await this.metadata.relocate(source, dest, records, copy);
      if (copied && !copy) await fs.rm(source, { recursive: true, force: false });
      if(!copy)await this.onChange?.('moved',source,dest,records);
      return { path: dest, warnings };
    });
  }
  rename(source, name) {
    return this.serial(async () => {
      if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[\\/\0]/.test(name)) throw new Error('Enter a filename, not a path.');
      source = path.resolve(source);
      const dest = path.join(path.dirname(source), name);
      if (source === dest) return dest;
      const caseOnly = process.platform === 'win32' && source.toLowerCase() === dest.toLowerCase();
      if (!caseOnly) {
        try { await fs.lstat(dest); throw new Error('An item with that name already exists.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const records = await this.metadata.snapshot(source);
      await fs.rename(source, dest);
      await this.metadata.relocate(source, dest, records, false, true);
      await this.onChange?.('renamed',source,dest,records);
      return dest;
    });
  }
}
module.exports = { FileTransfers, preserveCreationDates };
