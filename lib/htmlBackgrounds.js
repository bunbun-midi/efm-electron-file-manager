const fs=require('node:fs/promises'),path=require('node:path');
function registerBackgrounds(ipcMain,dialog,root){
  ipcMain.handle('backgrounds:list',async()=>{
    await fs.mkdir(root,{recursive:true});
    return (await fs.readdir(root,{withFileTypes:true})).filter(e=>e.isFile()&&/\.html?$/i.test(e.name)).map(e=>({name:e.name,path:path.join(root,e.name)})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  });
  ipcMain.handle('backgrounds:import',async()=>{
    const result=await dialog.showOpenDialog({title:'Import HTML Background',properties:['openFile'],filters:[{name:'HTML pages',extensions:['html','htm']}]});
    if(result.canceled||!result.filePaths.length)return null;
    const source=result.filePaths[0];if(!/\.html?$/i.test(source))throw Error('Choose an HTML file.');
    await fs.mkdir(root,{recursive:true});
    const base=path.basename(source,path.extname(source)),ext=path.extname(source);let target=path.join(root,path.basename(source)),i=1;
    if(path.resolve(source)===path.resolve(target))return target;
    while(true){try{await fs.copyFile(source,target,require('node:fs').constants.COPYFILE_EXCL);return target;}catch(error){if(error.code!=='EEXIST')throw error;target=path.join(root,`${base} (${i++})${ext}`);}}
  });
}
module.exports={registerBackgrounds};
