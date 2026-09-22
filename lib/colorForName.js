// Deterministically assigns a "swatch" color to a file based on its
// extension, so the same kind of file always gets the same colored square.

const FILE_PALETTE = [
  '#4fd1c5', '#63b3ed', '#f6ad55', '#fc8181', '#b794f4',
  '#f687b3', '#68d391', '#fbd38d', '#81e6d9', '#a3bffa',
];

const FOLDER_COLOR = '#f2c94c';
const VIRTUAL_FOLDER_COLOR = '#a78bfa';

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function colorForName(name, isDirectory) {
  if (isDirectory) return FOLDER_COLOR;
  const ext = (name.split('.').pop() || '').toLowerCase();
  const idx = hashString(ext || name) % FILE_PALETTE.length;
  return FILE_PALETTE[idx];
}

module.exports = { colorForName, FILE_PALETTE, FOLDER_COLOR, VIRTUAL_FOLDER_COLOR };
