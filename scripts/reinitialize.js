#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SKILL_DIR = path.resolve(__dirname, '..');

function log(message) {
  process.stderr.write(`[visual-delivery] ${message}\n`);
}

function outputJSON(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function parseArgs(argv) {
  const args = {};
  const passthrough = [];
  for (let i = 2; i < argv.length; i++) {
    const item = argv[i];
    passthrough.push(item);
    if (item.startsWith('--')) {
      const key = item.slice(2);
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        passthrough.push(argv[++i]);
      } else {
        args[key] = true;
      }
    }
  }
  return { args, passthrough };
}

function buildStartArgs(argv) {
  const result = [];
  for (let i = 2; i < argv.length; i++) {
    const item = argv[i];
    if (item === '--no-backup') continue;
    if (item === '--backup') {
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) i++;
      continue;
    }
    result.push(item);
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopPidFile(pidFile, label) {
  if (!fs.existsSync(pidFile)) return null;
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
  if (Number.isFinite(pid) && isProcessAlive(pid)) {
    log(`Stopping ${label} (PID ${pid})...`);
    try {
      process.kill(pid, 'SIGTERM');
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && isProcessAlive(pid)) {
        await sleep(200);
      }
      if (isProcessAlive(pid)) {
        process.kill(pid, 'SIGKILL');
        await sleep(500);
      }
    } catch {
      // Process already exited.
    }
  }
  try { fs.unlinkSync(pidFile); } catch {}
  return Number.isFinite(pid) ? pid : null;
}

function timestamp() {
  const d = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

function uniqueBackupPath(dataDir) {
  const base = `${dataDir}.bak.${timestamp()}`;
  if (!fs.existsSync(base)) return base;
  for (let i = 1; i < 100; i++) {
    const candidate = `${base}.${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Unable to allocate backup path for ${dataDir}`);
}

function assertSafeRuntimeDir(dataDir) {
  const resolved = path.resolve(dataDir);
  const home = process.env.HOME ? path.resolve(process.env.HOME) : null;
  const forbidden = new Set([path.parse(resolved).root, home, SKILL_DIR].filter(Boolean));
  if (forbidden.has(resolved)) {
    throw new Error(`Refusing to reset unsafe data dir: ${resolved}`);
  }
  if (!path.basename(resolved).startsWith('.visual-delivery')) {
    throw new Error(`Refusing to reset non Visual Delivery runtime dir: ${resolved}`);
  }
}

async function main() {
  const { args, passthrough } = parseArgs(process.argv);
  const dataDir = path.resolve(args['data-dir'] || path.join(process.cwd(), '.visual-delivery'));
  const noBackup = args.backup === 'false' || args['no-backup'] === true;

  assertSafeRuntimeDir(dataDir);

  const serverPid = await stopPidFile(path.join(dataDir, 'server.pid'), 'server');
  const tunnelPid = await stopPidFile(path.join(dataDir, 'tunnel.pid'), 'tunnel');
  try { fs.unlinkSync(path.join(dataDir, 'tunnel.url')); } catch {}

  let backupDir = null;
  if (fs.existsSync(dataDir)) {
    if (noBackup) {
      log(`Removing runtime data dir: ${dataDir}`);
      fs.rmSync(dataDir, { recursive: true, force: true });
    } else {
      backupDir = uniqueBackupPath(dataDir);
      log(`Backing up runtime data dir: ${backupDir}`);
      fs.renameSync(dataDir, backupDir);
    }
  }

  const startArgs = buildStartArgs(process.argv);
  log('Starting with a clean runtime data dir...');
  const result = spawnSync(process.execPath, [path.join(SKILL_DIR, 'scripts', 'start.js'), ...startArgs], {
    cwd: SKILL_DIR,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    outputJSON({
      status: 'error',
      message: 'Reinitialize failed while starting server.',
      data_dir: dataDir,
      backup_dir: backupDir,
      server_pid: serverPid,
      tunnel_pid: tunnelPid,
    });
    process.exit(result.status || 1);
  }

  outputJSON({
    status: 'reinitialized',
    data_dir: dataDir,
    backup_dir: backupDir,
    server_pid: serverPid,
    tunnel_pid: tunnelPid,
  });
}

main().catch((err) => {
  log(`Error: ${err.message}`);
  outputJSON({ status: 'error', message: err.message });
  process.exit(1);
});
