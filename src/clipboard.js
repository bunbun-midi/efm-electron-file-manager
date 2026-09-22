// A single app-wide clipboard for cut/copy/paste. Cut items are dimmed in
// their source window until pasted (or until a new cut/copy replaces them).

const Clipboard = {
  mode: null, // 'copy' | 'cut' | null
  paths: [],
  sourceWin: null,

  copy(win) {
    this._clearCutVisual();
    const ids = [...win.selection];
    this.paths = win.entries.filter((e) => ids.includes(e.id) && FileView.hasNativeProperties(e)).map((e) => e.path);
    this.mode = this.paths.length ? 'copy' : null;
    this.sourceWin = win;
    this.publish(win);
    if (this.paths.length) win.setStatus(`${this.paths.length} item${this.paths.length === 1 ? '' : 's'} copied`);
  },

  cut(win) {
    this._clearCutVisual();
    const ids = [...win.selection];
    this.paths = win.entries.filter((e) => ids.includes(e.id) && FileView.hasNativeProperties(e)).map((e) => e.path);
    this.mode = this.paths.length ? 'cut' : null;
    this.sourceWin = win;
    this.publish(win);
    if (!this.paths.length) return;
    ids.forEach((id) => {
      const el = win.el.querySelector(`[data-entry-id="${CSS.escape(String(id))}"]`);
      if (el) el.classList.add('cut');
    });
    win.setStatus(`${this.paths.length} item${this.paths.length === 1 ? '' : 's'} cut`);
  },

  async paste(win) {
    if (this.pasting) return;
    if (win.path.startsWith('vdir://')) {
      win.setStatus("Can't paste into a virtual directory.");
      return;
    }

    this.pasting = true;
    try {
      await this.pendingWrite;
      if (window.fm.fileClipboard) {
        const snapshot=await window.fm.fileClipboard({action:'read'});
        if(this.paths.join('\0')!==snapshot.paths.join('\0'))this._clearCutVisual();
        this.paths=snapshot.paths;this.mode=snapshot.mode;this.nativeToken=snapshot.token;
      }
    } catch(error) { this.pasting=false;win.setStatus(`Could not read file clipboard: ${error.message}`);return; }
    if(!this.paths.length){this.pasting=false;win.setStatus('The clipboard contains no files or folders.');return;}
    const clipboardToken=this.nativeToken;
    const mode = this.mode, paths = [...this.paths], directory = win.path;
    const errors = [], warnings = [], failed = [];
    for (const p of paths) {
      try {
        const result = mode === 'cut' ? await window.fm.moveItem(p, directory) : await window.fm.copyItem(p, directory);
        warnings.push(...(result?.warnings || []));
      } catch (err) {
        failed.push(p); errors.push(`Paste failed: ${err.message}`);
      }
    }

    const wasCut = mode === 'cut';
    const movedPaths = paths.filter(p => !failed.includes(p));
    if (wasCut && this.mode === mode && this.paths.length === paths.length && this.paths.every((p, i) => p === paths[i])) {
      this._clearCutVisual();
      this.paths = failed;
      this.mode = failed.length ? 'cut' : null;
      if(window.fm.fileClipboard) {
        try { await window.fm.fileClipboard({action:'commit',token:clipboardToken,paths:failed}); }
        catch(error){warnings.push(`Files transferred, but the clipboard could not be updated: ${error.message}`);}
      }
    }

    try { await win.navigate(win.path); } finally { this.pasting = false; }

    if (wasCut) {
      const sourceDirs = new Set(movedPaths.map((p) => window.fm.dirname(p)));
      sourceDirs.forEach((d) => {
        if (d !== win.path) win.manager.refreshWindowsShowingPath(d);
      });
    }
    win.setStatus([...errors, ...warnings].join(' ') || `${paths.length - failed.length} item(s) ${wasCut ? 'moved' : 'copied'}.`);
  },

  _clearCutVisual() {
    if (this.sourceWin) {
      this.sourceWin.el.querySelectorAll('.cut').forEach((el) => el.classList.remove('cut'));
    }
  },
  publish(win) {
    if(!window.fm.fileClipboard||!this.paths.length)return;
    this.pendingWrite=window.fm.fileClipboard({action:'write',paths:[...this.paths],mode:this.mode}).then(snapshot=>{this.nativeToken=snapshot.token;}).catch(error=>{win.setStatus(`Could not publish files to the OS clipboard: ${error.message}`);throw error;});
    this.pendingWrite.catch(()=>{});
  },
};
