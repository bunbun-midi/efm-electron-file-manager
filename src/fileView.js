const FileView = {
  async render(win) {
    const content = win.el.querySelector('.fm-content');
    content.innerHTML = '';
    content.classList.remove('detail-mode', 'icon-mode', 'image-mode');

    if (win.preview) {
      content.classList.add('image-mode');
      this.renderPreviewOverlay(win, content);
      this.updateStatus(win);
      return;
    }

    if (win.viewMode === 'detail') {
      content.classList.add('detail-mode');
      this.renderDetailView(win, content);
    } else {
      content.classList.add('icon-mode');
      await this.renderIconView(win, content);
    }
    this.updateStatus(win);
  },

  updateStatus(win) {
    const total = win.entries.length;
    const sel = win.selection.size;
    win.setStatus(sel > 0 ? `${sel} of ${total} selected` : `${total} item${total === 1 ? '' : 's'}`);
  },

  refreshSelectionClasses(win) {
    const content = win.el.querySelector('.fm-content');
    content.querySelectorAll('[data-entry-id]').forEach((el) => {
      el.classList.toggle('selected', win.selection.has(el.dataset.entryId));
      el.classList.toggle('search-highlight', !!win.searchHighlights?.has(el.dataset.entryId));
      el.classList.toggle('favorite-highlight', !!win.entries.find(entry => entry.id === el.dataset.entryId)?.bookmarked);
    });
  },

  clearSelection(win) {
    win.selection.clear();
    this.refreshSelectionClasses(win);
    this.updateStatus(win);
  },

  // Reads an icon's actual rendered position from the DOM — the single
  // source of truth for "where is this on screen right now", whether it
  // came from saved layout or an auto-assigned grid slot.
  getIconPosition(win, entryId) {
    const el = win.el.querySelector(`[data-entry-id="${CSS.escape(String(entryId))}"]`);
    if (!el) return null;
    return { x: parseInt(el.style.left, 10) || 0, y: parseInt(el.style.top, 10) || 0 };
  },

  scrollEntryIntoView(win, entryId) {
    const el = win.el.querySelector(`[data-entry-id="${CSS.escape(String(entryId))}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },

  // Spatial arrow-key navigation for icon view: picks whichever icon is
  // actually nearest in the pressed direction (by on-screen position),
  // rather than just stepping through the sorted list — since icons can be
  // freely dragged anywhere, list order and visual order don't match.
  // Candidates strictly behind the current item (wrong side of the axis)
  // are excluded, then scored by distance along the direction, weighted
  // to prefer staying roughly in the same row/column over cutting a
  // diagonal — the same heuristic used for TV/console d-pad navigation.
  moveSelectionInDirection(win, direction) {
    if (win.viewMode !== 'icon') return;
    const entries = this.sortedEntries(win);
    if (entries.length === 0) return;

    if (win.selection.size === 0) {
      win.selection = new Set([entries[0].id]);
      this.refreshSelectionClasses(win);
      this.updateStatus(win);
      this.scrollEntryIntoView(win, entries[0].id);
      return;
    }

    const anchorId = [...win.selection][win.selection.size - 1];
    const anchorPos = this.getIconPosition(win, anchorId);
    if (!anchorPos) return;

    let best = null;
    let bestScore = Infinity;
    for (const e of entries) {
      if (e.id === anchorId) continue;
      const pos = this.getIconPosition(win, e.id);
      if (!pos) continue;
      const dx = pos.x - anchorPos.x;
      const dy = pos.y - anchorPos.y;
      let primary;
      let perpendicular;
      if (direction === 'right') {
        if (dx <= 0) continue;
        primary = dx;
        perpendicular = Math.abs(dy);
      } else if (direction === 'left') {
        if (dx >= 0) continue;
        primary = -dx;
        perpendicular = Math.abs(dy);
      } else if (direction === 'down') {
        if (dy <= 0) continue;
        primary = dy;
        perpendicular = Math.abs(dx);
      } else {
        if (dy >= 0) continue;
        primary = -dy;
        perpendicular = Math.abs(dx);
      }
      const score = primary + perpendicular * 2;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) return; // nothing further in that direction

    win.selection = new Set([best.id]);
    this.refreshSelectionClasses(win);
    this.updateStatus(win);
    this.scrollEntryIntoView(win, best.id);
  },

  // Windows-Explorer-style "type to select": typing accumulates into a
  // short-lived buffer and jumps to the first entry (in the current sort
  // order) whose name starts with it. Repeating the same single letter
  // quickly cycles through every entry starting with that letter instead
  // of accumulating into a two-letter search — matching real Explorer.
  // Works in both icon and detail view.
  typeAheadSelect(win, char) {
    const now = Date.now();
    const timeout = 800;
    const withinTimeout = now - win.typeAheadLast < timeout;
    const isRepeatSameLetter =
      withinTimeout && win.typeAheadBuffer.length === 1 && char.toLowerCase() === win.typeAheadBuffer.toLowerCase();

    if (isRepeatSameLetter) {
      win.typeAheadCycle += 1;
    } else if (withinTimeout && win.typeAheadBuffer) {
      win.typeAheadBuffer += char;
      win.typeAheadCycle = 0;
    } else {
      win.typeAheadBuffer = char;
      win.typeAheadCycle = 0;
    }
    win.typeAheadLast = now;

    const query = win.typeAheadBuffer.toLowerCase();
    const matches = this.sortedEntries(win).filter((e) => e.name.toLowerCase().startsWith(query));
    if (matches.length === 0) return;
    const target = matches[win.typeAheadCycle % matches.length];

    win.selection = new Set([target.id]);
    this.refreshSelectionClasses(win);
    this.updateStatus(win);
    this.scrollEntryIntoView(win, target.id);
  },

  sortedEntries(win) {
    const dirsFirst = (a, b) => ((a.kind === 'directory') === (b.kind === 'directory') ? 0 : a.kind === 'directory' ? -1 : 1);
    const arr = [...win.entries];
    arr.sort((a, b) => {
      if (win.sortKey === 'name') {
        const df = dirsFirst(a, b);
        if (df !== 0) return df;
      }
      let av = a[win.sortKey];
      let bv = b[win.sortKey];
      if (['order', 'note'].includes(win.sortKey)) {
        return String(av || '').localeCompare(String(bv || ''), undefined, { numeric: true, sensitivity: 'base' }) * win.sortDir;
      }
      av ??= ''; bv ??= '';
      if (win.sortKey === 'size') {
        av = a.kind === 'directory' ? (a.folderSize?.bytes ?? -1) : a.size;
        bv = b.kind === 'directory' ? (b.folderSize?.bytes ?? -1) : b.size;
      }
      if (typeof av === 'string') {
        av = av.toLowerCase();
        bv = bv.toLowerCase();
      }
      if (av < bv) return -1 * win.sortDir;
      if (av > bv) return 1 * win.sortDir;
      return 0;
    });
    return arr;
  },

  // -- Preview overlay (images expand to fill the window's viewport; text
  //    files from virtual directories get a simple reader) -----------------

  renderPreviewOverlay(win, content) {
    const entry = win.preview;
    const wrap = document.createElement('div');
    wrap.className = 'image-viewer';

    const bar = document.createElement('div');
    bar.className = 'image-viewer-bar';
    const back = document.createElement('button');
    back.className = 'image-toolbar-btn';
    back.textContent = '◀ Back';
    back.onclick = () => {
      if(win.type==='image-viewer'){win.manager.close(win.id);return;}
      win.preview = null;
      FileView.render(win);
    };
    const nameSpan = document.createElement('span');
    nameSpan.className = 'image-viewer-name';
    nameSpan.textContent = entry.name;
    bar.appendChild(back);
    bar.appendChild(nameSpan);

    if (!entry.isText) {
      // Only entries backed by a real file can be favorited — purely
      // generated images (e.g. the Color Gallery's swatches) have no
      // underlying file to point a favorite at.
      if (!entry.dataUrl) {
        const favBtn = document.createElement('button');
        favBtn.className = 'image-toolbar-btn favorite-btn';
        favBtn.title = 'Favorite this image';
        bar.appendChild(favBtn);
        this.refreshFavoriteButton(favBtn, entry.path);
        favBtn.onclick = async () => {
          try {
            const list = await window.fm.listFavorites();
            if (list.includes(entry.path)) await window.fm.removeFavorite(entry.path);
            else await window.fm.addFavorite(entry.path);
          } catch {
            /* non-fatal */
          }
          this.refreshFavoriteButton(favBtn, entry.path);
        };
      }

      const viewFavBtn = document.createElement('button');
      viewFavBtn.className = 'image-toolbar-btn';
      viewFavBtn.textContent = '\u2b50 Favorites';
      viewFavBtn.title = 'Open your favorited images';
      viewFavBtn.onclick = () => win.manager.open('vdir://favorites');
      bar.appendChild(viewFavBtn);

      const pixelBtn = document.createElement('button');
      pixelBtn.className = 'image-toolbar-btn';
      pixelBtn.textContent = win.previewPixelated ? '\u25a6 Pixelated' : '\u25a3 Smooth';
      pixelBtn.title = 'Toggle nearest-neighbor (pixelated) vs. smooth scaling';
      pixelBtn.onclick = () => {
        win.previewPixelated = !win.previewPixelated;
        const imgEl = win.el.querySelector('.image-viewer-holder img');
        if (imgEl) imgEl.style.imageRendering = win.previewPixelated ? 'pixelated' : 'auto';
        pixelBtn.textContent = win.previewPixelated ? '\u25a6 Pixelated' : '\u25a3 Smooth';
      };
      bar.appendChild(pixelBtn);

      const zoomLabel = document.createElement('span');
      zoomLabel.className = 'image-zoom-label';
      zoomLabel.textContent = `${Math.round((win.previewZoom || 1) * 100)}%`;
      bar.appendChild(zoomLabel);
    }
    wrap.appendChild(bar);

    if (entry.isText) {
      const pre = document.createElement('pre');
      pre.className = 'text-viewer';
      pre.textContent = entry.content;
      wrap.appendChild(pre);
    } else {
      const holder = document.createElement('div');
      holder.className = 'image-viewer-holder';
      const img = document.createElement('img');
      img.alt = entry.name;
      if(win.type==='image-viewer')img.onload=()=>{if(win.lastAccessedImage!==entry.path&&!entry.path.startsWith('vdir://')){win.lastAccessedImage=entry.path;window.fm.recordOpened(entry.path).catch(()=>{});}};
      img.src = entry.dataUrl || window.fm.toFileUrl(entry.path);
      img.style.transform = `scale(${win.previewZoom || 1})`;
      img.style.imageRendering = win.previewPixelated ? 'pixelated' : 'auto';
      holder.appendChild(img);
      wrap.appendChild(holder);

      // Ctrl (or Cmd) + wheel zooms in/out; plain wheel (or Right/Left
      // Arrow, wired in renderer.js) steps to the next/previous image.
      // macOS trackpad pinch also reports as a wheel event with ctrlKey
      // true, so this doubles as pinch-to-zoom for free.
      holder.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            this.zoomPreview(win, e.deltaY < 0 ? 0.1 : -0.1);
          } else {
            this.stepPreview(win, e.deltaY > 0 ? 1 : -1);
          }
        },
        { passive: false }
      );
    }
    content.appendChild(wrap);
  },

  async refreshFavoriteButton(btn, realPath) {
    try {
      const list = await window.fm.listFavorites();
      const isFav = list.includes(realPath);
      btn.textContent = isFav ? '\u2605 Favorited' : '\u2606 Favorite';
      btn.classList.toggle('is-favorite', isFav);
    } catch {
      btn.textContent = '\u2606 Favorite';
    }
  },

  // Adjusts win.previewZoom and applies it directly to the already-rendered
  // <img>, rather than re-rendering — keeps rapid wheel ticks smooth.
  zoomPreview(win, delta) {
    if (!win.preview || win.preview.isText) return;
    const current = win.previewZoom || 1;
    const next = Math.min(5, Math.max(0.2, +(current + delta).toFixed(2)));
    if (next === current) return;
    win.previewZoom = next;
    const img = win.el.querySelector('.image-viewer-holder img');
    const label = win.el.querySelector('.image-zoom-label');
    if (img) img.style.transform = `scale(${next})`;
    if (label) label.textContent = `${Math.round(next * 100)}%`;
  },

  // Moves win.preview to the next/previous image in the current directory
  // listing (wraps around at the ends). Right Arrow / wheel-down step
  // forward, Left Arrow / wheel-up step back — wired up from here and from
  // renderer.js's keydown handler.
  stepPreview(win, direction) {
    if (!win.preview || win.preview.isText) return;
    const images = this.sortedEntries(win).filter((e) => e.kind === 'image');
    if (images.length === 0) return;
    const idx = images.findIndex((e) => e.id === win.preview.id);
    const nextIdx = idx === -1 ? 0 : (idx + direction + images.length) % images.length;
    win.preview = images[nextIdx];
    win.previewZoom = 1;
    this.render(win);
  },

  // -- Detail view ----------------------------------------------------------

  metadataFields: ['order', 'note', 'prevName', 'origName', 'md5', 'sha256', 'sha512', 'created'],
  updateMetadata(win, entry, metadata) {
    Object.assign(entry, metadata);
    const row = win.el.querySelector(`[data-entry-id="${CSS.escape(String(entry.id))}"]`);
    if (!row) return;
    row.classList.toggle('favorite-highlight', !!entry.bookmarked);
    for (const field of this.metadataFields) {
      const cell = row.querySelector(`.cell-${field}`);
      if (cell && !cell.querySelector('input')) {
        cell.textContent = field === 'created' ? Utils.formatDate(entry.created) : entry[field] || '';
        cell.title = cell.textContent;
      }
    }
  },
  async refreshMetadata(manager) {
    for (const win of [...manager.windows]) {
      if (['vdir://favorites_','vdir://metadata'].includes(win.path)) { await win.navigate(win.path); continue; }
      for (const entry of [...(win.entries || [])]) {
        if (!this.hasNativeProperties(entry)) continue;
        try {
          const meta = await window.fm.getEntryMetadata(entry.path);
          if (win.entries.includes(entry)) this.updateMetadata(win, entry, meta);
        } catch { /* Item may have moved or been deleted. */ }
      }
      this.sortRows(win);
    }
  },
  sortRows(win) {
    const body = win.el.querySelector('.detail-table tbody');
    if (!body || body.querySelector('input')) return;
    for (const entry of this.sortedEntries(win)) {
      const row = body.querySelector(`[data-entry-id="${CSS.escape(String(entry.id))}"]`);
      if (row) body.appendChild(row);
    }
  },
  editCell(win, entry, cell, field) {
    if (cell.querySelector('input') || !this.hasNativeProperties(entry)) return;
    const input = document.createElement('input');
    input.className = 'metadata-input'; input.value = entry[field] || '';
    input.maxLength = field === 'order' ? 256 : 10000;
    input.setAttribute('aria-label', `${field === 'order' ? '#' : 'Note'} for ${entry.name}`);
    cell.textContent = ''; cell.appendChild(input); input.focus(); input.select();
    let cancelled = false;
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { cancelled = true; input.blur(); }
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    });
    input.addEventListener('blur', async () => {
      const value = input.value; input.remove();
      try {
        if (!cancelled && value !== (entry[field] || '')) {
          const result = await window.fm.editEntryMetadata(entry.path, field, value);
          this.updateMetadata(win, entry, result);
        }
      } catch (error) { win.setStatus(`Couldn't save ${field}: ${error.message}`); }
      cell.textContent = entry[field] || ''; cell.title = cell.textContent;
      this.sortRows(win);
    }, { once: true });
  },
  async calculateHashes(win, entry, algorithm) {
    const entries = win.selection.has(entry.id) ? win.entries.filter(item => win.selection.has(item.id)) : [entry];
    const targets = entries.filter(item => item.kind !== 'directory' && this.hasNativeProperties(item));
    const errors = [];
    for (const [index, item] of targets.entries()) {
      win.setStatus(`Calculating ${algorithm.toUpperCase()} (${index + 1}/${targets.length}): ${item.name}…`);
      try { this.updateMetadata(win, item, await window.fm.calculateHash(item.path, algorithm)); }
      catch (error) { errors.push(`${item.name}: ${error.message}`); }
    }
    this.sortRows(win);
    win.setStatus(errors.join(' ') || `${algorithm.toUpperCase()} saved for ${targets.length} file(s).`);
  },
  async favorite(win, entry) {
    const value = !entry.bookmarked;
    const targets = win.selection.has(entry.id) ? win.entries.filter(item => win.selection.has(item.id)) : [entry];
    try {
      for (const item of targets.filter(item => this.hasNativeProperties(item))) {
        this.updateMetadata(win, item, await window.fm.editEntryMetadata(item.path, 'bookmarked', value));
      }
      win.setStatus(value ? 'Added to vdir://favorites_' : 'Favorite removed.');
    } catch (error) { win.setStatus(`Couldn't update favorites: ${error.message}`); }
  },

  folderSizeJobs: new Set(),
  sizeText(entry) {
    if (entry.kind !== 'directory') return Utils.formatBytes(entry.size);
    if (this.folderSizeJobs.has(entry.path)) return 'Calculating…';
    return entry.folderSize ? `${Utils.formatBytes(entry.folderSize.bytes)}${entry.folderSize.skipped ? ' (partial)' : ''}` : '--';
  },
  sizeTitle(entry) {
    const result = entry.folderSize;
    return result ? `${result.bytes.toLocaleString()} bytes; calculated ${new Date(result.calculatedAt).toLocaleString()}. ${result.skipped} unreadable items; ${result.links} links excluded. Use Calc Folder Size to refresh.` : '';
  },
  async calculateFolderSize(win, entry) {
    if (this.folderSizeJobs.has(entry.path)) return;
    const sourcePath = win.path;
    const refresh = (result) => {
      for (const view of win.manager.windows) {
        for (const item of view.entries || []) {
          if (item.path !== entry.path || item.kind !== 'directory') continue;
          if (result) item.folderSize = result;
          const cell = view.el.querySelector(`[data-entry-id="${CSS.escape(String(item.id))}"] .cell-size`);
          if (cell) { cell.textContent = this.sizeText(item); cell.title = this.sizeTitle(item); }
        }
        if (result && view.sortKey === 'size') {
          const body = view.el.querySelector('.detail-table tbody');
          if (body) for (const item of this.sortedEntries(view)) {
            const row = body.querySelector(`[data-entry-id="${CSS.escape(String(item.id))}"]`);
            if (row) body.appendChild(row);
          }
        }
      }
    };
    this.folderSizeJobs.add(entry.path);
    refresh();
    win.setStatus(`Calculating size of ${entry.name}…`);
    try {
      const result = await window.fm.calculateFolderSize(entry.path);
      this.folderSizeJobs.delete(entry.path);
      refresh(result);
      if (win.el.isConnected && win.path === sourcePath) win.setStatus(`${entry.name}: ${Utils.formatBytes(result.bytes)}${result.skipped ? ` (partial: ${result.skipped} unreadable items)` : ''}. Saved.`);
    } catch (error) {
      this.folderSizeJobs.delete(entry.path);
      refresh();
      if (win.el.isConnected && win.path === sourcePath) win.setStatus(`Couldn't calculate folder size: ${error.message}`);
    }
  },

  DETAIL_COLUMNS: [
    { key: 'name', label: 'Name', defaultWidth: 220 },
    { key: 'kind', label: 'Kind', defaultWidth: 90 },
    { key: 'size', label: 'Size', defaultWidth: 90 },
    { key: 'created', label: 'Date Created', defaultWidth: 150 },
    { key: 'modified', label: 'Date Modified', defaultWidth: 150 },
    { key: 'prevName', label: 'PrevName', defaultWidth: 180 },
    { key: 'origName', label: 'OrigName', defaultWidth: 180 },
    { key: 'order', label: '#', defaultWidth: 80 },
    { key: 'note', label: 'Note', defaultWidth: 220 },
    { key: 'md5', label: 'MD5', defaultWidth: 240 },
    { key: 'sha256', label: 'SHA256', defaultWidth: 300 },
    { key: 'sha512', label: 'SHA512', defaultWidth: 300 },
  ],

  // A few extensions whose canonical MIME subtype isn't just the extension
  // itself — used when building the DownloadURL drag-out payload.
  IMAGE_MIME_OVERRIDES: { jpg: 'jpeg', jpe: 'jpeg', jfif: 'jpeg', tif: 'tiff', svg: 'svg+xml' },
  imageMimeSubtype(ext) {
    const bare = (ext || '').replace('.', '').toLowerCase();
    return this.IMAGE_MIME_OVERRIDES[bare] || bare || 'png';
  },

  renderDetailView(win, content) {
    const cols = win.path==='vdir://history' ? [{key:'action',label:'Action',defaultWidth:150},{key:'historyPath',label:'Path',defaultWidth:350},{key:'path2',label:'Path2',defaultWidth:350},{key:'time',label:'Time',defaultWidth:170}] : win.type === 'search-results' || win.path === 'vdir://metadata'
      ? [this.DETAIL_COLUMNS[0], { key: 'parentDirectory', label: 'Parent Directory', defaultWidth: 300 }, ...this.DETAIL_COLUMNS.slice(1)]
      : this.DETAIL_COLUMNS;
    if (!win.columnWidths) {
      win.columnWidths = {};
      cols.forEach((c) => {
        win.columnWidths[c.key] = c.defaultWidth;
      });
    }
    cols.forEach(col => { if (!Number.isFinite(win.columnWidths[col.key])) win.columnWidths[col.key] = col.defaultWidth; });

    const table = document.createElement('table');
    table.className = 'detail-table';
    const syncTableWidth = () => { table.style.width = `${cols.reduce((sum, col) => sum + win.columnWidths[col.key], 0)}px`; };
    syncTableWidth();

    const colgroup = document.createElement('colgroup');
    cols.forEach((c) => {
      const colEl = document.createElement('col');
      colEl.style.width = `${win.columnWidths[c.key]}px`;
      colgroup.appendChild(colEl);
    });
    table.appendChild(colgroup);

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    cols.forEach((c, i) => {
      const th = document.createElement('th');

      const labelSpan = document.createElement('span');
      labelSpan.className = 'col-label';
      labelSpan.textContent = c.label + (win.sortKey === c.key ? (win.sortDir === 1 ? ' \u25B2' : ' \u25BC') : '');
      labelSpan.onclick = () => {
        if (win.sortKey === c.key) win.sortDir *= -1;
        else {
          win.sortKey = c.key;
          win.sortDir = 1;
        }
        FileView.render(win);
      };
      th.appendChild(labelSpan);

      // Keep every other column fixed; the table grows with the dragged edge.
      {
        const handle = document.createElement('span');
        handle.className = 'col-resize-handle';
        handle.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          handle.classList.add('resizing');
          const colEl = colgroup.children[i];
          const grabOffset = e.clientX - th.getBoundingClientRect().right;
          const onMove = (ev) => {
            const width = Math.max(40, ev.clientX - grabOffset - th.getBoundingClientRect().left);
            win.columnWidths[c.key] = width;
            colEl.style.width = `${width}px`;
            syncTableWidth();
          };
          const onUp = () => {
            handle.classList.remove('resizing');
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('blur', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
          window.addEventListener('blur', onUp);
        });
        th.appendChild(handle);
      }

      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const entry of this.sortedEntries(win)) {
      const tr = document.createElement('tr');
      tr.className = 'detail-row';
      tr.dataset.entryId = entry.id;
      if (win.selection.has(entry.id)) tr.classList.add('selected');
      if (win.searchHighlights?.has(entry.id)) tr.classList.add('search-highlight');
      if (entry.bookmarked) tr.classList.add('favorite-highlight');

      const kindLabel =
        entry.kind === 'directory'
          ? 'Folder'
          : entry.kind === 'image'
          ? 'Image'
          : entry.ext
          ? `${entry.ext.slice(1).toUpperCase()} File`
          : 'File';

      const textByKey = {
        action:entry.action,historyPath:entry.historyPath,path2:entry.path2,time:Utils.formatDate(entry.time),
        ...Object.fromEntries(this.metadataFields.map(field => [field, entry[field] || ''])),
        parentDirectory: entry.parentDirectory,
        kind: kindLabel,
        size: this.sizeText(entry),
        created: Utils.formatDate(entry.created),
        modified: Utils.formatDate(entry.modified),
      };

      cols.forEach((c) => {
        const td = document.createElement('td');
        if (this.metadataFields.includes(c.key)) td.className = `cell-${c.key}`;
        if (c.key === 'size') { td.className = 'cell-size'; td.title = this.sizeTitle(entry); }
        if (c.key === 'name') {
          td.className = 'cell-name';
          const sq = document.createElement('span');
          sq.className = 'mini-square';
          sq.style.background = entry.color;
          NativeFileIcons.attach(sq, entry);
          const nameText = document.createElement('span');
          nameText.className = 'cell-name-text';
          nameText.textContent = entry.name;
          td.appendChild(sq);
          td.appendChild(nameText);
        } else {
          td.textContent = textByKey[c.key];
          td.title = td.textContent;
        }
        if (['order', 'note'].includes(c.key) && this.hasNativeProperties(entry)) {
          td.classList.add('editable-cell');
          td.addEventListener('mousedown', e => { e.stopPropagation(); win.manager.focus(win.id); });
          td.addEventListener('dblclick', e => e.stopPropagation());
          td.addEventListener('click', e => { e.stopPropagation(); this.editCell(win, entry, td, c.key); });
        }
        tr.appendChild(td);
      });

      this.wireEntryEvents(win, tr, entry);
      this.wireDragAndDrop(win, tr, entry);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    content.appendChild(table);

    content.onmousedown = (e) => {
      if (e.target === content || e.target === table || e.target === tbody) this.clearSelection(win);
    };
  },

  // -- Icon view (freely rearrangeable grid) ---------------------------------

  async renderIconView(win, content) {
    const holder = document.createElement('div');
    holder.className = 'icon-canvas';
    content.appendChild(holder);

    const directory = win.path;
    const layout = win.layout || await window.fm.getLayout(directory);
    if (!content.contains(holder) || win.path !== directory) return;
    win.layout = layout;
    if(win.layoutOptionsPath!==directory){win.layoutOptions=await window.fm.getFolderLayoutOptions?.(directory)||{};win.layoutOptionsPath=directory;}
    const options=win.layoutOptions||{};options.frozen||={};let frozenChanged=false;
    if (!content.contains(holder) || win.path !== directory) return;

    // Scales with the icon-size setting (AppSettings), matching the same
    // ratios the CSS uses for .icon-item/.icon-square/.icon-label so the
    // default grid slots line up with how the icons actually render.
    const iconSize = (typeof AppSettings !== 'undefined' && AppSettings.current.iconSize) || 30;
    const cellW = Math.round(iconSize * 3.333);
    const cellH = Math.round(iconSize * 2.6);
    const contentWidth = Math.max(content.clientWidth, cellW);
    const cols = Math.max(1, Math.floor(contentWidth / cellW));
    const entries = this.sortedEntries(win);

    entries.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'icon-item';
      item.dataset.entryId = entry.id;
      if (win.selection.has(entry.id)) item.classList.add('selected');
      if (win.searchHighlights?.has(entry.id)) item.classList.add('search-highlight');
      if (entry.bookmarked) item.classList.add('favorite-highlight');

      // Each entry's default grid slot is keyed to its own position in the
      // list, not a counter shared with other un-positioned entries — so
      // dragging one icon elsewhere leaves a gap instead of shifting every
      // other icon to "fill in" for it.
      let pos = Object.hasOwn(layout, entry.isVirtual ? entry.id : entry.name) ? layout[entry.isVirtual ? entry.id : entry.name] : (Object.hasOwn(layout,entry.name)?layout[entry.name]:null);
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
        const col = index % cols;
        const row = Math.floor(index / cols);
        pos = options.dontReflow && Object.hasOwn(options.frozen,entry.isVirtual ? entry.id : entry.name) ? options.frozen[entry.isVirtual ? entry.id : entry.name] : { x: col * cellW + 12 + (options.offsetRows && row % 2 ? cellW/2 : 0), y: row * cellH + 12 };
        if(options.dontReflow&&!Object.hasOwn(options.frozen,entry.isVirtual ? entry.id : entry.name)){Object.defineProperty(options.frozen,entry.isVirtual ? entry.id : entry.name,{value:pos,enumerable:true,configurable:true,writable:true});frozenChanged=true;}
      }
      item.style.left = `${pos.x}px`;
      item.style.top = `${pos.y}px`;

      const square = document.createElement('div');
      square.className = 'icon-square';
      square.style.background = entry.color;

      const label = document.createElement('div');
      label.className = 'icon-label';
      const labelText = document.createElement('span');
      labelText.className = 'icon-label-text';
      labelText.textContent = entry.name;
      label.appendChild(labelText);

      item.appendChild(square);
      item.appendChild(label);

      const appearance = Object.hasOwn(layout, entry.isVirtual ? entry.id : entry.name) ? layout[entry.isVirtual ? entry.id : entry.name] : (Object.hasOwn(layout,entry.name)?{...layout[entry.name]}:{});
      Object.defineProperty(layout, entry.isVirtual ? entry.id : entry.name, { value: appearance, enumerable: true, configurable: true, writable: true });
      IconAppearance.attach(item, entry, appearance, (patch) => {
        window.fm.setLayoutPos(directory, entry.isVirtual ? entry.id : entry.name, patch).catch(() =>
          win.setStatus('Could not save icon appearance.'));
      });

      this.wireEntryEvents(win, item, entry);
      this.wireDragAndDrop(win, item, entry);
      holder.appendChild(item);
    });

    const rows = Math.ceil(win.entries.length / cols) + 1;
    holder.style.minHeight = `${rows * cellH + 40}px`;
    if(frozenChanged)window.fm.setFolderLayoutOptions?.(directory,options).catch(error=>win.setStatus(error.message));

    holder.onmousedown = (e) => {
      if (e.target !== holder) return;
      this.clearSelection(win);
      this.startMarquee(win, holder, e);
    };
  },

  async configureLayout(win,action){
    try{
      const options=win.layoutOptions||await window.fm.getFolderLayoutOptions(win.path);options.frozen||={};
      if(action==='offsetRows'){options.offsetRows=!options.offsetRows;options.frozen={};}
      if(action==='dontReflow'){
        options.dontReflow=!options.dontReflow;options.frozen={};
        if(options.dontReflow)for(const entry of win.entries){const pos=this.getIconPosition(win,entry.id);if(pos)Object.defineProperty(options.frozen,entry.isVirtual ? entry.id : entry.name,{value:pos,enumerable:true,configurable:true,writable:true});}
      }
      if(action==='realign'){await window.fm.realignLayout(win.path);win.layout=null;options.frozen={};}
      win.layoutOptions=await window.fm.setFolderLayoutOptions(win.path,options);win.layoutOptionsPath=win.path;
      const content=win.el.querySelector('.fm-content'),left=content.scrollLeft,top=content.scrollTop;
      await this.render(win);content.scrollLeft=left;content.scrollTop=top;
    }catch(error){win.setStatus(`Could not update icon layout: ${error.message}`);}
  },
  wireEntryEvents(win, el, entry) {
    el.addEventListener('click', () => {
      if (el._toggleOnClick) {
        el._toggleOnClick = false;
        win.selection.delete(entry.id);
        this.refreshSelectionClasses(win); this.updateStatus(win);
      }
    });
    el.addEventListener('mousedown', (e) => {
      el._toggleOnClick = false;
      e.stopPropagation();
      win.manager.focus(win.id);
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (win.selection.has(entry.id)) el._toggleOnClick = e.button === 0;
        else win.selection.add(entry.id);
      } else if (!win.selection.has(entry.id)) {
        win.selection.clear();
        win.selection.add(entry.id);
      }
      this.refreshSelectionClasses(win);
      this.updateStatus(win);
    });

    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.openEntry(win, entry);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      win.manager.focus(win.id);
      if (!win.selection.has(entry.id)) {
        win.selection.clear();
        win.selection.add(entry.id);
        this.refreshSelectionClasses(win);
      }
      ContextMenu.showForEntry(win, entry, e.clientX, e.clientY);
    });
  },

  // Keep ordinary gestures in HTML5 for free-positioning; Shift explicitly
  // hands the gesture to the OS for native multi-file/folder drag-out.
  // External sources receive COPY feedback: this app owns any actual move.
  dropEffect(e) {
    return [...(e.dataTransfer.types||[])].includes('application/x-fm-paths') ? (e.ctrlKey?'copy':'move') : 'copy';
  },
  wireDragAndDrop(win, el, entry) {
    if (!this.hasNativeProperties(entry)) return;
    el.draggable = true;
    if (entry.kind === 'directory') {
      el.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = this.dropEffect(e); });
      el.addEventListener('drop', async e => {
        e.preventDefault(); e.stopPropagation();
        win.el.querySelector('.fm-content').classList.remove('drop-target');
        await this.handleDrop(win, e, entry.path);
      });
    }

    el.addEventListener('dragstart', (e) => {
      el._toggleOnClick = false;
      win.manager.focus(win.id);
      if (!win.selection.has(entry.id)) {
        win.selection.clear();
        win.selection.add(entry.id);
        this.refreshSelectionClasses(win);
      }
      const ids = [...win.selection];
      const dragEntries = win.entries.filter((en) => ids.includes(en.id) && this.hasNativeProperties(en));
      if (dragEntries.length === 0) {
        e.preventDefault();
        return;
      }
      const paths = dragEntries.map((en) => en.path);
      if(e.shiftKey&&window.fm.nativeFileDrag){
        e.preventDefault();
        win.setStatus('Native drag: release Shift after starting; Ctrl copies on Windows. Escape cancels.');
        window.fm.nativeFileDrag(paths,e.ctrlKey).then(()=>{
          for(const directory of new Set(paths.map(p=>window.fm.dirname(p))))win.manager.refreshWindowsShowingPath(directory);
        }).catch(error=>win.setStatus(`Could not start native drag: ${error.message}`));
        return;
      }

      let iconDrag = null;
      if (el.classList.contains('icon-item')) {
        const rect = el.getBoundingClientRect();
        // Use the same hotspot for Chromium's ghost and the eventual drop.
        // Fixed offsets fail when grabbing a different corner or resizing.
        const offsetX = Math.round(e.clientX - rect.left);
        const offsetY = Math.round(e.clientY - rect.top);
        e.dataTransfer.setDragImage(el, offsetX, offsetY);
        iconDrag = {
          offsetX, offsetY,
          positions: dragEntries.map((en) => {
            const node = win.el.querySelector(`[data-entry-id="${CSS.escape(String(en.id))}"]`);
            const bounds = node.getBoundingClientRect();
            return { path: en.path, dx: bounds.left - rect.left, dy: bounds.top - rect.top };
          }),
        };
      }

      dragEntries.forEach((en) => {
        const domEl = win.el.querySelector(`[data-entry-id="${CSS.escape(String(en.id))}"]`);
        if (domEl) domEl.classList.add('dragging');
      });

      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('application/x-fm-paths', JSON.stringify({ sourceWindowId: win.id, paths, iconDrag }));

      // Best-effort drag-out for a single file: Chromium honors this
      // "mime:filename:url" convention when the drop lands on the OS shell.
      // Multi-file drag-out isn't supported by this mechanism — dragging
      // several files still works fine *within* the app via the payload above.
      if (paths.length === 1) {
        const mime = entry.kind === 'image' && entry.ext ? `image/${this.imageMimeSubtype(entry.ext)}` : 'application/octet-stream';
        e.dataTransfer.setData('DownloadURL', `${mime}:${entry.name}:${window.fm.toFileUrl(paths[0])}`);
      }
    });

    el.addEventListener('dragend', () => {
      win.el.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
    });
  },

  // Handles a drop of real files onto a window's content area — from
  // another window, from this same window's own icons (repositioning), or
  // from the OS (Finder/Explorer dragged in).
  async handleDrop(win, e, targetDirectory = win.path) {
    // External sources must not delete on a returned MOVE effect while our
    // asynchronous transfer is still running. We own the entire move, including
    // removing the source only after a successful cross-volume copy.
    if(!e.dataTransfer.getData('application/x-fm-paths'))e.dataTransfer.dropEffect='copy';
    if ((win.type === 'search-results' || win.type === 'search') && targetDirectory === win.path) return;

    let paths = [];
    let sameWindow = false;
    let iconDrag = null;
    const internalRaw = e.dataTransfer.getData('application/x-fm-paths');
    if (internalRaw) {
      try {
        const parsed = JSON.parse(internalRaw);
        paths = parsed.paths || [];
        sameWindow = parsed.sourceWindowId === win.id && targetDirectory === win.path;
        if (Number.isFinite(parsed.iconDrag?.offsetX) && Number.isFinite(parsed.iconDrag?.offsetY)) {
          iconDrag = parsed.iconDrag;
        }
      } catch {
        /* malformed payload — fall through to the files check below */
      }
    }
    if (paths.length === 0) {
      paths = [...(e.dataTransfer.files || [])].map((f) => f.path).filter(Boolean);
    }
    if (paths.length === 0) return;
    if (targetDirectory.startsWith('vdir://') && (!sameWindow || e.ctrlKey)) {
      win.setStatus('Virtual folders allow icon repositioning, not filesystem transfers.');return;
    }

    const isCopy = e.ctrlKey;
    const messages = [];
    const holder = win.el.querySelector('.icon-canvas');
    const canvasRect = holder ? holder.getBoundingClientRect() : null;
    const sourceDirs = new Set();

    if (sameWindow && !isCopy && holder) {
      // Keep enough canvas beneath the current viewport even when moving the
      // rightmost/bottommost icon inward; otherwise the browser clamps scroll.
      const content = win.el.querySelector('.fm-content');
      holder.style.minWidth = `${Math.max(holder.offsetWidth, content.scrollLeft + content.clientWidth)}px`;
      holder.style.minHeight = `${Math.max(holder.offsetHeight, content.scrollTop + content.clientHeight)}px`;
    }

    for (const filePath of paths) {
      sourceDirs.add(window.fm.dirname(filePath));

      if (sameWindow && !isCopy) {
        // Dropped back into the window it came from: just reposition, no fs change.
        if (canvasRect) {
          const draggedEntry=win.entries.find(item=>item.path===filePath);
          const name = draggedEntry?.isVirtual ? draggedEntry.id : window.fm.basename(filePath);
          const relative = iconDrag?.positions?.find((position) => position.path === filePath);
          // The canvas rectangle already reflects its scrollable parent's
          // scroll position. Add only the canvas's own scroll, if any.
          const x = Math.max(0, e.clientX - canvasRect.left + holder.scrollLeft - (iconDrag?.offsetX || 0) + (relative?.dx || 0));
          const y = Math.max(0, e.clientY - canvasRect.top + holder.scrollTop - (iconDrag?.offsetY || 0) + (relative?.dy || 0));
          win.layout[name] = { ...win.layout[name], x, y };
          const entry = win.entries.find((item) => item.path === filePath);
          const node = entry && win.el.querySelector(`[data-entry-id="${CSS.escape(String(entry.id))}"]`);
          if (node) {
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
          }
          try {
            await window.fm.setLayoutPos(win.path, name, { x, y });
          } catch {
            /* non-fatal */
          }
        }
        continue;
      }

      try {
        const result = isCopy ? await window.fm.copyItem(filePath, targetDirectory) : await window.fm.moveItem(filePath, targetDirectory);
        messages.push(...(result?.warnings || []));
      } catch (err) {
        messages.push(`Couldn't ${isCopy ? 'copy' : 'move'} ${window.fm.basename(filePath)}: ${err.message}`);
      }
    }

    // Repositioning changes only layout. Rebuilding the listing would reset
    // scroll, selection, stacking order, and decoded thumbnails unnecessarily.
    if (sameWindow && !isCopy) return;

    await win.navigate(win.path);
    if (targetDirectory !== win.path) win.manager.refreshWindowsShowingPath(targetDirectory);
    if (!isCopy) {
      for (const dir of sourceDirs) {
        if (dir !== win.path) win.manager.refreshWindowsShowingPath(dir);
      }
    }
    if (messages.length) win.setStatus(messages.join(' '));
  },

  startMarquee(win, holder, e) {
    const rect = holder.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    const box = document.createElement('div');
    box.className = 'marquee';
    holder.appendChild(box);

    const onMove = (ev) => {
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const left = Math.min(startX, x);
      const top = Math.min(startY, y);
      const w = Math.abs(x - startX);
      const h = Math.abs(y - startY);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;

      win.selection.clear();
      holder.querySelectorAll('.icon-item').forEach((el) => {
        const overlap = [...el.querySelectorAll('.icon-square, .icon-label')].some((part) => {
          const bounds = part.getBoundingClientRect();
          return bounds.left < rect.left + left + w && bounds.right > rect.left + left &&
            bounds.top < rect.top + top + h && bounds.bottom > rect.top + top;
        });
        if (overlap) win.selection.add(el.dataset.entryId);
      });
      this.refreshSelectionClasses(win);
      this.updateStatus(win);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      box.remove();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  },

  // -- Actions ---------------------------------------------------------------

  hasNativeProperties(entry) {
    return !!entry?.path && !entry.path.startsWith('vdir://');
  },
  async showProperties(win, entry) {
    if (!this.hasNativeProperties(entry)) {
      win.setStatus('This item has no file on disk to show Properties for.');
      return;
    }
    try { await window.fm.showFileProperties(entry.path); }
    catch (error) { if (win.el.isConnected) win.setStatus(`Couldn't open Properties: ${error.message}`); }
  },

  async openEntry(win, entry) {
    if (entry.kind === 'directory') {
      win.manager.open(entry.path);
      return;
    }
    // A user-chosen "Open With" association wins over the built-in image/text
    // preview too — if they went to the trouble of setting one, respect it.
    if (this.hasNativeProperties(entry)) {
      let association = null;
      try {
        association = await window.fm.getAssociation(entry.ext);
      } catch {
        /* treat as no association */
      }
      if (association) {
        try {
          await window.fm.openFileWith(entry.path, association.appPath);
        } catch (err) {
          win.setStatus(`Couldn't open with ${association.appName || association.appPath}: ${err.message}`);
        }
        return;
      }
    }
    if (entry.kind === 'image') {
      await ImageViewer.open(win,entry);
      return;
    }
    if (entry.isVirtual && entry.content) {
      win.preview = { ...entry, isText: true };
      await this.render(win);
      return;
    }
    if (!this.hasNativeProperties(entry)) return; // nothing openable
    await window.fm.openFile(entry.path);
  },

  async openWithDialog(win, entry) {
    const appPath = await window.fm.pickApplication();
    if (!appPath) return;
    const appName = window.fm.basename(appPath).replace(/\.(app|exe)$/i, '');
    try {
      await window.fm.setAssociation(entry.ext, appPath, appName);
      await window.fm.openFileWith(entry.path, appPath);
    } catch (err) {
      win.setStatus(`Couldn't open with ${appName}: ${err.message}`);
    }
  },

  async changeIconColor(win, entry) {
    const ext = entry.ext ? entry.ext.replace(/^\./, '') : entry.name.toLowerCase();
    const color = await Dialog.promptColor({ title: `Icon Color for .${ext} Files`, initialValue: entry.color });
    if (color === null) return;
    try {
      await window.fm.setExtColor(ext, color);
    } catch (err) {
      win.setStatus(`Couldn't save color: ${err.message}`);
      return;
    }
    win.manager.refreshAllDirectoryWindows(); // global setting — every open window should pick it up
  },

  async resetIconColor(win, entry) {
    const ext = entry.ext ? entry.ext.replace(/^\./, '') : entry.name.toLowerCase();
    try {
      await window.fm.removeExtColor(ext);
    } catch {
      /* non-fatal */
    }
    win.manager.refreshAllDirectoryWindows();
  },

  startRename(win, entry) {
    const container = win.el.querySelector(`[data-entry-id="${CSS.escape(String(entry.id))}"]`);
    if (!container) return;
    const textEl = container.querySelector('.icon-label-text, .cell-name-text');
    if (!textEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = entry.name;
    textEl.replaceWith(input);
    win.renaming = true;
    input.focus();
    input.select();

    const commit = async () => {
      const newName = input.value.trim();
      if (newName && newName !== entry.name) {
        try {
          await window.fm.renameItem(entry.path, newName);
        } catch (err) {
          win.setStatus(`Rename failed: ${err.message}`);
        }
      }
      try { await win.navigate(win.path); } finally { win.renaming = false; }
    };
    input.addEventListener('keydown', (e) => {
      // blur changes activeElement before the event reaches the document.
      // Consume the key here so the global Enter shortcut cannot open the old path.
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') {
        e.preventDefault();
        input.value = entry.name;
        input.blur();
      }
    });
    input.addEventListener('blur', commit, { once: true });
  },

  async trashEntry(win, entry) {
    if (!this.hasNativeProperties(entry)) return;
    try {
      await window.fm.trashItem(entry.path);
    } catch (err) {
      win.setStatus(`Couldn't trash: ${err.message}`);
    }
    win.selection.delete(entry.id);
    win.navigate(win.path);
  },

  async trashSelection(win) {
    const ids = [...win.selection];
    const targets = win.entries.filter((e) => ids.includes(e.id) && this.hasNativeProperties(e));
    for (const entry of targets) {
      try {
        await window.fm.trashItem(entry.path);
      } catch {
        /* keep going */
      }
    }
    win.navigate(win.path);
  },
};

// -----------------------------------------------------------------------------
// Right-click context menu
// -----------------------------------------------------------------------------

const ContextMenu = {
  el: null,

  init() {
    this.el = document.getElementById('context-menu');
    // Capture phase (the `true` at the end): fires on the way *down* to the
    // clicked element, before that element's own mousedown handler runs —
    // so it can't be silently blocked by something like a file icon calling
    // stopPropagation() for its own selection logic.
    document.addEventListener(
      'mousedown',
      (e) => {
        if (!this.el.contains(e.target)) this.hide();
      },
      true
    );
  },

  hide() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  },

  showAt(items, x, y) {
    this.el.innerHTML = '';
    for (const it of items) {
      if (it.separator) {
        const hr = document.createElement('div');
        hr.className = 'ctx-sep';
        this.el.appendChild(hr);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'ctx-item' + (it.disabled ? ' disabled' : '');
      row.textContent = it.label;
      if (!it.disabled) row.onclick = () => { this.hide(); it.action(); };
      this.el.appendChild(row);
    }
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.classList.remove('hidden');
    const bounds = this.el.getBoundingClientRect();
    this.el.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
    this.el.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
  },

  showForEntry(win, entry, x, y) {
    const metadataItems = [];
    if (FileView.hasNativeProperties(entry)) {
      metadataItems.push({ label: entry.bookmarked ? 'Unfavorite' : 'Favorite', action: () => FileView.favorite(win, entry) });
      if (entry.kind !== 'directory' && (typeof AppSettings === 'undefined' || AppSettings.current.showHashCalc !== false)) {
        for (const algorithm of ['md5', 'sha256', 'sha512']) metadataItems.push({ label: `Calculate ${algorithm.toUpperCase()}`, action: () => FileView.calculateHashes(win, entry, algorithm) });
      }
    }
    const propertiesItems = [{ label: 'Properties', disabled: !FileView.hasNativeProperties(entry), action: () => FileView.showProperties(win, entry) }];
    const sizeItems = win.viewMode === 'detail' && entry.kind === 'directory' && !entry.path.startsWith('vdir://')
      ? [{ label: 'Calc Folder Size', disabled: FileView.folderSizeJobs.has(entry.path), action: () => FileView.calculateFolderSize(win, entry) }] : [];
    if (win.type === 'search-results') {
      this.showAt([
        { label: 'Open', action: () => FileView.openEntry(win, entry) },
        ...sizeItems,
        { label: 'Open Parent Directory', action: () => win.manager.open(entry.parentDirectory) },
        { label: 'Copy Path', action: () => navigator.clipboard.writeText(entry.path) },
        ...propertiesItems,
        ...metadataItems,
      ], x, y);
      return;
    }
    const items = [...sizeItems];
    const isOpenable = entry.kind === 'directory' || entry.kind === 'image' || FileView.hasNativeProperties(entry) || entry.content;
    items.push({ label: 'Open', action: () => FileView.openEntry(win, entry), disabled: !isOpenable });
    if (FileView.hasNativeProperties(entry) && entry.kind !== 'directory') {
      items.push({ label: 'Open With\u2026', action: () => FileView.openWithDialog(win, entry) });
    }

    if (FileView.hasNativeProperties(entry)) {
      items.push({ separator: true });
      items.push({ label: 'Cut', action: () => Clipboard.cut(win) });
      items.push({ label: 'Copy', action: () => Clipboard.copy(win) });
      items.push({ separator: true });
      items.push({ label: 'Rename', action: () => FileView.startRename(win, entry) });
      items.push({ label: 'Move to Trash', action: () => FileView.trashEntry(win, entry) });
      if (entry.kind !== 'directory') {
        items.push({ label: 'Change Icon Color\u2026', action: () => FileView.changeIconColor(win, entry) });
        items.push({ label: 'Reset Icon Color', action: () => FileView.resetIconColor(win, entry) });
      }
      items.push({ separator: true });
      items.push({ label: 'Copy Path', action: () => navigator.clipboard.writeText(entry.path) });
      items.push({ label: 'Reveal in Finder', action: () => window.fm.showInFolder(entry.path) });
      items.push({ label: 'Create Desktop Shortcut', action: () => DesktopShortcuts.createForEntry(entry) });
      if (entry.kind === 'directory') {
        items.push({ label: 'Terminal', action: () => win.manager.openTerminal(entry.path) });
        items.push({ label: this.terminalLabel(), action: () => this.openTerminalAt(win, entry.path) });
      }
    }
    items.push({ separator: true }, ...metadataItems, ...propertiesItems);
    this.showAt(items, x, y);
  },

  showForEmpty(win, x, y) {
    if (win.type === 'search-results') {
      this.showAt([{ label: 'Refresh Search', action: () => win.refresh() }], x, y);
      return;
    }
    const items = [];
    if(win.viewMode==='icon')items.push(
      {label:`${win.layoutOptions?.offsetRows?'✓ ':''}Offset Rows`,action:()=>FileView.configureLayout(win,'offsetRows')},
      {label:`${win.layoutOptions?.dontReflow?'✓ ':''}Don't Reflow`,action:()=>FileView.configureLayout(win,'dontReflow')},
      {label:'Realign',action:()=>FileView.configureLayout(win,'realign')},
      {separator:true});
    if (!win.path.startsWith('vdir://')) {
      items.push({ label: 'New Folder', action: () => win.newFolderInActive() });
      items.push({
        label: 'Paste',
        action: () => Clipboard.paste(win),
        disabled: !window.fm.fileClipboard && Clipboard.paths.length === 0,
      });
      items.push({ label: 'Terminal', action: () => win.manager.openTerminal(win.path) });
      items.push({ label: this.terminalLabel(), action: () => this.openTerminalAt(win, win.path) });
      items.push({ separator: true });
    }
    items.push({
      label: win.viewMode === 'icon' ? 'Switch to Detail View' : 'Switch to Icon View',
      action: () => win.toggleView(),
    });
    items.push({ label: 'Refresh', action: () => win.navigate(win.path) });
    this.showAt(items, x, y);
  },

  terminalLabel() {
    return window.fm.platform === 'win32' ? 'Open Command Prompt Here' : 'Open Terminal Here';
  },

  async openTerminalAt(win, dirPath) {
    try {
      await window.fm.openTerminal(dirPath);
    } catch (err) {
      win.setStatus(`Couldn't open a terminal: ${err.message}`);
    }
  },
};
