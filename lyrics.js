window.LyricsView = (() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const ic = (n, c) => window.icon(n, c);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const MODES = { cascada: 'Cascada', enfoque: 'Enfoque', linea: 'Una línea' };
const SCENES = {
  aura: ['Aura del álbum', '🌌'], portada: ['Portada', '💿'], estrellas: ['Noche estrellada', '✨'],
  lluvia: ['Lluvia', '🌧️'], petalos: ['Pétalos', '🌸'], nieve: ['Nieve', '❄️'], video: ['Video musical', '🎬'],
};
const COLORS = { album: 'Del álbum', accent: 'Mi color', blanco: 'Blanco' };

const cfg = Object.assign(
  { mode: 'cascada', scene: 'aura', font: 'elegante', size: 1, speed: 14, dim: .3, colors: 'album', offset: 0 },
  load('notas.lyrics', {}));
const videos = load('notas.videos', {});
if (!load('notas.videosDesfase0', false)) {
  for (const v of Object.values(videos)) { v.offset = 0; (v.alts || []).forEach(a => (a.offset = 0)); }
  save('notas.videos', videos); save('notas.videosDesfase0', true);
}
const saveCfg = () => save('notas.lyrics', cfg);

let H = null;
let root = null, stage = null, msg = null, isOpen = false, raf = 0, last = 0;
let track = null, trackId, lyr = { lines: [], synced: false, status: 'idle' };
let active = -2, curEl = null, wasPlaying = null, lastPos = 0, czLane = 0, idleT = 0;
let pal = { c: ['#ff6f9c', '#9b7bff', '#4fa3ff'], bg: '#140f22', bg2: '#2b1a45' };

const cache = new Map();
async function fetchLyrics(t) {
  if (cache.has(t.id)) return cache.get(t.id);
  const artist = t.artists?.[0]?.name || t.show?.name || '';
  let j = null;
  try {
    const r = await fetch('https://lrclib.net/api/get?' + new URLSearchParams({
      track_name: t.name, artist_name: artist, album_name: t.album?.name || '', duration: Math.round(t.duration_ms / 1000),
    }));
    if (r.ok) j = await r.json();
  } catch {}
  if (!j || (!j.syncedLyrics && !j.plainLyrics && !j.instrumental)) {
    try {
      const clean = t.name.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').trim();
      const r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ track_name: clean, artist_name: artist }));
      if (r.ok) {
        const arr = await r.json();
        const near = x => Math.abs((x.duration || 0) * 1000 - t.duration_ms) < 8000;
        j = arr.find(x => x.syncedLyrics && near(x)) || arr.find(x => x.syncedLyrics) || arr.find(x => x.plainLyrics) || null;
      }
    } catch {}
  }
  const res = parse(j, t.duration_ms);
  cache.set(t.id, res);
  return res;
}

function parse(j, dur) {
  if (!j) return { lines: [], synced: false };
  if (j.instrumental) return { lines: [], synced: false, instrumental: true };
  let lines = [];
  if (j.syncedLyrics) {
    for (const raw of j.syncedLyrics.split('\n')) {
      const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
      if (!tags.length) continue;
      const body = raw.replace(/\[[^\]]*\]/g, '');
      const words = wordTimes(body);
      const text = words ? words.map(w => w.text).join(' ') : body.trim() || '♪';
      tags.forEach(m => lines.push({ t: (+m[1] * 60 + parseFloat(m[2].replace(':', '.'))) * 1000, text, words }));
    }
    lines.sort((a, b) => a.t - b.t);
    lines = lines.filter((l, i) => !(l.text === '♪' && (i === 0 || lines[i - 1].text === '♪')));
    return { lines, synced: true };
  }
  lines = (j.plainLyrics || '').split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ t: 0, text }));
  lines.forEach((l, i) => (l.t = dur * .06 + (dur * .86 * i) / lines.length));
  return { lines, synced: false };
}

function wordTimes(body) {
  if (!/<\d+:\d+(?:\.\d+)?>/.test(body)) return null;
  const out = [];
  const re = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g;
  let m;
  while ((m = re.exec(body))) {
    const text = m[3].trim();
    if (text) out.push({ t: (+m[1] * 60 + parseFloat(m[2])) * 1000, text });
  }
  return out.length ? out : null;
}

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
const hsl = (h, s, l) => `hsl(${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

function getPalette(url) {
  return new Promise(res => {
    if (!url) return res(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 28;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 28, 28);
        const d = x.getImageData(0, 0, 28, 28).data;
        const bins = Array.from({ length: 12 }, () => ({ h: 0, s: 0, l: 0, w: 0 }));
        let sh = 0, ss = 0, sl = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
          sh += h; ss += s; sl += l; n++;
          const w = s * s * Math.max(0, 1 - Math.abs(l - .5) * 1.7);
          if (w < .015) continue;
          const b = bins[Math.floor(h * 12) % 12];
          b.h += h * w; b.s += s * w; b.l += l * w; b.w += w;
        }
        const top = bins.filter(b => b.w > 0).sort((a, b) => b.w - a.w).slice(0, 3).map(b => [b.h / b.w, b.s / b.w, b.l / b.w]);
        const avg = [sh / n, ss / n, sl / n];
        const base = top[0] || [avg[0], Math.max(avg[1], .35), .55];
        while (top.length < 3) top.push([(base[0] + (top.length === 1 ? .97 : .035)) % 1, base[1] * .85, top.length === 1 ? base[2] * .75 : Math.min(.7, base[2] * 1.2)]);
        res({
          c: top.map(([h, s, l]) => hsl(h, Math.max(s, .55), clamp(l, .52, .68))),
          bg: hsl(base[0], Math.min(base[1], .55), .08),
          bg2: hsl(top[1][0], Math.min(top[1][1], .6), .2),
        });
      } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

function blurArt(url, id) {
  const art = $('.ly-art', root), s = root.style;
  art.classList.remove('raw');
  if (!url) { s.removeProperty('--art-a'); s.removeProperty('--art-p'); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (trackId !== id) return;
    const make = (size, filter) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d');
      x.filter = filter;
      x.drawImage(img, -size * .1, -size * .1, size * 1.2, size * 1.2);
      return `url("${c.toDataURL('image/jpeg', .85)}")`;
    };
    try {
      s.setProperty('--art-a', make(64, 'blur(3px) saturate(1.6)'));
      s.setProperty('--art-p', make(120, 'blur(3px) saturate(1.35) brightness(.85)'));
    } catch {
      s.setProperty('--art-a', `url("${url}")`); s.setProperty('--art-p', `url("${url}")`);
      art.classList.add('raw');
    }
  };
  img.onerror = () => { s.removeProperty('--art-a'); s.removeProperty('--art-p'); };
  img.src = url;
}

function build() {
  root = document.createElement('section');
  root.className = 'ly';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="ly-bg">
      <div class="ly-art"></div>
      <div class="ly-blobs"><i></i><i></i><i></i><i></i></div>
      <div class="ly-video"></div>
      <canvas class="ly-canvas"></canvas>
      <div class="ly-shade"></div>
    </div>
    <div class="ly-stage"></div>
    <div class="ly-msg"></div>
    <header class="ly-top">
      <button class="ly-ib" data-a="close" title="Cerrar (Esc)">${ic('down')}</button>
      <div class="ly-src"></div>
      <div class="ly-top-r">
        <button class="ly-ib" data-a="find" title="Buscar música (/)">${ic('search')}</button>
        <button class="ly-ib" data-a="full" title="Pantalla completa (F)">${ic('maximize')}</button>
        <button class="ly-ib" data-a="cfg" title="Personalizar">${ic('sliders')}</button>
      </div>
    </header>
    <footer class="ly-bar">
      <div class="ly-prog"><div class="ly-fill"></div></div>
      <div class="ly-bar-row">
        <img class="ly-cover" alt="">
        <div class="ly-meta"><div class="ly-t"></div><div class="ly-a"></div></div>
        <div class="ly-ctrls">
          <button class="ly-ib ghost" data-a="img" title="Crear imagen de esta frase">${ic('share')}</button>
          <button class="ly-ib ghost" data-a="quote" title="Guardar esta frase en tus notas">${ic('bookmark')}</button>
          <button class="ly-ib ghost" data-a="prev" title="Anterior">${ic('prev')}</button>
          <button class="ly-ib big" data-a="toggle" title="Reproducir / pausar">${ic('play', 'i-play')}${ic('pause', 'i-pause')}</button>
          <button class="ly-ib ghost" data-a="next" title="Siguiente">${ic('next')}</button>
          <div class="ly-vol">
            <button class="ly-ib ghost" data-a="mute" title="Volumen (+ / −)">${ic('vol')}</button>
            <input class="range" type="range" min="0" max="100" value="50" aria-label="Volumen">
          </div>
        </div>
      </div>
    </footer>
    <aside class="ly-panel"></aside>
    <aside class="ly-find">
      <div class="lf-head"><h3>Poner música 🎧</h3><button class="ly-ib sm" data-f="x" title="Cerrar">${ic('x')}</button></div>
      <label class="lf-search">${ic('search')}<input type="search" placeholder="Canciones, artistas, playlists…" autocomplete="off" spellcheck="false"></label>
      <div class="lf-body"></div>
    </aside>`;
  document.body.appendChild(root);
  stage = $('.ly-stage', root);
  msg = $('.ly-msg', root);
  cv = $('.ly-canvas', root);
  ctx = cv.getContext('2d');

  root.addEventListener('click', onClick);
  stage.addEventListener('click', e => {
    const l = e.target.closest('.fz-line');
    if (l && lyr.lines[+l.dataset.i]) H.seek(Math.max(0, lyr.lines[+l.dataset.i].t - cfg.offset * 1000 + 30));
  });
  $('.ly-vol .range', root).addEventListener('input', e => setVolume(+e.target.value, true));
  $('.lf-search input', root).addEventListener('input', e => {
    clearTimeout(findT);
    const q = e.target.value.trim();
    findT = setTimeout(() => (q ? findSearch(q) : findHome()), 320);
  });
  $('.ly-find', root).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f === 'x') return toggleFind(false);
    const name = (b.querySelector('b') || b.querySelector('span:last-child'))?.textContent || '';
    if (b.dataset.uri) H.play(b.dataset.ctx ? { context_uri: b.dataset.ctx, offset: { uri: b.dataset.uri } } : { uris: [b.dataset.uri] });
    else if (b.dataset.ctxplay) H.play({ context_uri: b.dataset.ctxplay });
    else return;
    H.toast('▶ ' + name);
    H.burst(e.clientX, e.clientY, ['🎵', '🎶', '✨'], 8);
    setTimeout(() => toggleFind(false), 350);
  });
  root.addEventListener('pointerdown', e => { if (!e.target.closest('.ly-vol')) $('.ly-vol', root)?.classList.remove('open'); });
  $('.ly-prog', root).addEventListener('click', e => {
    if (!track) return;
    const r = e.currentTarget.getBoundingClientRect();
    H.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * track.duration_ms);
  });
  const panel = $('.ly-panel', root);
  panel.addEventListener('click', onPanelClick);
  panel.addEventListener('input', onPanelInput);
  ['pointermove', 'pointerdown', 'wheel'].forEach(ev => root.addEventListener(ev, wake, { passive: true }));
  addEventListener('resize', () => isOpen && resize());
  addEventListener('message', onYouTubeMessage);
  document.addEventListener('fullscreenchange', () => {
    const b = $('[data-a="full"]', root);
    if (b) b.innerHTML = ic(document.fullscreenElement ? 'minimize' : 'maximize');
  });
  document.addEventListener('keydown', onKey, true);
  applyVars();
}

function onClick(e) {
  const b = e.target.closest('[data-a]');
  if (!b || b.closest('.ly-panel')) return;
  const a = b.dataset.a;
  if (a === 'close') close();
  else if (a === 'full') toggleFull();
  else if (a === 'cfg') togglePanel();
  else if (a === 'find') toggleFind();
  else if (a === 'toggle') H.toggle();
  else if (a === 'next') H.next();
  else if (a === 'mute') {
    const vol = $('.ly-vol', root);
    if (matchMedia('(max-width: 640px)').matches && !vol.classList.contains('open')) { vol.classList.add('open'); return; }
    const cur = H.getVolume() ?? 50;
    if (cur > 0) { lastVol = cur; setVolume(0); } else setVolume(lastVol || 50);
  }
  else if (a === 'prev') H.prev();
  else if (a === 'img') {
    const l = lyr.lines[active];
    if (!track || !l || l.text === '♪') { H.toast('Espera a que suene una frase ✨'); return; }
    close();
    setTimeout(() => H.shareLine(l.text, track, H.art(track, 'md')), 450);
  }
  else if (a === 'quote') {
    const l = lyr.lines[active];
    if (!track || !l || l.text === '♪') { H.toast('Espera a que suene una frase ✨'); return; }
    H.saveQuote(l.text, track);
    const r = b.getBoundingClientRect();
    H.burst(r.left + r.width / 2, r.top + r.height / 2, ['💌', '✨', '💖'], 12);
  }
  if (b.classList.contains('ly-ib')) b.animate?.([{ transform: 'scale(.82)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
}

function onKey(e) {
  if (!isOpen) return;
  if (e.target.closest?.('input')) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key.toLowerCase();
  const handled = { escape: 1, ' ': 1, f: 1, arrowright: 1, arrowleft: 1, arrowup: 1, arrowdown: 1, '+': 1, '-': 1, '=': 1, '/': 1 };
  if (!handled[k]) return;
  e.preventDefault(); e.stopImmediatePropagation();
  wake();
  if (k === '/') toggleFind(true);
  else if (k === 'escape') root.classList.contains('find') ? toggleFind(false) : root.classList.contains('cfg') ? togglePanel(false) : close();
  else if (k === ' ') H.toggle();
  else if (k === 'f') toggleFull();
  else if (k === 'arrowright') H.next();
  else if (k === 'arrowleft') H.prev();
  else if (k === '+' || k === '=' || k === '-') { const v = clamp((H.getVolume() ?? 50) + (k === '-' ? -5 : 5), 0, 100); setVolume(v); H.toast(`Volumen ${v}%`); }
  else { cfg.offset = +clamp(cfg.offset + (k === 'arrowup' ? .1 : -.1), -3, 3).toFixed(1); saveCfg(); H.toast(`Sincronía ${cfg.offset > 0 ? '+' : ''}${cfg.offset.toFixed(1)} s`); if (root.classList.contains('cfg')) renderPanel(); }
}

let lastVol = 50, volT = 0, volDrag = 0;
function setVolume(v, fromSlider = false) {
  v = Math.round(clamp(v, 0, 100));
  volDrag = performance.now() + 2500;
  paintVolume(v);
  clearTimeout(volT);
  volT = setTimeout(() => H.setVolume(v), fromSlider ? 180 : 0);
}
function paintVolume(v) {
  const r = $('.ly-vol .range', root);
  if (!r) return;
  r.value = v;
  r.style.setProperty('--v', v + '%');
  const b = $('[data-a="mute"]', root);
  const name = v == 0 ? 'volOff' : v < 45 ? 'volLow' : 'vol';
  if (b.dataset.ic !== name) { b.dataset.ic = name; b.innerHTML = ic(name); }
}

let findSeq = 0, findT = 0, myPlaylists = null;
function toggleFind(force) {
  const on = force ?? !root.classList.contains('find');
  if (on) togglePanel(false);
  root.classList.toggle('find', on);
  wake();
  if (!on) return;
  const inp = $('.lf-search input', root);
  setTimeout(() => inp.focus(), 250);
  if (!inp.value.trim()) findHome();
}
const rowHTML = (t, i) => `
  <button class="lf-row" data-uri="${esc(t.uri)}" data-ctx="${esc(t.album?.uri || '')}" style="--i:${i}">
    <img src="${esc(H.art(t, 'sm'))}" alt="" loading="lazy">
    <span class="lf-t"><b>${esc(t.name)}</b><small>${esc(H.artist(t))}</small></span>
    <span class="lf-go">${ic('play')}</span>
  </button>`;
const plHTML = (p, i) => `
  <button class="lf-pl" data-ctxplay="${esc(p.uri)}" style="--i:${i}">
    ${p.images?.[0]?.url ? `<img src="${esc(p.images[0].url)}" alt="" loading="lazy">` : '<span class="ph">🎵</span>'}
    <span>${esc(p.name)}</span>
  </button>`;
async function findHome() {
  const body = $('.lf-body', root), my = ++findSeq;
  body.innerHTML = '<p class="lf-sec">Tus playlists</p><div class="lf-pls">' + '<span class="lf-sk"></span>'.repeat(6) + '</div>';
  try {
    myPlaylists ||= (await H.playlists())?.items?.filter(Boolean) || [];
    if (my !== findSeq) return;
    body.innerHTML = myPlaylists.length
      ? `<p class="lf-sec">Tus playlists</p><div class="lf-pls">${myPlaylists.slice(0, 24).map(plHTML).join('')}</div>`
      : '<p class="lf-empty">Escribe arriba para buscar una canción ✨</p>';
  } catch { if (my === findSeq) body.innerHTML = '<p class="lf-empty">Conecta Spotify para buscar música 🎧</p>'; }
}
async function findSearch(q) {
  const body = $('.lf-body', root), my = ++findSeq;
  body.innerHTML = '<span class="lf-sk row"></span>'.repeat(5);
  try {
    const r = await H.search(q);
    if (my !== findSeq) return;
    const tracks = r?.tracks?.items?.filter(Boolean) || [], pls = r?.playlists?.items?.filter(Boolean) || [];
    body.innerHTML = (tracks.length ? `<p class="lf-sec">Canciones</p>${tracks.map(rowHTML).join('')}` : '')
      + (pls.length ? `<p class="lf-sec">Playlists</p><div class="lf-pls">${pls.slice(0, 6).map(plHTML).join('')}</div>` : '')
      || `<p class="lf-empty">No encontré nada para “${esc(q)}” 🎧</p>`;
  } catch { if (my === findSeq) body.innerHTML = '<p class="lf-empty">No se pudo buscar 😕</p>'; }
}

function wake() {
  root.classList.remove('idle');
  clearTimeout(idleT);
  idleT = setTimeout(() => { if (!root.classList.contains('cfg') && !root.classList.contains('find')) root.classList.add('idle'); }, 3500);
}

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else root.requestFullscreen?.().catch(() => H.toast('Tu navegador no dejó usar pantalla completa'));
}

function togglePanel(force) {
  const on = force ?? !root.classList.contains('cfg');
  if (on) renderPanel();
  root.classList.toggle('cfg', on);
  wake();
}

function open() {
  if (!H) return;
  if (!root) build();
  isOpen = true;
  trackId = undefined;
  wasPlaying = null;
  root.classList.remove('gone');
  void root.offsetWidth;
  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('ly-open');
  resize();
  last = performance.now();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
  wake();
}

function close() {
  if (!isOpen) return;
  isOpen = false;
  root.classList.remove('open', 'cfg');
  root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('ly-open');
  if (document.fullscreenElement) document.exitFullscreen?.();
  setTimeout(() => {
    if (isOpen) return;
    cancelAnimationFrame(raf);
    clearVideo();
    stage.innerHTML = '';
    active = -2; curEl = null;
    root.classList.add('gone');
  }, 900);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (now - last < ({ fluid: 15, eco: 30, lite: 50 }[H.motion?.()] || 15)) return;
  const dt = Math.min(100, now - last);
  last = now;
  drawParticles(dt, now);
  ambient(now / 1000);

  const t = H.track(), id = t?.id || null;
  if (id !== trackId) { trackId = id; t ? loadTrack(t) : showIdle(); }
  track = t;

  const playing = !!(t && H.playing());
  if (playing !== wasPlaying) {
    wasPlaying = playing;
    root.classList.toggle('playing', playing);
    if (videoOn()) ytCmd(playing ? 'playVideo' : 'pauseVideo');
  }
  if (!t) return;

  stepCascade(playing ? dt : 0);
  const raw = H.pos();
  if (now > volDrag) { const v = H.getVolume(); if (v != null && +$('.ly-vol .range', root).value !== v) paintVolume(v); }
  $('.ly-fill', root).style.transform = `scaleX(${Math.min(1, raw / t.duration_ms)})`;
  syncVideo(raw, now);
  if (lyr.status !== 'ok') return;

  const pos = raw + cfg.offset * 1000;
  const idx = findIdx(pos);
  if (idx !== active) {
    const jump = active === -2 || idx < active || idx > active + 2 || Math.abs(pos - lastPos) > 2500;
    setActive(idx, jump, pos);
  }
  lastPos = pos;
  if (curEl) lightWords(curEl, pos);
}

function findIdx(pos) {
  const L = lyr.lines;
  let i = clamp(active, -1, L.length - 1);
  if (i >= 0 && L[i].t > pos) i = -1;
  while (i + 1 < L.length && L[i + 1].t <= pos) i++;
  return i;
}

async function loadTrack(t) {
  track = t;
  active = -2; curEl = null; czLane = 0;
  lyr = { lines: [], synced: false, status: 'loading' };
  stage.innerHTML = '';
  $('.ly-cover', root).src = H.art(t, 'md') || '';
  $('.ly-t', root).textContent = t.name;
  $('.ly-a', root).textContent = H.artist(t);
  blurArt(H.art(t, 'md'), t.id);
  $('.ly-src', root).textContent = '';
  showMsg('loading');
  setupScene();
  if (root.classList.contains('cfg')) renderPanel();

  getPalette(H.art(t, 'sm')).then(p => {
    if (trackId !== t.id) return;
    if (p) pal = p;
    applyVars();
    recolorParticles();
  });

  const r = await fetchLyrics(t);
  if (trackId !== t.id) return;
  lyr = { ...r, status: r.lines.length ? 'ok' : r.instrumental ? 'inst' : 'none' };
  $('.ly-src', root).textContent = lyr.status === 'ok' ? (lyr.synced ? '● Letra sincronizada' : '○ Letra aproximada') : '';
  showMsg(lyr.status === 'ok' ? '' : lyr.status);
  renderStage();
}

function showIdle() {
  track = null;
  lyr = { lines: [], synced: false, status: 'idle' };
  stage.innerHTML = '';
  curEl = null; active = -2;
  $('.ly-t', root).textContent = 'Nada sonando';
  $('.ly-a', root).textContent = 'Abre Spotify y pon una canción';
  $('.ly-cover', root).removeAttribute('src');
  blurArt('', null);
  $('.ly-src', root).textContent = '';
  showMsg('idle');
  setupScene();
}

function showMsg(kind) {
  if (msg.dataset.k === kind) return;
  msg.dataset.k = kind;
  const t = track;
  const art = t && H.art(t, 'md');
  const img = art ? `<img src="${esc(art)}" alt="">` : '';
  const title = t ? `<h2>${esc(t.name)}</h2>` : '';
  const dots = '<div class="ly-dots"><i></i><i></i><i></i></div>';
  const body = {
    idle: `<div class="big-e">🎧</div><h2>Pon algo en Spotify</h2><p>La letra aparecerá aquí, cayendo como cascada ✨</p>`,
    loading: `${img}${title}<p>Buscando la letra…</p>${dots}`,
    intro: `${img}${title}<p>${esc(t ? H.artist(t) : '')}</p>${dots}`,
    none: `${img}${title}<p>No encontré la letra de esta canción 🥲<br>Disfruta la vibra ✨</p>`,
    inst: `${img}${title}<p>🎶 Instrumental, solo siente la música</p>`,
  }[kind];
  msg.innerHTML = body ? `<div class="ly-card">${body}</div>` : '';
}

function wordsHTML(text, chars, words) {
  let wi = 0, ci = 0;
  return (words ? words.flatMap((w, i) => (i ? [' ', w.text] : [w.text])) : text.split(/(\s+)/)).map(p => {
    if (!p) return '';
    if (/^\s+$/.test(p)) return ' ';
    const inner = chars ? [...p].map(ch => `<span class="ch" style="--i:${ci++}">${esc(ch)}</span>`).join('') : esc(p);
    return `<span class="w" style="--i:${wi++}">${inner}</span>`;
  }).join('');
}

function lineDur(i) {
  const l = lyr.lines[i], n = lyr.lines[i + 1];
  const gap = (n ? n.t : (track?.duration_ms || l.t + 5000)) - l.t;
  return Math.max(400, Math.min(gap * .92, 500 + l.text.length * 85));
}
function prepWords(el, i) {
  const ws = $$('.w', el);
  const total = ws.reduce((s, w) => s + w.textContent.length, 0) || 1;
  let acc = 0;
  el._line = i;
  el._dur = lineDur(i);
  const timed = lyr.lines[i]?.words?.length === ws.length ? lyr.lines[i].words : null;
  el._ws = ws.map((w, k) => { const f = acc / total; acc += w.textContent.length; return { w, f, time: timed ? timed[k].t : null }; });
}
function lightWords(el, pos) {
  const l = lyr.lines[el._line];
  if (!l || !el._ws) return;
  const p = (pos - l.t) / el._dur;
  for (const o of el._ws) {
    const on = o.time != null ? pos >= o.time - 40 : o.f <= p;
    if (on !== o.w.classList.contains('on')) o.w.classList.toggle('on', on);
  }
}
const allOn = el => el?._ws?.forEach(o => o.w.classList.add('on'));

function renderStage() {
  curEl = null; active = -2; czLane = 0;
  root.dataset.mode = cfg.mode;
  if (lyr.status !== 'ok') { stage.innerHTML = ''; return; }
  if (cfg.mode === 'cascada') stage.innerHTML = '<div class="cz"></div>';
  else if (cfg.mode === 'enfoque') stage.innerHTML = `<div class="fz">${lyr.lines.map((l, i) =>
    `<div class="fz-line ${l.text === '♪' ? 'note' : ''}" data-i="${i}" style="--d:${i + 1}">${wordsHTML(l.text, false, l.words)}</div>`).join('')}</div>`;
  else stage.innerHTML = '<div class="ln"></div><div class="ln-next"></div>';
}

function setActive(idx, jump, pos) {
  active = idx;
  if (cfg.mode === 'cascada') {
    if (curEl) { allOn(curEl); curEl.classList.add('past'); }
    curEl = null;
    if (jump) {
      $$('.cz-line', stage).forEach(el => el.remove());
      for (let j = Math.max(0, idx - 8); j < idx; j++) {
        const age = pos - lyr.lines[j].t;
        if (age > cfg.speed * 1000) continue;
        const el = czSpawn(j, age);
        if (el) { allOn(el); el.classList.add('past', 'quiet'); }
      }
    }
    if (idx >= 0) curEl = czSpawn(idx, jump ? Math.max(0, pos - lyr.lines[idx].t) : 0);
  } else if (cfg.mode === 'enfoque') {
    fzActivate(idx);
  } else {
    lnActivate(idx);
  }
  showMsg(idx < 0 && cfg.mode !== 'enfoque' ? 'intro' : lyr.status === 'ok' ? '' : lyr.status);
}

function czSpawn(i, age = 0) {
  const box = $('.cz', stage), l = lyr.lines[i];
  if (!box || !l) return null;
  const el = document.createElement('div');
  el.className = 'cz-line' + (l.text === '♪' ? ' note' : '');
  const len = l.text.length;
  el.style.setProperty('--fz', len > 48 ? 'clamp(20px, 3.3vw, 40px)' : len > 26 ? 'clamp(24px, 4.3vw, 54px)' : 'clamp(28px, 5.6vw, 74px)');
  el.innerHTML = l.text === '♪' ? '<span class="w">♪ ♫ ♪</span>' : wordsHTML(l.text, false, l.words);
  box.appendChild(el);
  const W = root.clientWidth, Hh = root.clientHeight;
  const lanes = [0, -.15, .13, -.07, .17, -.17, .07];
  const x = lanes[czLane++ % lanes.length] * W * (W < 640 ? .3 : 1) + rnd(-.02, .02) * W;
  const drift = rnd(-.05, .05) * W, r0 = rnd(-7, 7), r1 = rnd(-2, 2), r2 = r1 + rnd(-4, 4);
  el._kf = reduced ? [
    [0, x, Hh * .2, 0, 1, 0], [.1, x, Hh * .2, 0, 1, 1], [.8, x, Hh * .6, 0, 1, .6], [1, x, Hh * .7, 0, 1, 0],
  ] : [
    [0, x, -Hh * .15, r0, .9, 0], [.08, x, Hh * .14, r1, 1, 1],
    [.64, x + drift * .6, Hh * .6, r2, 1, .82], [1, x + drift, Hh * 1.06, r2, .95, 0],
  ];
  el._age = Math.min(age, cfg.speed * 1000 - 50);
  el._dur = cfg.speed * 1000;
  placeCascade(el);
  prepWords(el, i);
  const all = $$('.cz-line', box);
  if (all.length > 16) all.slice(0, all.length - 16).forEach(o => o.remove());
  return el;
}

function placeCascade(el) {
  const p = Math.min(1, el._age / el._dur), k = el._kf;
  let j = 0;
  while (j < k.length - 2 && p > k[j + 1][0]) j++;
  const a = k[j], b = k[j + 1], f = (p - a[0]) / (b[0] - a[0] || 1);
  const v = i => a[i] + (b[i] - a[i]) * f;
  el.style.transform = `translate(calc(-50% + ${v(1).toFixed(1)}px), ${v(2).toFixed(1)}px) rotate(${v(3).toFixed(2)}deg) scale(${v(4).toFixed(3)})`;
  el.style.opacity = v(5).toFixed(3);
}
function stepCascade(dt) {
  if (cfg.mode !== 'cascada' || !dt) return;
  for (const el of stage.querySelectorAll('.cz-line')) {
    el._age += dt;
    if (el._age >= el._dur) { if (el === curEl) curEl = null; el.remove(); continue; }
    placeCascade(el);
  }
}

const BLOB_K = [[0, 0, 1], [12, 8, 1.2], [-6, 14, .9], [8, -6, 1.1]];
const BLOB_T = [[22, 0], [27, -6], [31, -11], [18, -3]];
const ease = p => .5 - Math.cos(p * Math.PI) / 2;
const pingpong = (t, dur) => { const q = ((t / dur) % 2 + 2) % 2; return q > 1 ? 2 - q : q; };
function ambient(t) {
  if (reduced || H.motion?.() === 'lite') return;
  const scene = root.dataset.scene;
  const videoShown = scene === 'video' && $('.ly-video', root).classList.contains('show');
  if (scene !== 'portada' && !videoShown) {
    const blobs = root.querySelectorAll('.ly-blobs i');
    blobs.forEach((b, i) => {
      const [dur, delay] = BLOB_T[i];
      const p = ease(pingpong(t - delay, dur)) * 3, j = Math.min(2, Math.floor(p)), f = p - j;
      const A = BLOB_K[j], B = BLOB_K[j + 1], m = n => (A[n] + (B[n] - A[n]) * f).toFixed(2);
      b.style.transform = `translate(${m(0)}vmax, ${m(1)}vmax) scale(${m(2)})`;
    });
    const breath = wasPlaying ? 1 + .0125 * (1 - Math.cos(t * Math.PI * 2 / 7)) : 1;
    $('.ly-blobs', root).style.transform = `scale(${breath.toFixed(4)})`;
  }
  const art = $('.ly-art', root);
  if (scene === 'aura' || (scene === 'video' && !videoShown)) art.style.transform = `rotate(${((t * 4) % 360).toFixed(2)}deg) scale(1.15)`;
  else if (scene === 'portada') {
    const q = ease(pingpong(t, 34));
    art.style.transform = `translate(${(2 * q).toFixed(2)}%, ${(-2 * q).toFixed(2)}%) scale(${(1.12 + .28 * q).toFixed(3)}) rotate(${(-3 + 8 * q).toFixed(2)}deg)`;
  }
  const card = msg.querySelector('.ly-card img');
  if (card && wasPlaying) card.style.transform = `translateY(${(-5 + 5 * Math.cos(t * Math.PI / 3)).toFixed(1)}px) rotate(${(-.75 + .75 * Math.cos(t * Math.PI / 3)).toFixed(2)}deg)`;
  msg.querySelectorAll('.ly-dots i').forEach((d, i) => {
    const q = Math.max(0, Math.sin((t / 1.4 - i * .14) * Math.PI * 2));
    d.style.opacity = (.3 + .7 * q).toFixed(2);
    d.style.transform = `scale(${(.7 + .45 * q).toFixed(2)})`;
  });
}

function fzActivate(idx) {
  const list = $('.fz', stage);
  if (!list) return;
  const els = $$('.fz-line', list);
  els.forEach((el, i) => {
    el.style.setProperty('--d', Math.abs(i - Math.max(idx, -1)));
    el.classList.toggle('now', i === idx);
    el.classList.toggle('far', Math.abs(i - idx) > 3);
    el.classList.toggle('past', i < idx);
    if (i < idx) allOn(el);
    else if (i > idx) $$('.w.on', el).forEach(w => w.classList.remove('on'));
  });
  const el = els[Math.max(0, idx)];
  if (!el) return;
  list.style.transform = `translateY(${Math.round(root.clientHeight * .42 - (el.offsetTop + el.offsetHeight / 2))}px)`;
  if (idx >= 0) { prepWords(el, idx); curEl = el; } else curEl = null;
}

function lnActivate(idx) {
  const box = $('.ln', stage), nx = $('.ln-next', stage);
  if (!box) return;
  $$('.ln-cur', box).forEach(o => { o.classList.add('out'); setTimeout(() => o.remove(), 700); });
  curEl = null;
  if (idx >= 0) {
    const l = lyr.lines[idx];
    const el = document.createElement('div');
    el.className = 'ln-cur' + (l.text === '♪' ? ' note' : '');
    el.innerHTML = l.text === '♪' ? '<span class="w on">♪ ♫ ♪</span>' : wordsHTML(l.text, true, l.words);
    box.appendChild(el);
    prepWords(el, idx);
    curEl = el;
  }
  const n = lyr.lines[idx + 1];
  nx.classList.remove('in'); void nx.offsetWidth;
  nx.textContent = n && n.text !== '♪' ? n.text : '';
  nx.classList.add('in');
}

let cv, ctx, W = 0, Hh = 0, DPR = 1, kind = '', parts = [], extras = [], meteorT = 0;

function resize() {
  if (!root) return;
  DPR = 1;
  W = root.clientWidth; Hh = root.clientHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(Hh * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (lyr.status === 'ok' && cfg.mode === 'enfoque') fzActivate(active);
}

const REMOTE = !!window.NOTAS_REMOTE;
function setupScene() {
  const want = cfg.scene === 'video' && (REMOTE || !videos[track?.id]) ? 'aura' : cfg.scene;
  root.dataset.scene = want;
  if (want === 'video') loadVideo(); else clearVideo();
  if (kind !== want) initParticles(want);
  if (cfg.scene === 'video' && track && !videos[track.id]) autoVideo(track);
}

const searching = new Set(), noVideo = new Set();
async function autoVideo(t, force = false) {
  if (!t || searching.has(t.id) || (!force && (videos[t.id] || noVideo.has(t.id)))) return;
  searching.add(t.id);
  if (root.classList.contains('cfg')) renderPanel();
  try {
    const r = await fetch('/api/video?' + new URLSearchParams({ name: t.name, artist: H.artist(t), dur: Math.round(t.duration_ms / 1000) }));
    if (!(r.headers.get('content-type') || '').includes('json')) throw new Error('old-server');
    const j = await r.json();
    const list = j.results || [];
    if (!list.length) {
      noVideo.add(t.id);
      if (trackId === t.id) H.toast('No encontré un video que se pueda ver aquí 🥲');
      return;
    }
    videos[t.id] = { ...list[0], alts: list, i: 0, auto: true };
    save('notas.videos', videos);
    if (trackId === t.id && cfg.scene === 'video') {
      clearVideo(); setupScene();
      H.toast('🎬 ' + list[0].title);
    }
  } catch (e) {
    if (trackId === t.id) H.toast(e.message === 'old-server'
      ? 'Cierra y vuelve a abrir iniciar.bat para activar la búsqueda de videos'
      : 'No pude buscar el video (¿hay internet?)');
  } finally {
    searching.delete(t.id);
    if (root.classList.contains('cfg') && trackId === t.id) renderPanel();
  }
}
function nextVideo() {
  const v = videos[track?.id];
  if (!v?.alts?.length || v.alts.length < 2) { delete videos[track.id]; noVideo.delete(track.id); autoVideo(track, true); return; }
  v.i = (v.i + 1) % v.alts.length;
  Object.assign(v, v.alts[v.i]);
  save('notas.videos', videos);
  clearVideo(); setupScene(); renderPanel();
  H.toast(`🎬 ${v.title || 'Otro video'} (${v.i + 1}/${v.alts.length})`);
}

function initParticles(k) {
  kind = k;
  const base = { aura: 60, portada: 40, estrellas: 260, lluvia: 320, petalos: 36, nieve: 170, video: 0 }[k] || 0;
  const n = Math.round(base * clamp((W * Hh) / (1280 * 720), .45, 1.6) * (reduced ? .25 : H?.motion?.() === 'lite' ? .3 : 1));
  parts = Array.from({ length: n }, () => spawn(k, true));
  extras = k === 'lluvia'
    ? Array.from({ length: 14 }, () => ({ x: rnd(0, W), y: rnd(0, Hh), r: rnd(30, 110), vx: rnd(-8, 8), vy: rnd(-6, 6), c: pick(pal.c), a: rnd(.05, .14) }))
    : [];
}
function recolorParticles() {
  parts.forEach(p => { if (p.c && kind !== 'petalos') p.c = pick(pal.c); });
  extras.forEach(p => (p.c = pick(pal.c)));
}
const PETALS = ['#ffc2d6', '#ffb0c8', '#ffd6e4', '#ff9dbb', '#fff0f5'];
function spawn(k, init) {
  switch (k) {
    case 'estrellas': return { x: rnd(0, W), y: rnd(0, Hh), r: rnd(.4, 1.8), ph: rnd(0, 7), sp: rnd(.6, 2.2) };
    case 'lluvia': return { x: rnd(-60, W + 60), y: init ? rnd(-Hh, Hh) : rnd(-160, -20), len: rnd(12, 30), vy: rnd(650, 1050), a: rnd(.12, .38) };
    case 'petalos': return { x: rnd(0, W), y: init ? rnd(-Hh, Hh) : rnd(-80, -20), s: rnd(6, 13), rot: rnd(0, 7), vr: rnd(-1.4, 1.4), vy: rnd(26, 62), ph: rnd(0, 7), sw: rnd(18, 55), fl: rnd(0, 7), c: Math.random() < .3 ? pick(pal.c) : pick(PETALS) };
    case 'nieve': return { x: rnd(0, W), y: init ? rnd(0, Hh) : -10, r: rnd(1, 3.6), vy: rnd(18, 55), ph: rnd(0, 7), sw: rnd(8, 36), a: rnd(.35, .95) };
    default: return { x: rnd(0, W), y: init ? rnd(0, Hh) : Hh + 10, r: rnd(.8, 2.8), vy: -rnd(8, 28), ph: rnd(0, 7), a: rnd(.2, .75), c: pick(pal.c) };
  }
}

function drawParticles(dt, now) {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, Hh);
  if (!parts.length || document.hidden) return;
  const s = dt / 1000, t = now / 1000;
  const speed = wasPlaying ? 1 : .35;
  const st = s * speed;
  if (kind === 'estrellas') {
    ctx.fillStyle = '#fff';
    for (const p of parts) {
      ctx.globalAlpha = .25 + .75 * Math.abs(Math.sin(t * p.sp + p.ph));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    meteorT -= s;
    if (meteorT <= 0) { meteorT = rnd(2.5, 7); extras.push({ x: rnd(W * .2, W * 1.1), y: rnd(-20, Hh * .35), vx: -rnd(500, 800), vy: rnd(220, 360), life: 1 }); }
    for (const m of extras) {
      m.x += m.vx * s; m.y += m.vy * s; m.life -= s * .9;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * .18, m.y - m.vy * .18);
      g.addColorStop(0, `rgba(255,255,255,${Math.max(0, m.life)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * .18, m.y - m.vy * .18); ctx.stroke();
    }
    extras = extras.filter(m => m.life > 0);
  } else if (kind === 'lluvia') {
    for (const b of extras) {
      b.x += b.vx * st; b.y += b.vy * st;
      if (b.x < -b.r) b.x = W + b.r; if (b.x > W + b.r) b.x = -b.r;
      if (b.y < -b.r) b.y = Hh + b.r; if (b.y > Hh + b.r) b.y = -b.r;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, b.c); g.addColorStop(1, 'transparent');
      ctx.globalAlpha = b.a * (.7 + .3 * Math.sin(t + b.r)); ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill();
    }
    ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 1.1;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.y += p.vy * st; p.x += 70 * st;
      if (p.y > Hh + 30) parts[i] = spawn('lluvia');
      ctx.globalAlpha = p.a;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.len * .07, p.y - p.len); ctx.stroke();
    }
  } else if (kind === 'petalos') {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.y += p.vy * st; p.ph += st; p.rot += p.vr * st; p.fl += st * 2.2;
      const x = p.x + Math.sin(p.ph) * p.sw;
      if (p.y > Hh + 30) { parts[i] = spawn('petalos'); continue; }
      ctx.save(); ctx.translate(x, p.y); ctx.rotate(p.rot); ctx.scale(1, .35 + .65 * Math.abs(Math.cos(p.fl)));
      ctx.globalAlpha = .88; ctx.fillStyle = p.c;
      const z = p.s;
      ctx.beginPath(); ctx.moveTo(0, -z);
      ctx.bezierCurveTo(z * .95, -z * .55, z * .7, z * .75, 0, z);
      ctx.bezierCurveTo(-z * .7, z * .75, -z * .95, -z * .55, 0, -z);
      ctx.fill(); ctx.restore();
    }
  } else if (kind === 'nieve') {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.y += p.vy * st; p.ph += st * .8;
      if (p.y > Hh + 10) { parts[i] = spawn('nieve'); continue; }
      ctx.globalAlpha = p.a;
      ctx.beginPath(); ctx.arc(p.x + Math.sin(p.ph) * p.sw, p.y, p.r, 0, 6.283); ctx.fill();
    }
  } else {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.y += p.vy * st; p.ph += st;
      if (p.y < -10) { parts[i] = spawn(kind); continue; }
      const x = p.x + Math.sin(p.ph) * 14;
      ctx.fillStyle = p.c;
      ctx.globalAlpha = p.a * .18; ctx.beginPath(); ctx.arc(x, p.y, p.r * 4, 0, 6.283); ctx.fill();
      ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}

let vid = { t: null, at: 0, check: 0 };
let ytLead = clamp(+load('notas.ytLead', .35) || .35, 0, 2);
const videoOn = () => root?.dataset.scene === 'video' && !!$('.ly-video iframe', root);
function ytId(s) {
  const m = String(s || '').trim().match(/(?:youtu\.be\/|[?&]v=|shorts\/|embed\/|live\/)([\w-]{11})/) || String(s || '').trim().match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}
const BRIDGE = `http://localhost:${location.port || 80}/yt.html`;
const ytFrame = () => $('.ly-video iframe', root);
function loadVideo() {
  const v = videos[track?.id], box = $('.ly-video', root);
  if (!v) { clearVideo(); return; }
  const key = v.id + '|' + track.id;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.classList.remove('show');
  const start = Math.max(0, Math.floor(H.pos() / 1000 + (v.offset || 0) + ytLead));
  box.innerHTML = `<iframe title="Video musical" tabindex="-1" allow="autoplay; encrypted-media"
    src="${BRIDGE}?${new URLSearchParams({ v: v.id, start })}"></iframe>`;
  vid = { t: null, at: 0, check: 0, state: -1, dur: 0, goodSince: 0, shown: false, hold: 0, measureAt: 0, rate: 1, asked: 1 };
}
function clearVideo() {
  const box = root && $('.ly-video', root);
  if (box) { box.innerHTML = ''; box.dataset.key = ''; box.classList.remove('show'); }
}
function ytPost(o) { ytFrame()?.contentWindow?.postMessage(JSON.stringify(o), '*'); }
function ytCmd(func, args = []) { ytPost({ event: 'command', func, args }); }
function noCaptions() {
  ytCmd('unloadModule', ['captions']);
  ytCmd('unloadModule', ['cc']);
  ytCmd('setOption', ['captions', 'track', {}]);
}
function onYouTubeMessage(e) {
  const f = ytFrame();
  if (!f || e.source !== f.contentWindow) return;
  let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
  if (d?.event === 'bridgeReady') {
    ytPost({ event: 'listening', id: 'ly', channel: 'widget' });
  } else if (d?.event === 'onReady') {
    noCaptions();
    ytCmd(wasPlaying ? 'playVideo' : 'pauseVideo');
  } else if (d?.event === 'onError') {
    videoFailed(d.info);
  } else if (d?.info) {
    const i = d.info;
    if (i.playerState != null) {
      if (i.playerState === 1 && vid.state !== 1) noCaptions();
      vid.state = i.playerState;
    }
    if (i.duration) vid.dur = i.duration;
    if (i.playbackRate) vid.rate = i.playbackRate;
    if (i.currentTime != null) { vid.t = i.currentTime; vid.at = performance.now(); }
  }
}
function videoFailed(code) {
  const v = videos[track?.id];
  if (!v || code === 2) return;
  const bad = new Set([...(v.bad || []), v.id]);
  const alt = (v.alts || []).find(a => !bad.has(a.id));
  if (alt) {
    Object.assign(v, alt, { bad: [...bad], i: v.alts.indexOf(alt) });
    H.toast('Ese video no se deja ver aquí, probando otro… 🎬');
  } else {
    delete videos[track.id];
    noVideo.add(track.id);
    H.toast('YouTube no deja ver los videos de esta canción aquí 🥲');
  }
  save('notas.videos', videos);
  clearVideo(); setupScene();
  if (root.classList.contains('cfg')) renderPanel();
}
function syncVideo(raw, now) {
  const box = $('.ly-video', root);
  if (!videoOn()) { box?.classList.remove('show'); return; }
  if (now < vid.check) return;
  vid.check = now + 150;
  const v = videos[track?.id];
  if (!v) return;
  const want = raw / 1000 + (v.offset || 0);
  const vt = vid.t == null ? null : vid.t + (vid.state === 1 ? (now - vid.at) / 1000 * (vid.rate || 1) : 0);
  const drift = vt == null ? null : vt - want;
  const endZone = vid.dur && (want > vid.dur - 1 || (vt != null && vt > vid.dur - 14));
  const inRange = want >= 0 && !endZone;

  const good = wasPlaying && vid.state === 1 && drift != null && Math.abs(drift) < .3 && inRange;
  vid.goodSince = good ? (vid.goodSince || now) : 0;
  const show = !!vid.goodSince && now - vid.goodSince > (vid.shown ? 250 : 2200);
  if (show) vid.shown = true;
  box.classList.toggle('show', show);

  if (!wasPlaying || !inRange || vid.state === 3 || vid.state === -1) return;

  if (vid.measureAt && now >= vid.measureAt && vid.state === 1 && drift != null) {
    if (Math.abs(drift) < 1.5) { ytLead = clamp(ytLead - drift * .7, 0, 2); save('notas.ytLead', +ytLead.toFixed(3)); }
    vid.measureAt = 0;
  }
  if (now < vid.hold) return;
  if (drift == null || Math.abs(drift) > 1) {
    setRate(1);
    ytCmd('seekTo', [Math.max(0, want + ytLead), true]);
    if (vid.state !== 1) ytCmd('playVideo');
    vid.hold = now + 2200;
    vid.measureAt = now + 1200;
    return;
  }
  const target = Math.abs(drift) < .035 ? 1 : 1 - clamp(drift * .35, -.1, .1);
  setRate(Math.round(target * 100) / 100);
}
function setRate(r) {
  if (Math.abs(r - vid.asked) < .009) return;
  vid.asked = r;
  ytCmd('setPlaybackRate', [r]);
}

const FMT = {
  size: v => Math.round(v * 100) + '%',
  speed: v => (v >= 22 ? 'rápida' : v >= 15 ? 'suave' : 'lenta'),
  dim: v => Math.round(v * 100) + '%',
  offset: v => `${v > 0 ? '+' : ''}${(+v).toFixed(1)} s`,
  voff: v => `${v > 0 ? '+' : ''}${(+v).toFixed(2)} s`,
};
function range(k, label, min, max, step, value) {
  return `<label class="lp-row"><span>${label}</span>
    <input class="range" type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${value}" style="--v:${((value - min) / (max - min)) * 100}%">
    <output>${FMT[k](value)}</output></label>`;
}
function seg(k, opts) {
  return `<div class="lp-seg" data-k="${k}">${Object.entries(opts).map(([v, n]) => `<button data-v="${v}" class="${cfg[k] === v ? 'on' : ''}">${n}</button>`).join('')}</div>`;
}
function renderPanel() {
  const p = $('.ly-panel', root);
  const v = videos[track?.id];
  const q = track ? encodeURIComponent(`${track.name} ${H.artist(track)} video oficial`) : '';
  p.innerHTML = `
    <div class="lp-head"><h3>Personaliza ✨</h3><button class="ly-ib sm" data-a="cfg-x" title="Cerrar">${ic('x')}</button></div>
    <div class="lp-sec">Cómo aparece la letra</div>
    ${seg('mode', MODES)}
    <div class="lp-sec">Lugar</div>
    <div class="lp-scenes" data-k="scene">${Object.entries(SCENES).filter(([k]) => !(REMOTE && k === 'video')).map(([k, [n, e]]) =>
      `<button class="lp-scene ${cfg.scene === k ? 'on' : ''}" data-v="${k}"><span class="e">${e}</span>${n}</button>`).join('')}</div>
    ${cfg.scene === 'video' && !REMOTE ? `
      <div class="lp-video">
        ${!track ? '<p class="lp-hint">Pon una canción y buscaré su video solito ✨</p>'
          : searching.has(track.id) ? '<p class="lp-hint">🔎 Buscando el video oficial…</p>'
          : v ? `<div class="lp-vid-now">${ic('youtube')}<div><b>${esc(v.title || 'Video elegido')}</b><small>${esc(v.channel || '')}</small></div></div>
                 <div class="lp-btns"><button class="lp-btn" data-a="yt-next">🔀 Otro video</button><button class="lp-btn" data-a="yt-del">Quitar</button></div>
                 ${range('voff', 'Desfase', -30, 30, .05, v.offset || 0)}
                 <p class="lp-hint">${v.auto && v.offset ? 'Desfase estimado por la intro del video. ' : ''}Si la boca y la voz no coinciden, ajústalo.</p>`
          : '<p class="lp-hint">No encontré un video que se pueda ver aquí. Puedes pegar uno abajo.</p>'}
        ${track ? `<details class="lp-manual"${v || searching.has(track.id) ? '' : ' open'}><summary>Pegar un link de YouTube</summary>
          <input id="lp-yt" placeholder="https://youtu.be/…" autocomplete="off" spellcheck="false">
          <div class="lp-btns">
            <a class="lp-btn red" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">${ic('youtube')}Buscar</a>
            <button class="lp-btn" data-a="yt-save">Usar este</button>
          </div></details>` : ''}
      </div>` : ''}
    <div class="lp-sec">Letra</div>
    <div class="lp-fonts" data-k="font">${Object.entries(H.fonts).map(([k, f]) =>
      `<button class="lp-font ${cfg.font === k ? 'on' : ''}" data-v="${k}" title="${f.name}" style="font-family:${f.f.replace(/"/g, "'")}">Aa</button>`).join('')}</div>
    ${range('size', 'Tamaño', .7, 1.6, .05, cfg.size)}
    ${cfg.mode === 'cascada' ? range('speed', 'Caída', 6, 26, 1, 32 - cfg.speed) : ''}
    <div class="lp-sec">Colores</div>
    ${seg('colors', COLORS)}
    ${range('dim', 'Oscurecer', 0, .8, .05, cfg.dim)}
    <div class="lp-sec">Sincronía</div>
    ${range('offset', 'Adelantar', -3, 3, .1, cfg.offset)}
    <p class="lp-hint">Si la letra va atrasada, súbelo; si va adelantada, bájalo. También con las flechas ↑ ↓.</p>
    <p class="lp-hint soft">Letras de LRCLIB · Atajos: Espacio pausa · ← → canción · F pantalla completa</p>`;
}
function onPanelClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  const grp = b.closest('[data-k]');
  if (grp && b.dataset.v) {
    const k = grp.dataset.k, v = b.dataset.v;
    if (cfg[k] === v) return;
    cfg[k] = v; saveCfg();
    if (k === 'mode') renderStage();
    if (k === 'scene') setupScene();
    applyVars();
    renderPanel();
    if (k === 'scene' && v === 'video' && track && !videos[track.id]) setTimeout(() => $('#lp-yt', root)?.focus(), 350);
    return;
  }
  const a = b.dataset.a;
  if (a === 'cfg-x') togglePanel(false);
  else if (a === 'yt-save') {
    const id = ytId($('#lp-yt', root).value);
    if (!id) { H.toast('Ese link de YouTube no parece válido'); return; }
    videos[track.id] = { id, offset: 0, title: 'Video elegido por ti', channel: '' };
    save('notas.videos', videos);
    clearVideo(); setupScene(); renderPanel();
    H.toast('Video guardado para esta canción 🎬');
  } else if (a === 'yt-next') {
    nextVideo();
  } else if (a === 'yt-del') {
    delete videos[track.id];
    noVideo.add(track.id);
    save('notas.videos', videos);
    setupScene(); renderPanel();
  }
}
function onPanelInput(e) {
  const r = e.target.closest('input.range');
  if (!r) return;
  const k = r.dataset.k, v = +r.value;
  r.style.setProperty('--v', ((v - r.min) / (r.max - r.min)) * 100 + '%');
  r.nextElementSibling.textContent = FMT[k](v);
  if (k === 'voff') {
    if (videos[track?.id]) { videos[track.id].offset = v; save('notas.videos', videos); vid.check = 0; }
    return;
  }
  cfg[k] = k === 'speed' ? 32 - v : v;
  saveCfg();
  applyVars();
}

function applyVars() {
  if (!root) return;
  const s = root.style;
  const f = H?.fonts?.[cfg.font];
  s.setProperty('--lyf', f ? f.f : "'Playfair Display', serif");
  s.setProperty('--lys', cfg.size);
  s.setProperty('--dim', cfg.dim);
  s.setProperty('--c1', pal.c[0]); s.setProperty('--c2', pal.c[1]); s.setProperty('--c3', pal.c[2]);
  s.setProperty('--bg1', pal.bg); s.setProperty('--bg2', pal.bg2);
  s.setProperty('--hl', cfg.colors === 'blanco' ? '#ffffff' : cfg.colors === 'accent' ? 'var(--accent)' : pal.c[0]);
  root.dataset.colors = cfg.colors;
  root.dataset.mode = cfg.mode;
}

return {
  init(hooks) { H = hooks; },
  open, close,
  toggle() { isOpen ? close() : open(); },
  isOpen: () => isOpen,
};
})();
