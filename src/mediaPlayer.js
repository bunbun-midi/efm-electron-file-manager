const MediaPlayer = {
  async shutdown() {
    const win=this.win;if(!win)return;
    while(win.recordBusy)await new Promise(resolve=>setTimeout(resolve,30));
    win.recordBusy=true;win.stopPlayback();
    try{await win.capture?.stop(false);}finally{win.capture=null;win.recordBusy=false;}
  },
  open(manager) {
    if(this.win?.el.isConnected){this.win.el.classList.remove('minimized');manager.focus(this.win.id);return this.win;}
    this.win=new MediaPlayerWindow(manager);return this.win;
  },
};
class MediaPlayerWindow extends UtilityWindow {
  constructor(manager) {
    super(manager,'Media Player',620,620);
    this.el.classList.add('media-player-window');this.content.classList.add('media-player');
    this.tracks=[];this.index=-1;this.selected=-1;this.loop=0;this.reversed=false;this.playing=false;this.token=0;
    this.audio=new Audio();this.audio.preload='metadata';this.audio.volume=.8;
    this.content.innerHTML=`<div class="player-brand"><strong>EFM <em>WAVE</em></strong><span>DESKTOP AUDIO SYSTEM · 03</span>
      <select class="player-menu" aria-label="Player menu"><option value="">Player menu</option><option value="add">Add audio files…</option><option value="export">Export M3U…</option><option value="remove">Remove selected track</option><option value="clear">Clear playlist</option><option value="inputs">Refresh recording inputs</option></select></div>
      <div class="player-lcd"><div class="player-indicators"><span class="player-state">READY</span><span class="player-mode">STOP AFTER PLAYLIST</span></div><div class="player-title">Drop audio into the playlist</div><div class="player-time">00:00 <small>/ 00:00</small></div><div class="player-spectrum" aria-hidden="true">▁ ▃ ▆ ▄ ▂ ▅ ▇ ▃ ▁ ▂ ▅ ▃ ▆ ▄ ▁ ▃ ▅ ▂ ▇ ▄</div></div>
      <div class="player-sliders"><label>Position <input class="player-seek" type="range" min="0" max="1000" value="0"></label><label>Volume <input class="player-volume" type="range" min="0" max="1" step="0.01" value="0.8"></label></div>
      <div class="player-transport"><button data-action="previous" title="Previous track" aria-label="Previous track">|◀</button><button data-action="next" title="Next track" aria-label="Next track">▶|</button><button data-action="stop" title="Stop playback / finish recording" aria-label="Stop">■</button><button data-action="play" title="Play / pause" aria-label="Play / pause">▶</button><button data-action="record" title="Record / finish recording" aria-label="Record" class="record-button">●</button><button data-action="reverse" title="Reverse audio playback" aria-label="Reverse" aria-pressed="false">↶</button><button data-action="loop" title="Cycle: stop after playlist, loop track, loop playlist" aria-label="Loop mode">↪</button></div>
      <details class="recording-menu"><summary>Recording · input and format</summary><div class="recording-options">
      <label>Input <select class="record-input"><option value="">Default input</option></select></label>
      <label>Output <select class="record-output" aria-label="Playback output"><option value="">Default output</option></select></label>
      <p class="audio-backend-note">Devices use Chromium’s audio backend; MME / DirectSound / WASAPI modes are not individually selectable.</p>
      <label>Format <select class="record-format"><option value="wav">WAV · PCM</option><option value="ogg">Ogg · Opus</option></select></label>
      <label>WAV depth <select class="record-bits"><option>16</option><option>24</option></select></label>
      <label>Sample rate <select class="record-rate"><option value="44100">44.1 kHz</option><option value="48000" selected>48 kHz</option><option value="96000">96 kHz</option><option value="192000">192 kHz</option><option value="384000">384 kHz</option></select></label>
      <label>Channels <select class="record-channels"><option value="1">Mono</option><option value="2" selected>Stereo</option></select></label>
      <label>Ogg quality <select class="record-bitrate"><option value="64000">64 kb/s · voice</option><option value="128000">128 kb/s · standard</option><option value="192000" selected>192 kb/s · high</option><option value="256000">256 kb/s · very high</option><option value="320000">320 kb/s · maximum</option></select></label>
      </div><p>Input rate is device-dependent; the actual rate is shown when recording. WAV is resampled to the selected rate. Opus uses 48 kHz. Higher output rates or bit depths cannot add detail the input did not capture.</p></details>
      <div class="playlist-heading"><span>PLAYLIST</span><span class="playlist-count">0 TRACKS</span></div><ol class="player-playlist" tabindex="0" aria-label="Playlist; double-click to play; Delete to remove"></ol><div class="player-message" role="status">Drop files here or use Player menu → Add audio files.</div>`;
    this.$=selector=>this.content.querySelector(selector);
    for(const button of this.content.querySelectorAll('[data-action]'))button.onclick=()=>this.run(button.dataset.action);
    this.$('.player-menu').onchange=e=>{const action=e.target.value;e.target.value='';this.menuAction(action).catch(error=>this.message(error.message));};
    this.$('.player-volume').oninput=e=>{this.audio.volume=Number(e.target.value);if(this.gain)this.gain.gain.value=this.audio.volume;};
    this.$('.player-seek').oninput=e=>this.seek(Number(e.target.value)/1000*this.duration());
    this.$('.record-format').onchange=()=>this.syncRecordOptions();this.syncRecordOptions();
    const list=this.$('.player-playlist');
    list.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';list.classList.add('drop-target');});
    list.addEventListener('dragleave',()=>list.classList.remove('drop-target'));
    list.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();list.classList.remove('drop-target');let paths=[];try{paths=JSON.parse(e.dataTransfer.getData('application/x-fm-paths')).paths||[];}catch{}if(!paths.length)paths=[...e.dataTransfer.files].map(f=>f.path).filter(Boolean);this.add(paths);});
    list.onkeydown=e=>{if(e.key==='Delete'){e.preventDefault();this.removeSelected();}if(e.key==='Enter'&&this.selected>=0){e.preventDefault();this.play(this.selected).catch(error=>this.message(error.message));}};
    this.audio.onended=()=>{if(!this.reversed)this.ended();};
    this.audio.onerror=()=>{this.playing=false;this.message('This audio file could not be played. It may use an unsupported codec or be unavailable.');this.update();};
    this.clock=setInterval(()=>this.update(),100);
    this.refreshInputs().catch(()=>{});
    AudioCapture.opusSupported().then(supported=>{this.$('.record-format option[value="ogg"]').disabled=!supported;if(!supported)this.message('This Electron build cannot encode Opus; WAV recording is available.');});
    this.deviceChange=()=>this.refreshInputs().catch(()=>{});navigator.mediaDevices?.addEventListener('devicechange',this.deviceChange);
    this.beforeClose=()=>{
      if(this.closingReady)return true;
      if(this.recordBusy){this.message('Finishing the recording operation; close again when it completes.');return false;}
      if(!this.capture)return true;
      this.recordBusy=true;this.message('Saving recording before closing…');
      this.capture.stop(false).catch(error=>console.error(error)).finally(()=>{this.capture=null;this.closingReady=true;this.manager.close(this.id);});
      return false;
    };
    this.destroy=()=>{
      clearInterval(this.clock);this.stopPlayback();this.audio.src='';this.decodeAbort?.abort();this.reverseContext?.close();
      navigator.mediaDevices?.removeEventListener('devicechange',this.deviceChange);
      // A close keeps the automatic recording; no naming dialog is required.
      this.capture?.stop(false).catch(error=>console.error(error));
    };
    this.setStatus('Winamp-inspired player · original artwork · local audio');
    this.initEnhancements();
  }
  message(text){this.$('.player-message').textContent=text;}
  async menuAction(action){
    if(action==='help')this.openPlayerHelp();
    if(action==='settings')this.openPlayerSettings();
    if(action==='add')this.add(await window.fm.pickAudio());
    if(action==='export'){const p=await window.fm.exportPlaylist(this.tracks.map(t=>t.path));if(p)this.message(`Playlist saved: ${p}`);}
    if(action==='remove')this.removeSelected();
    if(action==='clear'){this.stopPlayback();this.tracks=[];this.index=this.selected=-1;this.renderList();}
    if(action==='inputs'){await this.refreshInputs();this.message('Input list refreshed. Device names become available after microphone permission is granted.');}
  }
  add(paths){
    let added=0;
    for(const path of paths){if(typeof path!=='string'||! /\.(mp3|wav|wave|ogg|oga|opus|flac|m4a|aac|webm|weba|mp4|aif|aiff)$/i.test(path))continue;this.tracks.push({path,name:path.split(/[\\/]/).pop()});added++;}
    this.renderList();this.message(`${added} audio file${added===1?'':'s'} added. Double-click a track to play.`);
  }
  renderList(){
    const list=this.$('.player-playlist');list.replaceChildren();
    this.tracks.forEach((track,i)=>{const li=document.createElement('li');li.textContent=`${String(i+1).padStart(2,'0')}  ${track.name}`;li.title=track.path;li.classList.toggle('current',i===this.index);li.classList.toggle('selected',i===this.selected);li.onclick=()=>{this.selected=i;this.renderList();};li.ondblclick=()=>this.play(i).catch(error=>this.message(error.message));list.appendChild(li);});
    this.wirePlaylistRows?.();
    this.$('.playlist-count').textContent=`${this.tracks.length} TRACKS`;this.update();
  }
  removeSelected(){if(this.selected<0)return;const i=this.selected;if(i===this.index){this.stopPlayback();this.index=-1;}else if(i<this.index)this.index--;this.tracks.splice(i,1);this.selected=Math.min(i,this.tracks.length-1);this.renderList();}
  async run(action){try{
    if(action==='record'){if(this.capture)await this.stopRecording();else await this.startRecording();return;}
    if(action==='stop'){this.stopPlayback();if(this.capture)await this.stopRecording();}
    if(action==='previous'&&this.tracks.length)await this.play(Math.max(0,this.index-1));
    if(action==='next'&&this.tracks.length)await this.play((this.index+1)%this.tracks.length);
    if(action==='play'){if(this.playing)this.pause();else if(this.index>=0)await this.resume();else if(this.tracks.length)await this.play(Math.max(0,this.selected));}
    if(action==='loop'){this.loop=(this.loop+1)%3;this.$('[data-action="loop"]').textContent=['↪','↺¹','↺∞'][this.loop];}
    if(action==='reverse'){
      const position=this.position(), wasPlaying=this.playing;this.pause();this.reversed=!this.reversed;
      this.$('[data-action="reverse"]').setAttribute('aria-pressed',String(this.reversed));
      if(this.index>=0){if(this.reversed){await this.loadReverse();this.reverseOffset=position>0?Math.max(0,this.duration()-position):0;}else this.audio.currentTime=Math.max(0,this.duration()-position);if(wasPlaying)await this.resume();}
    }
    this.update();
  }catch(error){this.message(error.message);}}
  stopPlayback(){this.token++;this.pause();this.audio.currentTime=0;this.reverseOffset=0;this.update();}
  pause(){this.token++;if(this.reversed&&this.playing)this.reverseOffset=this.position();this.playing=false;this.audio.pause();if(this.reverseSource){this.reverseSource.onended=null;this.reverseSource.stop();this.reverseSource=null;}this.update();}
  async play(index){if(!this.tracks[index])return;this.stopPlayback();this.index=index;this.selected=index;this.reverseBuffer=null;this.reverseOffset=0;this.audio.src=window.fm.toFileUrl(this.tracks[index].path);this.renderList();await this.resume();await window.fm.recordOpened(this.tracks[index].path).catch(()=>{});}
  async resume(){
    if(this.index<0)return;
    this.ensureAudioGraph();await this.reverseContext.resume();
    const token=++this.token;
    if(this.reversed){await this.loadReverse();if(token!==this.token||!this.el.isConnected)return;await this.reverseContext.resume();
      if(this.reverseOffset>=this.reverseBuffer.duration)this.reverseOffset=0;
      this.reverseSource=this.reverseContext.createBufferSource();this.reverseSource.buffer=this.reverseBuffer;this.reverseSource.connect(this.gain);
      this.reverseSource.playbackRate.value=this.speed||1;
      this.reverseSource.onended=()=>{this.reverseSource=null;this.ended();};this.reverseStart=this.reverseContext.currentTime;this.reverseSource.start(0,this.reverseOffset||0);this.playing=true;
    }else{await this.audio.play();if(token!==this.token)return;this.playing=true;}
    this.message(this.reversed?'Playing backwards. Reverse playback decodes the whole track into memory.':'Playing.');this.update();
  }
  async loadReverse(){
    if(this.reverseBuffer)return;
    this.message('Preparing reverse audio…');const path=this.tracks[this.index]?.path;if(!path)return;
    if(this.audio.duration>20*60)throw new Error('Reverse playback is limited to tracks up to 20 minutes to bound decoded audio memory.');
    this.ensureAudioGraph();
    this.decodeAbort?.abort();this.decodeAbort=new AbortController();
    const response=await fetch(window.fm.toFileUrl(path),{signal:this.decodeAbort.signal});
    const length=Number(response.headers.get('content-length'));if(length>128*1024*1024)throw new Error('Reverse playback is limited to audio files smaller than 128 MB.');
    const bytes=await response.arrayBuffer();if(bytes.byteLength>128*1024*1024)throw new Error('Audio file is too large for reverse playback.');
    const buffer=await this.reverseContext.decodeAudioData(bytes);
    if(buffer.duration>20*60)throw new Error('Reverse playback is limited to tracks up to 20 minutes.');
    if(this.tracks[this.index]?.path!==path)throw new Error('Track changed while preparing reverse playback.');
    for(let c=0;c<buffer.numberOfChannels;c++)buffer.getChannelData(c).reverse();this.reverseBuffer=buffer;
  }
  duration(){return this.reversed?this.reverseBuffer?.duration||0:Number.isFinite(this.audio.duration)?this.audio.duration:0;}
  position(){return this.reversed?Math.min(this.duration(),(this.reverseOffset||0)+(this.playing?(this.reverseContext.currentTime-this.reverseStart)*(this.speed||1):0)):this.audio.currentTime||0;}
  seek(value){const playing=this.playing;this.pause();if(this.reversed)this.reverseOffset=value;else this.audio.currentTime=value;if(playing)this.resume().catch(error=>this.message(error.message));this.update();}
  ended(){this.playing=false;if(this.loop===1)this.play(this.index).catch(error=>this.message(error.message));else if(this.index+1<this.tracks.length)this.play(this.index+1).catch(error=>this.message(error.message));else if(this.loop===2&&this.tracks.length)this.play(0).catch(error=>this.message(error.message));else{this.stopPlayback();this.message('Playlist finished.');}}
  update(){if(!this.$)return;const time=value=>{value=Math.floor(value||0);return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;};
    this.$('.player-title').textContent=this.tracks[this.index]?.name||'Drop audio into the playlist';
    const elapsed=this.capture?.context?this.capture.frames/this.capture.context.sampleRate:this.position();
    this.$('.player-time').replaceChildren(document.createTextNode(time(elapsed)));const small=document.createElement('small');small.textContent=` / ${time(this.duration())}`;this.$('.player-time').appendChild(small);
    this.$('.player-state').textContent=this.capture?'● RECORDING':this.playing?(this.reversed?'REVERSE':'PLAYING'):'STOPPED / PAUSED';
    this.$('.player-mode').textContent=['STOP AFTER PLAYLIST','LOOP SAME TRACK','LOOP PLAYLIST'][this.loop];
    this.$('[data-action="play"]').textContent=this.playing?'Ⅱ':'▶';this.$('[data-action="record"]').classList.toggle('recording',!!this.capture);
    this.$('.player-seek').value=this.duration()?this.position()/this.duration()*1000:0;
    this.$('.player-spectrum').classList.toggle('running',this.playing||!!this.capture);
  }
  syncRecordOptions(){const ogg=this.$('.record-format').value==='ogg';this.$('.record-bits').disabled=ogg;this.$('.record-rate').disabled=ogg;this.$('.record-bitrate').disabled=!ogg;}
  async refreshInputs(){
    const devices=await navigator.mediaDevices.enumerateDevices();
    for(const [kind,selector,label] of [['audioinput','.record-input','Input'],['audiooutput','.record-output','Output']]){
      const select=this.$(selector),selected=select.value;
      select.replaceChildren(new Option(`Default ${label.toLowerCase()}`,''));
      for(const [i,d] of devices.filter(d=>d.kind===kind).entries())select.add(new Option(d.label||`${label} ${i+1}`,d.deviceId));
      select.value=[...select.options].some(option=>option.value===selected)?selected:'';
      if(kind==='audiooutput'){
        select.disabled=typeof AudioContext.prototype.setSinkId!=='function';
        if(select.disabled)select.title='Output selection is unavailable in this Electron build.';
        if(this.outputDevice&&!devices.some(d=>d.kind===kind&&d.deviceId===this.outputDevice))await this.changeOutput('');
      }
    }
  }
  async startRecording(){
    if(this.recordBusy)return;this.recordBusy=true;this.stopPlayback();
    const options={format:this.$('.record-format').value,bits:Number(this.$('.record-bits').value),rate:Number(this.$('.record-rate').value),channels:Number(this.$('.record-channels').value),bitrate:Number(this.$('.record-bitrate').value),device:this.$('.record-input').value};
    try{const capture=new AudioCapture();this.capture=capture;const info=await capture.start(options,error=>{this.message(error.message);this.stopRecording().catch(e=>this.message(e.message));});
      this.message(`Recording → ${info.path} · input ${info.inputRate||'device default'} Hz / output ${info.outputRate} Hz`);await this.refreshInputs();
      this.content.querySelectorAll('.recording-options select:not(.record-output)').forEach(select=>select.disabled=true);
    }catch(error){this.capture=null;throw error;}finally{this.recordBusy=false;this.update();}
  }
  async stopRecording(){if(this.recordBusy||!this.capture)return;this.recordBusy=true;const capture=this.capture;
    try{const path=await capture.stop(true);this.message(`Recording saved: ${path}`);if(path)this.add([path]);this.message(`Recording saved: ${path}`);}
    finally{this.capture=null;this.recordBusy=false;this.content.querySelectorAll('.recording-options select:not(.record-output)').forEach(select=>select.disabled=false);this.syncRecordOptions();this.update();}
  }
}

