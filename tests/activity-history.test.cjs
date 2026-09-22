const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {ActivityHistory}=require('../lib/activityHistory');
test('history filters extensions, persists ordered concurrent events and can disable new entries',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'efm-history-'));let extensions=' .PNG, *.txt ';
 try{const file=path.join(dir,'history.json'),history=new ActivityHistory(()=>file,async()=>({historyExtensions:extensions}));
 await history.record('accessed (opened)','photo.jpeg');assert.deepEqual(await history.list(),[]);
 await Promise.all([history.record('accessed (opened)','photo.PNG'),history.record('renamed','notes.bin','notes.txt'),history.record('moved','file.txt','new/file.txt')]);
 const rows=await history.list();assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.recordId)).size,3);assert.equal(rows[1].path2,'notes.txt');
 extensions='';await history.record('accessed (opened)','photo.PNG');assert.equal((await history.list()).length,3);
 assert.deepEqual(await new ActivityHistory(()=>file,async()=>({})).list(),rows);
 }finally{assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('efm-history-'));await fs.rm(dir,{recursive:true,force:true});}
});
