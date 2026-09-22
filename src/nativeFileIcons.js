// Preload complete size families for listed files, using bounded concurrency.
// Keep real paths as cache keys: folders/executables may have custom icons.
const NativeFileIcons = {
  controllers: new Set(),
  cache: new Map(),
  queue: [],
  active: 0,
  initialized: false,
  enabled: false,
  folderUrl: new URL('assets/folder.svg', document.currentScript.src).href,

  setEnabled(enabled) {
    this.enabled = enabled === true;
    document.documentElement.classList.toggle('use-native-icons', this.enabled);
    for (const controller of this.controllers) controller.update();
  },

  init() {
    if (this.initialized) return;
    this.initialized = true;
    new MutationObserver(() => {
      for (const controller of this.controllers) {
        if (!controller.square.isConnected) { controller.dispose(); this.controllers.delete(controller); }
      }
    }).observe(document.body, { childList: true, subtree: true });
  },

  request(key, filePath, revision, valid) {
    const cached = this.cache.get(key);
    if (cached) {
      if (cached.pending) cached.consumers.push(valid);
      return cached.promise;
    }
    const consumers = [valid];
    const promise = new Promise(resolve => { this.queue.push({ filePath, revision, consumers, resolve }); });
    const record = { time: Date.now(), promise, consumers, pending: true };
    this.cache.delete(key);
    this.cache.set(key, record);
    if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value);
    this.pump();
    promise.then(value => {
      record.pending = false; consumers.length = 0;
      if (!value?.length && this.cache.get(key)?.promise === promise) this.cache.delete(key);
    });
    return promise;
  },

  pump() {
    while (this.active < 4 && this.queue.length) {
      const job = this.queue.shift();
      if (!job.consumers.some(valid => valid())) { job.resolve([]); continue; }
      this.active++;
      Promise.resolve().then(() => window.fm.getFileIconFamily(job.filePath, job.revision))
        .catch(() => []).then(job.resolve).finally(() => { this.active--; this.pump(); });
    }
  },

  attach(square, entry) {
    const filePath = entry.path || entry.targetPath;
    const folder = entry.kind === 'directory';
    if (!folder && (!filePath || filePath.startsWith('vdir://') || entry.dataUrl)) return;
    this.init();
    const image = document.createElement('img');
    image.className = 'os-file-icon'; image.alt = ''; image.draggable = false; image.hidden = true;
    square.append(image);
    let revision = 0;
    let loading = false;
    let family = folder ? [{ width: Infinity, height: Infinity, dataUrl: this.folderUrl }] : null;
    let disposed = false;
    const paint = () => {
      if (!family?.length || !this.enabled || disposed) return;
      const rect = square.getBoundingClientRect();
      const pixels = Math.max(rect.width, rect.height) * (window.devicePixelRatio || 1);
      const variant = family.find(item => Math.max(item.width, item.height) >= pixels) || family.at(-1);
      if (image.getAttribute('src') !== variant.dataUrl) image.src = variant.dataUrl;
      if (image.complete && image.naturalWidth > 0) {
        image.hidden = false; square.classList.add('has-native-icon');
      }
    };
    image.onload = () => {
      if (disposed || !this.enabled) return;
      image.hidden = false; square.classList.add('has-native-icon');
    };
    image.onerror = () => { image.hidden = true; square.classList.remove('has-native-icon'); };
    const update = () => {
      const valid = () => !disposed && this.enabled && square.isConnected;
      if (!this.enabled || disposed) {
        revision++; loading = false;
        image.hidden = true; square.classList.remove('has-native-icon');
        return;
      }
      if (!square.isConnected) return;
      if (family) { paint(); return; }
      if (loading) return;
      loading = true;
      const key = JSON.stringify([filePath, entry.modified || 0]);
      const version = ++revision;
      this.request(key, filePath, entry.modified || 0, valid).then(data => {
        if (version !== revision || !valid()) return;
        loading = false;
        family = data || [];
        paint();
      });
    };
    const resize = new ResizeObserver(update);
    resize.observe(square);
    this.controllers.add({ square, update, dispose: () => {
      disposed = true; revision++; resize.disconnect();
    } });
    queueMicrotask(update); // Renderers attach the square to the DOM synchronously.
  },
};
