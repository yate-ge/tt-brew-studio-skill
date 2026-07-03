#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

const PORT = 3847;           // Avoids conflict with 3000/5173/8080 common dev ports
const HEALTH_TIMEOUT = 15;   // Seconds to wait for server startup

const SKILL_DIR = path.resolve(__dirname, '..');
const RUNTIME_LABEL = 'tt-design-brew-studio';
// English and Chinese have built-in locale presets; other languages are agent-generated at runtime.
const PRESET_LANGS = ['en', 'zh'];

function log(msg) {
  process.stderr.write(`[${RUNTIME_LABEL}] ${msg}\n`);
}

function outputJSON(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args[key] = argv[++i];
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function normalizeLang(lang) {
  if (typeof lang !== 'string') return null;
  const v = lang.trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith('zh')) return 'zh';
  if (v.startsWith('en')) return 'en';
  // Accept any language code (agent generates locale for non-preset languages)
  return v || null;
}

function detectEnvLang() {
  const envLang = normalizeLang(process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '');
  return envLang || 'en';
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function syncTemplateDir(sourceDir, destDir, options = {}) {
  const preserveRootEntries = new Set(options.preserveRootEntries || []);
  fs.mkdirSync(destDir, { recursive: true });

  const sourceEntries = new Map(
    fs.readdirSync(sourceDir, { withFileTypes: true }).map((entry) => [entry.name, entry])
  );
  const destEntries = fs.readdirSync(destDir, { withFileTypes: true });

  for (const entry of destEntries) {
    if (preserveRootEntries.has(entry.name)) continue;
    const sourceEntry = sourceEntries.get(entry.name);
    const destPath = path.join(destDir, entry.name);
    if (!sourceEntry) {
      fs.rmSync(destPath, { recursive: true, force: true });
      continue;
    }
    if (entry.isDirectory() && sourceEntry.isDirectory()) {
      syncTemplateDir(path.join(sourceDir, entry.name), destPath);
    }
  }

  fs.cpSync(sourceDir, destDir, { recursive: true, force: true });
}

function manifestHash(dir) {
  const hash = crypto.createHash('sha256');
  for (const name of ['package.json', 'package-lock.json']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) {
      hash.update(name);
      hash.update(fs.readFileSync(file));
    }
  }
  return hash.digest('hex');
}

function commandFailureDetails(err) {
  const chunks = [err?.stdout, err?.stderr]
    .map((chunk) => Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || ''))
    .map((text) => text.trim())
    .filter(Boolean);
  if (!chunks.length) return '';
  const joined = chunks.join('\n');
  return joined.length > 4000 ? `${joined.slice(-4000)}` : joined;
}

function ensureDependencies(dir, installCommand, label) {
  const nodeModules = path.join(dir, 'node_modules');
  const stampPath = path.join(nodeModules, '.vd-install-hash');
  const hash = manifestHash(dir);
  let installedHash = null;
  try { installedHash = fs.readFileSync(stampPath, 'utf8').trim(); } catch {}
  if (fs.existsSync(nodeModules) && installedHash === hash) return;

  log(`Installing ${label} dependencies...`);
  try {
    execSync(installCommand, { cwd: dir, stdio: 'pipe' });
    fs.mkdirSync(nodeModules, { recursive: true });
    fs.writeFileSync(stampPath, hash, 'utf8');
  } catch (err) {
    const details = commandFailureDetails(err);
    outputJSON({
      status: 'error',
      message: `Failed to install ${label} dependencies. Check network and retry.`,
      details,
    });
    process.exit(1);
  }
}


async function checkServerHealth(port, timeoutSec) {
  const deadline = Date.now() + timeoutSec * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await sleep(500);
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  const dataDir = path.resolve(args['data-dir'] || path.join(process.cwd(), '.visual-delivery'));
  const initLang = normalizeLang(args['lang']) || detectEnvLang();
  const shouldSyncTemplates = args['sync-templates'] !== 'false';

  // Read persisted settings early (for port & remote resolution)
  const settingsPath = path.join(dataDir, 'data', 'settings.json');
  const persistedSettings = (() => {
    try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
    catch { return {}; }
  })();

  // Resolve port: --port CLI flag > settings.port > default 3847
  const cliPort = parseInt(args['port']);
  const pPort = parseInt(persistedSettings.port);
  const settingsPort = (pPort >= 1024 && pPort <= 65535) ? pPort : null;
  const port = (cliPort >= 1024 && cliPort <= 65535) ? cliPort : (settingsPort || PORT);

  // Check Node.js version
  const nodeVersion = parseInt(process.versions.node.split('.')[0]);
  if (nodeVersion < 18) {
    outputJSON({
      status: 'error',
      message: `Node.js >= 18 required (found v${process.versions.node}). Install: https://nodejs.org`
    });
    process.exit(1);
  }

  // Check if already running — stop old server so we can resync templates and restart
  const pidFile = path.join(dataDir, 'server.pid');
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
    if (isProcessAlive(pid)) {
      log(`Stopping previous server (PID ${pid}) to resync templates...`);
      try {
        process.kill(pid, 'SIGTERM');
        // Wait for process to exit (up to 5s)
        const killDeadline = Date.now() + 5000;
        while (Date.now() < killDeadline && isProcessAlive(pid)) {
          await sleep(200);
        }
        if (isProcessAlive(pid)) {
          process.kill(pid, 'SIGKILL');
          await sleep(500);
        }
      } catch {
        // Process already gone
      }
    }
    try { fs.unlinkSync(pidFile); } catch {}
  }

  // Determine if first run
  const firstRun = !fs.existsSync(path.join(dataDir, 'server'));

  // Initialize work directory (first run)
  let templatesSynced = false;
  if (firstRun) {
    log('Initializing work directory...');

    // Create canvas runtime data directories.
    fs.mkdirSync(path.join(dataDir, 'data', 'canvas-workspaces'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'data', 'scaffolds'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

    // Copy server template
    log('  Copying server template...');
    syncTemplateDir(path.join(SKILL_DIR, 'templates', 'server'), path.join(dataDir, 'server'));

    // Copy frontend template
    log('  Copying frontend template...');
    syncTemplateDir(path.join(SKILL_DIR, 'templates', 'ui'), path.join(dataDir, 'ui'));

    // Copy design template (only if not exists)
    if (!fs.existsSync(path.join(dataDir, 'design'))) {
      log('  Generating design specification...');
      fs.cpSync(path.join(SKILL_DIR, 'templates', 'design'), path.join(dataDir, 'design'), { recursive: true });
    }

    // Remove any stale dist/ copied from templates — always rebuild on first run
    const copiedDist = path.join(dataDir, 'ui', 'dist');
    if (fs.existsSync(copiedDist)) {
      fs.rmSync(copiedDist, { recursive: true });
    }
  } else {
    // Ensure data dirs exist on subsequent runs
    fs.mkdirSync(path.join(dataDir, 'data', 'canvas-workspaces'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'data', 'scaffolds'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

    if (shouldSyncTemplates) {
      log('Syncing runtime templates...');
      syncTemplateDir(path.join(SKILL_DIR, 'templates', 'server'), path.join(dataDir, 'server'), {
        preserveRootEntries: ['node_modules'],
      });
      syncTemplateDir(path.join(SKILL_DIR, 'templates', 'ui'), path.join(dataDir, 'ui'), {
        preserveRootEntries: ['node_modules', 'dist'],
      });
      templatesSynced = true;
    }
  }

  // Copy locale presets to runtime (for server-side language switching)
  const localesSourceDir = path.join(SKILL_DIR, 'templates', 'locales');
  const localesDestDir = path.join(dataDir, 'locales');
  if (fs.existsSync(localesSourceDir)) {
    fs.cpSync(localesSourceDir, localesDestDir, { recursive: true, force: true });
  }

  // Generate locale.json from preset when language changes or missing
  const localePath = path.join(dataDir, 'data', 'locale.json');
  const currentLang = (() => {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8')).language;
    } catch { return null; }
  })();
  const langChanged = currentLang !== initLang;

  const isPresetLang = PRESET_LANGS.includes(initLang);
  const needsLocaleRefresh = !fs.existsSync(localePath)
    || langChanged
    || (templatesSynced && isPresetLang);

  if (needsLocaleRefresh) {
    const presetPath = path.join(localesDestDir, `${initLang}.json`);
    if (fs.existsSync(presetPath)) {
      // Use built-in preset
      fs.cpSync(presetPath, localePath);
      log(`  Locale set from preset: ${initLang}`);
    } else {
      // Non-preset language — copy en.json as fallback, agent will generate
      const fallbackPath = path.join(localesDestDir, 'en.json');
      if (fs.existsSync(fallbackPath)) {
        fs.cpSync(fallbackPath, localePath);
      }
      log(`  Locale fallback to en (agent will generate ${initLang})`);
    }
  }

  const PLATFORM_DEFAULTS = {
    en: { name: 'TT Design Brew Studio', slogan: 'Think together on a design canvas.', favicon: '' },
    zh: { name: 'TT 设计精酿 Studio', slogan: '在画布上一起推敲设计判断。', favicon: '' },
  };
  const STALE_PLATFORM_NAMES = new Set([
    'Visual Delivery',
    'Visual Delivery Canvas',
    'Visual Delivery 画布',
    ...Object.values(PLATFORM_DEFAULTS).map((item) => item.name),
  ]);

  // Read existing settings to check if platform needs update
  const existingSettings = (() => {
    if (!fs.existsSync(settingsPath)) return {};
    try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
    catch { return {}; }
  })();

  const platformName = existingSettings.platform?.name || '';
  const isDefaultOrStalePlatform = !platformName || STALE_PLATFORM_NAMES.has(platformName);

  // Update settings.json when needed
  if (!fs.existsSync(settingsPath) || langChanged || isDefaultOrStalePlatform) {
    // For non-preset languages: use empty platform so frontend falls back to generated locale values.
    // Treat empty platform (both name/slogan falsy) as unset — re-apply defaults
    const hasCustomPlatform = existingSettings.platform
      && (existingSettings.platform.name || existingSettings.platform.slogan)
      && !isDefaultOrStalePlatform;
    const platformValue = (() => {
      const ep = existingSettings.platform || {};
      if (hasCustomPlatform) {
        return { name: ep.name, slogan: ep.slogan, favicon: ep.favicon || '' };
      }
      return isPresetLang ? PLATFORM_DEFAULTS[initLang] : { name: '', slogan: '', favicon: '' };
    })();

    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        ...existingSettings,
        language: initLang,
        language_explicit: true,
        trigger_mode: existingSettings.trigger_mode || 'smart',
        port,
        platform: platformValue,
      }, null, 2),
      'utf8'
    );
  }

  const serverDir = path.join(dataDir, 'server');
  ensureDependencies(serverDir, 'npm install --omit=dev --silent', 'server');

  const uiDir = path.join(dataDir, 'ui');
  ensureDependencies(uiDir, 'npm install --silent', 'frontend');

  // Build frontend (if dist/ missing)
  const distDir = path.join(uiDir, 'dist');
  if (!fs.existsSync(distDir) || templatesSynced) {
    log('Building frontend...');
    try {
      execSync('npm run build', { cwd: uiDir, stdio: 'pipe' });
    } catch (err) {
      const details = commandFailureDetails(err);
      outputJSON({
        status: 'error',
        message: 'Frontend build failed.',
        details,
      });
      process.exit(1);
    }
  }

  // Resolve network access: --remote CLI flag > settings.remote > default false
  const allowRemote = args['remote'] === true || (persistedSettings.remote === true && args['remote'] !== 'false');
  const host = allowRemote ? '0.0.0.0' : '127.0.0.1';

  // Start server
  log('Starting server...');
  const logFd = fs.openSync(path.join(dataDir, 'logs', 'server.log'), 'a');
  const child = spawn('node', [
    'index.js',
    '--data-dir', dataDir,
    '--project-dir', process.cwd(),
    '--port', String(port),
    '--host', host,
    '--ui-dir', distDir
  ], {
    cwd: serverDir,
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });
  child.unref();
  fs.closeSync(logFd);

  // Wait for server ready
  const healthy = await checkServerHealth(port, HEALTH_TIMEOUT);
  if (!healthy) {
    outputJSON({
      status: 'error',
      message: `Server failed to start within ${HEALTH_TIMEOUT}s. Check ${path.join(dataDir, 'logs', 'server.log')}`
    });
    process.exit(1);
  }

  // Resolve trigger mode for output
  const triggerMode = persistedSettings.trigger_mode || 'smart';
  const triggerModeLabels = { auto: 'Auto', smart: 'Smart (context-based)', manual: 'Manual' };

  // Output results
  log('');
  log('Ready!');
  log(`  URL:            http://${allowRemote ? '0.0.0.0' : 'localhost'}:${port}`);
  log(`  Network:        ${allowRemote ? 'LAN / external' : 'localhost only'}`);
  log(`  Trigger mode:   ${triggerModeLabels[triggerMode] || triggerMode}`);

  outputJSON({
    status: 'started',
    url: `http://${allowRemote ? '0.0.0.0' : 'localhost'}:${port}`,
    host,
    pid: child.pid,
    first_run: firstRun,
    templates_synced: templatesSynced,
    language: initLang,
    trigger_mode: triggerMode
  });
}

main().catch(err => {
  log(`Error: ${err.message}`);
  outputJSON({ status: 'error', message: err.message });
  process.exit(1);
});
