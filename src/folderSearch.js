const FolderSearch = {
  shortcut(event, manager) {
    if (!event.ctrlKey || event.altKey || event.metaKey || !['f', 'e'].includes(event.key.toLowerCase()) ||
        document.querySelector('.modal-overlay:not(.hidden)')) return false;
    const active = manager.getActive();
    let owner = active?.type === 'directory' ? active : active?.type === 'search' ? active.owner : null;
    if (active?.type === 'search-results') {
      owner = active.searchOwner?.el.isConnected ? active.searchOwner : manager.open(active.spec.root);
    }
    if (!owner) return false; // Keep terminal editing shortcuts available to the shell.
    event.preventDefault();
    const gui = this.open(owner);
    gui.query.select();
    return true;
  },
  open(owner) {
    if (owner.type !== 'directory') return;
    if (owner.searchDialog?.el.isConnected) {
      owner.searchDialog.el.classList.remove('minimized');
      owner.manager.focus(owner.searchDialog.id);
      owner.searchDialog.query.focus();
      return owner.searchDialog;
    }
    const dialog = new FolderSearchWindow(owner);
    owner.searchDialog = dialog;
    owner.manager.windows.push(dialog);
    owner.manager.focus(dialog.id);
    dialog.query.focus();
    return dialog;
  },

  async results(owner, spec, result) {
    const win = new SearchResultsWindow(owner.manager, spec, result);
    win.searchOwner = owner;
    owner.manager.windows.push(win);
    owner.manager.focus(win.id);
    await win.showResults(result);
    return win;
  },

  summary(result) {
    return `${result.entries.length} match${result.entries.length === 1 ? '' : 'es'}` +
      (result.skipped ? `; ${result.skipped} inaccessible folder(s) skipped` : '') +
      (result.truncated ? '; search limit reached — results are incomplete' : '');
  },
};

class FolderSearchWindow extends FMWindow {
  constructor(owner) {
    super(owner.manager, { path: owner.path, x: owner.x + 35, y: owner.y + 35, width: 440, height: 300 });
    this.type = 'search';
    this.owner = owner;
    this.requestId = null;
    this.el.querySelector('.fm-title-text').textContent = 'Search';
    this.el.querySelector('.fm-locationbar').hidden = true;
    this.el.querySelector('.fm-locationbar').style.display = 'none';
    const content = this.el.querySelector('.fm-content');
    content.className = 'fm-content folder-search-content';
    content.innerHTML = `
      <form class="folder-search-form">
        <div class="search-scope"></div>
        <label>Filename contains<input class="search-query" type="text" required spellcheck="false" /></label>
        <label><input class="search-recursive" type="checkbox" /> Search Recursively</label>
        <label><input class="search-select" type="checkbox" /> Select</label>
        <label><input class="search-highlight-option" type="checkbox" /> Highlight</label>
        <div class="search-actions"><button type="submit">Search</button><button class="search-stop" type="button" disabled>Stop</button><button class="search-clear" type="button">Clear Highlights</button></div>
        <progress class="search-progress" hidden aria-label="Search progress"></progress>
      </form>`;
    this.query = content.querySelector('.search-query');
    const schedule=()=>{this.cancel();this.liveTimer=setTimeout(()=>this.search(),250);};
    this.query.addEventListener('input',schedule);
    content.querySelectorAll('input[type=checkbox]').forEach(input=>input.addEventListener('change',schedule));
    this.unsubscribeProgress=window.fm.onSearchProgress(progress=>{
      if(progress.id!==this.requestId)return;
      this.setStatus(`${progress.entries.length} matches · ${progress.scanned} folders searched · ${progress.pending} pending`);
      if(this.streamResults&&this.liveResults?.el.isConnected)this.liveResults.showResults(progress);
    });
    content.querySelector('form').addEventListener('submit', event => { event.preventDefault(); this.search(); });
    content.querySelector('.search-stop').onclick = () => this.cancel();
    content.querySelector('.search-clear').onclick = () => {
      owner.searchHighlights.clear(); FileView.refreshSelectionClasses(owner);
    };
    content.addEventListener('contextmenu', event => event.stopImmediatePropagation(), true);
    this.updateScope();
  }

  updateScope() {
    this.el.querySelector('.search-scope').textContent = `In: ${this.owner.path}`;
  }

  busy(value) {
    this.el.querySelector('.search-progress').hidden=!value;
    this.el.querySelector('button[type=submit]').disabled = value;
    this.el.querySelector('.search-stop').disabled = !value;
  }

  cancel() {
    clearTimeout(this.liveTimer);
    if (!this.requestId) return;
    window.fm.cancelSearch(this.requestId);
    this.requestId = null;
    this.busy(false);
    this.setStatus('Search stopped.');
  }

  async search() {
    const query = this.query.value.trim();
    this.cancel();
    if (!query) { if(this.liveResults?.el.isConnected)await this.liveResults.showResults({entries:[]});this.setStatus('Enter part of a filename.');return; }
    const id = Utils.uid('search');
    const root = this.owner.path;
    const recursive = this.el.querySelector('.search-recursive').checked;
    const select = this.el.querySelector('.search-select').checked;
    const highlight = this.el.querySelector('.search-highlight-option').checked;
    this.streamResults=!select&&!highlight;
    this.requestId = id;
    this.busy(true); this.setStatus('Searching…');
    if(!select&&!highlight){
      const spec={root,query,recursive};
      if(!this.liveResults?.el.isConnected){this.liveResults=new SearchResultsWindow(this.manager,spec);this.liveResults.searchOwner=this.owner;this.manager.windows.push(this.liveResults);}
      this.liveResults.spec=spec;this.liveResults.el.querySelector('.fm-title-text').textContent=`Search: ${query}`;
      this.liveResults.el.querySelector('.fm-location-input').value=root;
      await this.liveResults.showResults({entries:[]});
      this.manager.focus(this.id); // Keep typing in the search field as results arrive.
    }
    try {
      if(this.requestId!==id)return;
      const result = await window.fm.searchDirectory({ id, root, query, recursive });
      if (this.requestId !== id || !this.owner.el.isConnected || this.owner.path !== root) return;
      const matches = new Set(result.entries.map(entry => entry.id));
      const local = this.owner.entries.filter(entry => matches.has(entry.id)).map(entry => entry.id);
      if (select) this.owner.selection = new Set(local);
      this.owner.searchHighlights = new Set(highlight ? local : []);
      FileView.refreshSelectionClasses(this.owner);
      FileView.updateStatus(this.owner);
      const summary = FolderSearch.summary(result);
      this.setStatus(summary + (select || highlight ? `; ${local.length} in the source folder` : ''));
      if (!select && !highlight && this.liveResults?.el.isConnected) await this.liveResults.showResults(result);
    } catch (error) {
      if (this.requestId === id) this.setStatus(`Search failed or timed out: ${error.message}`);
    } finally {
      if (this.requestId === id) { this.requestId = null; this.busy(false); }
    }
  }

  destroy() {
    this.cancel();
    this.unsubscribeProgress?.();
    if (this.owner.searchDialog === this) this.owner.searchDialog = null;
  }
}

class SearchResultsWindow extends FMWindow {
  constructor(manager, spec) {
    super(manager, { path: spec.root, x: 90, y: 70, width: 900, height: 480 });
    this.type = 'search-results';
    this.spec = spec;
    this.viewMode = 'detail';
    this.el.querySelector('.fm-title-text').textContent = `Search: ${spec.query}`;
    const input = this.el.querySelector('.fm-location-input');
    input.value = spec.root; input.readOnly = true;
    this.el.querySelector('.fm-search-btn').hidden = true;
    const refresh = this.el.querySelector('.fm-go-btn');
    refresh.textContent = 'Refresh'; refresh.onclick = () => this.refresh();
  }

  async showResults(result) {
    this.entries = result.entries;
    this.selection.clear();
    this.preview = null;
    await FileView.render(this);
    this.setStatus(FolderSearch.summary(result));
  }

  async refresh() {
    if (this.requestId) window.fm.cancelSearch(this.requestId);
    const id = this.requestId = Utils.uid('search');
    this.setStatus('Searching…');
    try {
      const result = await window.fm.searchDirectory({ ...this.spec, id });
      if (this.requestId === id && this.el.isConnected) await this.showResults(result);
    } catch (error) {
      if (this.requestId === id) this.setStatus(`Search failed or timed out: ${error.message}`);
    } finally { if (this.requestId === id) this.requestId = null; }
  }
  navigate() { return this.refresh(); }
  goUp() {}
  goBack() {}
  goForward() {}
  toggleView() {}
  destroy() { if (this.requestId) window.fm.cancelSearch(this.requestId); this.requestId = null; }
}
