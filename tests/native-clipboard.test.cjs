const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {NativeClipboard}=require('../lib/nativeClipboard');
test('Windows native file clipboard interoperates with file lists, cut flags and guarded consumption',{skip:process.platform!=='win32'},async()=>{
 const helper=new NativeClipboard();let saved=false;const dir=await fs.mkdtemp(path.join(os.tmpdir(),'efm-clipboard-'));
 try{
  await helper.request({action:'checkpoint'});saved=true;
  const paths=[path.join(dir,'one Ω.txt'),path.join(dir,'folder')];await fs.writeFile(paths[0],'keep');await fs.mkdir(paths[1]);
  let state=await helper.request({action:'write',paths,mode:'copy'});assert.deepEqual(state.paths,paths);assert.equal(state.mode,'copy');
  state=await helper.request({action:'write',paths,mode:'cut'});assert.equal(state.mode,'cut');assert.deepEqual((await helper.request({action:'read'})).paths,paths);
  const stale=state.token;await helper.request({action:'write',paths:[paths[0]],mode:'copy'});
  assert.equal((await helper.request({action:'commit',token:stale,paths:[]})).changed,true);assert.deepEqual((await helper.request({action:'read'})).paths,[paths[0]]);
  state=await helper.request({action:'write',paths,mode:'cut'});await helper.request({action:'commit',token:state.token,paths:[paths[1]]});state=await helper.request({action:'read'});assert.deepEqual(state.paths,[paths[1]]);assert.equal(state.mode,'cut');
  await helper.request({action:'commit',token:state.token,paths:[]});assert.deepEqual((await helper.request({action:'read'})).paths,[]);
  assert.equal(await fs.readFile(paths[0],'utf8'),'keep','Clipboard helper never deletes or moves sources');
  await helper.request({action:'restore'});saved=false;
  const {WindowsFileDrag}=require('../lib/windowsFileDrag');const nativeDrag=new WindowsFileDrag(()=>path.join(dir,'helper'));
  const drag=await nativeDrag.run(paths,false,true);assert.equal(drag.effect,'None');assert.equal(await fs.readFile(paths[0],'utf8'),'keep','Cancelling native drag never deletes sources');
 }finally{if(saved)await helper.request({action:'restore'});helper.stop();await fs.rm(dir,{recursive:true,force:true});}
});
