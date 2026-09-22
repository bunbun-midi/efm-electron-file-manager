ObjC.import('AppKit');
function run(argv) {
  const request=JSON.parse(argv[0]), board=$.NSPasteboard.generalPasteboard;
  const read=()=>{
    const files=board.propertyListForType('NSFilenamesPboardType');
    let paths=files?ObjC.deepUnwrap(files):[];
    if(!paths.length){const objects=board.readObjectsForClassesOptions($.NSArray.arrayWithObject($.NSURL),$.NSDictionary.dictionary);if(objects)for(let i=0;i<objects.count;i++){const url=objects.objectAtIndex(i);if(url.isFileURL)paths.push(ObjC.unwrap(url.path));}}
    const mode=board.stringForType('org.efm.file-operation');return {paths,mode:mode&&ObjC.unwrap(mode)==='cut'?'cut':'copy',token:String(board.changeCount)};
  };
  if(request.action==='read')return JSON.stringify(read());
  if(request.action==='commit'&&String(board.changeCount)!==request.token)return JSON.stringify({changed:true});
  board.clearContents;
  if(request.paths.length){const urls=request.paths.map(p=>$.NSURL.fileURLWithPath(p));board.writeObjects($(urls));board.setPropertyListForType($(request.paths),'NSFilenamesPboardType');board.setStringForType(request.mode||'cut','org.efm.file-operation');}
  return JSON.stringify(read());
}
