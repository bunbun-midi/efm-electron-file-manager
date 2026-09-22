const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'.electron-test-data','downloads');require('node:fs').mkdirSync(root,{recursive:true});app.setPath('userData',path.join(root,'profile'));
require('../main');
let fixture;
app.whenReady().then(async()=>{try{
 fixture=path.join(__dirname,'..','Backgrounds',`test-download-${Date.now()}.html`);
 await fs.writeFile(fixture,`<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%}</style></head><body><button id="wav">WAV</button><button id="midi">MIDI</button><button id="cancel">Cancel test</button><script>
 const payloads={wav:[82,73,70,70,4,0,0,0,87,65,86,69],midi:[77,84,104,100,0,0,0,6,0,0,0,1,0,96],cancel:[1,2,3]};
 for(const kind of Object.keys(payloads))document.getElementById(kind).onclick=()=>{const a=document.createElement('a');a.download=kind==='midi'?'instrument.midi':kind+'.wav';a.href=URL.createObjectURL(new Blob([new Uint8Array(payloads[kind])],{type:kind==='midi'?'audio/midi':'audio/wav'}));a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
 </script></body></html>`);
 const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
 await win.webContents.executeJavaScript(`new Promise(r=>{const t=setInterval(()=>{if(HtmlBackground.frame){clearInterval(t);r();}},20);})`);
 await win.webContents.executeJavaScript(`(async()=>{await HtmlBackground.load(${JSON.stringify(fixture)});HtmlBackground.setMode(1);})()`);
 await new Promise(r=>setTimeout(r,350));
 const frame=win.webContents.mainFrame.frames.find(f=>f.url.includes(path.basename(fixture)));assert.ok(frame);
 for(const [kind,filename,expected] of [['wav','wav.wav',[82,73,70,70,4,0,0,0,87,65,86,69]],['midi','instrument.midi',[77,84,104,100,0,0,0,6,0,0,0,1,0,96]],['cancel','cancel.wav',null]]){
  const result=new Promise((resolve,reject)=>{
   win.webContents.session.once('will-download',(_event,item)=>{
    try{const options=item.getSaveDialogOptions();assert.equal(options.title,'Save background export');assert.equal(options.defaultPath,filename);assert.ok(options.filters[0].extensions.includes(kind==='midi'?'midi':'wav'));
      item.once('done',(_e,state)=>resolve(state));
      // Substitute a test path only after verifying production supplied native
      // dialog options; no automated UI selection is needed for test fixtures.
      if(kind==='cancel')item.cancel();else item.setSavePath(path.join(root,filename));
    }catch(error){item.cancel();reject(error);}
   });
  });
  await frame.executeJavaScript(`document.getElementById(${JSON.stringify(kind)}).click()`,true);
  assert.equal(await result,kind==='cancel'?'cancelled':'completed');
  if(expected)assert.deepEqual([...await fs.readFile(path.join(root,filename))],expected);
  console.log(`${kind}: native Save As options and ${kind==='cancel'?'cancellation':'download bytes'} verified.`);
 }
 for(const size of [[900,600],[1200,750]]){
  win.setContentSize(...size);await new Promise(r=>setTimeout(r,100));
  assert.equal(await win.webContents.executeJavaScript(`(()=>{const r=HtmlBackground.frame.getBoundingClientRect();return r.left===0&&r.top===0&&r.width===innerWidth&&r.height===innerHeight;})()`),true);
 }
 assert.equal(await frame.executeJavaScript('document.compatMode'), 'CSS1Compat');
 assert.deepEqual(await frame.executeJavaScript('[typeof require,typeof window.fm]'),['undefined','undefined']);
 await win.webContents.executeJavaScript('HtmlBackground.load("off")');await fs.unlink(fixture);fixture=null;
 console.log('Background fills the EFM viewport at both sizes and stays isolated.');app.exit(0);
 }catch(error){console.error(error);if(fixture)await fs.unlink(fixture).catch(()=>{});app.exit(1);}});
setTimeout(()=>{console.error('Background download checks timed out');app.exit(1);},25000).unref();
