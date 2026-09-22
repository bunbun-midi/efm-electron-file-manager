const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile,spawn}=require('node:child_process');
class WindowsFileDrag {
  constructor(directory){this.directory=directory;this.children=new Set();}
  async build(){
    if(this.building)return this.building;
    this.building=(async()=>{
      const source=path.join(__dirname,'windowsFileDrag.cs'),data=await fs.readFile(source),hash=crypto.createHash('sha256').update(data).digest('hex').slice(0,16);
      const folder=this.directory();await fs.mkdir(folder,{recursive:true});const exe=path.join(folder,`file-drag-${hash}.exe`);
      try{await fs.access(exe);return exe;}catch{}
      let compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
      try{await fs.access(compiler);}catch{compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET/Framework/v4.0.30319/csc.exe');}
      await new Promise((resolve,reject)=>execFile(compiler,['/nologo','/target:exe',`/out:${exe}`,'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',source],{windowsHide:true,timeout:30000},(error,out,stderr)=>error?reject(new Error(out||stderr||error.message)):resolve()));return exe;
    })().catch(error=>{this.building=null;throw error;});return this.building;
  }
  async run(paths,copy,cancelForTest=false){
    const executable=await this.build();
    return new Promise((resolve,reject)=>{
      const child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.children.add(child);let out='',errors='';
      const timer=setTimeout(()=>child.kill(),cancelForTest?10000:300000);
      child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>errors+=chunk);child.stdin.on('error',()=>{});
      child.on('error',reject);child.on('close',()=>{clearTimeout(timer);this.children.delete(child);try{const result=JSON.parse(out);if(result.error)throw Error(result.error);resolve(result);}catch(error){reject(new Error(errors||error.message));}});
      child.stdin.end(JSON.stringify({paths,copy,cancelForTest})+'\n');
    });
  }
  stop(){for(const child of this.children)child.kill();this.children.clear();}
}
module.exports={WindowsFileDrag};
