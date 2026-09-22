// Spectrum, playlist editing, and player preferences kept separate from transport/recording.
Object.assign(MediaPlayerWindow.prototype, {
  initEnhancements() {
    const defaults={bins:20,height:24,bottom:'#79acbb',top:'#79acbb',solid:true,displayHeight:160};
    let saved={};try{saved=JSON.parse(localStorage.getItem('efm-player-settings'))||{};}catch{}
    this.playerSettings={...defaults,...saved};
    this.playerSettings.bins=Math.max(5,Math.min(24,Number(this.playerSettings.bins)||20));
    this.playerSettings.height=Math.max(10,Math.min(300,Number(this.playerSettings.height)||24));
    this.speed=1;this.audio.preservesPitch=false;
    this.$('.player-menu').add(new Option('Settings…','settings'));
    this.$('.player-menu').add(new Option('Help · keyboard shortcuts…','help'));
    this.initSpeedControl();
    this.$('.record-output').onchange=()=>this.changeOutput(this.$('.record-output').value).catch(error=>this.message(error.message));
    const lcd=this.$('.player-lcd'), grip=document.createElement('div');grip.className='player-display-grip';grip.title='Drag to resize display';grip.setAttribute('role','separator');grip.tabIndex=0;grip.setAttribute('aria-label','Display height');lcd.appendChild(grip);
    const resize=value=>{this.playerSettings.displayHeight=Math.max(120,Math.min(800,value));lcd.style.height=`${this.playerSettings.displayHeight}px`;};resize(this.playerSettings.displayHeight);
    grip.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();grip.setPointerCapture(e.pointerId);this.displayDrag={y:e.clientY,height:lcd.getBoundingClientRect().height};};
    grip.onpointermove=e=>{if(this.displayDrag)resize(this.displayDrag.height+e.clientY-this.displayDrag.y);};
    grip.onpointerup=grip.onpointercancel=grip.onlostpointercapture=()=>{this.displayDrag=null;this.savePlayerSettings();};
    grip.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();resize(this.playerSettings.displayHeight+(e.key==='ArrowUp'?-5:5));this.savePlayerSettings();}};
    this.refreshSpectrumStyle();
    const list=this.$('.player-playlist');
    list.addEventListener('dragover',e=>{if(!this.playlistDrag)return;e.preventDefault();e.stopImmediatePropagation();e.dataTransfer.dropEffect=e.ctrlKey?'copy':'move';this.markPlaylistDrop(e);},true);
    list.addEventListener('drop',e=>{if(!this.playlistDrag)return;e.preventDefault();e.stopImmediatePropagation();const target=this.playlistDropIndex(e);this.reorderTrack(this.playlistDrag.index,target,e.ctrlKey);this.clearPlaylistDrag();},true);
    this.transportKeys=e=>{
      if(this.manager.getActive()!==this||e.ctrlKey||e.metaKey||e.altKey||e.repeat||e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;
      if(e.key===','||e.key==='.'){e.preventDefault();try{this.changeSpeed(this.speed*Math.pow(2,(e.key==='.'?1:-1)/12));}catch(error){this.message(error.message);}return;}
      const action={z:'previous',x:'next',c:'stop',v:'play',b:'record',n:'reverse',m:'loop'}[e.key.toLowerCase()];
      if(action){e.preventDefault();this.run(action);}
    };document.addEventListener('keydown',this.transportKeys);
    const draw=()=>{this.drawSpectrum();this.spectrumFrame=requestAnimationFrame(draw);};draw();
    const destroy=this.destroy;this.destroy=()=>{cancelAnimationFrame(this.spectrumFrame);document.removeEventListener('keydown',this.transportKeys);for(const win of [this.settingsWindow,this.helpWindow])if(win?.el.isConnected)this.manager.close(win.id);destroy();};
  },
  savePlayerSettings(){localStorage.setItem('efm-player-settings',JSON.stringify(this.playerSettings));},
  changeSpeed(speed){
    if(!Number.isFinite(speed)||speed<=0)throw Error('Enter a positive playback speed.');
    // Let the playback engine validate its supported range before changing state.
    try{this.audio.playbackRate=speed;}catch{throw Error('This playback speed is outside the audio engine’s supported range.');}
    if(this.reversed&&this.playing){this.reverseOffset=this.position();this.reverseStart=this.reverseContext.currentTime;}
    this.speed=speed;this.audio.preservesPitch=false;
    if(this.reverseSource)this.reverseSource.playbackRate.value=this.speed;
    this.syncSpeedControl();
  },
  syncSpeedControl(){
    this.$('.player-speed-slider').value=String(this.speed);
    const value=this.$('.player-speed-value');if(document.activeElement!==value)value.value=`${this.speed.toFixed(2)}×`;
  },
  initSpeedControl(){
    const control=document.createElement('span');control.className='player-speed';
    control.innerHTML='Speed <input class="player-speed-slider" aria-label="Playback speed" type="range" min="0.25" max="3" step="any" value="1"><input class="player-speed-value" aria-label="Enter playback speed" type="text" inputmode="decimal" value="1.00×">';
    control.onclick=e=>{e.preventDefault();e.stopPropagation();};control.onkeydown=e=>e.stopPropagation();
    this.$('.recording-menu summary').appendChild(control);
    const slider=this.$('.player-speed-slider'),value=this.$('.player-speed-value');
    slider.title='Ctrl-drag: fine tuning. Double-click within 300 ms: reset to 1.00×.';
    let drag=null,lastClick=-Infinity;
    slider.oninput=()=>this.changeSpeed(Number(slider.value));
    slider.onpointerdown=e=>{
      if(e.button!==0)return;e.preventDefault();slider.focus();slider.setPointerCapture(e.pointerId);
      const reset=e.timeStamp-lastClick<=300;lastClick=-Infinity;
      drag={x:e.clientX,start:e.clientX,moved:false,reset};
      if(reset)this.changeSpeed(1);
      else if(!e.ctrlKey){const r=slider.getBoundingClientRect();this.changeSpeed(Math.max(.25,Math.min(3,.25+(e.clientX-r.left)/r.width*2.75)));}
    };
    slider.onpointermove=e=>{if(!drag||drag.reset)return;const dx=e.clientX-drag.x;drag.x=e.clientX;drag.moved ||= Math.abs(e.clientX-drag.start)>3;this.changeSpeed(this.sliderSpeedDelta(dx,slider.getBoundingClientRect().width,e.ctrlKey));};
    slider.onpointerup=e=>{if(drag&&!drag.moved&&!drag.reset)lastClick=e.timeStamp;drag=null;};
    slider.onpointercancel=slider.onlostpointercapture=()=>{drag=null;};
    slider.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();this.changeSpeed(Math.max(.25,Math.min(3,this.speed+(e.key==='ArrowRight'?1:-1)*(e.ctrlKey?.0005:.01))));}};
    value.onfocus=()=>{value.value=String(this.speed);value.select();};
    value.onblur=()=>{try{this.changeSpeed(Number(value.value.trim().replace(/[×x]$/i,'')));}catch(error){this.message(error.message);}value.value=`${this.speed.toFixed(2)}×`;};
    value.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();value.blur();}if(e.key==='Escape'){e.preventDefault();value.value=String(this.speed);value.blur();}};
  },
  sliderSpeedDelta(dx,width,fine){return Math.max(.25,Math.min(3,Math.max(.25,Math.min(3,this.speed))+dx/Math.max(1,width)*2.75*(fine?.05:1)));},
  async changeOutput(deviceId){
    const select=this.$('.record-output'),previous=this.outputDevice||'';
    this.ensureAudioGraph();select.disabled=true;
    try{if(typeof this.reverseContext.setSinkId!=='function')throw Error('Audio output selection is unavailable in this Electron build.');await this.reverseContext.setSinkId(deviceId);this.outputDevice=deviceId;select.value=deviceId;}
    catch(error){select.value=previous;throw error;}
    finally{select.disabled=typeof this.reverseContext.setSinkId!=='function';}
  },
  openPlayerHelp(){
    if(this.helpWindow?.el.isConnected){this.manager.focus(this.helpWindow.id);return;}
    const win=this.helpWindow=new UtilityWindow(this.manager,'Media Player Help',480,420);win.content.classList.add('player-help');
    win.content.innerHTML='<p>Keyboard shortcuts apply while the player is active and you are not typing in a field.</p><table><tr><td>Z / X</td><td>Previous / next track</td></tr><tr><td>C</td><td>Stop playback / finish recording</td></tr><tr><td>V</td><td>Pause / play</td></tr><tr><td>B</td><td>Start / finish recording</td></tr><tr><td>N</td><td>Reverse playback direction</td></tr><tr><td>M</td><td>Cycle loop mode</td></tr><tr><td>, / .</td><td>Speed down / up one semitone</td></tr><tr><td>Enter / Delete</td><td>Play / remove selected playlist track</td></tr><tr><td>Ctrl + drag</td><td>Duplicate playlist track; fine-tune speed slider (20× slower)</td></tr><tr><td>← / →</td><td>Adjust focused speed slider; Ctrl for fine steps</td></tr><tr><td>↑ / ↓</td><td>Resize display when its lower border has focus</td></tr></table><p>Double-click the speed slider within 300 ms to reset to 1.00×. Click the numeric speed to type a positive value, then Enter to apply or Escape to cancel. The slider spans 0.25–3×; typed values may exceed 3×, subject to the audio engine’s limits. Pitch changes with speed.</p><p>Drag tracks to reorder. The output selector routes playback, including reverse playback; it does not monitor the recording input.</p>';
  },
  ensureAudioGraph(){
    if(this.analyser)return;
    this.reverseContext ||= new AudioContext();
    this.analyser=this.reverseContext.createAnalyser();this.analyser.fftSize=4096;this.analyser.smoothingTimeConstant=.7;this.analyser.connect(this.reverseContext.destination);
    this.mediaSource=this.reverseContext.createMediaElementSource(this.audio);this.mediaSource.connect(this.analyser);
    this.gain=this.reverseContext.createGain();this.gain.gain.value=this.audio.volume;this.gain.connect(this.analyser);
  },
  refreshSpectrumStyle(){
    const s=this.playerSettings, spectrum=this.$('.player-spectrum');spectrum.replaceChildren();spectrum.style.height=`${s.height}px`;
    this.$('.player-lcd').style.minHeight=`${s.height+120}px`;
    for(let i=0;i<s.bins;i++){const bar=document.createElement('span');bar.style.background=s.solid?s.bottom:`linear-gradient(to top,${s.bottom},${s.top})`;spectrum.appendChild(bar);}
  },
  drawSpectrum(){
    if(this.capture?.source&&!this.capture.spectrumAnalyser){const a=this.capture.context.createAnalyser();a.fftSize=4096;this.capture.source.connect(a);this.capture.spectrumAnalyser=a;}
    const analyser=this.capture?.spectrumAnalyser||this.analyser;
    const bars=this.$('.player-spectrum').children;
    if(!analyser||(!this.playing&&!this.capture)){for(const bar of bars)bar.style.transform='scaleY(0)';return;}
    const values=new Uint8Array(analyser.frequencyBinCount);analyser.getByteFrequencyData(values);
    // DC is included in the first band; nonzero edges are logarithmic up to
    // Nyquist. Frequencies above sampleRate/2 cannot be represented by PCM.
    const rate=analyser.context.sampleRate, high=rate/2, low=20;
    for(let i=0;i<bars.length;i++){
      const from=i===0?0:low*Math.pow(high/low,i/bars.length),to=low*Math.pow(high/low,(i+1)/bars.length);
      const start=Math.min(values.length-1,Math.floor(from/high*values.length)),end=Math.min(values.length,Math.max(start+1,Math.ceil(to/high*values.length)));
      let energy=0;for(let k=start;k<end;k++)energy+=values[k]*values[k];
      bars[i].style.transform=`scaleY(${Math.sqrt(energy/(end-start))/255})`;
      bars[i].title=`${Math.round(from)}–${Math.round(to)} Hz`;
    }
  },
  openPlayerSettings(){
    if(this.settingsWindow?.el.isConnected){this.manager.focus(this.settingsWindow.id);return;}
    const win=this.settingsWindow=new UtilityWindow(this.manager,'Media Player Settings',390,310),s=this.playerSettings;
    win.content.classList.add('player-settings');
    win.content.innerHTML='<label>Spectrum bins <input name="bins" type="number" min="5" max="24" step="1"></label><label>Bar height (px) <input name="height" type="number" min="10" max="300"></label><label>Bottom / single color <input name="bottom" type="color"></label><label>Top color <input name="top" type="color"></label><label><input name="solid" type="checkbox"> Single color</label><p>Bands include DC (0 Hz), then increase logarithmically to half the audio sample rate (Nyquist).</p>';
    for(const input of win.content.querySelectorAll('input')){if(input.type==='checkbox')input.checked=s[input.name];else input.value=s[input.name];input.oninput=()=>{s[input.name]=input.type==='checkbox'?input.checked:input.type==='number'?Math.round(Math.max(Number(input.min),Math.min(Number(input.max),input.valueAsNumber||Number(input.min)))):input.value;this.refreshSpectrumStyle();this.savePlayerSettings();};}
    win.setStatus('Changes apply immediately and are saved.');
  },
  wirePlaylistRows(){
    [...this.$('.player-playlist').children].forEach((li,index)=>{
      li.draggable=true;li.dataset.playlistIndex=index;
      li.ondragstart=e=>{this.playlistDrag={index};e.dataTransfer.effectAllowed='copyMove';e.dataTransfer.setData('application/x-efm-playlist',String(index));li.classList.add('playlist-dragging');};
      li.ondragend=()=>this.clearPlaylistDrag();
    });
  },
  playlistDropIndex(e){const rows=[...this.$('.player-playlist').children];const i=rows.findIndex(li=>e.clientY<li.getBoundingClientRect().top+li.getBoundingClientRect().height/2);return i<0?rows.length:i;},
  markPlaylistDrop(e){const i=this.playlistDropIndex(e);[...this.$('.player-playlist').children].forEach((li,n)=>{li.classList.toggle('playlist-insert-before',n===i);li.classList.toggle('playlist-insert-after',i===this.tracks.length&&n===i-1);});},
  clearPlaylistDrag(){this.playlistDrag=null;this.$('.player-playlist').querySelectorAll('li').forEach(li=>li.classList.remove('playlist-dragging','playlist-insert-before','playlist-insert-after'));},
  reorderTrack(from,to,copy){
    if(!this.tracks[from])return;const active=this.tracks[this.index];let track=this.tracks[from];
    if(copy)track={...track};else{this.tracks.splice(from,1);if(to>from)to--;}
    to=Math.max(0,Math.min(this.tracks.length,to));this.tracks.splice(to,0,track);this.index=this.tracks.indexOf(active);this.selected=to;this.renderList();
  },
});
