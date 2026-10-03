const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme, session, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.NOTAS_DATA || path.join(app.getPath('appData'), 'Mis Notas');
process.env.NOTAS_DATA = DATA_DIR;
app.setPath('userData', path.join(DATA_DIR, 'app'));

app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService');
app.userAgentFallback = app.userAgentFallback.replace(/\s(Electron|mis-notas)\/[\w.-]+/gi, '');
app.setAppUserModelId('com.misnotas.app');

if (!app.requestSingleInstanceLock()) app.exit(0);

const logFile = path.join(DATA_DIR, 'registro.txt');
function log(...msg) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 200e3) fs.renameSync(logFile, logFile + '.viejo');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg.join(' ')}\n`);
  } catch {}
}

const bootFile = path.join(DATA_DIR, 'app', 'arranque.json');
function loadBoot() { try { return JSON.parse(fs.readFileSync(bootFile, 'utf8')); } catch { return {}; } }
function saveBoot(b) { try { fs.mkdirSync(path.dirname(bootFile), { recursive: true }); fs.writeFileSync(bootFile, JSON.stringify(b)); } catch {} }
const boot = loadBoot();
const SAFE_GPU = boot.gpu === false || process.argv.includes('--sin-gpu');
if (SAFE_GPU) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-compositing');
}
log(`Arranque v${app.getVersion()} · Windows ${require('os').release()} · ${SAFE_GPU ? 'modo compatible (sin GPU)' : 'con GPU'}`);

let win = null;
let baseURL = '';
let quitting = false;
const startedAt = Date.now();

let relaunching = false;
async function relaunchWithGpu(on, why) {
  if (relaunching) return;
  relaunching = true;
  log(`Reinicio ${on ? 'con' : 'sin'} GPU: ${why}`);
  saveBoot({ ...loadBoot(), gpu: on });
  saveWindowState();
  if (win && !win.isDestroyed()) {
    const flush = win.webContents.executeJavaScript('window.NotasSync ? NotasSync.flush() : null').catch(() => {});
    await Promise.race([flush, new Promise(r => setTimeout(r, 1500))]);
  }
  app.relaunch({ args: process.argv.slice(1).filter(a => a !== '--sin-gpu') });
  app.exit(0);
}

let gpuCrashes = 0, shuttingDown = false, lastPageGone = 0;
app.on('before-quit', () => { shuttingDown = true; });
app.on('child-process-gone', (_e, d) => {
  if (d.type !== 'GPU' || shuttingDown) return;
  log(`Falló el proceso gráfico (${d.reason}, código ${d.exitCode})`);
  gpuCrashes++;
  setTimeout(() => {
    if (shuttingDown || relaunching || Date.now() - lastPageGone < 3000) return log('(se estaba cerrando la app: no es una falla del video)');
    if (!SAFE_GPU && (Date.now() - startedAt < 60e3 || gpuCrashes >= 2)) relaunchWithGpu(false, 'falló la tarjeta gráfica');
  }, 1500);
});

const stateFile = path.join(DATA_DIR, 'ventana.json');
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return { width: 1180, height: 820 }; }
}
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile, JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {}
}

function looksBlank(img) {
  if (!img || img.isEmpty()) return true;
  const { width, height } = img.getSize();
  if (width < 20 || height < 20) return true;
  const bmp = img.resize({ width: 120, quality: 'good' }).toBitmap();
  let min = 255, max = 0;
  for (let i = 0; i < bmp.length; i += 4) {
    const l = (bmp[i] + bmp[i + 1] + bmp[i + 2]) / 3;
    if (l < min) min = l;
    if (l > max) max = l;
  }
  return max - min < 12;
}

function iconPath() {
  const p = path.join(__dirname, '..', 'build', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

async function createWindow() {
  const { start } = require('../server');
  let started, error;
  try {
    started = await start({ dataDir: DATA_DIR, quiet: true });
  } catch (e) {
    error = e;
    if (e.code === 'EACCES') {
      log('Windows tiene reservado el puerto 5173:', e.message);
      error = new Error('Windows no deja usar el puerto 5173. Reinicia la PC e intenta de nuevo.');
      for (const port of [5273, 5373, 5473]) {
        try { started = await start({ port, dataDir: DATA_DIR, quiet: true }); break; } catch (e2) { log(`Puerto ${port}:`, e2.message); }
      }
    }
  }
  if (!started) {
    log('No se pudo iniciar:', error?.message);
    dialog.showErrorBox('Mis Notas', error?.message || 'No se pudo iniciar.');
    app.quit();
    return;
  }
  baseURL = started.url;

  const st = loadWindowState();
  if (st.x != null && !screen.getAllDisplays().some(d => {
    const a = d.workArea;
    return st.x + 100 > a.x && st.x < a.x + a.width - 100 && st.y >= a.y - 10 && st.y < a.y + a.height - 60;
  })) { delete st.x; delete st.y; }
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1180, height: st.height || 820,
    minWidth: 380, minHeight: 560,
    show: false,
    title: 'Mis Notas',
    icon: iconPath(),
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E0D12' : '#F4F1F8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) { log('ready-to-show no llegó'); win.show(); } }, 8000);

  const sendState = () => win && !win.isDestroyed() && win.webContents.send('win:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
  ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'enter-html-full-screen', 'leave-html-full-screen', 'restore']
    .forEach(ev => win.on(ev, () => setTimeout(sendState, 50)));
  win.webContents.on('did-finish-load', sendState);

  const wc = win.webContents;
  wc.on('console-message', e => { if (e.level === 'error') log(`Página: ${e.message} (${e.sourceId}:${e.lineNumber})`); });
  wc.on('preload-error', (_e, p, err) => log('Preload:', p, err?.message));
  let loadTries = 0;
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    log(`No cargó ${url}: ${desc} (${code})`);
    if (++loadTries <= 5) setTimeout(() => win && !win.isDestroyed() && win.loadURL(baseURL), 800 * loadTries);
    else dialog.showErrorBox('Mis Notas', `No se pudo abrir la app (${desc}). Si tienes un antivirus, revisa que no bloquee "Mis Notas".`);
  });
  let crashes = 0;
  wc.on('render-process-gone', (_e, d) => {
    log(`La página se cerró (${d.reason}, código ${d.exitCode})`);
    lastPageGone = Date.now();
    if (d.reason === 'clean-exit' || quitting || shuttingDown) return;
    setTimeout(() => {
      if (shuttingDown || relaunching || !win || win.isDestroyed()) return;
      if (++crashes >= 2 && !SAFE_GPU) return relaunchWithGpu(false, 'la página se cerró dos veces');
      if (crashes <= 3) win.loadURL(baseURL);
    }, 1500);
  });
  wc.on('unresponsive', () => log('La página no responde'));

  wc.once('did-finish-load', () => setTimeout(async () => {
    if (!win || win.isDestroyed() || SAFE_GPU) return;
    try {
      const booted = await wc.executeJavaScript("document.body.classList.contains('desktop') && !!document.querySelector('#chips')");
      if (!booted) { log('La app no terminó de arrancar (revisa los errores de "Página" arriba)'); return; }
      if (!win.isVisible() || win.isMinimized()) return;
      const img = await wc.capturePage();
      if (looksBlank(img)) relaunchWithGpu(false, 'la ventana se veía vacía');
    } catch (e) { log('Revisión de arranque:', e.message); }
  }, 4000));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(baseURL)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });

  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable && !p.selectionText) return;
    const items = [];
    for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    if (p.misspelledWord) {
      if (!items.length) items.push({ label: 'Sin sugerencias', enabled: false });
      items.push({ label: 'Agregar al diccionario', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      items.push({ type: 'separator' });
    }
    if (p.isEditable) items.push({ label: 'Cortar', role: 'cut', enabled: p.editFlags.canCut });
    items.push({ label: 'Copiar', role: 'copy', enabled: p.editFlags.canCopy });
    if (p.isEditable) {
      items.push({ label: 'Pegar', role: 'paste', enabled: p.editFlags.canPaste });
      items.push({ type: 'separator' }, { label: 'Seleccionar todo', role: 'selectAll' });
    }
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.control && input.shift && input.key.toLowerCase() === 'i' && !app.isPackaged) win.webContents.toggleDevTools();
    if (input.control && input.shift && input.key.toLowerCase() === 'g') { e.preventDefault(); relaunchWithGpu(SAFE_GPU, 'atajo Ctrl+Shift+G'); }
    if (input.control && ['=', '+', '-', '0'].includes(input.key)) {
      const z = win.webContents.getZoomFactor();
      win.webContents.setZoomFactor(input.key === '0' ? 1 : Math.min(2, Math.max(.6, z + (input.key === '-' ? -.1 : .1))));
      e.preventDefault();
    }
  });

  win.on('close', e => {
    saveWindowState();
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    const flush = win.webContents.executeJavaScript('window.NotasSync ? NotasSync.flush() : null').catch(() => {});
    Promise.race([flush, new Promise(r => setTimeout(r, 1500))]).finally(() => win.destroy());
  });
  win.on('closed', () => { win = null; });

  win.loadURL(baseURL);
}

ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:toggle-max', () => { if (!win) return; if (win.isFullScreen()) win.setFullScreen(false); else if (win.isMaximized()) win.unmaximize(); else win.maximize(); });
ipcMain.on('win:close', () => win?.close());

ipcMain.on('focus-window', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const ses = session.defaultSession;
  const allowed = ['fullscreen', 'clipboard-sanitized-write'];
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.includes(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => allowed.includes(perm));
  app.on('web-contents-created', (_e, wc) => wc.on('will-attach-webview', e => e.preventDefault()));
  const langs = ['es-419', 'es-ES', 'es'].filter(l => ses.availableSpellCheckerLanguages.includes(l));
  if (langs.length) ses.setSpellCheckerLanguages(langs.slice(0, 1).concat(ses.availableSpellCheckerLanguages.includes('en-US') ? ['en-US'] : []));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
