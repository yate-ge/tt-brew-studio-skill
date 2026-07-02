const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { setupWebSocket, broadcast, closeWebSocket } = require('./lib/ws');
const { setupRoutes } = require('./routes/api');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[key] = argv[++i];
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const dataDir = args['data-dir'] || path.join(process.cwd(), '.visual-delivery');
const port = parseInt(args.port, 10) || 3847;
const host = args.host || '127.0.0.1';
const uiDir = args['ui-dir'] || path.join(dataDir, 'ui', 'dist');

fs.mkdirSync(path.join(dataDir, 'data'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'data', 'canvas-workspaces'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'data', 'scaffolds'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.set('port', port);

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return cookies;
    cookies[rawKey] = decodeURIComponent(rest.join('=') || '');
    return cookies;
  }, {});
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function readAccessSettings() {
  const settingsPath = path.join(dataDir, 'data', 'settings.json');
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return {
      enabled: settings.access_key_enabled === true,
      key: typeof settings.access_key === 'string' ? settings.access_key : '',
    };
  } catch {
    return { enabled: false, key: '' };
  }
}

function accessKeyMiddleware(req, res, next) {
  if (req.path === '/health' || req.path === '/api/health') return next();

  const access = readAccessSettings();
  if (!access.enabled || !access.key) return next();

  const cookies = parseCookies(req.headers.cookie || '');
  const provided = req.get('x-vd-access-key') || req.query.vd_key || cookies.vd_access_key;
  if (provided && timingSafeEqual(provided, access.key)) {
    if (req.query.vd_key) {
      res.cookie('vd_access_key', access.key, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
    }
    return next();
  }

  if (req.method === 'GET' && req.accepts('html')) {
    res.status(401).type('html').send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Visual Delivery Access</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    form { width: min(420px, 100%); background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08); }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0 0 18px; color: #64748b; font-size: 14px; line-height: 1.6; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; }
    button { margin-top: 12px; width: 100%; padding: 10px 12px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <form method="GET" action="${req.path}">
      <h1>需要访问密钥</h1>
      <p>请输入当前项目的 Visual Delivery 访问密钥。</p>
      <input name="vd_key" type="password" autocomplete="current-password" autofocus />
      <button type="submit">进入</button>
    </form>
  </main>
</body>
</html>`);
    return;
  }

  res.status(401).json({
    error: { code: 'ACCESS_KEY_REQUIRED', message: 'Valid Visual Delivery access key required' },
  });
}

app.use(accessKeyMiddleware);

setupRoutes(app, dataDir);

app.use('/api', (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `API route not found: ${req.path}` },
  });
});

if (fs.existsSync(uiDir)) {
  // Serve static assets but NOT index.html (we inject locale into it)
  app.use(express.static(uiDir, { index: false }));

  // Read locale for injection into HTML
  function readLocale() {
    const localePath = path.join(dataDir, 'data', 'locale.json');
    try {
      return JSON.parse(fs.readFileSync(localePath, 'utf8'));
    } catch {
      return {};
    }
  }

  // Read language code from settings
  function readLangCode() {
    const settingsPath = path.join(dataDir, 'data', 'settings.json');
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings.language || 'en';
    } catch {
      return 'en';
    }
  }

  const indexHtmlPath = path.join(uiDir, 'index.html');
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/health')) {
      try {
        const html = fs.readFileSync(indexHtmlPath, 'utf8');
        const locale = readLocale();
        const lang = readLangCode();
        const script = `<script>window.__VD_LOCALE__=${JSON.stringify(locale)};window.__VD_LANG__="${lang}";</script>`;
        const injected = html.replace('</head>', `${script}\n</head>`);
        res.type('html').send(injected);
      } catch (err) {
        console.error('Error serving index.html:', err.message);
        res.status(500).send('Internal Server Error');
      }
    }
  });
}

const server = http.createServer(app);
setupWebSocket(server);

function watchDesignTokens() {
  const tokensPath = path.join(dataDir, 'design', 'tokens.json');
  if (!fs.existsSync(tokensPath)) return;

  let debounceTimer = null;
  fs.watch(tokensPath, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
        if (tokens.colors && tokens.typography && tokens.spacing) {
          broadcast('design_updated', tokens);
        }
      } catch (err) {
        console.error('Invalid tokens.json:', err.message);
      }
    }, 200);
  });
}

const pidPath = path.join(dataDir, 'server.pid');
fs.writeFileSync(pidPath, String(process.pid));

server.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
  watchDesignTokens();
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  closeWebSocket();
  server.close(() => {
    try {
      fs.unlinkSync(pidPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('PID cleanup error:', err.message);
      }
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
