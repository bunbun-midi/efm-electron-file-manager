const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
class ActivityHistory {
  constructor(filename,settings){this.filename=filename;this.settings=settings;this.queue=Promise.resolve();}
  async list(){await this.queue.catch(()=>{});try{return JSON.parse(await fs.readFile(this.filename(),'utf8'));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
  async record(action,source,destination=''){
    const extensions=new Set(String((await this.settings()).historyExtensions||'').split(',').map(s=>s.trim().toLowerCase().replace(/^\*?\./,'')).filter(Boolean));
    if(!extensions.has(path.extname(source).slice(1).toLowerCase())&&!extensions.has(path.extname(destination).slice(1).toLowerCase()))return;
    const row={recordId:randomUUID(),action,historyPath:source,path2:destination,time:Date.now()};
    const job=this.queue.catch(()=>{}).then(async()=>{let rows=[];try{rows=JSON.parse(await fs.readFile(this.filename(),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      rows.push(row);await fs.mkdir(path.dirname(this.filename()),{recursive:true});await fs.writeFile(this.filename()+'.tmp',JSON.stringify(rows));await fs.rename(this.filename()+'.tmp',this.filename());});
    this.queue=job;await job;return row;
  }
}
module.exports={ActivityHistory};
