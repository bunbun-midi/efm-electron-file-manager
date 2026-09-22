// Shared system menu for directory and terminal windows. One controller owns
// keyboard capture and the cancellable Move/Size transaction at a time.
const WindowSystemMenu = {
  items: [['restore', 'Restore', 'r'], ['move', 'Move', 'm'], ['size', 'Size', 's'],
    ['minimize', 'Minimize', 'n'], ['maximize', 'Maximize', 'x'], ['close', 'Close', 'c']],
  menu: null,
  operation: null,
  pointer: null,

  init(manager) {
    this.manager = manager;
    window.addEventListener('keydown', event => this.keydown(event), true);
    window.addEventListener('mousemove', event => {
      const previous = this.pointer;
      this.pointer = { x: event.clientX, y: event.clientY };
      if (this.operation && previous) this.mouseMove(event.clientX - previous.x, event.clientY - previous.y);
    }, true);
    window.addEventListener('mousedown', event => {
      if (this.operation) {
        event.preventDefault(); event.stopImmediatePropagation();
        this.finish(event.button !== 0);
      } else if (this.menu && !this.menu.contains(event.target)) {
        this.hide();
      }
    }, true);
    window.addEventListener('blur', () => { this.hide(); this.finish(true); });
    window.fm.onWindowSystemCommand?.(command => {
      if (this.blocked()) return;
      if (this.operation) { if (command === 'close') this.finish(true); return; }
      const win = this.manager.getActive();
      if (command === 'menu' && this.menu) { this.hide(); return; }
      if (win) command === 'menu' ? this.show(win) : this.run(win, command);
    });
  },

  blocked() { return !!document.querySelector('.modal-overlay:not(.hidden)'); },

  attach(win) {
    const titlebar = win.el.querySelector('.fm-titlebar');
    const button = document.createElement('button');
    button.className = 'fm-system-button';
    button.textContent = '▣';
    button.title = window.fm.platform === 'darwin' ? 'Window menu (Alt+Q / Alt+E / Command+Space)' : 'Window menu (Alt+Q / Alt+E)';
    button.setAttribute('aria-label', 'Window menu');
    button.setAttribute('aria-haspopup', 'menu');
    button.addEventListener('mousedown', event => event.stopPropagation());
    button.addEventListener('click', event => { event.stopPropagation(); this.show(win); });
    button.addEventListener('dblclick', event => { event.stopPropagation(); this.run(win, 'close'); });
    titlebar.prepend(button);
    titlebar.addEventListener('contextmenu', event => {
      event.preventDefault(); event.stopPropagation();
      this.show(win, event.clientX, event.clientY);
    });
  },

  show(win, x, y) {
    if (this.blocked()) return;
    this.finish(true);
    this.hide();
    if (typeof ContextMenu !== 'undefined') ContextMenu.hide();
    this.manager.focus(win.id);
    this.previousFocus = document.activeElement;
    this.target = win;
    const menu = document.createElement('div');
    menu.className = 'window-system-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Window');
    this.items.forEach(([command, label, key], index) => {
      if (command === 'close') {
        const separator = document.createElement('hr');
        separator.setAttribute('role', 'separator'); menu.append(separator);
      }
      const button = document.createElement('button');
      button.setAttribute('role', 'menuitem');
      const at = label.toLowerCase().indexOf(key);
      button.append(label.slice(0, at));
      const mnemonic = document.createElement('u'); mnemonic.textContent = label[at];
      button.append(mnemonic, label.slice(at + 1));
      if (command === 'close') {
        const shortcut = document.createElement('span'); shortcut.textContent = 'Alt+F4'; button.append(shortcut);
      }
      button.addEventListener('mouseenter', () => this.select(index));
      button.addEventListener('click', () => this.run(win, command));
      menu.append(button);
    });
    document.body.append(menu);
    this.menu = menu;
    const title = win.el.querySelector('.fm-titlebar').getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x ?? title.left, innerWidth - menu.offsetWidth))}px`;
    menu.style.top = `${Math.max(0, Math.min(y ?? title.bottom, innerHeight - menu.offsetHeight))}px`;
    this.select(0);
  },

  select(index) {
    this.index = (index + this.items.length) % this.items.length;
    this.menu.querySelectorAll('button').forEach((button, i) => {
      button.tabIndex = i === this.index ? 0 : -1;
      if (i === this.index) button.focus({ preventScroll: true });
    });
  },

  hide() {
    if (!this.menu) return;
    this.menu.remove(); this.menu = null; this.target = null;
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  },

  bounds(win) { return { x: win.x, y: win.y, width: win.width, height: win.height }; },
  apply(win, bounds) { win.setBounds(bounds.x, bounds.y, bounds.width, bounds.height); },

  restore(win) {
    if (win.el.classList.contains('minimized')) win.el.classList.remove('minimized');
    else if (win.maximized) {
      if (win._preMax) this.apply(win, win._preMax);
      win.maximized = false;
    }
  },

  maximize(win) {
    win.el.classList.remove('minimized');
    if (!win.maximized) win._preMax = this.bounds(win);
    const desktop = document.getElementById('desktop');
    win.setBounds(8, 8, Math.max(parseFloat(getComputedStyle(win.el).minWidth) || 300, desktop.clientWidth - 16), Math.max(parseFloat(getComputedStyle(win.el).minHeight) || 220, desktop.clientHeight - 16));
    win.maximized = true;
  },

  run(win, command) {
    this.hide();
    if (!win.el.isConnected) return;
    this.manager.focus(win.id);
    if (command === 'move' || command === 'size') this.begin(win, command);
    else if (command === 'restore') this.restore(win);
    else if (command === 'maximize') this.maximize(win);
    else if (command === 'minimize') win.el.classList.add('minimized');
    else if (command === 'close') this.manager.close(win.id);
  },

  begin(win, kind) {
    this.finish(true);
    const before = { ...this.bounds(win), maximized: win.maximized,
      minimized: win.el.classList.contains('minimized'), preMax: win._preMax && { ...win._preMax } };
    // Size needs a visible viewport. Move can reposition a collapsed titlebar.
    if (kind === 'size') win.el.classList.remove('minimized');
    if (win.maximized) {
      if (win._preMax) this.apply(win, win._preMax);
      win.maximized = false;
    }
    const overlay = document.createElement('div');
    overlay.className = 'window-geometry-overlay';
    const hint = document.createElement('div');
    hint.className = 'window-geometry-hint'; hint.setAttribute('role', 'status');
    overlay.append(hint); document.body.append(overlay);
    overlay.addEventListener('contextmenu', event => event.preventDefault());
    this.operation = { win, kind, before, horizontal: null, vertical: null, overlay, hint };
    this.updateHint();
  },

  updateHint() {
    const op = this.operation;
    const edge = (op.vertical || '') + (op.horizontal || '');
    op.overlay.style.cursor = op.kind === 'move' ? 'move' : edge ? `${edge}-resize` : 'crosshair';
    op.hint.textContent = `${op.kind === 'move' ? 'Move: use arrows or the mouse' : edge ? 'Size: use arrows or the mouse' : 'Size: press an arrow to choose an edge'} · Ctrl+arrow: 1 px · Enter/click: finish · Esc: cancel`;
  },

  change(dx, dy) {
    const op = this.operation;
    const b = this.bounds(op.win);
    if (op.kind === 'move') {
      b.x += dx; b.y = Math.max(0, b.y + dy);
    } else {
      const minWidth = parseFloat(getComputedStyle(op.win.el).minWidth) || 300;
      const minHeight = parseFloat(getComputedStyle(op.win.el).minHeight) || 220;
      if (op.horizontal) {
        const width = Math.max(minWidth, b.width + (op.horizontal === 'e' ? dx : -dx));
        if (op.horizontal === 'w') b.x += b.width - width;
        b.width = width;
      }
      if (op.vertical) {
        if (op.vertical === 'n') dy = Math.max(-b.y, dy);
        const height = Math.max(minHeight, b.height + (op.vertical === 's' ? dy : -dy));
        if (op.vertical === 'n') b.y += b.height - height;
        b.height = height;
      }
    }
    this.apply(op.win, b);
  },

  arrow(key, fine) {
    const op = this.operation;
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    if (op.kind === 'size') {
      const axis = horizontal ? 'horizontal' : 'vertical';
      if (!op[axis]) {
        op[axis] = { ArrowLeft: 'w', ArrowRight: 'e', ArrowUp: 'n', ArrowDown: 's' }[key];
        this.updateHint(); return; // first arrow on each axis selects its edge
      }
    }
    const step = fine ? 1 : 8;
    this.change(horizontal ? (key === 'ArrowLeft' ? -step : step) : 0,
      horizontal ? 0 : (key === 'ArrowUp' ? -step : step));
  },

  mouseMove(dx, dy) {
    const op = this.operation;
    if (op.kind === 'size' && !op.horizontal && !op.vertical) {
      // With the mouse, first reach a border to choose the sizing edge.
      const rect = op.win.el.getBoundingClientRect();
      const { x, y } = this.pointer;
      if (y >= rect.top - 8 && y <= rect.bottom + 8) {
        if (Math.abs(x - rect.left) <= 8) op.horizontal = 'w';
        else if (Math.abs(x - rect.right) <= 8) op.horizontal = 'e';
      }
      if (x >= rect.left - 8 && x <= rect.right + 8) {
        if (Math.abs(y - rect.top) <= 8) op.vertical = 'n';
        else if (Math.abs(y - rect.bottom) <= 8) op.vertical = 's';
      }
      this.updateHint(); return;
    }
    this.change(dx, dy);
  },

  finish(cancel) {
    const op = this.operation;
    if (!op) return;
    this.operation = null; op.overlay.remove();
    if (cancel && op.win.el.isConnected) {
      this.apply(op.win, op.before);
      op.win.maximized = op.before.maximized;
      op.win._preMax = op.before.preMax;
      op.win.el.classList.toggle('minimized', op.before.minimized);
    }
  },

  keydown(event) {
    if (this.blocked()) return;
    if (event.altKey && event.code === 'Space') return; // leave Alt+Space to the OS in every mode
    const menuKey = !event.ctrlKey && !event.shiftKey &&
      ((event.altKey && !event.metaKey && event.key.toLowerCase() === 'q') ||
       (window.fm.platform === 'darwin' && event.metaKey && !event.altKey && event.code === 'Space'));
    if (this.operation) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') this.finish(true);
      else if (event.key === 'Enter') this.finish(false);
      else if (event.key.startsWith('Arrow')) this.arrow(event.key, event.ctrlKey);
      return;
    }
    if (this.menu) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape' || menuKey) this.hide();
      else if (event.key === 'ArrowDown') this.select(this.index + 1);
      else if (event.key === 'ArrowUp') this.select(this.index - 1);
      else if (event.key === 'Home') this.select(0);
      else if (event.key === 'End') this.select(this.items.length - 1);
      else if (event.altKey && event.key === 'F4') this.run(this.target, 'close');
      else if (event.key === 'Enter' || event.key === ' ') this.run(this.target, this.items[this.index][0]);
      else {
        const item = this.items.find(([, , mnemonic]) => mnemonic === event.key.toLowerCase());
        if (item) this.run(this.target, item[0]);
      }
      return;
    }
    const win = this.manager.getActive();
    if (win && (menuKey || (event.altKey && event.key === 'F4'))) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'F4') this.run(win, 'close'); else this.show(win);
    }
  },
};
