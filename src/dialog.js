// A small reusable modal — used for "Create Shortcut"'s path prompt, and
// for reporting errors from it. Built custom (rather than relying on
// window.prompt(), which Electron doesn't reliably support) so it matches
// the rest of the app's look.

const Dialog = {
  el: null,
  _activeCancel: null,

  init() {
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay hidden';
    this.el.innerHTML = `
      <div class="modal-box">
        <div class="modal-title"></div>
        <div class="modal-message"></div>
        <input type="text" class="modal-input" spellcheck="false" />
        <div class="modal-buttons">
          <button class="modal-cancel-btn">Cancel</button>
          <button class="modal-ok-btn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);

    // Clicking the dimmed backdrop cancels, same as clicking away from a context menu.
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el && this._activeCancel) this._activeCancel();
    });
    // Safety net: keep any keystroke (including Escape) from reaching the
    // window's global shortcuts while this is open, regardless of which
    // child element currently has focus.
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
  },

  _show({ title, message, showInput, inputType, placeholder, initialValue, okLabel }) {
    return new Promise((resolve) => {
      const titleEl = this.el.querySelector('.modal-title');
      const messageEl = this.el.querySelector('.modal-message');
      const input = this.el.querySelector('.modal-input');
      const okBtn = this.el.querySelector('.modal-ok-btn');
      const cancelBtn = this.el.querySelector('.modal-cancel-btn');

      titleEl.textContent = title || '';
      messageEl.textContent = message || '';
      messageEl.style.display = message ? '' : 'none';
      input.style.display = showInput ? '' : 'none';
      cancelBtn.style.display = showInput ? '' : 'none';
      input.type = inputType || 'text';
      input.placeholder = placeholder || '';
      input.value = initialValue || '';
      okBtn.textContent = okLabel || 'OK';

      const finish = (result) => {
        this.el.classList.add('hidden');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        input.onkeydown = null;
        this._activeCancel = null;
        resolve(result);
      };

      okBtn.onclick = () => finish(showInput ? input.value : true);
      cancelBtn.onclick = () => finish(null);
      this._activeCancel = () => finish(null);
      input.onkeydown = (e) => {
        if (e.key === 'Enter') finish(input.value);
        if (e.key === 'Escape') finish(null);
      };

      this.el.classList.remove('hidden');
      if (showInput) {
        input.focus();
        if (input.type === 'text') input.select();
      } else {
        okBtn.focus();
      }
    });
  },

  /** Returns the entered string, or null if cancelled/dismissed. */
  promptText({ title, placeholder, initialValue } = {}) {
    return this._show({ title, showInput: true, inputType: 'text', placeholder, initialValue });
  },

  /** Returns the chosen hex color, or null if cancelled/dismissed. */
  promptColor({ title, initialValue } = {}) {
    return this._show({ title, showInput: true, inputType: 'color', initialValue: initialValue || '#63b3ed' });
  },

  /** Simple one-button informational/error dialog. */
  alertText({ title, message } = {}) {
    return this._show({ title, message, showInput: false });
  },
};
