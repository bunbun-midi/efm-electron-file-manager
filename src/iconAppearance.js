// Shared by directory icons and desktop shortcuts. Persistence is supplied by
// the owner so this component knows nothing about paths, windows, or IPC.
const IconAppearance = {
  MIN_SIZE: 16,
  MAX_SIZE: 3840,
  sizeAfterWheel(size, delta, mode, pageHeight = 800) {
    const pixels = delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);
    return Math.max(this.MIN_SIZE, Math.min(this.MAX_SIZE,
      size * Math.exp(-Math.max(-240, Math.min(240, pixels)) * 0.002)));
  },

  attach(item, entry, state, save) {
    const square = item.querySelector('.icon-square');
    let size = Number.isFinite(state.size) ? Math.max(this.MIN_SIZE, Math.min(this.MAX_SIZE, state.size)) : null;
    let scaling = state.scaling === 'bilinear' ? 'bilinear' : 'default';
    if (size !== null) item.style.setProperty('--icon-size', `${size}px`);
    item.classList.add('resizable-icon');
    const baseSize = () => parseFloat(getComputedStyle(item).getPropertyValue('--icon-size')) || 30;
    const describe = () => {
      item.title = `Ctrl+wheel: resize (${Math.round(size || baseSize())} px)` +
        (entry.kind === 'image' ? `\nAlt+click: toggle scaling (currently ${scaling})` : '');
    };
    let pending = {};
    let timer;
    const persist = (patch) => {
      Object.assign(state, patch);
      Object.assign(pending, patch);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const changes = pending;
        pending = {};
        save(changes);
      }, 120);
    };
    item.addEventListener('wheel', (event) => {
      if (!event.ctrlKey || event.deltaY === 0 || event.target.closest('input')) return;
      event.preventDefault();
      event.stopPropagation();
      size = this.sizeAfterWheel(size || baseSize(),
        event.deltaY, event.deltaMode, item.parentElement.clientHeight);
      item.style.setProperty('--icon-size', `${size}px`);
      persist({ size });
      describe();
    }, { passive: false });

    if (entry.kind === 'image') {
      const img = document.createElement('img');
      img.className = 'icon-thumbnail';
      img.alt = '';
      img.draggable = false;
      img.loading = 'lazy';
      img.decoding = 'async';
      const canvas = document.createElement('canvas');
      canvas.className = 'icon-thumbnail bilinear-thumbnail';
      canvas.hidden = true;
      square.append(img, canvas);
      let loaded = false;
      let visible = false;
      let dirty = true;
      let failed = false;
      const draw = () => {
        if (!loaded || !visible || scaling !== 'bilinear') return;
        if (!dirty || failed) return;
        dirty = false;
        // One shared GPU context uses LINEAR texture filtering explicitly;
        // CSS "smooth" does not guarantee a particular interpolation kernel.
        try {
          BilinearThumbnails.draw(img, canvas, square.clientWidth, square.clientHeight);
          canvas.hidden = false;
          img.style.visibility = 'hidden';
        } catch {
          failed = true;
          canvas.hidden = true;
          img.style.visibility = '';
          item.title = 'Bilinear rendering unavailable for this image; showing default scaling.\nCtrl+wheel: resize; Alt+click: toggle scaling';
        }
      };
      const update = () => {
        dirty = true;
        failed = false;
        canvas.hidden = true;
        img.style.visibility = '';
        describe();
        draw();
      };
      img.onload = () => {
        loaded = true;
        // Size denotes the longest side. Make the actual icon rectangle match
        // the decoded image, rather than letterboxing inside a square hit area.
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        item.style.setProperty('--image-width-factor', img.naturalWidth / longest);
        item.style.setProperty('--image-height-factor', img.naturalHeight / longest);
        item.classList.add('image-icon');
        square.classList.add('has-thumbnail');
        update();
      };
      img.onerror = () => {
        loaded = false;
        item.classList.remove('image-icon');
        square.classList.remove('has-thumbnail');
        img.hidden = true;
        canvas.hidden = true;
        item.title = `${entry.name}\nThumbnail unavailable; Ctrl+wheel still resizes the icon.`;
        NativeFileIcons.attach(square, entry);
      };
      img.src = entry.dataUrl || window.fm.toFileUrl(entry.path || entry.targetPath);
      const resize = new ResizeObserver(() => { dirty = true; draw(); });
      resize.observe(square);
      const visibility = new IntersectionObserver((records) => {
        // Raising/reparenting an icon may queue both exit and enter records
        // in one delivery. Use the latest state, not the first transition.
        const record = records[records.length - 1];
        visible = record.isIntersecting;
        if (visible) { dirty = true; draw(); }
      });
      visibility.observe(item);
      this.live.set(item, { draw, dispose: () => { resize.disconnect(); visibility.disconnect(); } });
      this.startUpdates();
      item.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        // DOM order is enough when siblings share a stacking level. Desktop
        // shortcuts retain z-index:1, safely below the internal windows.
        // Never detach the pressed element: Chromium can lose click/dblclick
        // tracking (and drag initiation) when its target is reinserted.
        const parent = item.parentElement;
        for (const sibling of [...parent.children]) {
          if (sibling !== item && sibling.classList.contains('icon-item') &&
              (item.compareDocumentPosition(sibling) & Node.DOCUMENT_POSITION_FOLLOWING)) {
            parent.insertBefore(sibling, item);
          }
        }
      });
      item.addEventListener('click', (event) => {
        if (!event.altKey || event.target.closest('input')) return;
        event.preventDefault();
        event.stopPropagation();
        scaling = scaling === 'default' ? 'bilinear' : 'default';
        persist({ scaling });
        update();
      });
      item.addEventListener('dblclick', (event) => {
        if (event.altKey) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
    } else {
      NativeFileIcons.attach(square, entry);
    }
    describe();
  },

  live: new Map(),
  updateTimer: null,
  startUpdates() {
    if (this.updateTimer !== null) return;
    // Detached views release observers and decoded images on the next tick.
    // Bilinear thumbnails are snapshots, repainted on load/resize/toggle;
    // default <img> rendering retains native animation without frame copying.
    this.updateTimer = setInterval(() => {
      for (const [item, controller] of this.live) {
        if (!item.isConnected) { controller.dispose(); this.live.delete(item); }
        else controller.draw();
      }
      if (!this.live.size) { clearInterval(this.updateTimer); this.updateTimer = null; }
    }, 100);
  },
};

// A single context/texture serves every thumbnail, avoiding the browser's
// per-page WebGL context limit. Copy the result into each icon's 2D canvas.
const BilinearThumbnails = {
  init() {
    const surface = document.createElement('canvas');
    const gl = surface.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL unavailable');
    const shader = (type, source) => {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
      return result;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER,
      'attribute vec2 p; varying vec2 uv; void main(){ uv=(p+1.0)*0.5; gl_Position=vec4(p,0,1); }'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER,
      'precision mediump float; varying vec2 uv; uniform sampler2D image; void main(){ gl_FragColor=texture2D(image,uv); }'));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    surface.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.gl = null; });
    this.surface = surface;
    this.gl = gl;
  },
  draw(img, output, width, height) {
    if (!this.gl) this.init();
    const gl = this.gl;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (img.naturalWidth > max || img.naturalHeight > max) throw new Error('Image exceeds texture limit');
    const ratio = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * ratio * devicePixelRatio));
    const h = Math.max(1, Math.round(img.naturalHeight * ratio * devicePixelRatio));
    this.surface.width = w;
    this.surface.height = h;
    gl.viewport(0, 0, w, h);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Image upload failed');
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    output.width = w;
    output.height = h;
    output.getContext('2d').drawImage(this.surface, 0, 0);
  },
};
