const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

function launchSpec(target, files, platform = process.platform) {
  const ext = path.extname(target).toLowerCase();
  if (platform === 'win32' && ['.bat', '.cmd'].includes(ext)) {
    // CMD expands these environment references once. Paths are never inserted
    // into command source; delayed expansion stays disabled for literal '!'.
    const env = { ...process.env, EFM_DROP_TARGET: target };
    files.forEach((file, i) => { env[`EFM_DROP_${i}`] = file; });
    const command = ['"%EFM_DROP_TARGET%"', ...files.map((_, i) => `"%EFM_DROP_${i}%"`)].join(' ');
    return { executable: process.env.COMSPEC || 'cmd.exe', args: ['/d', '/v:off', '/s', '/c', `"${command}"`], options: { windowsVerbatimArguments: true, env } };
  }
  if (platform === 'win32' && ext === '.ps1') return { executable: 'powershell.exe', args: ['-NoProfile', '-File', target, ...files] };
  if (platform === 'darwin' && ext === '.app') return { executable: '/usr/bin/open', args: ['-a', target, ...files] };
  if (['.sh', '.bash', '.zsh', '.command'].includes(ext)) {
    const shell = ext === '.zsh' ? 'zsh' : ext === '.bash' ? 'bash' : 'sh';
    return { executable: platform === 'win32' ? shell : `/bin/${shell}`, args: [target, ...files] };
  }
  if (platform === 'win32' && !['.exe', '.com'].includes(ext)) throw new Error('This shortcut is not an executable or supported script.');
  return { executable: target, args: files };
}

async function launchShortcut(target, files) {
  if (typeof target !== 'string' || !path.isAbsolute(target) || !Array.isArray(files) || !files.length || files.length > 500) throw new Error('Choose an application and one or more files.');
  for (const file of [target, ...files]) {
    if (typeof file !== 'string' || !path.isAbsolute(file) || /[\0\r\n]/.test(file)) throw new Error('Invalid file path.');
    await fs.stat(file);
  }
  const spec = launchSpec(target, files);
  if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(target) && [target, ...files].reduce((n, p) => n + p.length + 3, 0) > 7500) throw new Error('These paths exceed the Windows batch command limit. Drop fewer files at once.');
  return new Promise((resolve, reject) => {
    const child = spawn(spec.executable, spec.args, { cwd: path.dirname(target), detached: true, windowsHide: true, stdio: 'ignore', ...spec.options });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
}
module.exports = { launchSpec, launchShortcut };
