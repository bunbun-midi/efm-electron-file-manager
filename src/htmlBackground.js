const HtmlBackground={
  mode:0,
  async init(){
    this.frame=document.createElement('iframe');this.frame.className='html-background';this.frame.title='Desktop HTML background';this.frame.setAttribute('sandbox','allow-scripts allow-forms allow-downloads');this.frame.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");document.body.prepend(this.frame);
    const saved=localStorage.getItem('efm-html-background');await this.load(saved);this.setMode(0);
    window.fm.onBackgroundDownloadStatus(status=>{
      if(status.state==='interrupted')Dialog.alertText({title:'Background export',message:'The download was interrupted. Your instrument remains open; try exporting again.'});
      else if(status.state==='completed'&&this.control)this.control.title=`Saved: ${status.path}`;
    });
  },
  async load(selected){
    this.pages=await window.fm.listBackgrounds();
    const page=selected==='off'?null:(this.pages.find(p=>p.path===selected)||this.pages[0]);
    this.selected=page?.path||'off';this.frame.hidden=!page;if(page)this.frame.src=window.fm.toFileUrl(page.path);else this.frame.removeAttribute('src');
    localStorage.setItem('efm-html-background',this.selected);
  },
  setMode(mode){
    this.mode=mode;document.body.dataset.backgroundMode=String(mode);
    if(this.frame){this.frame.inert=mode===0;this.frame.tabIndex=mode===0?-1:0;this.frame.style.pointerEvents=mode===0?'none':'auto';if(mode===0&&document.activeElement===this.frame)this.frame.blur();}
    if(this.control){this.control.title=['Background: view only','Background: interactive with desktop','Background: interactive fullscreen'][mode]+' · Click to cycle; right-click for pages and Appearance';this.control.setAttribute('aria-label',this.control.title);}
  },
  decorate(el,shortcut){
    this.control=el;el.classList.add('background-control');el.setAttribute('role','button');el.tabIndex=0;document.body.appendChild(el);
    el.addEventListener('mousedown',e=>{if(e.button!==0)return;document.body.classList.add('background-control-dragging');const release=()=>{document.body.classList.remove('background-control-dragging');window.removeEventListener('mouseup',release);window.removeEventListener('blur',release);};window.addEventListener('mouseup',release);window.addEventListener('blur',release);},true);
    const cycle=()=>{if(Date.now()-(el._lastDrag||0)>200)this.setMode((this.mode+1)%3);};
    el.addEventListener('click',cycle);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();cycle();}});
    el.addEventListener('contextmenu',async e=>{e.preventDefault();e.stopImmediatePropagation();
      try{this.pages=await window.fm.listBackgrounds();ContextMenu.showAt([
        ...this.pages.map(page=>({label:(page.path===this.selected?'✓ ':'')+page.name,action:()=>this.load(page.path)})),
        {label:'Use desktop color / image',action:()=>this.load('off')},
        {label:'Import HTML file…',action:async()=>{const file=await window.fm.importBackground();if(file)await this.load(file);}},
        {separator:true},{label:'Appearance',action:()=>{const win=DesktopIconAppearance.open(shortcut);win.el.classList.add('background-configuration');}},
        {label:'Anchor in lower left',action:()=>{localStorage.removeItem('efm-background-moved');this.position();}},
      ],e.clientX,e.clientY);}catch(error){await Dialog.alertText({title:'Background',message:error.message});}
    },true);
    this.resizeObserver?.disconnect();this.resizeObserver=new ResizeObserver(()=>this.position());this.resizeObserver.observe(el);this.resizeObserver.observe(el.querySelector('.icon-label'));
    if(!this.resizeListener){this.resizeListener=()=>this.position();window.addEventListener('resize',this.resizeListener);}
    this.position();this.setMode(this.mode);
  },
  position(){
    const el=this.control;if(!el)return;const r=el.getBoundingClientRect(),label=el.querySelector('.icon-label'),width=Math.max(r.width,label.offsetLeft+label.offsetWidth),height=Math.max(r.height,label.offsetTop+label.offsetHeight),maxX=Math.max(0,innerWidth-width-8),maxY=Math.max(0,innerHeight-height-8);
    const moved=localStorage.getItem('efm-background-moved');el.style.left=`${moved?Math.max(0,Math.min(maxX,parseFloat(el.style.left)||0)):8}px`;
    el.style.top=`${moved?Math.max(0,Math.min(maxY,parseFloat(el.style.top)||0)):maxY}px`;
  }
};
