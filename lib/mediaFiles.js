const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function wavHeader(bytes, rate, channels, bits) {
  const b = Buffer.alloc(44);
  b.write('RIFF'); b.writeUInt32LE(bytes + 36, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * bits / 8, 28);
  b.writeUInt16LE(channels * bits / 8, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(bytes, 40); return b;
}
class RecordingStore {
  constructor(directory) { this.directory = directory; this.active = new Map(); }
  async start(owner, options) {
    const { format, rate, channels, bits } = options;
    if (!['wav','ogg'].includes(format) || !Number.isInteger(rate) || rate < 8000 || rate > 384000 || ![1,2].includes(channels) || ![16,24].includes(bits)) throw new Error('Invalid recording format.');
    if ([...this.active.values()].some(r => r.owner === owner)) throw new Error('A recording is already active.');
    const directory = this.directory(); await fs.mkdir(directory, { recursive:true });
    let file, handle;
    for (let i = 0; ; i++) {
      file = path.join(directory, `MyRecording${String(i).padStart(3,'0')}.${format}`);
      try { handle = await fs.open(file, 'wx'); break; } catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    if (format === 'wav') await handle.write(wavHeader(0, rate, channels, bits), 0, 44, 0);
    const id = crypto.randomUUID();
    this.active.set(id, { owner, file, handle, format, rate, channels, bits, bytes:0, queue:Promise.resolve() }); return { id, path:file };
  }
  get(owner, id) { const r = this.active.get(id); if (!r || r.owner !== owner) throw new Error('Recording not found.'); return r; }
  append(owner, id, data) {
    const r = this.get(owner,id), buffer = Buffer.from(data);
    if (!buffer.length || buffer.length > 4 * 1024 * 1024) throw new Error('Invalid recording block.');
    r.queue = r.queue.then(async () => {
      if (r.bytes + buffer.length > 0xffffffff - 36) throw new Error('WAV/recording limit reached; stop and start another recording.');
      let written = 0;
      while (written < buffer.length) { const result = await r.handle.write(buffer, written, buffer.length-written, (r.format === 'wav' ? 44 : 0) + r.bytes + written); written += result.bytesWritten; }
      r.bytes += buffer.length;
      // Keep even interrupted WAV captures playable, not just after Stop.
      if (r.format === 'wav') await r.handle.write(wavHeader(r.bytes,r.rate,r.channels,r.bits),0,44,0);
    }); return r.queue;
  }
  async finish(owner,id) {
    const r = this.get(owner,id);
    try {
      await r.queue;
      if(r.format==='wav' && r.bytes % 2) {
        await r.handle.write(Buffer.from([0]),0,1,44+r.bytes);
        const header=wavHeader(r.bytes,r.rate,r.channels,r.bits); header.writeUInt32LE(r.bytes+37,4); await r.handle.write(header,0,44,0);
      }
    } catch(error) { throw new Error(`${error.message} Partial recording retained at ${r.file}`); }
    finally { await r.handle.close(); this.active.delete(id); }
    return r.file;
  }
  async finishOwner(owner) { await Promise.allSettled([...this.active].filter(([,r])=>r.owner===owner).map(([id])=>this.finish(owner,id))); }
}
function m3u(paths) {
  if (!Array.isArray(paths) || paths.length > 10000 || paths.some(p => typeof p !== 'string' || !path.isAbsolute(p) || /[\r\n\0]/.test(p))) throw new Error('Invalid playlist.');
  return '#EXTM3U\n' + paths.map(p => `#EXTINF:-1,${path.basename(p)}\n${p}`).join('\n') + '\n';
}
module.exports = { RecordingStore, wavHeader, m3u };
