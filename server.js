const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { searchVideo } = require('./video-search');
const { createRemote } = require('./remote');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 5173;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const PUBLIC = /^\/(index\.html|styles\.css|lyrics\.css|extras\.css|app\.js|lyrics\.js|extras\.js|spotify\.js|icons\.js|sync\.js|yt\.html|icon\.svg|icon\.png|manifest\.webmanifest|fonts\/[\w.-]+\.(woff2|css))$/;
const MEDIA_NAME = /^\/media\/([\w-]{8,64}\.(webp|png|jpg))$/;
const MEDIA_TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };
const FILE_OF = { '/icon.png': '/build/icon.png' };

const inlineHashes = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`).join(' ');
function cspFor(rel, html) {
  if (rel === '/yt.html') {
    return [`default-src 'none'`, `script-src ${inlineHashes(html)}`, `style-src 'unsafe-inline'`,
      `frame-src https://www.youtube-nocookie.com`, `frame-ancestors http://127.0.0.1:* http://localhost:*`, `base-uri 'none'`].join('; ');
  }
  return [`default-src 'self'`, `script-src 'self' ${inlineHashes(html)}`.trim(), `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`, `font-src 'self' data:`, `media-src 'self' data: blob:`,
    `connect-src 'self' https://api.spotify.com https://accounts.spotify.com https://lrclib.net`,
    `frame-src http://localhost:* http://127.0.0.1:*`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`,
    `frame-ancestors 'none'`].join('; ');
}

const defaultDataDir = () => process.env.NOTAS_DATA || path.join(process.env.APPDATA || os.homedir(), 'Mis Notas');

function createStore(dir) {
  const file = path.join(dir, 'datos.json');
  const backups = path.join(dir, 'respaldos');
  let cache = null;
  let lastBackupDay = '';

  function read() {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch {
      try { cache = JSON.parse(fs.readFileSync(file + '.bak', 'utf8')); }
      catch { cache = { savedAt: 0, data: {} }; }
    }
    return cache;
  }

  function write(next) {
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, file + '.bak');
      const day = new Date().toISOString().slice(0, 10);
      if (day !== lastBackupDay) {
        lastBackupDay = day;
        fs.mkdirSync(backups, { recursive: true });
        fs.copyFileSync(file, path.join(backups, `datos-${day}.json`));
        const old = fs.readdirSync(backups).filter(f => f.startsWith('datos-')).sort().slice(0, -14);
        old.forEach(f => fs.rmSync(path.join(backups, f), { force: true }));
      }
    }
    fs.writeFileSync(file + '.tmp', JSON.stringify(next));
    fs.renameSync(file + '.tmp', file);
    cache = next;
  }

  return { read, write, file };
}

function merge(server = {}, client = {}) {
  const parse = (d, k, def) => { try { return JSON.parse(d[k]) ?? def; } catch { return def; } };
  const out = { ...server, ...client };
  const byId = (a, b, newer) => {
    const m = new Map();
    for (const x of [...a, ...b]) if (x && x.id != null) { const o = m.get(x.id); if (!o || newer(x, o)) m.set(x.id, x); }
    return [...m.values()];
  };
  const pristineSeed = n => String(n?.id).startsWith('seed-') && n.updated === n.created;
  let sn = parse(server, 'notas.notes', []), cn = parse(client, 'notas.notes', []);
  const onlySeeds = list => list.length > 0 && list.every(pristineSeed);
  const hasReal = list => list.some(n => !pristineSeed(n));
  if (onlySeeds(sn) && hasReal(cn)) sn = [];
  else if (onlySeeds(cn) && hasReal(sn)) cn = [];
  const dead = { ...parse(server, 'notas.deleted', {}) };
  for (const [id, t] of Object.entries(parse(client, 'notas.deleted', {}))) dead[id] = Math.max(dead[id] || 0, t);
  out['notas.deleted'] = JSON.stringify(dead);
  out['notas.notes'] = JSON.stringify(byId(sn, cn, (x, o) => (x.updated || 0) >= (o.updated || 0)).filter(n => !(dead[n.id] >= (n.updated || 0))));
  out['notas.folders'] = JSON.stringify(byId(parse(server, 'notas.folders', []), parse(client, 'notas.folders', []), () => true));
  out['notas.videos'] = JSON.stringify({ ...parse(server, 'notas.videos', {}), ...parse(client, 'notas.videos', {}) });
  return out;
}

function dropDeleted(data) {
  try {
    const dead = JSON.parse(data['notas.deleted'] || '{}');
    const notes = JSON.parse(data['notas.notes'] || '[]');
    const alive = notes.filter(n => !(dead[n.id] >= (n.updated || 0)));
    return alive.length === notes.length ? data : { ...data, 'notas.notes': JSON.stringify(alive) };
  } catch { return data; }
}

function createLock(dir) {
  const file = path.join(dir, 'candado.json');
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let fails = 0, blockedUntil = 0;
  const kdf = (pin, salt) => crypto.scryptSync(String(pin), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cache = new Map();
  const key = (pin, salt) => {
    const k = pin + '|' + salt.toString('base64');
    if (!cache.has(k)) { if (cache.size > 50) cache.clear(); cache.set(k, kdf(pin, salt)); }
    return cache.get(k);
  };
  return {
    hasPin: () => !!cfg,
    blocked: () => (blockedUntil > Date.now() ? Math.ceil((blockedUntil - Date.now()) / 1000) : 0),
    check(pin) {
      if (!cfg || !/^\d{4,8}$/.test(String(pin || ''))) return false;
      const ok = crypto.timingSafeEqual(key(String(pin), Buffer.from(cfg.salt, 'base64')), Buffer.from(cfg.hash, 'base64'));
      if (ok) { fails = 0; return true; }
      fails++;
      if (fails >= 5) blockedUntil = Date.now() + Math.min(300, 30 * 2 ** (fails - 5)) * 1000;
      return false;
    },
    setPin(pin) {
      const salt = crypto.randomBytes(16);
      cfg = { salt: salt.toString('base64'), hash: key(pin, salt).toString('base64') };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(cfg));
      fails = 0;
    },
    seal(pin, text) {
      const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key(pin, salt), iv);
      const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
      return { v: 1, s: salt.toString('base64'), i: iv.toString('base64'), t: c.getAuthTag().toString('base64'), d: data.toString('base64') };
    },
    open(pin, box) {
      const d = crypto.createDecipheriv('aes-256-gcm', key(pin, Buffer.from(box.s, 'base64')), Buffer.from(box.i, 'base64'));
      d.setAuthTag(Buffer.from(box.t, 'base64'));
      return Buffer.concat([d.update(Buffer.from(box.d, 'base64')), d.final()]).toString('utf8');
    },
  };
}

function readBodyBuffer(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(new Error('muy grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
function readBody(req, max = 25e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(new Error('muy grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createServer({ port = PORT, dataDir = defaultDataDir() } = {}) {
  const store = createStore(dataDir);
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const handoffs = new Map();
  let spotifySession = null;
  let remote = null;
  const dataRoot = path.dirname(store.file);
  const mediaDir = path.join(dataRoot, 'media');
  const lock = createLock(dataRoot);

  async function api(req, res, p, q) {
    const fromPhone = !!req.notasRemote;
    if (!fromPhone && !allowedHosts.has(req.headers.host)) return sendJSON(res, 403, { error: 'host' });
    const origin = req.headers.origin;
    if (origin && (fromPhone ? origin !== `http://${req.headers.host}` : !allowedOrigins.has(origin))) return sendJSON(res, 403, { error: 'origen' });
    if (req.method !== 'GET' && req.headers['x-notas'] !== '1') return sendJSON(res, 403, { error: 'cabecera' });

    if (fromPhone && !['/api/data', '/api/ver', '/api/video', '/api/spotify/token', '/api/media', '/api/lock', '/api/lock/setup', '/api/lock/seal', '/api/lock/open'].includes(p)) return sendJSON(res, 403, { error: 'solo en la PC' });

    if (p === '/api/media' && req.method === 'POST') {
      const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[req.headers['content-type']];
      if (!ext) return sendJSON(res, 400, { error: 'tipo' });
      const buf = await readBodyBuffer(req, 15e6);
      const id = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24);
      fs.mkdirSync(mediaDir, { recursive: true });
      const name = `${id}${q.get('thumb') ? '-t' : ''}.${ext}`;
      const f = path.join(mediaDir, name);
      if (!fs.existsSync(f)) fs.writeFileSync(f, buf);
      return sendJSON(res, 200, { url: `/media/${name}` });
    }

    if (p === '/api/lock' && req.method === 'GET') return sendJSON(res, 200, { hasPin: lock.hasPin() });
    if (p.startsWith('/api/lock/') && req.method === 'POST') {
      const b = JSON.parse(await readBody(req, 5e6));
      const wait = lock.blocked();
      if (wait) return sendJSON(res, 429, { error: 'espera', wait });
      if (p === '/api/lock/setup') {
        if (lock.hasPin() && !lock.check(b.oldPin)) return sendJSON(res, 403, { error: 'pin' });
        if (!/^\d{4,8}$/.test(String(b.pin || ''))) return sendJSON(res, 400, { error: 'formato' });
        lock.setPin(String(b.pin));
        return sendJSON(res, 200, { ok: true });
      }
      if (!lock.check(b.pin)) return sendJSON(res, 403, { error: 'pin', wait: lock.blocked() });
      if (p === '/api/lock/seal') return sendJSON(res, 200, { box: lock.seal(String(b.pin), String(b.text || '')) });
      if (p === '/api/lock/open') {
        try { return sendJSON(res, 200, { text: lock.open(String(b.pin), b.box) }); }
        catch { return sendJSON(res, 422, { error: 'dañada' }); }
      }
    }

    if (p === '/api/ping') return sendJSON(res, 200, { app: 'mis-notas', data: store.file });
    if (p === '/api/ver') return sendJSON(res, 200, { savedAt: store.read().savedAt || 0 });

    if (p === '/api/spotify/session' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req, 1e4));
      spotifySession = b && typeof b.access_token === 'string' ? { access_token: b.access_token, expires_at: +b.expires_at || 0 } : null;
      return sendJSON(res, 200, { ok: true });
    }
    if (p === '/api/spotify/token') {
      const s = spotifySession && spotifySession.expires_at > Date.now() + 5000 ? spotifySession : null;
      return sendJSON(res, 200, s || { access_token: null });
    }

    if (p === '/api/remote' && req.method === 'GET') return sendJSON(res, 200, remote.status());
    if (p === '/api/remote' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req, 1e4));
      return sendJSON(res, 200, await remote.setEnabled(!!b.enabled));
    }
    if (p === '/api/remote/pair' && req.method === 'POST') return sendJSON(res, 200, await remote.newPairing());
    if (p === '/api/remote/forget' && req.method === 'POST') {
      const b = JSON.parse(await readBody(req, 1e4));
      return sendJSON(res, 200, remote.forget(String(b.id || '')));
    }

    if (p === '/api/data') {
      if (req.method === 'GET') return sendJSON(res, 200, store.read());
      if (req.method === 'PUT') {
        const body = JSON.parse(await readBody(req));
        if (!body || typeof body.data !== 'object') return sendJSON(res, 400, { error: 'datos' });
        const cur = store.read();
        const conflict = !!cur.savedAt && body.base !== cur.savedAt;
        const data = conflict ? merge(cur.data, body.data) : dropDeleted(body.data);
        const savedAt = Math.max(Date.now(), (cur.savedAt || 0) + 1);
        store.write({ savedAt, data });
        return sendJSON(res, 200, conflict ? { savedAt, merged: true, data } : { savedAt });
      }
    }

    if (p === '/api/auth/handoff' && req.method === 'POST') {
      const { state, code } = JSON.parse(await readBody(req, 1e4));
      if (typeof state !== 'string' || typeof code !== 'string' || state.length > 200 || code.length > 2000) return sendJSON(res, 400, { error: 'datos' });
      if (handoffs.size >= 20) handoffs.delete(handoffs.keys().next().value);
      handoffs.set(state, { code, at: Date.now() });
      return sendJSON(res, 200, { ok: true });
    }
    if (p === '/api/auth/poll') {
      for (const [k, v] of handoffs) if (Date.now() - v.at > 10 * 60e3) handoffs.delete(k);
      const h = handoffs.get(q.get('state') || '');
      if (!h) return sendJSON(res, 200, { code: null });
      handoffs.delete(q.get('state'));
      return sendJSON(res, 200, { code: h.code });
    }

    if (p === '/api/video') {
      if (!q.get('name')) return sendJSON(res, 400, { error: 'falta name' });
      try { return sendJSON(res, 200, { results: await searchVideo(q.get('name'), q.get('artist') || '', Number(q.get('dur')) || 0) }); }
      catch (e) { return sendJSON(res, 502, { error: String(e.message || e) }); }
    }
    sendJSON(res, 404, { error: 'no existe' });
  }

  function handler(req, res) {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    if (p.startsWith('/api/')) {
      api(req, res, p, url.searchParams).catch(e => sendJSON(res, 500, { error: String(e.message || e) }));
      return;
    }
    const mm = p.match(MEDIA_NAME);
    if (mm) {
      return fs.readFile(path.join(mediaDir, mm[1]), (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MEDIA_TYPES[mm[2]], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        res.end(data);
      });
    }
    const rel = p === '/' ? '/index.html' : p;
    if (!PUBLIC.test(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    fs.readFile(path.join(ROOT, FILE_OF[rel] || rel), (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
      if (req.notasRemote && rel === '/index.html') data = Buffer.from(String(data).replace('<script src="sync.js">', '<script>window.NOTAS_REMOTE = true;</script>\n  <script src="sync.js">'));
      const headers = {
        'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream',
        'Cache-Control': rel.startsWith('/fonts/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      };
      if (rel.endsWith('.html')) {
        headers['Content-Security-Policy'] = cspFor(rel, String(data));
        if (rel !== '/yt.html') headers['X-Frame-Options'] = 'DENY';
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  }

  return { handler, store, attachRemote: r => (remote = r) };
}

function start({ port = PORT, dataDir, quiet = false } = {}) {
  const url = `http://${HOST}:${port}/`;
  return new Promise((resolve, reject) => {
    const { handler, store, attachRemote } = createServer({ port, dataDir });
    const server = http.createServer(handler);
    server.once('error', async e => {
      if (e.code !== 'EADDRINUSE') return reject(e);
      try {
        const r = await fetch(url + 'api/ping', { signal: AbortSignal.timeout(2000) });
        const j = await r.json();
        if (j.app === 'mis-notas' && path.resolve(j.data || '') === path.resolve(store.file)) return resolve({ url, reused: true, dataFile: store.file });
        if (j.app === 'mis-notas') return reject(new Error('Hay otra copia de Mis Notas abierta con otros datos. Ciérrala (o cierra iniciar.bat) e intenta de nuevo.'));
      } catch {}
      reject(new Error(`El puerto ${port} lo está usando otro programa. Ciérralo e intenta de nuevo.`));
    });
    server.listen(port, HOST, () => {
      attachRemote(createRemote({ dataDir: path.dirname(store.file), handler }));
      const v6 = http.createServer(handler);
      v6.on('error', () => {});
      v6.listen(port, '::1');
      if (!quiet) console.log(`\n  ✨ Mis Notas está lista en ${url}\n     Tus datos: ${store.file}\n     (deja esta ventana abierta mientras la usas)\n`);
      resolve({ url, server, reused: false, dataFile: store.file });
    });
  });
}

module.exports = { start, merge };

if (require.main === module) {
  start().then(({ url, reused }) => {
    if (reused) console.log(`\n  La app ya está corriendo en ${url}\n`);
    if (process.argv.includes('--open')) require('child_process').exec(`start "" "${url}"`);
  }).catch(e => { console.error('\n  ' + e.message + '\n'); process.exit(1); });
}
