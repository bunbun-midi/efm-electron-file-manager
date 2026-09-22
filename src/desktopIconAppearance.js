const DesktopIconAppearance = {
  live: new Map(),
  defaults() {
    return { fontFamily: AppSettings.current.fontFamily, fontSize: AppSettings.current.fontSize, textColor: '#111111',
      backgroundColor: AppSettings.current.labelBackgroundColor, backgroundAlpha: AppSettings.current.labelBackgroundAlpha,
      anchor: 's', outside: true, leftAlign: false, iconImage: null, offsetX: 0, offsetY: 0, displayName: '' };
  },
  position(anchor, outside, width, height, labelWidth, labelHeight, gap = 4) {
    const [x, y] = { nw: [-1,-1], n: [0,-1], ne: [1,-1], w: [-1,0], c: [0,0], e: [1,0], sw: [-1,1], s: [0,1], se: [1,1] }[anchor] || [0,1];
    const axis = (a, size, label) => outside && anchor !== 'c'
      ? a < 0 ? -label-gap : a > 0 ? size+gap : (size-label)/2
      : (a+1)*(size-label)/2;
    return { left: axis(x,width,labelWidth), top: axis(y,height,labelHeight) };
  },
  apply(el, values) {
    const appearance = { ...this.defaults(), ...values };
    const label = el.querySelector('.icon-label'), text = el.querySelector('.icon-label-text'), square = el.querySelector('.icon-square');
    label.style.width = 'max-content'; label.style.maxWidth = '240px'; label.style.transition = 'none';
    label.style.textAlign = appearance.leftAlign ? 'left' : 'center';
    text.style.fontFamily = appearance.fontFamily; text.style.fontSize = `${appearance.fontSize}px`; text.style.color = appearance.textColor;
    const color = appearance.backgroundColor, rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16));
    text.style.backgroundColor = `rgba(${rgb.join(',')},${appearance.backgroundAlpha})`;
    text.style.display = 'block'; text.style.whiteSpace = 'normal'; text.style.overflowWrap = 'anywhere';
    const update = () => {
      // Font size is specified at a 48 px icon, and follows the rendered size
      // during the resize transition, including nonsquare thumbnails.
      const scale = Math.max(square.offsetWidth, square.offsetHeight) / 48;
      text.style.fontSize = `${appearance.fontSize * scale}px`;
      text.style.lineHeight = '1.2';
      text.style.padding = `${scale}px ${4 * scale}px`;
      label.style.maxWidth = `${240 * scale}px`;
      const pos = this.position(appearance.anchor, appearance.outside, square.offsetWidth, square.offsetHeight, label.offsetWidth, label.offsetHeight);
      label.style.left = `${square.offsetLeft + pos.left + appearance.offsetX}px`; label.style.top = `${square.offsetTop + pos.top + appearance.offsetY}px`;
    };
    const observer = new ResizeObserver(update); observer.observe(square); observer.observe(label); update();
    const dispose = () => { observer.disconnect(); this.live.delete(el); };
    this.live.set(el, dispose);
    if (!this.cleanupTimer) this.cleanupTimer = setInterval(() => {
      for (const [item, cleanup] of this.live) if (!item.isConnected) cleanup();
      if (!this.live.size) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
    }, 500);
    return dispose;
  },
  open(shortcut) {
    const win = new UtilityWindow(DesktopShortcuts.manager, `Appearance — ${shortcut.name}`, 450, 690);
    const draft = { ...this.defaults(), ...shortcut.appearance };
    win.content.classList.add('desktop-appearance-form');
    win.content.innerHTML = `<div class="desktop-appearance-preview"></div>
      <label>Displayed name <input data-field="displayName" type="text" maxlength="500" placeholder="Default name"></label>
      <label>Font <input data-field="fontFamily" type="text"></label>
      <label>Text size <input data-field="fontSize" type="number" min="8" max="96"></label>
      <label>Text color <input data-field="textColor" type="color"></label>
      <label>Font background <input data-field="backgroundColor" type="color"></label>
      <label>Background opacity (%) <input data-field="backgroundAlpha" type="number" min="0" max="100"></label>
      <div class="appearance-image-buttons"><button class="choose-icon">Choose image…</button><button class="reset-icon">Default image</button></div>
      <div class="anchor-controls"><div class="anchor-grid" role="group" aria-label="Label anchor"></div><div>
      <label><input data-field="outside" type="checkbox"> Outside icon</label>
      <label><input data-field="leftAlign" type="checkbox"> Left-align text (otherwise center)</label></div></div>
      <div class="label-offset-controls"><div class="label-stick" tabindex="0" role="group" aria-label="Label offset joystick: drag slowly; Shift for finer movement; arrow keys also work"><span></span></div><div>
      <label>X offset <input data-field="offsetX" type="number" min="-10000" max="10000" step="0.1"></label>
      <label>Y offset <input data-field="offsetY" type="number" min="-10000" max="10000" step="0.1"></label>
      <small>Drag and hold to nudge. Shift: extra fine.</small></div></div>
      <div class="appearance-actions"><button class="appearance-defaults">Defaults</button><button class="appearance-cancel">Cancel</button><button class="appearance-save">Save</button></div>`;
    const preview = win.content.querySelector('.desktop-appearance-preview');
    let previewIcon;
    const redraw = () => {
      previewIcon?._disposeLabel?.(); preview.innerHTML = '';
      previewIcon = DesktopShortcuts.renderOne({ ...shortcut, id: 'preview', x: 120, y: 45, appearance: draft }, preview, true);
      win.content.querySelectorAll('[data-anchor]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.anchor === draft.anchor)));
      const outside = win.content.querySelector('[data-field="outside"]'); outside.disabled = draft.anchor === 'c';
    };
    const populate = () => {
      win.content.querySelectorAll('[data-field]').forEach(input => {
        const key = input.dataset.field;
        if (input.type === 'checkbox') input.checked = draft[key];
        else input.value = key === 'backgroundAlpha' ? Math.round(draft[key]*100) : (draft[key] ?? '');
      }); redraw();
    };
    for (const [i, anchor] of ['nw','n','ne','w','c','e','sw','s','se'].entries()) {
      const button = document.createElement('button'); button.textContent = ['↖','↑','↗','←','•','→','↙','↓','↘'][i]; button.dataset.anchor = anchor;
      button.title = { nw:'Top left',n:'Top center',ne:'Top right',w:'Middle left',c:'Centered',e:'Middle right',sw:'Bottom left',s:'Bottom center',se:'Bottom right' }[anchor];
      button.onclick = () => { draft.anchor = anchor; if (anchor === 'c') { draft.outside = false; win.content.querySelector('[data-field="outside"]').checked = false; } redraw(); }; win.content.querySelector('.anchor-grid').appendChild(button);
    }
    win.content.addEventListener('input', e => {
      const key = e.target.dataset.field; if (!key) return;
      draft[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number'
        ? Math.max(Number(e.target.min), Math.min(Number(e.target.max), e.target.valueAsNumber || 0)) / (key === 'backgroundAlpha' ? 100 : 1) : e.target.value;
      redraw();
    });
    win.content.querySelector('.choose-icon').onclick = async () => {
      try {
        const data = await window.fm.pickShortcutImage(); if (!data) return;
        const image = new Image(); image.src = data; await image.decode(); draft.iconImage = data; redraw(); win.setStatus('Image loaded. Save to apply.');
      } catch (error) { win.setStatus(`Cannot use this image: ${error.message}`); }
    };
    win.content.querySelector('.reset-icon').onclick = () => { draft.iconImage = null; redraw(); };
    win.content.querySelector('.appearance-defaults').onclick = () => { Object.assign(draft, this.defaults()); populate(); };
    win.content.querySelector('.appearance-cancel').onclick = () => win.manager.close(win.id);
    win.content.querySelector('.appearance-save').onclick = async () => {
      try {
        shortcut.appearance = await window.fm.setShortcutAppearance(shortcut.id, draft);
        DesktopShortcuts.refresh(shortcut); win.manager.close(win.id);
      } catch (error) { win.setStatus(`Could not save: ${error.message}`); }
    };
    const stick = win.content.querySelector('.label-stick');
    let vector = [0, 0], frame, last = 0;
    const nudge = (x, y) => {
      for (const [key, amount] of [['offsetX', x], ['offsetY', y]]) {
        draft[key] = Math.max(-10000, Math.min(10000, draft[key] + amount));
        win.content.querySelector(`[data-field="${key}"]`).value = draft[key].toFixed(1);
      }
      previewIcon?._disposeLabel?.();
      if (previewIcon) previewIcon._disposeLabel = this.apply(previewIcon, draft);
    };
    const tick = now => { const dt = Math.min(0.05, (now - last) / 1000); last = now; nudge(vector[0] * dt, vector[1] * dt); frame = requestAnimationFrame(tick); };
    const move = e => {
      const rect = stick.getBoundingClientRect(), dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
      const length = Math.hypot(dx, dy), factor = Math.min(1, 28 / (length || 1));
      const x = dx * factor / 28, y = dy * factor / 28, speed = e.shiftKey ? 2 : 12;
      vector = [x * Math.abs(x) * speed, y * Math.abs(y) * speed];
      stick.firstElementChild.style.transform = `translate(${x * 22}px,${y * 22}px)`;
    };
    const release = () => { cancelAnimationFrame(frame); frame = null; vector = [0,0]; stick.firstElementChild.style.transform = ''; };
    stick.onpointerdown = e => { if (e.button !== 0) return; e.preventDefault(); stick.focus(); stick.setPointerCapture(e.pointerId); move(e); last = performance.now(); frame = requestAnimationFrame(tick); };
    stick.onpointermove = e => { if (stick.hasPointerCapture(e.pointerId)) move(e); };
    stick.onpointerup = stick.onpointercancel = stick.onlostpointercapture = release;
    stick.onkeydown = e => { const v = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[e.key]; if (v) { e.preventDefault(); e.stopPropagation(); nudge(v[0] * (e.shiftKey ? 0.1 : 1), v[1] * (e.shiftKey ? 0.1 : 1)); } };
    win.destroy = () => { release(); previewIcon?._disposeLabel?.(); };
    populate(); win.setStatus('Label positions use the actual icon and text dimensions.'); return win;
  },
};
