const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

async function showFileProperties(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || filePath.includes('\0')) {
    throw new Error('Properties requires a real file or folder.');
  }
  await fs.lstat(filePath);
  let executable, args, input;
  if (process.platform === 'win32') {
    executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    args = ['-NoProfile', '-NonInteractive', '-Sta', '-File', path.join(__dirname, 'windowsFileProperties.ps1')];
    input = JSON.stringify(filePath);
  } else if (process.platform === 'darwin') {
    executable = '/usr/bin/osascript';
    args = [path.join(__dirname, 'macFileProperties.applescript'), filePath];
  } else {
    throw new Error('Native Properties is currently supported on Windows and macOS.');
  }
  // Paths are data, never interpolated into shell or AppleScript source.
  // The Windows helper remains alive while its native property sheet is open.
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let errorText = '';
    child.stderr.on('data', data => { errorText = (errorText + data).slice(-4096); });
    child.on('error', reject);
    child.stdin.on('error', () => {});
    child.on('close', code => code === 0 ? resolve() : reject(new Error(errorText.trim() || 'Could not open Properties.')));
    child.stdin.end(input || '');
  });
}

module.exports = { showFileProperties };
