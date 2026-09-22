const path=require('node:path');

// Keep Chromium's download handling (including blob: URLs owned by sandboxed
// pages). Supplying dialog options, not a save path, preserves native Save As.
function attachBackgroundDownloads(win){
  const contents=win.webContents,session=contents.session;
  const onDownload=(event,item,source)=>{
    if(source!==contents)return;
    const filename=path.basename(item.getFilename()||'Background export');
    const extension=path.extname(filename).slice(1).toLowerCase();
    const filters=extension==='wav'?[{name:'WAV audio',extensions:['wav']}]:['mid','midi'].includes(extension)?[{name:'MIDI file',extensions:['mid','midi']}]:[];
    item.setSaveDialogOptions({title:'Save background export',defaultPath:filename,filters:[...filters,{name:'All files',extensions:['*']}],properties:['showOverwriteConfirmation','createDirectory']});
    item.once('done',(_event,state)=>{
      if(!contents.isDestroyed())contents.send('backgrounds:download-status',{state,path:state==='completed'?item.getSavePath():null});
    });
  };
  session.on('will-download',onDownload);
  win.once('closed',()=>session.removeListener('will-download',onDownload));
}
module.exports={attachBackgroundDownloads};
