const { spawn, execFile } = require('node:child_process');
const readline = require('node:readline');
const path = require('node:path');
let worker = null;
let sequence = 0;
const pending = new Map();

function stopIconWorker() {
  const old = worker; worker = null;
  old?.kill();
  for (const job of pending.values()) { clearTimeout(job.timer); job.resolve([]); }
  pending.clear();
}

function windowsImages(filePath) {
  if (!worker) {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-Sta', '-File', path.join(__dirname, 'windowsIconWorker.ps1')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    worker = child;
    const failed = () => { if (worker === child) stopIconWorker(); };
    child.on('error', failed); child.on('exit', failed); child.stdin.on('error', failed);
    child.stderr.resume();
    readline.createInterface({ input: child.stdout }).on('line', line => {
      let result;
      try { result = JSON.parse(line); } catch { return; }
      const job = pending.get(result.id);
      if (job) { pending.delete(result.id); clearTimeout(job.timer); job.resolve(result.variants || []); }
    });
  }
  return new Promise(resolve => {
    const id = ++sequence;
    const timer = setTimeout(stopIconWorker, 20000);
    pending.set(id, { resolve, timer });
    worker.stdin.write(JSON.stringify({ id, path: filePath }) + '\n');
  });
}

function platformIconImages(filePath) {
  if (process.platform === 'win32') return windowsImages(filePath);
  if (process.platform === 'darwin') return new Promise(resolve => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', path.join(__dirname, 'macIconImages.js'), filePath],
      { timeout: 20000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
        if (error) return resolve([]);
        try { resolve(JSON.parse(stdout)); } catch { resolve([]); }
      });
  });
  return Promise.resolve([]);
}

module.exports = { platformIconImages, stopIconWorker };
