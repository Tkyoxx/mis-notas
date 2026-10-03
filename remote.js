const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REMOTE_PORT = Number(process.env.NOTAS_REMOTE_PORT) || 5174;
const BIND = '0.0.0.0';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const token = (n = 24) => crypto.randomBytes(n).toString('base64url');

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const virtual = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Parsec|ZeroTier|Tailscale|Hamachi|Bluetooth|TAP|VPN|Radmin/i.test(name);
      const home = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      const score = (home ? 2 : 0) + (virtual ? -5 : 0) + (/wi-?fi|wlan|inal[aá]mbrica/i.test(name) ? 1 : 0) + (/ethernet/i.test(name) ? 1 : 0);
      out.push({ name, address: a.address, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function deviceName(ua = '') {
  const os_ = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Dispositivo';
  const model = (ua.match(/Android [\d.]+; ([^;)]+)/) || [])[1];
  const br = /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Edg\//.test(ua) ? 'Edge' : /Firefox/i.test(ua) ? 'Firefox' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : '';
  return [model && model !== 'K' ? model.trim() : os_, br].filter(Boolean).join(' · ');
}

const cookieOf = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
};

const NOT_PAIRED = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mis Notas</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(160deg,#ffe2eb,#ece5ff);color:#231f2b;text-align:center;padding:24px;box-sizing:border-box}
.c{max-width:340px}.e{font-size:64px}h1{font-size:24px;margin:12px 0 8px}p{color:#6f6a7a;line-height:1.5;margin:0}
</style></head><body><div class="c"><div class="e">📱✨</div><h1>Conecta tu celular</h1>
<p>En la app <b>Mis Notas</b> de tu PC ve a <b>Ajustes → Celular → Conectar un celular</b> y escanea el código QR con la cámara.</p></div></body></html>`;

function createRemote({ dataDir, handler }) {
  const file = path.join(dataDir, 'celular.json');
  let cfg = { enabled: false, devices: [] };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}
  const save = () => { try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(cfg, null, 2)); } catch {} };
  let saveT = 0;
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 30e3); };

  const pairCodes = new Map();
  let server = null;

  function authed(req) {
    const t = cookieOf(req, 'notas_dev');
    if (!t) return null;
    const d = cfg.devices.find(x => x.hash === sha(t));
    if (d && Date.now() - (d.lastSeen || 0) > 60e3) { d.lastSeen = Date.now(); saveSoon(); }
    return d || null;
  }

  const hostOk = req => new RegExp(`^(\\d{1,3}\\.){3}\\d{1,3}:${REMOTE_PORT}$`).test(req.headers.host || '');

  function lanHandler(req, res) {
    if (!hostOk(req)) { res.writeHead(403); return res.end(); }
    const url = new URL(req.url, 'http://x');

    if (url.pathname === '/pair') {
      const c = url.searchParams.get('c') || '';
      const exp = pairCodes.get(c);
      if (!exp || exp < Date.now()) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(NOT_PAIRED.replace('Conecta tu celular', 'Ese código ya venció').replace('y escanea', 'y escanea el nuevo'));
      }
      pairCodes.delete(c);
      const t = token(32);
      cfg.devices.push({ id: token(6), name: deviceName(req.headers['user-agent']), hash: sha(t), created: Date.now(), lastSeen: Date.now() });
      save();
      res.writeHead(302, {
        'Set-Cookie': `notas_dev=${t}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
        Location: '/?conectado=1',
      });
      return res.end();
    }

    const dev = authed(req);
    if (!dev) {
      if (url.pathname.startsWith('/api/')) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"sin emparejar"}'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(NOT_PAIRED);
    }
    req.notasRemote = dev;
    handler(req, res);
  }

  function startLan() {
    if (server) return Promise.resolve();
    return new Promise(resolve => {
      server = http.createServer(lanHandler);
      server.on('error', e => { console.error('  (celular) ' + e.message); server = null; resolve(); });
      server.listen(REMOTE_PORT, BIND, () => resolve());
    });
  }
  function stopLan() {
    if (!server) return;
    server.close();
    server.closeAllConnections?.();
    server = null;
  }

  function status() {
    const addrs = lanAddresses();
    return {
      enabled: cfg.enabled,
      running: !!server,
      port: REMOTE_PORT,
      addresses: addrs.map(a => ({ name: a.name, url: `http://${a.address}:${REMOTE_PORT}/` })),
      devices: cfg.devices.map(({ id, name, created, lastSeen }) => ({ id, name, created, lastSeen })),
    };
  }

  async function setEnabled(on) {
    cfg.enabled = !!on;
    save();
    if (on) await startLan(); else stopLan();
    return status();
  }

  async function newPairing() {
    for (const [c, exp] of pairCodes) if (exp < Date.now()) pairCodes.delete(c);
    const c = token(12);
    const expiresAt = Date.now() + 5 * 60e3;
    pairCodes.set(c, expiresAt);
    const addrs = lanAddresses();
    const urls = addrs.map(a => `http://${a.address}:${REMOTE_PORT}/pair?c=${c}`);
    let qr = '';
    if (urls[0]) {
      qr = await require('qrcode').toString(urls[0], { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#231f2b', light: '#ffffff' } });
    }
    return { url: urls[0] || null, urls, qr, expiresAt };
  }

  function forget(id) {
    cfg.devices = cfg.devices.filter(d => d.id !== id);
    save();
    return status();
  }

  if (cfg.enabled) startLan();
  return { status, setEnabled, newPairing, forget, stop: stopLan, save };
}

module.exports = { createRemote, lanAddresses, REMOTE_PORT };
