const {spawn,execFile}=require('node:child_process');
const readline=require('node:readline'),path=require('node:path');
class NativeClipboard {
  constructor(clipboard){this.clipboard=clipboard;this.pending=new Map();this.sequence=0;}
  stop(){this.worker?.kill();this.worker=null;for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(new Error('Clipboard helper stopped.'));}this.pending.clear();}
  request(request){
    const next=(this.queue||Promise.resolve()).catch(()=>{}).then(()=>this.perform(request));this.queue=next;return next;
  }
  perform(request){
    if(request.paths&&(!Array.isArray(request.paths)||request.paths.length>10000||request.paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)||/[\0\r\n]/.test(p))))return Promise.reject(new Error('Invalid clipboard paths.'));
    if(process.platform==='darwin')return new Promise((resolve,reject)=>execFile('/usr/bin/osascript',['-l','JavaScript',path.join(__dirname,'macClipboard.js'),JSON.stringify(request)],{timeout:10000,maxBuffer:8*1024*1024},(error,out)=>{if(error)return reject(error);try{resolve(JSON.parse(out));}catch(e){reject(e);}}));
    if(process.platform!=='win32'){
      const clipboard=this.clipboard,{fileURLToPath,pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
      const read=()=>{
        const gnome=clipboard.readBuffer('x-special/gnome-copied-files').toString(),uris=clipboard.readBuffer('text/uri-list').toString(),cut=clipboard.readBuffer('application/x-kde-cutselection').toString();
        const lines=(gnome||uris).split(/\r?\n/),paths=[];for(const line of lines)if(line.startsWith('file:'))try{paths.push(fileURLToPath(line));}catch{}
        return {paths,mode:gnome.startsWith('cut\n')||cut==='1'?'cut':'copy',token:createHash('sha256').update(gnome+'\0'+uris+'\0'+cut).digest('hex')};
      };
      if(request.action==='read')return Promise.resolve(read());
      if(request.action==='commit'&&read().token!==request.token)return Promise.resolve({changed:true});
      if(!request.paths.length)clipboard.clear();else clipboard.writeBuffer('x-special/gnome-copied-files',Buffer.from(`${request.mode||'cut'}\n${request.paths.map(p=>pathToFileURL(p).href).join('\n')}`));
      return Promise.resolve(read());
    }
    if(!this.worker){
      this.worker=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Sta','-File',path.join(__dirname,'windowsClipboard.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      const worker=this.worker;worker.on('error',()=>this.stop());worker.on('exit',()=>{if(this.worker===worker)this.stop();});worker.stdin.on('error',()=>{});worker.stderr.resume();
      readline.createInterface({input:worker.stdout}).on('line',line=>{
        let response;try{response=JSON.parse(line);}catch{return;}const job=this.pending.get(response.id);if(!job)return;
        this.pending.delete(response.id);clearTimeout(job.timer);
        if(response.result?.paths && (!Array.isArray(response.result.paths)||response.result.paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)||p.includes('\0'))))response.error='The OS clipboard returned an invalid file list. Copy the files again.';
        response.error?job.reject(new Error(response.error)):job.resolve(response.result);
      });
    }
    return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>this.stop(),request.action==='drag'?300000:15000);this.pending.set(id,{resolve,reject,timer});this.worker.stdin.write(JSON.stringify({...request,id})+'\n');});
  }
}
module.exports={NativeClipboard};
