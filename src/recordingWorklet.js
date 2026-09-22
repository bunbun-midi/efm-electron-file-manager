class RecordingCapture extends AudioWorkletProcessor {
  constructor(options) { super(); this.channels=options.processorOptions.channels; this.used=0; this.buffers=Array.from({length:this.channels},()=>new Float32Array(4096)); this.stopped=false;
    this.port.onmessage=e=>{if(e.data==='stop'){this.flush();this.stopped=true;this.port.postMessage('stopped');}};
  }
  flush() { if(!this.used)return; const data=this.buffers.map(b=>b.slice(0,this.used)); this.port.postMessage(data,data.map(b=>b.buffer));this.used=0; }
  process(inputs) {
    if(this.stopped)return false;
    const input=inputs[0]; if(!input?.length)return true;
    for(let i=0;i<input[0].length;i++){for(let c=0;c<this.channels;c++)this.buffers[c][this.used]=(input[c]||input[0])[i]||0;if(++this.used===4096)this.flush();}
    return true;
  }
}
registerProcessor('recording-capture',RecordingCapture);
