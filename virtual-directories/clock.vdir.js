// A scripted virtual directory that generates a couple of "files"
// describing the current date/time. It re-runs every time the folder is
// opened or refreshed, so the files are always up to date.

module.exports = {
  id: 'clock',
  label: 'Live Clock',
  description: 'Generates text files describing the current date and time.',

  list: async () => {
    const now = new Date();
    const dayOfYear = Math.ceil((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

    return [
      {
        name: 'current-time.txt',
        kind: 'file',
        color: '#4fd1c5',
        size: 48,
        modified: Date.now(),
        content: `It is currently ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}.`,
      },
      {
        name: 'iso-timestamp.txt',
        kind: 'file',
        color: '#63b3ed',
        size: 32,
        modified: Date.now(),
        content: now.toISOString(),
      },
      {
        name: 'day-of-year.txt',
        kind: 'file',
        color: '#f6ad55',
        size: 16,
        modified: Date.now(),
        content: `Day ${dayOfYear} of ${now.getFullYear()}.`,
      },
    ];
  },
};
