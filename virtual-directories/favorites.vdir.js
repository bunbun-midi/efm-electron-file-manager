// A virtual directory listing whatever images you've starred from the
// image viewer. Reads the same JSON file main.js's favorites:* IPC
// handlers write to — both run in the main process, so a plain fs read
// here stays in sync with the app's own state automatically.
//
// Unlike clock/colors/system-info, these entries point at real files
// (via `realPath`), so the viewer opens the genuine image rather than a
// synthetic one. They're still read-only through this virtual view though
// — no rename/trash/drag here, only viewing and un-favoriting.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { colorForName } = require('../lib/colorForName');

function favoritesPath() {
  return path.join(app.getPath('userData'), 'favorites.json');
}

function loadFavoritePaths() {
  try {
    return JSON.parse(fs.readFileSync(favoritesPath(), 'utf-8'));
  } catch {
    return [];
  }
}

module.exports = {
  id: 'favorites',
  label: 'Favorite Images',
  description: 'Images starred from the image viewer\u2019s \u2606 button.',

  list: async () => {
    const paths = loadFavoritePaths();
    const entries = [];
    for (const filePath of paths) {
      try {
        const stat = fs.statSync(filePath);
        const name = path.basename(filePath);
        entries.push({
          name,
          kind: 'image',
          color: colorForName(name, false),
          size: stat.size,
          modified: stat.mtimeMs,
          created: stat.birthtimeMs,
          realPath: filePath,
        });
      } catch {
        // Favorited file was since moved or deleted — just leave it out
        // rather than erroring the whole folder listing.
      }
    }
    return entries;
  },
};
