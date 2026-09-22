const fs=require('node:fs/promises'),path=require('node:path');
async function mountedDrives(){
  let candidates=[];
  if(process.platform==='win32')candidates=Array.from({length:26},(_,i)=>({name:`${String.fromCharCode(65+i)}:`,realPath:`${String.fromCharCode(65+i)}:\\`}));
  else {
    candidates=[{name:'Filesystem',realPath:'/'}];
    for(const base of process.platform==='darwin'?['/Volumes']:['/media','/mnt',`/run/media/${require('node:os').userInfo().username}`]){
      try{for(const item of await fs.readdir(base,{withFileTypes:true}))if(item.isDirectory()||item.isSymbolicLink())candidates.push({name:item.name,realPath:path.join(base,item.name)});}catch{}
    }
  }
  return (await Promise.all(candidates.map(async item=>{try{if((await fs.stat(item.realPath)).isDirectory())return {...item,kind:'directory'};}catch{}return null;}))).filter(Boolean);
}
module.exports={mountedDrives};
