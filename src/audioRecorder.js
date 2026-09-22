class AudioCapture {
  static workletURL = new URL('recordingWorklet.js',document.currentScript.src).href;
  static async opusSupported() {
    try { return (await AudioEncoder.isConfigSupported({codec:'opus',sampleRate:48000,numberOfChannels:2,bitrate:128000})).supported; } catch { return false; }
  }
  async start(options, onError) {
    this.options=options; this.onError=onError; this.writes=Promise.resolve(); this.frames=0; this.pendingBytes=0;
    try {
      this.stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:options.device?{exact:options.device}:undefined,
        sampleRate:{ideal:options.rate},channelCount:{ideal:options.channels},echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      const track=this.stream.getAudioTracks()[0]; this.inputSettings=track.getSettings();
      track.onended=()=>this.fail(new Error('The selected recording input was disconnected.'));
      this.context=new AudioContext({sampleRate:options.format==='ogg'?48000:options.rate});
      await this.context.resume();
      this.saved=await window.fm.startRecording({...options,rate:this.context.sampleRate});
      if(options.format==='ogg') {
        this.ogg=new AudioEncoding.Ogg();
        this.encoder=new AudioEncoder({output:(chunk,metadata)=>{
          if(!this.headerWritten){ for(const header of this.ogg.headers(metadata.decoderConfig?.description,options.channels))this.write(header);this.headerWritten=true; }
          if(this.lastPacket)this.write(this.ogg.packet(this.lastPacket.data,this.lastPacket.duration));
          const data=new Uint8Array(chunk.byteLength); chunk.copyTo(data); this.lastPacket={data,duration:chunk.duration || 20000};
        },error:error=>this.fail(error)});
        this.encoder.configure({codec:'opus',sampleRate:48000,numberOfChannels:options.channels,bitrate:options.bitrate,bitrateMode:'variable'});
      }
      await this.context.audioWorklet.addModule(AudioCapture.workletURL);
      this.node=new AudioWorkletNode(this.context,'recording-capture',{processorOptions:{channels:options.channels}});
      this.node.port.onmessage=e=>{
        if(e.data==='stopped'){this.resolveStopped?.();return;}
        if(this.failed)return;
        try {
          const channels=e.data, frames=channels[0].length;
          if(this.encoder){
            if(this.encoder.encodeQueueSize>200)throw new Error('Encoder cannot keep up. Recording stopped safely.');
            const planar=new Float32Array(frames*channels.length); channels.forEach((ch,i)=>planar.set(ch,i*frames));
            const audio=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:frames,numberOfChannels:channels.length,timestamp:Math.round(this.frames*1000000/48000),data:planar});
            this.encoder.encode(audio); audio.close();
          } else this.write(AudioEncoding.pcm(channels,options.bits));
          this.frames+=frames;
        }catch(error){this.fail(error);}
      };
      this.source=this.context.createMediaStreamSource(this.stream); this.source.connect(this.node);
      // The processor outputs silence; connecting keeps it scheduled without monitoring the microphone.
      this.node.connect(this.context.destination);
      return {path:this.saved.path,inputRate:this.inputSettings.sampleRate,outputRate:this.context.sampleRate};
    }catch(error){await this.stop(false).catch(()=>{});throw error;}
  }
  write(bytes) {
    this.pendingBytes+=bytes.byteLength;
    if(this.pendingBytes>32*1024*1024){this.fail(new Error('Recording storage cannot keep up.'));return;}
    this.writes=this.writes.then(()=>window.fm.appendRecording(this.saved.id,bytes)).then(()=>{this.pendingBytes-=bytes.byteLength;});
    this.writes.catch(error=>this.fail(error));
  }
  fail(error){if(this.failed)return;this.failed=error;this.onError?.(error);}
  stop(prompt=true) {
    if(this.stopping)return this.stopping;
    this.stopping=this.finish(prompt);return this.stopping;
  }
  async finish(prompt) {
    let failure=this.failed;
    try {
      if(this.node){await new Promise(resolve=>{const timer=setTimeout(resolve,1000);this.resolveStopped=()=>{clearTimeout(timer);resolve();};this.node.port.postMessage('stop');});}
      if(this.encoder?.state==='configured'){
        await this.encoder.flush();
        if(this.lastPacket)this.write(this.ogg.packet(this.lastPacket.data,this.lastPacket.duration,this.frames));
      }
      await this.writes;
    }catch(error){failure=error;}
    finally {
      this.stream?.getTracks().forEach(track=>track.stop());this.source?.disconnect();this.node?.disconnect();
      if(this.encoder?.state!=='closed')this.encoder?.close();await this.context?.close();
    }
    const saved=this.saved ? await window.fm.stopRecording(this.saved.id,prompt && !failure) : null;
    if(failure)throw new Error(`${failure.message} Recording retained at ${saved || this.saved?.path || 'the recording folder'}.`);
    return saved;
  }
}
