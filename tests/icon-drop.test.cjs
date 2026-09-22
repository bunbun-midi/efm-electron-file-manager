const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const writes = [];
  const transfers = [];
  const api = {
    dirname: p => path.posix.dirname(p), basename: p => path.posix.basename(p),
    toFileUrl: p => `file://${p}`,
    setLayoutPos: async (...args) => writes.push(args),
    copyItem: async (...args) => transfers.push(args),
    moveItem: async () => { throw new Error('Reposition must not move files'); },
  };
  const context = vm.createContext({ window: { fm: api }, CSS: { escape: s => s } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/fileView.js'), 'utf8') + '\nglobalThis.view = FileView;', context);
  const nodes = ['a', 'b'].map((id, index) => ({
    handlers: {},
    style: {},
    classList: { contains: name => name === 'icon-item', add() {}, remove() {} },
    getBoundingClientRect: () => ({ left: 100 + index * 230, top: 80 + index * 50 }),
    addEventListener(name, handler) { this.handlers[name] = handler; },
  }));
  const canvas = { style: {}, offsetWidth: 800, offsetHeight: 600, scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => ({ left: 40, top: -150 }) };
  const content = { scrollLeft: 180, scrollTop: 450, clientWidth: 800, clientHeight: 600 };
  let navigations = 0;
  const entries = ['a', 'b'].map(id => ({ id, name: `${id}.png`, path: `/photos/${id}.png`, ext: '.png', kind: 'image' }));
  const win = {
    id: 'window', path: '/photos', entries, selection: new Set(['a', 'b']),
    layout: { 'a.png': { size: 240, scaling: 'bilinear' } },
    el: { querySelector: selector => selector === '.icon-canvas' ? canvas : selector === '.fm-content' ? content : nodes[selector.includes('"a"') ? 0 : 1] },
    manager: { focus() {}, refreshWindowsShowingPath() {} },
    setStatus() {}, navigate: async () => { navigations++; content.scrollLeft = 0; content.scrollTop = 0; },
  };
  const data = new Map();
  let ghost;
  const dataTransfer = {
    setDragImage: (node, x, y) => { ghost = { node, x, y }; },
    setData: (key, value) => data.set(key, value), getData: key => data.get(key),
  };
  context.view.wireDragAndDrop(win, nodes[0], entries[0]);
  return { view: context.view, win, nodes, canvas, content, dataTransfer, writes, transfers, ghost: () => ghost, navigations: () => navigations };
}

for (const [offsetX, offsetY] of [[12, 8], [210, 190], [160, 28]]) {
  test(`drop matches the ghost hotspot (${offsetX}, ${offsetY}) in a scrolled folder`, async () => {
    const f = fixture();
    f.nodes[0].handlers.dragstart({ clientX: 100 + offsetX, clientY: 80 + offsetY, dataTransfer: f.dataTransfer });
    assert.equal(f.ghost().x, offsetX);
    assert.equal(f.ghost().y, offsetY);
    await f.view.handleDrop(f.win, { clientX: 540, clientY: 350, altKey: false, dataTransfer: f.dataTransfer });
    const a = f.writes[0][2];
    const b = f.writes[1][2];
    // Back in viewport coordinates, the icon exactly matches the ghost.
    assert.equal(a.x + 40, 540 - offsetX);
    assert.equal(a.y - 150, 350 - offsetY);
    assert.equal(b.x - a.x, 230);
    assert.equal(b.y - a.y, 50);
    assert.equal(f.win.layout['a.png'].size, 240);
    assert.equal(f.win.layout['a.png'].scaling, 'bilinear');
    assert.equal(f.transfers.length, 0);
    assert.equal(f.navigations(), 0, 'Repositioning must not reload the directory');
    assert.equal(f.content.scrollLeft, 180);
    assert.equal(f.content.scrollTop, 450);
    assert.equal(f.canvas.style.minWidth, '980px');
    assert.equal(f.canvas.style.minHeight, '1050px');
    assert.equal(f.nodes[0].style.left, `${a.x}px`);
    assert.equal(f.nodes[0].style.top, `${a.y}px`);
    assert.equal(f.win.selection.size, 2);
  });
}

test('Ctrl-drop copies rather than repositioning', async () => {
  const f = fixture();
  f.nodes[0].handlers.dragstart({ clientX: 120, clientY: 90, dataTransfer: f.dataTransfer });
  await f.view.handleDrop(f.win, { clientX: 540, clientY: 350, ctrlKey: true, dataTransfer: f.dataTransfer });
  assert.equal(f.writes.length, 0);
  assert.equal(f.transfers.length, 2);
  assert.equal(f.navigations(), 1, 'File copies still refresh the listing');
});
