// A scripted virtual directory with full Node.js access (it runs in the
// main process), used here to expose live system info as read-only files.

const os = require('os');

module.exports = {
  id: 'system-info',
  label: 'System Info',
  description: 'Live system information rendered as virtual text files.',

  list: async () => {
    const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    const cpuModel = (os.cpus()[0] || {}).model || 'Unknown CPU';

    return [
      {
        name: 'platform.txt',
        kind: 'file',
        color: '#68d391',
        size: 24,
        modified: Date.now(),
        content: `${os.platform()} (${os.arch()})`,
      },
      {
        name: 'cpu.txt',
        kind: 'file',
        color: '#fc8181',
        size: 24,
        modified: Date.now(),
        content: cpuModel,
      },
      {
        name: 'memory.txt',
        kind: 'file',
        color: '#f687b3',
        size: 24,
        modified: Date.now(),
        content: `${gb(os.totalmem() - os.freemem())} used of ${gb(os.totalmem())}`,
      },
      {
        name: 'uptime.txt',
        kind: 'file',
        color: '#b794f4',
        size: 16,
        modified: Date.now(),
        content: `${(os.uptime() / 3600).toFixed(1)} hours since boot`,
      },
    ];
  },
};
