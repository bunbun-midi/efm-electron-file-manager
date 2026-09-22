const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const os = require('os');
const { spawn } = require('child_process');
// Chromium caches are disposable. A fresh per-process directory avoids shared
// cache locks/permissions while keeping all saved user settings in userData.
const sessionCache = fssync.mkdtempSync(path.join(os.tmpdir(), 'efm-session-'));
app.setPath('sessionData', sessionCache);
const { launchShortcut } = require('./lib/shortcutLaunch');
const { validateSettings } = require('./lib/settingsJson');
const { RecordingStore, m3u } = require('./lib/mediaFiles');
const recordings = new RecordingStore(() => path.join(app.getPath('music'), 'EFM Recordings'));
ipcMain.handle('media:record-start', async (event, options) => {
  if (!event.sender.__recordingCleanup) { event.sender.__recordingCleanup = true; const owner = event.sender.id; event.sender.once('destroyed', () => recordings.finishOwner(owner)); }
  return recordings.start(event.sender.id, options);
});
ipcMain.handle('media:record-data', (event, id, data) => recordings.append(event.sender.id, id, data));
ipcMain.handle('media:record-stop', async (event, id, prompt = true) => {
  const saved = await recordings.finish(event.sender.id, id);
  if (!prompt) return saved;
  const result = await dialog.showSaveDialog({ title: 'Save recording (Cancel keeps the automatic recording)', defaultPath:saved, filters:[{name:'Recording',extensions:[path.extname(saved).slice(1)]}] });
  if (result.canceled || !result.filePath || path.resolve(result.filePath) === path.resolve(saved)) return saved;
  // Retain the automatic copy even if saving elsewhere fails.
  try { await fs.copyFile(saved,result.filePath); return result.filePath; }
  catch (error) { throw new Error(`Recording retained at ${saved}. Could not save another copy: ${error.message}`); }
});
ipcMain.handle('media:playlist-export', async (_event, paths) => {
  const content=m3u(paths), result=await dialog.showSaveDialog({title:'Export playlist',defaultPath:'Playlist.m3u',filters:[{name:'M3U playlist',extensions:['m3u']}]});
  if (result.canceled) return null; await fs.writeFile(result.filePath,content,'utf8'); return result.filePath;
});
ipcMain.handle('media:pick', async () => { const result=await dialog.showOpenDialog({properties:['openFile','multiSelections'],filters:[{name:'Audio',extensions:['mp3','wav','ogg','opus','flac','m4a','aac','webm','weba']},{name:'All files',extensions:['*']}]}); return result.canceled?[]:result.filePaths; });
ipcMain.handle('shortcut:launch', async (_event, target, files) => {const result=await launchShortcut(target,files);for(const file of files){try{if((await fs.stat(file)).isFile())await recordActivity('accessed (opened)',file);}catch{/* The launched application may already have removed its input. */}}return result;});
ipcMain.handle('desktop:trash', async () => {
  if (process.platform === 'win32') {
    return new Promise((resolve, reject) => {
      const child = spawn('explorer.exe', ['shell:RecycleBinFolder'], { detached: true, stdio: 'ignore', windowsHide: true });
      child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
    });
  }
  const error = await shell.openPath(process.platform === 'darwin' ? path.join(os.homedir(), '.Trash') : path.join(os.homedir(), '.local/share/Trash/files'));
  if (error) throw new Error(error);
});
const { colorForName, VIRTUAL_FOLDER_COLOR } = require('./lib/colorForName');
const { searchDirectory } = require('./lib/searchDirectory');
const { getFileIcon, getFileIconFamily } = require('./lib/fileIcons');
const { stopIconWorker } = require('./lib/platformIconImages');
const { FolderSizeStore } = require('./lib/folderSizes');
const { EntryMetadata } = require('./lib/entryMetadata');
const { FileTransfers } = require('./lib/fileTransfers');
const entryMetadata = new EntryMetadata(() => path.join(app.getPath('userData'), 'entry-metadata.json'));
const {ActivityHistory}=require('./lib/activityHistory');
const activityHistory=new ActivityHistory(()=>path.join(app.getPath('userData'),'activity-history.json'),()=>loadAppSettings());
const recordActivity=(...args)=>activityHistory.record(...args).then(row=>{if(row)for(const win of BrowserWindow.getAllWindows())win.webContents.send('history:changed');}).catch(error=>console.error('Could not save activity history:',error.message));
const fileTransfers = new FileTransfers(entryMetadata);
fileTransfers.onChange=async(action,source,destination,records)=>{for(const row of records)if(!row.directory)await recordActivity(action,path.join(source,row.relative),path.join(destination,row.relative));};
require('./lib/htmlBackgrounds').registerBackgrounds(ipcMain,dialog,path.join(__dirname,'Backgrounds'));
const fileKeyboardModes = new WeakMap();
const { NativeClipboard } = require('./lib/nativeClipboard');
const nativeClipboard = new NativeClipboard(require('electron').clipboard);
const {WindowsFileDrag}=require('./lib/windowsFileDrag');
const windowsFileDrag=new WindowsFileDrag(()=>path.join(app.getPath('userData'),'native-helpers'));
app.on('quit',()=>windowsFileDrag.stop());process.on('exit',()=>windowsFileDrag.stop());
app.on('quit', () => nativeClipboard.stop());
process.on('exit', () => nativeClipboard.stop());
ipcMain.handle('clipboard:files', (_event, request) => {
  if(!request||!['read','write','commit'].includes(request.action))throw new Error('Unsupported clipboard operation.');
  return nativeClipboard.request(request);
});
ipcMain.handle('files:native-drag', async (event,paths,copy) => {
  if(!Array.isArray(paths)||!paths.length||paths.length>10000||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw new Error('Invalid drag selection.');
  await Promise.all(paths.map(p=>fs.lstat(p)));
  if(process.platform==='win32')return windowsFileDrag.run(paths,copy===true);
  const {nativeImage}=require('electron');
  const icon=await app.getFileIcon(paths[0],{size:'normal'}).catch(()=>nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='));
  event.sender.startDrag({files:paths,icon});return {effect:'OS managed'};
});
ipcMain.on('keyboard:file-mode', (event, active) => fileKeyboardModes.set(event.sender, active === true));
function metadataChanged() {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('metadata:changed');
}
ipcMain.handle('metadata:get', async (_event, filePath) => entryMetadata.get(filePath, await fs.lstat(filePath)));
ipcMain.handle('metadata:edit', async (_event, filePath, field, value) => {
  const result = await entryMetadata.edit(filePath, field, value); metadataChanged(); return result;
});
ipcMain.handle('metadata:hash', async (_event, filePath, algorithm) => {
  const result = await entryMetadata.hash(filePath, algorithm); metadataChanged(); return result;
});
const { showFileProperties } = require('./lib/fileProperties');
ipcMain.handle('file:properties', (_event, filePath) => showFileProperties(filePath));
const folderSizes = new FolderSizeStore(() => path.join(app.getPath('userData'), 'folder-sizes.json'));
ipcMain.handle('folder:size', (_event, folder) => folderSizes.calculate(folder));

const VDIR_ROOT = path.join(__dirname, 'virtual-directories');
const vdirScripts = new Map();

const IMAGE_EXTS = new Set([
  '.png', '.apng', '.jpg', '.jpeg', '.jpe', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tif', '.tiff', '.avif', '.jfif',
]);

// ---------------------------------------------------------------------------
// Per-extension icon color overrides ("Change Icon Color…" in the context menu)
// ---------------------------------------------------------------------------

const extColorsFile = () => path.join(app.getPath('userData'), 'extension-colors.json');
let extColorsCache = null;

async function loadExtColors() {
  if (extColorsCache) return extColorsCache;
  try {
    extColorsCache = JSON.parse(await fs.readFile(extColorsFile(), 'utf-8'));
  } catch {
    extColorsCache = {};
  }
  return extColorsCache;
}

async function saveExtColors() {
  await fs.mkdir(path.dirname(extColorsFile()), { recursive: true });
  await fs.writeFile(extColorsFile(), JSON.stringify(extColorsCache, null, 2));
}

function extKeyFor(name) {
  return path.extname(name).toLowerCase().replace(/^\./, '');
}

/** Same as colorForName, but checks a loaded overrides map first. */
function resolveColor(name, isDirectory, overrides) {
  if (!isDirectory && overrides) {
    const override = overrides[extKeyFor(name)];
    if (override) return override;
  }
  return colorForName(name, isDirectory);
}

ipcMain.handle('extColors:list', async () => loadExtColors());

ipcMain.handle('extColors:set', async (_e, ext, color) => {
  const overrides = await loadExtColors();
  overrides[(ext || '').toLowerCase().replace(/^\./, '')] = color;
  await saveExtColors();
  return overrides;
});

ipcMain.handle('extColors:remove', async (_e, ext) => {
  const overrides = await loadExtColors();
  delete overrides[(ext || '').toLowerCase().replace(/^\./, '')];
  await saveExtColors();
  return true;
});

// ---------------------------------------------------------------------------
// Per-extension "Open With" associations
// ---------------------------------------------------------------------------

const associationsFile = () => path.join(app.getPath('userData'), 'file-associations.json');
let associationsCache = null;

async function loadAssociations() {
  if (associationsCache) return associationsCache;
  try {
    associationsCache = JSON.parse(await fs.readFile(associationsFile(), 'utf-8'));
  } catch {
    associationsCache = {};
  }
  return associationsCache;
}

async function saveAssociations() {
  await fs.mkdir(path.dirname(associationsFile()), { recursive: true });
  await fs.writeFile(associationsFile(), JSON.stringify(associationsCache, null, 2));
}

ipcMain.handle('associations:list', async () => loadAssociations());

ipcMain.handle('associations:get', async (_e, ext) => {
  const all = await loadAssociations();
  return all[(ext || '').toLowerCase().replace(/^\./, '')] || null;
});

ipcMain.handle('associations:set', async (_e, ext, appPath, appName) => {
  const all = await loadAssociations();
  const key = (ext || '').toLowerCase().replace(/^\./, '');
  all[key] = { appPath, appName: appName || path.basename(appPath) };
  await saveAssociations();
  return all[key];
});

ipcMain.handle('associations:remove', async (_e, ext) => {
  const all = await loadAssociations();
  delete all[(ext || '').toLowerCase().replace(/^\./, '')];
  await saveAssociations();
  return true;
});

ipcMain.handle('file:openWith', async (_e, filePath, appPath) => {
  const result=await new Promise((resolve, reject) => {
    const child =
      process.platform === 'darwin'
        ? spawn('open', ['-a', appPath, filePath], { detached: true, stdio: 'ignore' })
        : spawn(appPath, [filePath], { detached: true, stdio: 'ignore' });
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
    child.once('error', reject);
  });
  await recordActivity('accessed (opened)',filePath);return result;
});

ipcMain.handle('dialog:pickApplication', async () => {
  const isMac = process.platform === 'darwin';
  const result = await dialog.showOpenDialog({
    title: 'Choose Application',
    properties: ['openFile'],
    filters: isMac ? [{ name: 'Applications', extensions: ['app'] }] : [{ name: 'Programs', extensions: ['exe'] }],
    defaultPath: isMac ? '/Applications' : undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pickImage', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Desktop Background Image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'apng', 'jpg', 'jpeg', 'jpe', 'jfif', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif', 'tif', 'tiff'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ---------------------------------------------------------------------------
// App appearance settings (File > Settings…): icon size, UI font, desktop
// color/background image, titlebar color. One persisted profile, applied
// live to every open window.
// ---------------------------------------------------------------------------

const appSettingsFile = () => path.join(app.getPath('userData'), 'app-settings.json');
const DEFAULT_APP_SETTINGS = {
  historyExtensions: '',
  iconSize: 30,
  useNativeIcons: false,
  searchHighlightColor: '#00ffff',
  favoriteHighlightColor: '#00ffff',
  showHashCalc: true,
  labelBackgroundColor: '#ffffff',
  labelBackgroundAlpha: 0.88,
  fontSize: 12,
  fontFamily: 'Tahoma, Verdana, "Segoe UI", sans-serif',
  desktopColor: '#0c3a3a',
  desktopImage: null,
  titlebarColor: '#8a8a8a',
};
let appSettingsCache = null;

async function loadAppSettings() {
  if (appSettingsCache) return appSettingsCache;
  try {
    const saved = JSON.parse(await fs.readFile(appSettingsFile(), 'utf-8'));
    appSettingsCache = { ...DEFAULT_APP_SETTINGS, ...saved };
  } catch {
    appSettingsCache = { ...DEFAULT_APP_SETTINGS };
  }
  return appSettingsCache;
}

ipcMain.handle('appSettings:get', async () => loadAppSettings());
ipcMain.handle('settings:export', async (_event, settings) => {
  const clean = validateSettings(settings, DEFAULT_APP_SETTINGS);
  const result = await dialog.showSaveDialog({ title: 'Export Settings', defaultPath: 'efm-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, JSON.stringify({ format: 'efm-settings', version: 1, settings: clean }, null, 2), 'utf8');
  return true;
});
ipcMain.handle('settings:import', async () => {
  const result = await dialog.showOpenDialog({ title: 'Import Settings', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePaths.length) return null;
  if ((await fs.stat(result.filePaths[0])).size > 1024 * 1024) throw new Error('Settings JSON must be smaller than 1 MB.');
  return validateSettings(JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')), DEFAULT_APP_SETTINGS);
});

ipcMain.handle('appSettings:set', async (_e, settings) => {
  const current = await loadAppSettings();
  appSettingsCache = { ...current, ...settings };
  await fs.mkdir(path.dirname(appSettingsFile()), { recursive: true });
  await fs.writeFile(appSettingsFile(), JSON.stringify(appSettingsCache, null, 2));
  return appSettingsCache;
});

// ---------------------------------------------------------------------------
// Virtual directory scripts
// ---------------------------------------------------------------------------
// Any *.vdir.js file in /virtual-directories is loaded as a "scripted local
// page". Each module exports { id, label, description, list(subpath) }.
// `list` returns an array of virtual entries — see README.md for the schema.

function loadVirtualDirectories() {
  vdirScripts.clear();
  vdirScripts.set('drives',{id:'drives',label:process.platform==='win32'?'This PC — Drives':'Mounted Disks',list:()=>require('./lib/mountedDrives').mountedDrives()});
  vdirScripts.set('history',{id:'history',label:'File Activity History',list:async()=>(await activityHistory.list()).reverse().map(row=>({...row,name:row.historyPath,kind:'file',modified:row.time}))});
  vdirScripts.set('metadata', {id:'metadata',label:'File Notes, Numbers and Hashes',list:async()=>{
    const entries=[];
    for(const [filePath] of await entryMetadata.load()) {
      try {
        const stat=await fs.lstat(filePath),meta=await entryMetadata.get(filePath,stat);
        if(!meta.note&&!meta.order&&!meta.md5&&!meta.sha256&&!meta.sha512&&!meta.prevName&&!meta.origName)continue;
        entries.push({name:path.basename(filePath),realPath:filePath,kind:kindForEntry(filePath,stat.isDirectory()),size:stat.size,created:meta.created??stat.birthtimeMs,modified:stat.mtimeMs});
      }catch{/* Keep unavailable-drive records stored, but omit unavailable files from this view. */}
    }
    return entries;
  }});
  vdirScripts.set('favorites_', {
    id: 'favorites_', label: 'Favorite Files and Folders',
    list: async () => {
      const entries = [];
      for (const [filePath, metadata] of await entryMetadata.load()) {
        if (!metadata.bookmarked) continue;
        try {
          const stat = await fs.stat(filePath);
          if (!(await entryMetadata.get(filePath, stat)).bookmarked) continue;
          entries.push({ name: path.basename(filePath), realPath: filePath, kind: kindForEntry(filePath, stat.isDirectory()), size: stat.size, created: stat.birthtimeMs, modified: stat.mtimeMs });
        } catch { /* A missing bookmark remains stored in case its drive returns. */ }
      }
      return entries;
    },
  });
  if (!fssync.existsSync(VDIR_ROOT)) return;
  for (const file of fssync.readdirSync(VDIR_ROOT)) {
    if (!file.endsWith('.vdir.js')) continue;
    const full = path.join(VDIR_ROOT, file);
    try {
      delete require.cache[require.resolve(full)];
      const mod = require(full);
      if (mod && mod.id && typeof mod.list === 'function') {
        vdirScripts.set(mod.id, mod);
      } else {
        console.error(`Virtual directory script ${file} is missing an id or list() export.`);
      }
    } catch (err) {
      console.error(`Failed to load virtual directory script ${file}:`, err);
    }
  }
}

function kindForEntry(name, isDirectory) {
  if (isDirectory) return 'directory';
  const ext = path.extname(name).toLowerCase();
  return IMAGE_EXTS.has(ext) ? 'image' : 'file';
}

async function listReal(dirPath, signal) {
  const resolved = path.resolve(dirPath);
  const dirents = await fs.readdir(resolved, { withFileTypes: true });
  const overrides = await loadExtColors();
  const entries = [];
  for (const dirent of dirents) {
    signal?.throwIfAborted();
    if (dirent.name.startsWith('.')) continue; // keep the view clean; dotfiles hidden
    const full = path.join(resolved, dirent.name);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue; // broken symlink or permission error — skip quietly
    }
    const isDirectory = dirent.isDirectory();
    entries.push({
      id: full,
      name: dirent.name,
      path: full,
      kind: kindForEntry(dirent.name, isDirectory),
      size: stat.size,
      folderSize: isDirectory ? await folderSizes.get(full) : undefined,
      modified: stat.mtimeMs,
      created: stat.birthtimeMs,
      ext: path.extname(dirent.name).toLowerCase(),
      color: resolveColor(dirent.name, isDirectory, overrides),
      isVirtual: false,
      ...await entryMetadata.get(full, stat),
    });
  }
  return {
    path: resolved,
    isVirtual: false,
    entries,
    canGoUp: true,
  };
}

async function listVirtual(uri) {
  const rest = uri.slice('vdir://'.length);

  if (!rest) {
    // Root of virtual-directory-land: one folder per loaded script.
    const entries = [...vdirScripts.values()].map((mod) => ({
      id: 'vdir://' + mod.id,
      name: mod.label || mod.id,
      path: 'vdir://' + mod.id,
      kind: 'directory',
      size: 0,
      modified: Date.now(),
      created: Date.now(),
      ext: '',
      color: VIRTUAL_FOLDER_COLOR,
      isVirtual: true,
    }));
    return { path: 'vdir://', isVirtual: true, entries, canGoUp: false };
  }

  const [id, ...subParts] = rest.split('/');
  const sub = subParts.join('/');
  const mod = vdirScripts.get(id);
  if (!mod) throw new Error(`Unknown virtual directory: ${id}`);

  const raw = (await mod.list(sub)) || [];
  const base = uri.endsWith('/') ? uri.slice(0, -1) : uri;
  const overrides = await loadExtColors();
  const entries = raw.map((e) => ({
    id: `${base}/${e.recordId || (e.realPath ? encodeURIComponent(e.realPath) : e.name)}`,
    action:e.action,historyPath:e.historyPath,path2:e.path2,time:e.time,
    name: e.name,
    // A script can set realPath to point an entry at an actual file on disk
    // (e.g. favorites.vdir.js referencing real images) so the viewer opens
    // the genuine file instead of a synthetic vdir:// address. The entry
    // stays isVirtual — no rename/trash/drag through the virtual view.
    path: e.realPath || `${base}/${e.name}`,
    parentDirectory: e.realPath ? path.dirname(e.realPath) : base,
    kind: e.kind === 'directory' ? 'directory' : (e.dataUrl || e.kind === 'image' ? 'image' : 'file'),
    size: e.size || 0,
    modified: e.modified || Date.now(),
    created: e.created || e.modified || Date.now(),
    ext: e.kind === 'directory' ? '' : path.extname(e.name).toLowerCase(),
    color: e.color || resolveColor(e.name, e.kind === 'directory', overrides),
    isVirtual: true,
    content: e.content || null,
    dataUrl: e.dataUrl || null,
  }));
  for (const entry of entries) {
    if (!entry.path.startsWith('vdir://')) {
      try { Object.assign(entry, await entryMetadata.get(entry.path, await fs.lstat(entry.path))); } catch {}
    }
    if (entry.kind === 'directory' && !entry.path.startsWith('vdir://')) {
      entry.folderSize = await folderSizes.get(entry.path);
    }
  }
  return { path: uri, isVirtual: true, entries, canGoUp: true };
}

// ---------------------------------------------------------------------------
// IPC: directory listing & navigation
// ---------------------------------------------------------------------------

ipcMain.handle('dir:list', async (_e, rawPath) => {
  try {
    let dirPath = rawPath;
    if (!dirPath || dirPath === '~') dirPath = os.homedir();
    else if (dirPath.startsWith('~/')) dirPath = path.join(os.homedir(), dirPath.slice(2));

    if (dirPath.startsWith('vdir://')) return await listVirtual(dirPath);
    return await listReal(dirPath);
  } catch (err) {
    return { error: err.message, path: rawPath, entries: [], isVirtual: (rawPath || '').startsWith('vdir://') };
  }
});

ipcMain.handle('dir:up', (_e, currentPath) => {
  if (currentPath.startsWith('vdir://')) {
    const rest = currentPath.slice('vdir://'.length);
    if (!rest) return null;
    const parts = rest.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? 'vdir://' + parts.join('/') : 'vdir://';
  }
  const parent = path.dirname(currentPath);
  return parent === currentPath || (process.platform==='darwin'&&parent==='/Volumes') ? 'vdir://drives' : parent;
});

// A request belongs to its renderer and can be cancelled without affecting
// other search windows. Slow/inaccessible child directories are reported.
const searchJobs = new Map();
const searchSenders = new WeakSet();
ipcMain.handle('search:run', async (event, request) => {
  if (!request || typeof request.id !== 'string' || typeof request.root !== 'string' ||
      typeof request.query !== 'string' || !request.query.trim()) throw new Error('Invalid search request.');
  const senderId = event.sender.id;
  const key = `${senderId}:${request.id}`;
  searchJobs.get(key)?.abort();
  const controller = new AbortController();
  searchJobs.set(key, controller);
  if (!searchSenders.has(event.sender)) {
    searchSenders.add(event.sender);
    event.sender.once('destroyed', () => {
      for (const [id, job] of searchJobs) if (id.startsWith(`${senderId}:`)) { job.abort(); searchJobs.delete(id); }
    });
  }
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    return await searchDirectory({ root: request.root, query: request.query,
      recursive: request.recursive === true, signal: controller.signal,
      onProgress: progress=>{if(!controller.signal.aborted&&!event.sender.isDestroyed())event.sender.send('search:progress',{id:request.id,...progress});} },
      directory => directory.startsWith('vdir://') ? listVirtual(directory) : listReal(directory, controller.signal));
  } finally {
    clearTimeout(timeout);
    if (searchJobs.get(key) === controller) searchJobs.delete(key);
  }
});
ipcMain.on('search:cancel', (event, id) => searchJobs.get(`${event.sender.id}:${id}`)?.abort());

ipcMain.handle('fs:home', () => os.homedir());
ipcMain.handle('file:icon', (_event, filePath, options) => getFileIcon(app, filePath, options));
ipcMain.handle('file:icon-family', (_event, filePath, revision) => getFileIconFamily(app, filePath, revision));

// Stats a single real path and returns it in the same entry shape a
// directory listing uses — used for creating desktop shortcuts from
// whatever gets dropped, without listing the whole containing folder.
ipcMain.handle('fs:statEntry', async (_e, targetPath) => {
  const resolved = path.resolve(targetPath);
  const stat = await fs.stat(resolved);
  const name = path.basename(resolved);
  const isDirectory = stat.isDirectory();
  const overrides = await loadExtColors();
  return {
    id: resolved,
    name,
    path: resolved,
    kind: kindForEntry(name, isDirectory),
    size: stat.size,
    modified: stat.mtimeMs,
    created: stat.birthtimeMs,
    ext: path.extname(name).toLowerCase(),
    color: resolveColor(name, isDirectory, overrides),
    isVirtual: false,
  };
});

// ---------------------------------------------------------------------------
// IPC: file operations
// ---------------------------------------------------------------------------

ipcMain.handle('file:open', async (_e, filePath) => {const error=await shell.openPath(filePath);if(!error)await recordActivity('accessed (opened)',filePath);return error;});
ipcMain.handle('history:opened',async(_event,filePath)=>{if(typeof filePath==='string'&&(await fs.stat(filePath)).isFile())await recordActivity('accessed (opened)',filePath);});
ipcMain.handle('location:stat', async (_e, filePath) => {
  try { const stat=await fs.stat(filePath);return {directory:stat.isDirectory(),file:stat.isFile()}; }
  catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')return null;throw error;}
});

ipcMain.handle('file:trash', async (_e, filePath) => {
  await shell.trashItem(filePath);
  await entryMetadata.forget(filePath);
  metadataChanged();
  return true;
});

ipcMain.handle('file:rename', async (_e, oldPath, newName) => {
  const result = await fileTransfers.rename(oldPath, newName);metadataChanged(); return result;
});

ipcMain.handle('file:newFolder', async (_e, dirPath, name) => {
  const target = path.join(dirPath, name);
  await fs.mkdir(target);
  return target;
});

ipcMain.handle('file:showInFolder', (_e, filePath) => {
  shell.showItemInFolder(filePath);
});

// Serialized transfers preserve metadata and never overwrite a destination.
for (const mode of ['copy', 'move']) {
  ipcMain.handle('file:' + mode, async (_event, source, directory) => {
    const result = await fileTransfers.transfer(source, directory, mode === 'copy');
    metadataChanged();
    return result;
  });
}

// Ordinary gestures remain HTML5 drags for precise in-app positioning.
// Shift+drag uses files:native-drag for native multi-file/folder transfers.

// ---------------------------------------------------------------------------
// IPC: per-directory icon layout persistence (free rearrangement in icon view)
// ---------------------------------------------------------------------------

const layoutFile = () => path.join(app.getPath('userData'), 'icon-layout.json');
let layoutCache = null;
let layoutLoading = null;

async function loadLayout() {
  if (layoutCache) return layoutCache;
  if (!layoutLoading) layoutLoading = (async () => {
    try {
      const parsed = JSON.parse(await fs.readFile(layoutFile(), 'utf-8'));
      layoutCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      layoutCache = {};
    }
    return layoutCache;
  })();
  return layoutLoading;
}

let layoutWrites = Promise.resolve();
function saveLayout() {
  // Resize, drag, and multiple windows can save concurrently. Serialize
  // snapshots and replace atomically so these writes cannot truncate each other.
  const snapshot = JSON.stringify(layoutCache, null, 2);
  layoutWrites = layoutWrites.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(layoutFile()), { recursive: true });
    const temporary = `${layoutFile()}.tmp`;
    await fs.writeFile(temporary, snapshot);
    await fs.rename(temporary, layoutFile());
  });
  return layoutWrites;
}

ipcMain.handle('layout:get', async (_e, dirPath) => {
  const layout = await loadLayout();
  return Object.hasOwn(layout, dirPath) ? layout[dirPath] : {};
});

ipcMain.handle('layout:set', async (_e, dirPath, name, pos) => {
  const layout = await loadLayout();
  if (!Object.hasOwn(layout, dirPath)) Object.defineProperty(layout, dirPath, {
    value: {}, enumerable: true, configurable: true, writable: true,
  });
  if (pos === null) delete layout[dirPath][name];
  else {
    // Backwards-compatible patches: moving an icon must preserve its size
    // and interpolation, and appearance-only changes need no saved position.
    const patch = {};
    for (const key of ['x', 'y']) {
      if (Number.isFinite(pos[key])) patch[key] = Math.max(0, pos[key]);
    }
    if (Number.isFinite(pos.size)) patch.size = Math.max(16, Math.min(3840, pos.size));
    if (pos.scaling === 'default' || pos.scaling === 'bilinear') patch.scaling = pos.scaling;
    Object.defineProperty(layout[dirPath], name, {
      value: { ...layout[dirPath][name], ...patch }, enumerable: true, configurable: true, writable: true,
    });
  }
  await saveLayout();
  return true;
});

// ---------------------------------------------------------------------------
// IPC: open a terminal / command prompt at a given real directory
// ---------------------------------------------------------------------------

ipcMain.handle('shell:openTerminal', async (_e, dirPath) => {
  const platform = process.platform;
  let candidates;
  if (platform === 'darwin') {
    candidates = [{ cmd: 'open', args: ['-a', 'Terminal', dirPath], opts: {} }];
  } else if (platform === 'win32') {
    candidates = [{ cmd: 'cmd.exe', args: ['/K'], opts: { cwd: dirPath } }];
  } else {
    candidates = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm'].map((cmd) => ({
      cmd,
      args: [],
      opts: { cwd: dirPath },
    }));
  }

  for (const { cmd, args, opts } of candidates) {
    try {
      const child = spawn(cmd, args, { ...opts, detached: true, stdio: 'ignore' });
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      child.unref();
      return true;
    } catch {
      continue; // try the next candidate
    }
  }
  throw new Error('Could not open a terminal here.');
});

// ---------------------------------------------------------------------------
// IPC: desktop shortcuts (Alt+drag a file onto the app's own desktop area)
// ---------------------------------------------------------------------------

const shortcutsFile = () => path.join(app.getPath('userData'), 'desktop-shortcuts.json');
let shortcutsCache = null;
let shortcutsWrites = Promise.resolve();

async function loadShortcuts() {
  if (shortcutsCache) return shortcutsCache;
  try {
    shortcutsCache = JSON.parse(await fs.readFile(shortcutsFile(), 'utf-8'));
  } catch {
    shortcutsCache = [];
  }
  const builtins = [
    { id: 'builtin-trash', name: process.platform === 'win32' ? 'Recycle Bin' : 'Trash', targetPath: 'system://trash', builtin: 'trash' },
    { id: 'builtin-favorite-images', name: 'Favorites (images)', targetPath: 'vdir://favorites', builtin: 'images' },
    { id: 'builtin-favorite-files', name: 'Favorites (files and folders)', targetPath: 'vdir://favorites_', builtin: 'files' },
    { id: 'builtin-media-player', name: 'Media Player', targetPath: 'system://media-player', builtin: 'media' },
    { id:'builtin-background',name:'Background',targetPath:'system://background',builtin:'background' },
  ];
  let added = false;
  for (const [i, item] of builtins.entries()) if (!shortcutsCache.some(s => s.id === item.id)) {
    shortcutsCache.push({ ...item, kind: 'directory', color: '#e4bb42', x: 108, y: 30 + i * 120 }); added = true;
  }
  if (added) await saveShortcuts();
  return shortcutsCache;
}

async function saveShortcuts() {
  const snapshot = JSON.stringify(shortcutsCache, null, 2);
  shortcutsWrites = shortcutsWrites.catch(() => {}).then(async () => {
    const file = shortcutsFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + '.tmp', snapshot); await fs.rename(file + '.tmp', file);
  });
  await shortcutsWrites;
}

ipcMain.handle('shortcuts:list', async () => loadShortcuts());
ipcMain.handle('shortcuts:appearance', async (_event, id, appearance) => {
  const item = (await loadShortcuts()).find(s => s.id === id);
  if (!item) throw new Error('Shortcut no longer exists.');
  const { normalizeAppearance } = require('./lib/desktopAppearance');
  item.appearance = normalizeAppearance(appearance);
  await saveShortcuts(); return item.appearance;
});
let folderLayoutOptions, folderOptionsWrites=Promise.resolve();
const folderOptionsPath=()=>path.join(app.getPath('userData'),'folder-layout-options.json');
async function loadFolderOptions(){
  if(!folderLayoutOptions)folderLayoutOptions=fs.readFile(folderOptionsPath(),'utf8').then(JSON.parse).catch(()=>({}));
  return folderLayoutOptions;
}
ipcMain.handle('layout:options-get',async (_event,directory)=>{const all=await loadFolderOptions();return Object.hasOwn(all,directory)?all[directory]:{};});
ipcMain.handle('layout:options-set',async (_event,directory,options)=>{
  const all=await loadFolderOptions(), frozen={};
  for(const [name,pos]of Object.entries(options.frozen||{}).slice(0,100000))if(Number.isFinite(pos.x)&&Number.isFinite(pos.y))Object.defineProperty(frozen,name,{value:{x:Math.max(0,pos.x),y:Math.max(0,pos.y)},enumerable:true});
  const value={offsetRows:options.offsetRows===true,dontReflow:options.dontReflow===true,frozen};
  Object.defineProperty(all,directory,{value,enumerable:true,configurable:true,writable:true});
  const data=JSON.stringify(all);
  folderOptionsWrites=folderOptionsWrites.catch(()=>{}).then(async()=>{await fs.writeFile(folderOptionsPath()+'.tmp',data);await fs.rename(folderOptionsPath()+'.tmp',folderOptionsPath());});await folderOptionsWrites;return value;
});
ipcMain.handle('layout:realign',async (_event,directory)=>{
  const all=await loadLayout();if(Object.hasOwn(all,directory))for(const appearance of Object.values(all[directory])){delete appearance.x;delete appearance.y;}await saveLayout();return true;
});
ipcMain.handle('shortcuts:pickIcon', async () => {
  const result = await dialog.showOpenDialog({ title: 'Choose Shortcut Image', properties: ['openFile'], filters: [{ name: 'Images', extensions: [...IMAGE_EXTS].map(e => e.slice(1)) }, { name: 'All files', extensions: ['*'] }] });
  if (result.canceled || !result.filePaths.length) return null;
  const file = result.filePaths[0];
  if ((await fs.stat(file)).size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml' : ['.jpg','.jpeg','.jpe','.jfif'].includes(ext) ? 'image/jpeg' : ext === '.ico' ? 'image/x-icon' : `image/${ext.slice(1)}`;
  return `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;
});

ipcMain.handle('shortcuts:add', async (_e, shortcut) => {
  const list = await loadShortcuts();
  list.push(shortcut);
  await saveShortcuts();
  return shortcut;
});

ipcMain.handle('shortcuts:remove', async (_e, id) => {
  const list = await loadShortcuts();
  const idx = list.findIndex((s) => s.id === id);
  if (idx !== -1) list.splice(idx, 1);
  await saveShortcuts();
  return true;
});

ipcMain.handle('shortcuts:setPos', async (_e, id, pos) => {
  const list = await loadShortcuts();
  const item = list.find((s) => s.id === id);
  if (item) {
    item.x = pos.x;
    item.y = pos.y;
  }
  await saveShortcuts();
  return true;
});

// ---------------------------------------------------------------------------
// IPC: favorite images (☆ button in the image viewer). Read by the
// favorites.vdir.js virtual directory, which lists whatever's in this file.
// ---------------------------------------------------------------------------

const favoritesFile = () => path.join(app.getPath('userData'), 'favorites.json');
let favoritesCache = null;

async function loadFavoritesList() {
  if (favoritesCache) return favoritesCache;
  try {
    favoritesCache = JSON.parse(await fs.readFile(favoritesFile(), 'utf-8'));
  } catch {
    favoritesCache = [];
  }
  return favoritesCache;
}

async function saveFavoritesList() {
  await fs.mkdir(path.dirname(favoritesFile()), { recursive: true });
  await fs.writeFile(favoritesFile(), JSON.stringify(favoritesCache, null, 2));
}

ipcMain.handle('favorites:list', async () => loadFavoritesList());

ipcMain.handle('favorites:add', async (_e, filePath) => {
  const list = await loadFavoritesList();
  const resolved = path.resolve(filePath);
  if (!list.includes(resolved)) list.push(resolved);
  await saveFavoritesList();
  return list;
});

ipcMain.handle('favorites:remove', async (_e, filePath) => {
  const list = await loadFavoritesList();
  const resolved = path.resolve(filePath);
  const idx = list.indexOf(resolved);
  if (idx !== -1) list.splice(idx, 1);
  await saveFavoritesList();
  return list;
});

// ---------------------------------------------------------------------------
// IPC: in-app terminal (real PTY via node-pty, rendered with xterm.js)
// ---------------------------------------------------------------------------
// node-pty is a native module — it needs to be present and rebuilt against
// Electron's own Node ABI (see README: "Setting up the terminal feature")
// before this will work. Loading it is wrapped in try/catch so a missing
// or not-yet-rebuilt module doesn't crash the whole app; terminal windows
// just show a clear error instead.

let pty = null;
let ptyLoadError = null;
try {
  pty = require('node-pty');
} catch (err) {
  ptyLoadError = err;
}

const ptyProcesses = new Map(); // terminal id -> IPty instance

function defaultShell() {
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe';
  return process.env.SHELL || '/bin/zsh';
}

ipcMain.handle('terminal:spawn', (event, cwd) => {
  if (!pty) {
    throw new Error(
      `The terminal isn't set up yet — node-pty didn't load (${ptyLoadError ? ptyLoadError.message : 'unknown error'}). ` +
        'Run "npm install" and then rebuild native modules for Electron — see the README.'
    );
  }
  const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const shell = defaultShell();
  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd && !cwd.startsWith('vdir://') ? cwd : os.homedir(),
      env: process.env,
    });
  } catch (err) {
    throw new Error(`Couldn't start ${shell}: ${err.message}`);
  }
  ptyProcesses.set(id, ptyProcess);

  ptyProcess.onData((data) => {
    if (!event.sender.isDestroyed()) event.sender.send('terminal:data', id, data);
  });
  ptyProcess.onExit(({ exitCode, signal }) => {
    if (!event.sender.isDestroyed()) event.sender.send('terminal:exit', id, exitCode, signal);
    ptyProcesses.delete(id);
  });

  return { id, shell, pid: ptyProcess.pid };
});

ipcMain.on('terminal:input', (_e, id, data) => {
  const p = ptyProcesses.get(id);
  if (p) {
    try {
      p.write(data);
    } catch {
      /* pty may have just exited */
    }
  }
});

ipcMain.on('terminal:resize', (_e, id, cols, rows) => {
  const p = ptyProcesses.get(id);
  if (p && cols > 0 && rows > 0) {
    try {
      p.resize(cols, rows);
    } catch {
      /* pty may have just exited */
    }
  }
});

ipcMain.on('terminal:kill', (_e, id) => {
  const p = ptyProcesses.get(id);
  if (p) {
    try {
      p.kill();
    } catch {
      /* already dead */
    }
    ptyProcesses.delete(id);
  }
});

function killAllTerminals() {
  for (const p of ptyProcesses.values()) {
    try {
      p.kill();
    } catch {
      /* already dead */
    }
  }
  ptyProcesses.clear();
}

// Terminal appearance settings — one shared, persisted profile applied to
// every open (and future) terminal window.
const terminalSettingsFile = () => path.join(app.getPath('userData'), 'terminal-settings.json');
const DEFAULT_TERMINAL_SETTINGS = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  foreground: '#f0f0f0',
  background: '#1c1c1c',
  cursorBlink: true,
};
let terminalSettingsCache = null;

async function loadTerminalSettings() {
  if (terminalSettingsCache) return terminalSettingsCache;
  try {
    const saved = JSON.parse(await fs.readFile(terminalSettingsFile(), 'utf-8'));
    terminalSettingsCache = { ...DEFAULT_TERMINAL_SETTINGS, ...saved };
  } catch {
    terminalSettingsCache = { ...DEFAULT_TERMINAL_SETTINGS };
  }
  return terminalSettingsCache;
}

ipcMain.handle('terminal:getSettings', async () => loadTerminalSettings());

ipcMain.handle('terminal:setSettings', async (_e, settings) => {
  const current = await loadTerminalSettings();
  terminalSettingsCache = { ...current, ...settings };
  await fs.mkdir(path.dirname(terminalSettingsFile()), { recursive: true });
  await fs.writeFile(terminalSettingsFile(), JSON.stringify(terminalSettingsCache, null, 2));
  return terminalSettingsCache;
});

// ---------------------------------------------------------------------------
// Window / app lifecycle
// ---------------------------------------------------------------------------

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0f4c4c',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  // Route system-menu shortcuts to the active internal window before the
  let finishingRecording = false, recordingCloseReady = false;
  win.on('close', event => {
    if (recordingCloseReady || ![...recordings.active.values()].some(r => r.owner === win.webContents.id)) return;
    event.preventDefault();
    if (finishingRecording) return;
    finishingRecording = true;
    win.webContents.executeJavaScript('MediaPlayer.shutdown()').catch(error => console.error('Recording retained in EFM Recordings:', error)).finally(() => {
      recordingCloseReady = true; if (!win.isDestroyed()) win.close();
    });
  });
  // Route system-menu shortcuts to the active internal window before the
  // host window/menu consumes them. Never register an OS-wide shortcut.
  win.webContents.on('before-input-event', (event, input) => {
    // Native Edit-menu accelerators otherwise consume Ctrl+C/V before our
    // file clipboard sees them. Keep native text editing when an input owns focus.
    win.webContents.setIgnoreMenuShortcuts(fileKeyboardModes.get(win.webContents) === true &&
      (input.control || input.meta) && ['a', 'c', 'v', 'x'].includes(input.key.toLowerCase()));
    if (input.control || input.shift) return;
    const homeKey = input.key.toLowerCase() === 'e' && (input.alt || input.meta);
    if (homeKey) {
      event.preventDefault();
      if (input.type === 'keyDown' && !input.isAutoRepeat) win.webContents.send('menu:new-window', os.homedir());
      return;
    }
    const menuKey = (input.alt && !input.meta && input.key.toLowerCase() === 'q') ||
      (process.platform === 'darwin' && input.meta && !input.alt && input.code === 'Space');
    const closeKey = input.alt && !input.meta && input.key === 'F4';
    if (!menuKey && !closeKey) return;
    event.preventDefault();
    if (input.type === 'keyDown' && !input.isAutoRepeat) {
      win.webContents.send('window:system-command', input.key === 'F4' ? 'close' : 'menu');
    }
  });
  require('./lib/backgroundDownloads').attachBackgroundDownloads(win);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  return win;
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Home Window',
          accelerator: 'CmdOrCtrl+N',
          click: (_item, win) => win && win.webContents.send('menu:new-window', os.homedir()),
        },
        {
          label: 'New Virtual Directories Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: (_item, win) => win && win.webContents.send('menu:new-window', 'vdir://'),
        },
        { label: 'Media Player', click: (_item, win) => win?.webContents.send('menu:media-player') },
        { type: 'separator' },
        {
          label: 'Settings\u2026',
          accelerator: 'CmdOrCtrl+,',
          click: (_item, win) => win && win.webContents.send('menu:open-settings'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: 'Shortcuts', click: (_item, win) => win?.webContents.send('menu:shortcuts') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  if(process.platform==='win32')nativeClipboard.request({action:'ping'}).catch(()=>{});
  if(process.platform==='win32')windowsFileDrag.build().catch(error=>console.error('Native drag helper:',error.message));
  loadVirtualDirectories();
  buildAppMenu();
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  killAllTerminals();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  nativeClipboard.stop();
  stopIconWorker();
  killAllTerminals();
});
