const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

contextBridge.exposeInMainWorld('fm', {
  fileClipboard: request => ipcRenderer.invoke('clipboard:files',request),
  nativeFileDrag: (paths,copy) => ipcRenderer.invoke('files:native-drag',paths,copy),
  startRecording: options => ipcRenderer.invoke('media:record-start',options),
  appendRecording: (id,data) => ipcRenderer.invoke('media:record-data',id,data),
  stopRecording: (id,prompt=true) => ipcRenderer.invoke('media:record-stop',id,prompt),
  exportPlaylist: paths => ipcRenderer.invoke('media:playlist-export',paths),
  pickAudio: () => ipcRenderer.invoke('media:pick'),
  onMediaPlayerRequest: cb => ipcRenderer.on('menu:media-player',()=>cb()),
  listDir: (dirPath) => ipcRenderer.invoke('dir:list', dirPath),
  listBackgrounds:()=>ipcRenderer.invoke('backgrounds:list'),
  importBackground:()=>ipcRenderer.invoke('backgrounds:import'),
  onBackgroundDownloadStatus:callback=>ipcRenderer.on('backgrounds:download-status',(_event,status)=>callback(status)),
  locationStat: filePath => ipcRenderer.invoke('location:stat',filePath),
  extname: filePath => path.extname(filePath),
  onSearchProgress: callback => { const listener=(_event,value)=>callback(value);ipcRenderer.on('search:progress',listener);return ()=>ipcRenderer.removeListener('search:progress',listener); },
  calculateFolderSize: (folder) => ipcRenderer.invoke('folder:size', folder),
  getEntryMetadata: (filePath) => ipcRenderer.invoke('metadata:get', filePath),
  editEntryMetadata: (filePath, field, value) => ipcRenderer.invoke('metadata:edit', filePath, field, value),
  calculateHash: (filePath, algorithm) => ipcRenderer.invoke('metadata:hash', filePath, algorithm),
  onMetadataChanged: (cb) => ipcRenderer.on('metadata:changed', () => cb()),
  setFileKeyboardMode: (active) => ipcRenderer.send('keyboard:file-mode', active),
  getFileIcon: (filePath, options) => ipcRenderer.invoke('file:icon', filePath, options),
  getFileIconFamily: (filePath, revision) => ipcRenderer.invoke('file:icon-family', filePath, revision),
  searchDirectory: (request) => ipcRenderer.invoke('search:run', request),
  cancelSearch: (id) => ipcRenderer.send('search:cancel', id),
  goUp: (dirPath) => ipcRenderer.invoke('dir:up', dirPath),
  getHome: () => ipcRenderer.invoke('fs:home'),

  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  recordOpened: filePath => ipcRenderer.invoke('history:opened',filePath),
  onHistoryChanged:callback=>ipcRenderer.on('history:changed',()=>callback()),
  showFileProperties: (filePath) => ipcRenderer.invoke('file:properties', filePath),
  trashItem: (filePath) => ipcRenderer.invoke('file:trash', filePath),
  renameItem: (oldPath, newName) => ipcRenderer.invoke('file:rename', oldPath, newName),
  newFolder: (dirPath, name) => ipcRenderer.invoke('file:newFolder', dirPath, name),
  showInFolder: (filePath) => ipcRenderer.invoke('file:showInFolder', filePath),
  moveItem: (srcPath, destDir) => ipcRenderer.invoke('file:move', srcPath, destDir),
  copyItem: (srcPath, destDir) => ipcRenderer.invoke('file:copy', srcPath, destDir),
  statEntry: (p) => ipcRenderer.invoke('fs:statEntry', p),
  openTerminal: (dirPath) => ipcRenderer.invoke('shell:openTerminal', dirPath),
  platform: process.platform,

  dirname: (p) => path.dirname(p),
  basename: (p) => path.basename(p),
  pathSep: path.sep,

  getLayout: (dirPath) => ipcRenderer.invoke('layout:get', dirPath),
  getFolderLayoutOptions: directory => ipcRenderer.invoke('layout:options-get',directory),
  setFolderLayoutOptions: (directory,options) => ipcRenderer.invoke('layout:options-set',directory,options),
  realignLayout: directory => ipcRenderer.invoke('layout:realign',directory),
  setLayoutPos: (dirPath, name, pos) => ipcRenderer.invoke('layout:set', dirPath, name, pos),

  listShortcuts: () => ipcRenderer.invoke('shortcuts:list'),
  setShortcutAppearance: (id, appearance) => ipcRenderer.invoke('shortcuts:appearance', id, appearance),
  pickShortcutImage: () => ipcRenderer.invoke('shortcuts:pickIcon'),
  addShortcut: (shortcut) => ipcRenderer.invoke('shortcuts:add', shortcut),
  removeShortcut: (id) => ipcRenderer.invoke('shortcuts:remove', id),
  setShortcutPos: (id, pos) => ipcRenderer.invoke('shortcuts:setPos', id, pos),

  listFavorites: () => ipcRenderer.invoke('favorites:list'),
  addFavorite: (filePath) => ipcRenderer.invoke('favorites:add', filePath),
  removeFavorite: (filePath) => ipcRenderer.invoke('favorites:remove', filePath),

  listExtColors: () => ipcRenderer.invoke('extColors:list'),
  setExtColor: (ext, color) => ipcRenderer.invoke('extColors:set', ext, color),
  removeExtColor: (ext) => ipcRenderer.invoke('extColors:remove', ext),

  listAssociations: () => ipcRenderer.invoke('associations:list'),
  getAssociation: (ext) => ipcRenderer.invoke('associations:get', ext),
  setAssociation: (ext, appPath, appName) => ipcRenderer.invoke('associations:set', ext, appPath, appName),
  removeAssociation: (ext) => ipcRenderer.invoke('associations:remove', ext),
  openFileWith: (filePath, appPath) => ipcRenderer.invoke('file:openWith', filePath, appPath),
  pickApplication: () => ipcRenderer.invoke('dialog:pickApplication'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),

  getAppSettings: () => ipcRenderer.invoke('appSettings:get'),
  exportSettings: (settings) => ipcRenderer.invoke('settings:export', settings),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  openTrash: () => ipcRenderer.invoke('desktop:trash'),
  launchShortcut: (target, files) => ipcRenderer.invoke('shortcut:launch', target, files),
  onShortcutsRequest: (cb) => ipcRenderer.on('menu:shortcuts', () => cb()),
  setAppSettings: (settings) => ipcRenderer.invoke('appSettings:set', settings),
  onOpenSettingsRequest: (cb) => ipcRenderer.on('menu:open-settings', () => cb()),
  onWindowSystemCommand: (cb) => ipcRenderer.on('window:system-command', (_event, command) => cb(command)),

  spawnTerminal: (cwd) => ipcRenderer.invoke('terminal:spawn', cwd),
  writeTerminal: (id, data) => ipcRenderer.send('terminal:input', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  killTerminal: (id) => ipcRenderer.send('terminal:kill', id),
  onTerminalData: (cb) => ipcRenderer.on('terminal:data', (_e, id, data) => cb(id, data)),
  onTerminalExit: (cb) => ipcRenderer.on('terminal:exit', (_e, id, exitCode, signal) => cb(id, exitCode, signal)),
  getTerminalSettings: () => ipcRenderer.invoke('terminal:getSettings'),
  setTerminalSettings: (settings) => ipcRenderer.invoke('terminal:setSettings', settings),

  toFileUrl: (p) => pathToFileURL(p).href,

  // Resolves whatever the user typed into a location bar against the
  // window's current path (handles absolute paths, "~", and vdir:// URIs).
  resolveInput: (base, input) => {
    if (!input) return base;
    if (input.startsWith('vdir://')) return input;
    if (input === '~') return os.homedir();
    if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
    if (path.isAbsolute(input)) return input;
    if (base && base.startsWith('vdir://')) return base; // relative nav inside vdirs isn't supported
    return path.resolve(base || os.homedir(), input);
  },

  onNewWindowRequest: (cb) => ipcRenderer.on('menu:new-window', (_e, p) => cb(p)),
});
