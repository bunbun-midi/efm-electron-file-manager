// A scripted virtual directory that generates a small gallery of solid-color
// "images" on the fly. Each one is a real (tiny) SVG image, so double
// clicking it exercises the same 100%-of-viewport image viewer used for
// real image files on disk. Also demonstrates a nested virtual folder via
// the `subpath` argument passed to list().

function svgSquare(hex) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${hex}"/></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

function randomHex() {
  return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
}

module.exports = {
  id: 'colors',
  label: 'Color Gallery',
  description: 'A generated gallery of solid-color images, with a folder of pastel shades.',

  list: async (subpath) => {
    if (subpath === 'pastel') {
      const pastels = ['#ffd6e8', '#d6f5ff', '#e2ffd6', '#fff5d6', '#ecd6ff'];
      return pastels.map((hex, i) => ({
        name: `pastel-${i + 1}.svg`,
        kind: 'image',
        color: hex,
        size: 300,
        modified: Date.now(),
        dataUrl: svgSquare(hex),
      }));
    }

    const entries = [
      {
        name: 'pastel',
        kind: 'directory',
        color: '#ecd6ff',
        size: 0,
        modified: Date.now(),
      },
    ];
    for (let i = 1; i <= 8; i++) {
      const hex = randomHex();
      entries.push({
        name: `swatch-${i}.svg`,
        kind: 'image',
        color: hex,
        size: 300,
        modified: Date.now(),
        dataUrl: svgSquare(hex),
      });
    }
    return entries;
  },
};
