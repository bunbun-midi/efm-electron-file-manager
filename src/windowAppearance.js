// One schema drives storage, validation, the settings controls, and CSS values.
// Numbers are pixels except opacity percentages and the title's letter spacing.
const WINDOW_APPEARANCE_GROUPS = [
  ['Frame and shadow', [
    ['frame', 'Window background', '#c0c0c0'], ['text', 'Window text', '#111111'],
    ['border', 'Outer border', '#000000'], ['border-width', 'Outer border width', 1, 0, 8],
    ['radius', 'Corner radius', 0, 0, 24],
    ['bevel-light', 'Outer bevel light', '#ffffff'], ['bevel-dark', 'Outer bevel dark', '#7c7c7c'],
    ['bevel-inner-light', 'Inner bevel light', '#dfdfdf'], ['bevel-inner-dark', 'Inner bevel dark', '#4b4b4b'],
    ['bevel-width', 'Bevel thickness', 1, 0, 4],
    ['shadow', 'Shadow color', '#000000'], ['shadow-opacity', 'Shadow opacity (%)', 45, 0, 100],
    ['shadow-x', 'Shadow horizontal offset', 3, -20, 30], ['shadow-y', 'Shadow vertical offset', 3, -20, 30],
    ['shadow-blur', 'Shadow blur', 12, 0, 40], ['shadow-spread', 'Shadow spread', 0, -10, 20],
    ['min-width', 'Minimum window width', 300, 240, 800], ['min-height', 'Minimum window height', 220, 120, 600],
  ]],
  ['Titlebar', [
    ['title-active-start', 'Active gradient start', '#007070'], ['title-active-end', 'Active gradient end', '#00c2c2'],
    ['title-active-text', 'Active title text', '#ffffff'],
    ['title-inactive-start', 'Inactive gradient start', '#747474'], ['title-inactive-end', 'Inactive gradient end', '#adadad'],
    ['title-inactive-text', 'Inactive title text', '#e8e8e8'],
    ['title-highlight', 'Active title inset', '#ffffff'], ['title-highlight-opacity', 'Active inset opacity (%)', 25, 0, 100],
    ['title-height', 'Titlebar height', 24, 20, 64], ['title-font', 'Title font size', 12, 9, 24],
    ['title-left', 'Title left padding', 8, 0, 24], ['title-right', 'Title right padding', 4, 0, 24],
    ['title-spacing', 'Title letter spacing', 0.2, 0, 3, 0.1],
    ['title-button-width', 'Title button width', 17, 14, 48], ['title-button-height', 'Title button height', 15, 12, 48],
    ['title-button-gap', 'Title button gap', 3, 0, 12], ['title-button-font', 'Title button text size', 9, 8, 20],
    ['system-button-gap', 'System button gap', 4, 0, 16],
  ]],
  ['Buttons and input fields', [
    ['button', 'Button background', '#c0c0c0'], ['button-text', 'Button text', '#000000'],
    ['button-border', 'Button border', '#000000'], ['button-border-width', 'Button border width', 1, 0, 4],
    ['button-light', 'Button bevel light', '#ffffff'], ['button-dark', 'Button bevel dark', '#6b6b6b'],
    ['button-bevel', 'Button bevel thickness', 1, 0, 4], ['button-radius', 'Button corner radius', 0, 0, 12],
    ['button-font', 'Address button text size', 12, 9, 22],
    ['button-x', 'Address button side padding', 10, 2, 24], ['button-y', 'Address button vertical padding', 2, 0, 12],
    ['input', 'Input background', '#ffffff'], ['input-text', 'Input text', '#000000'],
    ['input-border', 'Input border', '#000000'], ['input-border-width', 'Input border width', 1, 0, 4],
    ['input-font', 'Address input text size', 12, 9, 24], ['input-x', 'Input side padding', 5, 0, 20], ['input-y', 'Input vertical padding', 3, 0, 12],
    ['focus', 'Input focus color', '#2b6cb0'], ['focus-width', 'Input focus width', 1, 0, 4],
  ]],
  ['Address bar, content, and status', [
    ['address', 'Address bar background', '#c0c0c0'], ['address-border', 'Address bar divider', '#7c7c7c'],
    ['address-border-width', 'Address divider width', 1, 0, 4], ['address-padding', 'Address bar padding', 4, 0, 16], ['address-gap', 'Address control gap', 4, 0, 16],
    ['content', 'Folder background', '#ffffff'], ['content-text', 'Folder text', '#111111'],
    ['content-border', 'Folder viewport border', '#7c7c7c'], ['content-border-width', 'Viewport border width', 1, 0, 6],
    ['content-margin', 'Viewport side margin', 4, 0, 20],
    ['drop-background', 'Drop target background', '#eef6ff'], ['drop-border', 'Drop target outline', '#2b6cb0'], ['drop-width', 'Drop outline width', 2, 1, 6],
    ['status', 'Status background', '#c0c0c0'], ['status-text', 'Status text', '#333333'], ['status-border', 'Status top border', '#ffffff'],
    ['status-border-width', 'Status border width', 1, 0, 4], ['status-font', 'Status text size', 11, 9, 22],
    ['status-x', 'Status side padding', 8, 0, 24], ['status-y', 'Status vertical padding', 3, 0, 12],
    ['scrollbar-width', 'Scrollbar width', 14, 8, 28], ['scrollbar-track', 'Scrollbar track', '#f0f0f0'], ['scrollbar-thumb', 'Scrollbar thumb', '#b0b0b0'], ['scrollbar-hover', 'Scrollbar thumb hover', '#808080'],
  ]],
  ['Detail view and resize handles', [
    ['table-font', 'Detail text size', 12, 9, 24], ['header', 'Column header background', '#d8d8d8'],
    ['header-text', 'Column header text', '#111111'], ['header-hover', 'Column header hover', '#e6e6e6'], ['header-border', 'Column header borders', '#999999'],
    ['header-border-width', 'Header border width', 1, 0, 3], ['header-x', 'Header side padding', 8, 0, 24], ['header-y', 'Header vertical padding', 4, 0, 16],
    ['row-hover', 'Row hover background', '#f2f8ff'], ['selection', 'Selected row background', '#2b6cb0'], ['selection-text', 'Selected row text', '#ffffff'],
    ['row-border', 'Row separator', '#eeeeee'], ['row-border-width', 'Row separator width', 1, 0, 3],
    ['row-x', 'Row side padding', 8, 0, 24], ['row-y', 'Row vertical padding', 3, 0, 16], ['name-gap', 'Name and icon gap', 6, 0, 20],
    ['column-handle', 'Column resize highlight', '#2b6cb0'], ['column-handle-opacity', 'Resize highlight opacity (%)', 45, 0, 100], ['column-handle-width', 'Column resize grab width', 6, 3, 16],
    ['edge-grab', 'Window edge grab width', 6, 3, 20], ['corner-grab', 'Window corner grab size', 10, 6, 30],
    ['resize-inset', 'Edge grab corner inset', 8, 4, 24],
  ]],
  ['Context menu', [
    ['menu', 'Menu background', '#f0f0f0'], ['menu-text', 'Menu text', '#111111'],
    ['menu-border', 'Menu border', '#000000'], ['menu-border-width', 'Menu border width', 1, 0, 4],
    ['menu-hover', 'Menu hover background', '#2b6cb0'], ['menu-hover-text', 'Menu hover text', '#ffffff'], ['menu-disabled', 'Disabled menu text', '#888888'],
    ['menu-font', 'Menu text size', 12, 9, 22], ['menu-min-width', 'Menu minimum width', 170, 120, 360],
    ['menu-padding', 'Menu outer padding', 2, 0, 8], ['menu-item-x', 'Menu item side padding', 12, 2, 24], ['menu-item-y', 'Menu item vertical padding', 2, 0, 10],
    ['menu-separator', 'Menu separator', '#cccccc'], ['menu-separator-height', 'Separator thickness', 1, 0, 4], ['menu-separator-gap', 'Separator vertical spacing', 2, 0, 10],
    ['menu-shadow', 'Menu shadow color', '#000000'], ['menu-shadow-opacity', 'Menu shadow opacity (%)', 40, 0, 100], ['menu-shadow-blur', 'Menu shadow blur', 8, 0, 30],
  ]],
  ['Titlebar system menu', [
    ['system-menu', 'System menu background', '#f5f5f5'], ['system-menu-text', 'System menu text', '#111111'],
    ['system-menu-hint', 'System menu shortcut text', '#555555'], ['system-menu-hover', 'System menu selection', '#dceaf9'],
    ['system-menu-border', 'System menu border', '#999999'], ['system-menu-border-width', 'System menu border width', 1, 0, 4],
    ['system-menu-radius', 'System menu corner radius', 6, 0, 16], ['system-menu-item-radius', 'Menu item corner radius', 3, 0, 10],
    ['system-menu-width', 'System menu minimum width', 200, 160, 360], ['system-menu-padding', 'System menu padding', 4, 0, 12],
    ['system-menu-x', 'System item side padding', 14, 4, 30], ['system-menu-y', 'System item vertical padding', 4, 0, 12],
    ['system-menu-font', 'System menu text size', 12, 9, 22], ['system-menu-gap', 'System shortcut spacing', 36, 8, 60],
  ]],
];

const WindowAppearance = {
  fields: WINDOW_APPEARANCE_GROUPS.flatMap(([, fields]) => fields),
  defaults() { return Object.fromEntries(this.fields.map(([key, , value]) => [key, value])); },
  resolve(settings = {}) {
    const source = { ...(settings.windowAppearance || {}) };
    if (!settings.windowAppearance && settings.titlebarColor) {
      const [dark, light] = shadeColorPair(settings.titlebarColor);
      source['title-inactive-start'] = dark; source['title-inactive-end'] = light;
    }
    return Object.fromEntries(this.fields.map(([key, , fallback, min, max]) => {
      const value = source[key];
      return [key, typeof fallback === 'string'
        ? (/^#[0-9a-f]{6}$/i.test(value) ? value : fallback)
        : (typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback)];
    }));
  },
  apply(settings) {
    const values = this.resolve(settings), root = document.documentElement;
    for (const [key, , fallback] of this.fields) {
      root.style.setProperty(`--wm-${key}`, String(values[key]) + (typeof fallback === 'number' && !key.endsWith('opacity') ? 'px' : ''));
    }
    for (const name of ['shadow', 'title-highlight', 'column-handle', 'menu-shadow']) {
      const color = values[name], rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
      root.style.setProperty(`--wm-${name}-rgba`, `rgba(${rgb.join(',')},${values[name + '-opacity'] / 100})`);
    }
  },
  build(container) {
    for (const [title, fields] of WINDOW_APPEARANCE_GROUPS) {
      const group = document.createElement('details'); group.open = title === 'Frame and shadow';
      const legend = document.createElement('summary'); legend.textContent = title; group.appendChild(legend);
      for (const [key, label, fallback, min, max, step] of fields) {
        const row = document.createElement('label'); row.className = 'window-setting-row';
        const name = document.createElement('span'); name.textContent = label;
        const input = document.createElement('input'); input.dataset.windowSetting = key;
        input.type = typeof fallback === 'string' ? 'color' : 'number';
        input.setAttribute('aria-label', label);
        if (input.type === 'number') { input.min = min; input.max = max; input.step = step || 1; }
        row.append(name, input); group.appendChild(row);
      }
      container.appendChild(group);
    }
  },
  populate(container, settings) {
    const values = this.resolve(settings);
    container.querySelectorAll('[data-window-setting]').forEach(input => { input.value = values[input.dataset.windowSetting]; });
  },
  read(container) {
    const values = {};
    container.querySelectorAll('[data-window-setting]').forEach(input => { values[input.dataset.windowSetting] = input.type === 'color' ? input.value : input.valueAsNumber; });
    return this.resolve({ windowAppearance: values });
  },
};
WindowAppearance.apply({});
