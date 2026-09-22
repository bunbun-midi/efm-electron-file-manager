/* PCM WAV payloads and RFC 7845 Ogg Opus framing. No additional codecs. */
const AudioEncoding = (() => {
  function pcm(channels, bits) {
    const frames = channels[0].length, bytes = bits / 8, output = new Uint8Array(frames * channels.length * bytes), view = new DataView(output.buffer);
    let offset = 0;
    for (let i=0;i<frames;i++) for (const channel of channels) {
      const sample = Math.max(-1,Math.min(1,channel[i] || 0));
      const value = Math.round(sample * (sample < 0 ? 2 ** (bits-1) : 2 ** (bits-1)-1));
      if (bits===16) view.setInt16(offset,value,true);
      else { output[offset]=value; output[offset+1]=value >> 8; output[offset+2]=value >> 16; }
      offset += bytes;
    }
    return output;
  }
  class Ogg {
    constructor(serial = Math.floor(Math.random()*0xffffffff)) { this.serial=serial; this.sequence=0; this.samples=0; }
    page(packet, granule, flags=0) {
      const segments = Math.floor(packet.length/255)+1;
      if (segments>255) throw new Error('Opus packet too large.');
      const out=new Uint8Array(27+segments+packet.length), v=new DataView(out.buffer);
      out.set(new TextEncoder().encode('OggS')); out[5]=flags;
      v.setBigUint64(6,BigInt(granule),true); v.setUint32(14,this.serial,true); v.setUint32(18,this.sequence++,true); out[26]=segments;
      for(let i=0;i<segments;i++) out[27+i]=Math.min(255,packet.length-i*255);
      out.set(packet,27+segments);
      let crc=0;
      for(const byte of out) { crc ^= byte<<24; for(let i=0;i<8;i++) crc=(crc<<1)^((crc & 0x80000000)?0x04c11db7:0); }
      v.setUint32(22,crc>>>0,true); return out;
    }
    headers(description, channels) {
      let head = description ? new Uint8Array(description) : null;
      if (!head || new TextDecoder().decode(head.slice(0,8)) !== 'OpusHead') {
        head=new Uint8Array(19); head.set(new TextEncoder().encode('OpusHead')); head[8]=1; head[9]=channels;
        new DataView(head.buffer).setUint16(10,312,true); new DataView(head.buffer).setUint32(12,48000,true);
      }
      this.preSkip=new DataView(head.buffer,head.byteOffset,head.byteLength).getUint16(10,true);
      const vendor=new TextEncoder().encode('EFM Media Player'), tags=new Uint8Array(16+vendor.length);
      tags.set(new TextEncoder().encode('OpusTags')); new DataView(tags.buffer).setUint32(8,vendor.length,true); tags.set(vendor,12);
      return [this.page(head,0,2),this.page(tags,0)];
    }
    packet(data, duration, finalSamples) {
      this.samples += Math.round(duration*48000/1000000);
      return this.page(data, finalSamples === undefined ? this.samples : Math.min(this.samples,finalSamples+this.preSkip), finalSamples === undefined ? 0 : 4);
    }
  }
  return { pcm, Ogg };
})();
if (typeof module !== 'undefined') module.exports = AudioEncoding;
