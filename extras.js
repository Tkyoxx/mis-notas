window.Extras = (() => {
'use strict';
const A = () => window.NotasApp;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c) => window.icon(n, c);
const firstFamily = f => (f.match(/'([^']+)'/) || [, 'Inter'])[1];

async function toWebp(source, max, q) {
  const bmp = await createImageBitmap(source, { imageOrientation: 'from-image' });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise(r => c.toBlob(r, 'image/webp', q));
}
async function upload(blob, thumb = false) {
  const r = await fetch('/api/media' + (thumb ? '?thumb=1' : ''), { method: 'POST', headers: { 'Content-Type': blob.type, 'X-Notas': '1' }, body: blob });
  if (!r.ok) throw new Error('subida');
  return (await r.json()).url;
}
async function uploadPhoto(file) {
  const [big, small] = await Promise.all([toWebp(file, 1600, .86), toWebp(file, 480, .8)]);
  const [src, thumb] = await Promise.all([upload(big), upload(small, true)]);
  return { src, thumb };
}
async function insertPhotos(files, at) {
  const imgs = [...files].filter(f => /^image\//.test(f.type));
  if (!imgs.length) return;
  A().toast(imgs.length > 1 ? `Agregando ${imgs.length} fotos… 📷` : 'Agregando foto… 📷');
  for (const f of imgs) {
    try {
      const { src, thumb } = await uploadPhoto(f);
      A().insertAtCaret(`<div class="media"><img class="photo" src="${src}" data-thumb="${thumb}" alt=""></div><p><br></p>`, at);
      at = null;
    } catch { A().toast('No pude agregar esa foto 😕 (¿es un formato raro como HEIC?)'); }
  }
}
function pickPhotos() {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true });
  inp.addEventListener('change', () => insertPhotos(inp.files));
  inp.click();
}

function openViewer(img) {
  const isSketch = img.classList.contains('sketch');
  const v = document.createElement('div');
  v.className = 'viewer';
  v.innerHTML = `
    <img src="${esc(img.getAttribute('src'))}" alt="">
    <div class="viewer-bar">
      ${isSketch ? `<button class="vbtn" data-v="edit">${ic('pen')}Editar dibujo</button>` : ''}
      <button class="vbtn danger" data-v="del">${ic('trash')}Quitar</button>
      <button class="vbtn" data-v="close">${ic('x')}Cerrar</button>
    </div>`;
  document.body.appendChild(v);
  requestAnimationFrame(() => v.classList.add('on'));
  const close = () => { v.classList.remove('on'); setTimeout(() => v.remove(), 300); removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  v.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) { if (e.target === v) close(); return; }
    if (b.dataset.v === 'close') close();
    if (b.dataset.v === 'del') { (img.closest('.media') || img).remove(); A().bodyChanged(); close(); }
    if (b.dataset.v === 'edit') { close(); openSketch({ from: img }); }
  });
}

const INKS = ['#231f2b', '#ffffff', '#ff4f8b', '#ff8a3d', '#f2b730', '#2fbf80', '#3d97ff', '#9277ff'];
const SIZES = [3, 7, 14];
function openSketch({ from = null } = {}) {
  const paperBg = getComputedStyle($('#editor')).backgroundColor;
  const px = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  px.fillStyle = '#000'; px.fillStyle = getComputedStyle($('#editor')).color; px.fillRect(0, 0, 1, 1);
  const [r, g, bl] = px.getImageData(0, 0, 1, 1).data;
  const first = (r * .299 + g * .587 + bl * .114) > 150 ? 1 : 0;
  const el = document.createElement('div');
  el.className = 'sk';
  el.innerHTML = `
    <header class="sk-top">
      <button class="sk-btn" data-k="cancel">Cancelar</button>
      <b>Dibujo ✏️</b>
      <button class="sk-btn strong" data-k="done">Listo</button>
    </header>
    <div class="sk-stage" style="background:${paperBg}"><canvas></canvas></div>
    <footer class="sk-tools">
      <div class="sk-inks">${INKS.map((c, i) => `<button class="sk-ink ${i === first ? 'on' : ''}" data-ink="${c}" style="--c:${c}"></button>`).join('')}</div>
      <div class="sk-sizes">${SIZES.map((s, i) => `<button class="sk-size ${i === 1 ? 'on' : ''}" data-size="${s}"><i style="--d:${s + 4}px"></i></button>`).join('')}</div>
      <div class="sk-acts">
        <button class="sk-ic" data-k="erase" title="Borrador">${ic('eraser')}</button>
        <button class="sk-ic" data-k="undo" title="Deshacer (Ctrl+Z)">${ic('undo')}</button>
        <button class="sk-ic" data-k="clear" title="Borrar todo">${ic('trash')}</button>
      </div>
    </footer>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));

  const cv = $('canvas', el), stage = $('.sk-stage', el), ctx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, ink = INKS[first], size = SIZES[1], erase = false, base = null;
  const strokes = [];
  let cur = null;

  function fit() {
    W = stage.clientWidth; H = stage.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  function drawStroke(s, from = 0) {
    ctx.save();
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const P = s.pts;
    if (P.length === 1) { ctx.beginPath(); ctx.arc(P[0][0], P[0][1], P[0][2] / 2, 0, 7); ctx.fill(); ctx.restore(); return; }
    for (let i = Math.max(1, from); i < P.length; i++) {
      const a = P[i - 1], b = P[i], m0 = i > 1 ? [(P[i - 2][0] + a[0]) / 2, (P[i - 2][1] + a[1]) / 2] : a, m1 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      ctx.lineWidth = (a[2] + b[2]) / 2;
      ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.quadraticCurveTo(a[0], a[1], m1[0], m1[1]); ctx.stroke();
    }
    ctx.restore();
  }
  function redraw() {
    ctx.clearRect(0, 0, W, H);
    if (base) {
      const s = Math.min(1, (W - 40) / base.width, (H - 40) / base.height);
      const w = base.width * s, h = base.height * s;
      base.rect = [(W - w) / 2, (H - h) / 2, w, h];
      ctx.drawImage(base, ...base.rect);
    }
    strokes.forEach(s => drawStroke(s));
  }
  if (from) {
    const im = new Image();
    im.onload = () => { base = im; redraw(); };
    im.src = from.getAttribute('src');
  }
  fit();
  const ro = new ResizeObserver(fit); ro.observe(stage);

  const widthOf = e => size * (e.pointerType === 'pen' && e.pressure > 0 ? .35 + e.pressure * 1.3 : 1) * (erase ? 2.2 : 1);
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect();
    cur = { color: ink, erase, pts: [[e.clientX - r.left, e.clientY - r.top, widthOf(e)]] };
    strokes.push(cur);
    drawStroke(cur);
  });
  cv.addEventListener('pointermove', e => {
    if (!cur) return;
    const r = cv.getBoundingClientRect();
    const co = e.getCoalescedEvents?.();
    const evs = co && co.length ? co : [e];
    const n = cur.pts.length;
    for (const c of evs) cur.pts.push([c.clientX - r.left, c.clientY - r.top, widthOf(c)]);
    drawStroke(cur, n);
  });
  const end = () => { cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  const close = () => { ro.disconnect(); el.classList.remove('on'); setTimeout(() => el.remove(), 350); removeEventListener('keydown', onKey, true); };
  const onKey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); strokes.pop(); redraw(); }
  };
  addEventListener('keydown', onKey, true);

  el.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ink) { ink = b.dataset.ink; erase = false; $$('.sk-ink', el).forEach(x => x.classList.toggle('on', x === b)); $('[data-k=erase]', el).classList.remove('on'); }
    if (b.dataset.size) { size = +b.dataset.size; $$('.sk-size', el).forEach(x => x.classList.toggle('on', x === b)); }
    const k = b.dataset.k;
    if (k === 'erase') { erase = !erase; b.classList.toggle('on', erase); }
    if (k === 'undo') { strokes.pop(); redraw(); }
    if (k === 'clear') { strokes.length = 0; base = null; redraw(); }
    if (k === 'cancel') close();
    if (k === 'done') {
      if (!strokes.length && !(from && base)) { close(); return; }
      b.disabled = true; b.textContent = 'Guardando…';
      try {
        const blob = await cropped();
        const url = await upload(blob);
        if (from) { from.src = url; A().bodyChanged(); }
        else A().insertAtCaret(`<div class="media"><img class="sketch" src="${url}" alt=""></div><p><br></p>`);
        close();
        A().toast('Dibujo guardado ✨');
      } catch { b.disabled = false; b.textContent = 'Listo'; A().toast('No se pudo guardar el dibujo'); }
    }
  });

  function cropped() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, w) => { x0 = Math.min(x0, x - w); y0 = Math.min(y0, y - w); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + w); };
    strokes.filter(s => !s.erase).forEach(s => s.pts.forEach(p => add(p[0], p[1], p[2])));
    if (base?.rect) { const [x, y, w, h] = base.rect; add(x, y, 0); add(x + w, y + h, 0); }
    const pad = 18;
    x0 = clamp(x0 - pad, 0, W); y0 = clamp(y0 - pad, 0, H); x1 = clamp(x1 + pad, 0, W); y1 = clamp(y1 + pad, 0, H);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round((x1 - x0) * dpr)); out.height = Math.max(1, Math.round((y1 - y0) * dpr));
    out.getContext('2d').drawImage(cv, x0 * dpr, y0 * dpr, out.width, out.height, 0, 0, out.width, out.height);
    return new Promise(r => out.toBlob(r, 'image/png'));
  }
}

const FORMATS = { story: [1080, 1920, 'Historia'], post: [1080, 1350, 'Post'], square: [1080, 1080, 'Cuadrado'] };
const STYLES = { paper: 'Papel', aura: 'Aura', night: 'Noche' };

function noteLines(html) {
  const d = new DOMParser().parseFromString(String(html || ''), 'text/html').body;
  d.querySelectorAll('img, .media').forEach(x => x.remove());
  d.querySelectorAll('ul.checklist > li').forEach(li => li.prepend(li.hasAttribute('data-checked') ? '✓ ' : '○ '));
  d.querySelectorAll('ul:not(.checklist) > li').forEach(li => li.prepend('• '));
  const s = d.innerHTML.replace(/<\/(p|div|li|h2|h3|blockquote)>|<br\s*\/?>/gi, '\n');
  const t = new DOMParser().parseFromString(s, 'text/html').body.textContent || '';
  return t.replace(/\n{3,}/g, '\n\n').trim().split('\n');
}
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) out.push(line);
      if (ctx.measureText(word).width <= maxW) { line = word; continue; }
      let part = '';
      for (const ch of word) { if (ctx.measureText(part + ch).width > maxW) { out.push(part); part = ch; } else part += ch; }
      line = part;
    }
    out.push(line);
  }
  return out;
}
const loadImg = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, r) : x.rect(X, Y, w, h); }
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

async function renderShare(src, fmt, style) {
  const [W, H] = FORMATS[fmt];
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const P = A().PAPERS[src.paper] || A().PAPERS.rosa;
  const tint = src.tint || P.t;
  const art = await loadImg(src.art);
  const fam = firstFamily((A().FONTS[src.font] || A().FONTS.elegante).f);
  await Promise.all([document.fonts.load(`700 60px "${fam}"`), document.fonts.load(`400 40px "${fam}"`), document.fonts.load(`40px "Noto Color Emoji"`)]).catch(() => {});
  const rnd = seeded([...(src.title || src.text || 'x')].reduce((a, ch) => a + ch.charCodeAt(0), 7));

  let ink = '#fff', ink2 = 'rgba(255,255,255,.7)';
  if (style === 'paper' && src.paper !== 'noche') {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, P.c); g.addColorStop(1, mixHex(P.c, tint, .18));
    x.fillStyle = P.c; x.fillRect(0, 0, W, H);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalAlpha = .18; x.fillStyle = tint;
    for (let i = 0; i < 3; i++) { const r = W * (.35 + rnd() * .3); x.beginPath(); x.arc(rnd() * W, rnd() * H, r, 0, 7); x.filter = 'blur(80px)'; x.fill(); }
    x.filter = 'none'; x.globalAlpha = 1;
    ink = '#231f2b'; ink2 = 'rgba(35,31,43,.6)';
  } else if (style === 'aura' || (style === 'paper' && src.paper === 'noche')) {
    x.fillStyle = '#120e1c'; x.fillRect(0, 0, W, H);
    if (art) { x.filter = 'blur(70px) saturate(1.5)'; const s = Math.max(W, H) * 1.3; x.drawImage(art, (W - s) / 2, (H - s) / 2, s, s); x.filter = 'none'; }
    else {
      x.filter = 'blur(90px)';
      [tint, P.c, '#9277ff'].forEach((col, i) => { x.globalAlpha = .6; x.fillStyle = col; x.beginPath(); x.arc(W * [.2, .85, .5][i], H * [.2, .45, .9][i], W * .5, 0, 7); x.fill(); });
      x.filter = 'none'; x.globalAlpha = 1;
    }
    const sh = x.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(0,0,0,.25)'); sh.addColorStop(1, 'rgba(0,0,0,.55)');
    x.fillStyle = sh; x.fillRect(0, 0, W, H);
  } else {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d1a44'); g.addColorStop(1, '#07061a');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 180; i++) { x.globalAlpha = .25 + rnd() * .75; x.fillStyle = '#fff'; x.beginPath(); x.arc(rnd() * W, rnd() * H, rnd() * 2.4 + .4, 0, 7); x.fill(); }
    x.globalAlpha = .35; x.filter = 'blur(100px)'; x.fillStyle = tint; x.beginPath(); x.arc(W * .8, H * .9, W * .5, 0, 7); x.fill(); x.filter = 'none'; x.globalAlpha = 1;
  }

  const pad = W * .09, maxW = W - pad * 2;
  const center = src.kind === 'lyric' || src.align === 'center';
  x.textAlign = center ? 'center' : 'left'; x.textBaseline = 'alphabetic';
  const tx = center ? W / 2 : pad;
  const top = pad + (fmt === 'story' ? H * .07 : 0);
  const footerH = W * .1 + (src.song || src.kind === 'lyric' ? W * .13 : 0);
  let y = top;

  if (src.kind !== 'lyric') {
    x.font = `${Math.round(W * .1)}px "Noto Color Emoji"`;
    x.fillText(src.emoji || '✨', tx, y + W * .09); y += W * .15;
    if (src.title) {
      let ts = W * .078, tl;
      do { x.font = `700 ${Math.round(ts)}px "${fam}", "Noto Color Emoji"`; tl = wrap(x, src.title, maxW); ts -= 3; } while (tl.length > 3 && ts > W * .045);
      x.fillStyle = ink;
      tl.slice(0, 3).forEach(l => { y += ts * 1.18; x.fillText(l, tx, y); });
      y += ts * .7;
    }
  }
  const lines = src.kind === 'lyric' ? [`“${src.text}”`] : src.lines;
  const avail = H - y - pad - footerH;
  let size = src.kind === 'lyric' ? W * .085 : W * .074, wrapped = [], lh = 1.42;
  for (; size >= W * .03; size -= 2) {
    x.font = `${src.kind === 'lyric' ? 700 : 400} ${Math.round(size)}px "${fam}", "Noto Color Emoji"`;
    wrapped = lines.flatMap(l => wrap(x, l, maxW));
    if (wrapped.length * size * lh <= avail) break;
  }
  const maxLines = Math.floor(avail / (size * lh));
  if (wrapped.length > maxLines) { wrapped = wrapped.slice(0, Math.max(1, maxLines)); wrapped[wrapped.length - 1] += ' …'; }
  const spare = avail - wrapped.length * size * lh;
  if (src.kind === 'lyric') y += spare / 2;
  else if (fmt !== 'square') y += spare * .22;
  x.fillStyle = src.kind === 'lyric' ? '#fff' : ink;
  if (style !== 'paper' || src.paper === 'noche') { x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 24; }
  wrapped.forEach(l => { y += size * lh; x.fillText(l, tx, y - size * (lh - 1) / 2); });
  x.shadowBlur = 0;

  const song = src.kind === 'lyric' ? { name: src.title, artist: src.artist, art: src.art } : src.song;
  const fy = H - pad - W * .05;
  if (song) {
    const s = W * .1, by = fy - W * .13;
    const img = art && src.kind === 'lyric' ? art : await loadImg(song.art);
    x.font = `700 ${Math.round(W * .034)}px "Inter", "Noto Color Emoji"`;
    const nameW = Math.min(maxW - s - 40, Math.max(x.measureText(song.name).width, (x.font = `500 ${Math.round(W * .028)}px "Inter"`, x.measureText(song.artist || '').width)));
    const boxW = s + 30 + nameW + 36, bx = center ? (W - boxW) / 2 : pad;
    x.fillStyle = style === 'paper' && src.paper !== 'noche' ? 'rgba(35,31,43,.07)' : 'rgba(255,255,255,.12)';
    roundRect(x, bx, by, boxW, s + 24, 28); x.fill();
    if (img) { x.save(); roundRect(x, bx + 12, by + 12, s, s, 18); x.clip(); x.drawImage(img, bx + 12, by + 12, s, s); x.restore(); }
    x.textAlign = 'left';
    x.fillStyle = ink; x.font = `700 ${Math.round(W * .034)}px "Inter", "Noto Color Emoji"`;
    x.fillText(fitText(x, song.name, nameW), bx + s + 30, by + 12 + s * .45);
    x.fillStyle = ink2; x.font = `500 ${Math.round(W * .028)}px "Inter", "Noto Color Emoji"`;
    x.fillText(fitText(x, song.artist || '', nameW), bx + s + 30, by + 12 + s * .85);
  }
  x.textAlign = 'left'; x.fillStyle = ink2; x.font = `600 ${Math.round(W * .026)}px "Inter", "Noto Color Emoji"`;
  x.fillText('✨ Mis Notas', pad, fy + W * .03);
  x.textAlign = 'right';
  x.fillText(new Date(src.date || Date.now()).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }), W - pad, fy + W * .03);
  return c;
}
function mixHex(a, b, t) {
  const h = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const A_ = h(a), B_ = h(b);
  return '#' + A_.map((v, i) => Math.round(v + (B_[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function fitText(x, t, w) { if (x.measureText(t).width <= w) return t; while (t && x.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }

let shareSheet = null, shareSeq = 0;
function openShare(src) {
  const APP = A();
  if (!shareSheet) {
    shareSheet = document.createElement('section');
    shareSheet.id = 'share'; shareSheet.className = 'sheet tall';
    shareSheet.innerHTML = `
      <div class="sheet-grab"></div>
      <header class="sheet-head"><h2>Compartir <span class="h-emoji">🖼️</span></h2><button class="close-btn" data-close>${ic('x')}</button></header>
      <div class="sheet-body share-body">
        <div class="share-prev"><img alt="Vista previa"></div>
        <div class="seg" data-k="fmt">${Object.entries(FORMATS).map(([k, v]) => `<button data-v="${k}">${v[2]}</button>`).join('')}</div>
        <div class="seg" data-k="style">${Object.entries(STYLES).map(([k, v]) => `<button data-v="${k}">${v}</button>`).join('')}</div>
        <div class="share-acts">
          <button class="btn" data-a="save">${ic('download')}Guardar imagen</button>
          <button class="btn ghost" data-a="copy" hidden>${ic('copy')}Copiar</button>
          <button class="btn ghost" data-a="send" hidden>${ic('share')}Compartir</button>
        </div>
      </div>`;
    document.body.appendChild(shareSheet);
    APP.enableSheetDrag(shareSheet);
    $('[data-close]', shareSheet).addEventListener('click', () => APP.closeSheet());
    shareSheet.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.closest('[data-k]')?.dataset.k;
      if (k) { shareSheet._opts[k] = b.dataset.v; APP.store.set('notas.shareOpts', { fmt: shareSheet._opts.fmt, style: shareSheet._opts.style }); draw(); return; }
      if (b.dataset.a) act(b.dataset.a, b);
    });
  }
  const saved = APP.store.get('notas.shareOpts', {});
  shareSheet._src = src;
  shareSheet._opts = { fmt: saved.fmt || 'story', style: src.kind === 'lyric' ? 'aura' : (saved.style || 'paper') };
  const canCopy = window.isSecureContext && !!window.ClipboardItem;
  $('[data-a=copy]', shareSheet).hidden = !canCopy;
  $('[data-a=send]', shareSheet).hidden = !(navigator.canShare && window.isSecureContext);
  APP.openSheet('share');
  draw();

  async function draw() {
    const my = ++shareSeq, o = shareSheet._opts;
    $$('.seg', shareSheet).forEach(s => $$('button', s).forEach(b => b.classList.toggle('on', b.dataset.v === o[s.dataset.k])));
    const prev = $('.share-prev', shareSheet);
    prev.classList.add('busy');
    const canvas = await renderShare(shareSheet._src, o.fmt, o.style);
    if (my !== shareSeq) return;
    shareSheet._canvas = canvas;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const img = $('img', prev);
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    shareSheet._blob = blob;
    prev.style.aspectRatio = `${FORMATS[o.fmt][0]} / ${FORMATS[o.fmt][1]}`;
    prev.classList.remove('busy');
  }
  async function act(a, b) {
    const blob = shareSheet._blob; if (!blob) return;
    const name = `mis-notas-${(shareSheet._src.title || 'nota').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').slice(0, 40)}.png`;
    if (a === 'save') {
      const u = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: u, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
      APP.toast('Imagen guardada 🖼️'); APP.burstAt(b, ['✨', '🖼️', '💖'], 10);
    }
    if (a === 'copy') { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); APP.toast('Imagen copiada 📋 (pégala donde quieras)'); } catch { APP.toast('No se pudo copiar'); } }
    if (a === 'send') { try { await navigator.share({ files: [new File([blob], name, { type: 'image/png' })] }); } catch {} }
  }
}
function shareNote(n) {
  const APP = A();
  openShare({ kind: 'note', title: n.title, lines: noteLines(n.html), emoji: n.emoji, font: n.font, paper: n.paper, align: n.align, song: n.song, date: n.updated });
}
function shareLyric(text, track, art) {
  openShare({ kind: 'lyric', text, title: track.name, artist: A().Music.artist(track), art, font: 'elegante', paper: 'lavanda' });
}

const pad2 = n => String(n).padStart(2, '0');
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
let diary = null, month = null, selected = null;

function writtenDays() {
  const s = new Set(A().store.get('notas.days', []));
  A().notes.forEach(n => { s.add(dayKey(n.created)); s.add(dayKey(n.updated)); });
  return s;
}
function streaks(days) {
  const d = new Date(); let cur = 0;
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { cur++; d.setDate(d.getDate() - 1); }
  const sorted = [...days].sort(); let best = 0, run = 0, prev = null;
  for (const k of sorted) { const t = new Date(k + 'T12:00'); run = prev && (t - prev) / 864e5 < 1.5 ? run + 1 : 1; best = Math.max(best, run); prev = t; }
  return { cur, best };
}
function openDiary() {
  const APP = A();
  if (!diary) {
    diary = document.createElement('section');
    diary.id = 'diary'; diary.className = 'sheet tall';
    diary.innerHTML = `
      <div class="sheet-grab"></div>
      <header class="sheet-head"><h2>Tu diario <span class="h-emoji">📅</span></h2><button class="close-btn" data-close>${ic('x')}</button></header>
      <div class="sheet-body" id="diary-body"></div>`;
    document.body.appendChild(diary);
    APP.enableSheetDrag(diary);
    $('[data-close]', diary).addEventListener('click', () => APP.closeSheet());
    diary.addEventListener('click', e => {
      const b = e.target.closest('[data-d], [data-m], [data-open], [data-today]');
      if (!b) return;
      if (b.dataset.m) { month.setMonth(month.getMonth() + +b.dataset.m); renderDiary(); }
      if (b.dataset.d) { selected = b.dataset.d; renderDiary(); }
      if (b.dataset.open) { APP.closeSheet(); setTimeout(() => APP.openNote(b.dataset.open), 380); }
      if (b.dataset.today != null) { APP.closeSheet(); setTimeout(() => APP.todayEntry(), 380); }
    });
  }
  const now = new Date();
  month = new Date(now.getFullYear(), now.getMonth(), 1);
  selected = dayKey(now);
  renderDiary();
  APP.openSheet('diary');
}
function noteChip(n) {
  const APP = A(), p = APP.PAPERS[n.paper] || APP.PAPERS.nube, locked = APP.isLocked(n);
  return `<button class="dchip papered" data-open="${esc(n.id)}" data-paper="${n.paper}" style="--paper:${p.c};--tint:${p.t}">
    <span class="e">${locked ? '🔒' : esc(n.emoji)}</span><span class="t">${esc(locked ? 'Nota privada' : n.title || APP.plain(n.html).slice(0, 40) || 'Nota sin título')}</span></button>`;
}
function renderDiary() {
  const APP = A(), notes = APP.notes, days = writtenDays(), { cur, best } = streaks(days);
  const today = dayKey(Date.now());
  const byDay = new Map();
  notes.forEach(n => { const k = dayKey(n.created); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(n); });
  const y = month.getFullYear(), m = month.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const nDays = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<span></span>');
  for (let d = 1; d <= nDays; d++) {
    const k = `${y}-${pad2(m + 1)}-${pad2(d)}`, list = byDay.get(k) || [];
    const dots = list.slice(0, 3).map(n => `<i style="background:${(APP.PAPERS[n.paper] || APP.PAPERS.nube).t}"></i>`).join('');
    cells.push(`<button class="dday ${days.has(k) ? 'w' : ''} ${k === today ? 'today' : ''} ${k === selected ? 'sel' : ''}" data-d="${k}"><b>${d}</b><span class="dots">${dots}</span></button>`);
  }
  const monthNotes = notes.filter(n => { const d = new Date(n.created); return d.getFullYear() === y && d.getMonth() === m; });
  const selList = notes.filter(n => dayKey(n.created) === selected || dayKey(n.updated) === selected).sort((a, b) => b.updated - a.updated);
  const selDate = new Date(selected + 'T12:00');
  const t = new Date();
  const memories = notes.filter(n => {
    const d = new Date(n.created);
    return d.getDate() === t.getDate() && (d.getMonth() === t.getMonth() ? d.getFullYear() < t.getFullYear() : (t.getMonth() - d.getMonth() + 12 * (t.getFullYear() - d.getFullYear())) === 1);
  }).slice(0, 3);
  const agoTxt = n => { const d = new Date(n.created); const yrs = t.getFullYear() - d.getFullYear(); return d.getMonth() === t.getMonth() ? `Hace ${yrs} ${yrs === 1 ? 'año' : 'años'}` : 'Hace un mes'; };

  $('#diary-body').innerHTML = `
    <div class="streak">
      <div class="fire">${cur ? '🔥' : '🌱'}</div>
      <div><b>${cur} ${cur === 1 ? 'día seguido' : 'días seguidos'}</b><small>${cur ? '¡Sigue así! ' : 'Escribe hoy para empezar tu racha. '}Mejor racha: ${best} ${best === 1 ? 'día' : 'días'}</small></div>
    </div>
    ${memories.length ? `<div class="memories"><p class="group-label" style="margin-top:6px">Un día como hoy ✨</p>${memories.map(n => `<div class="mem"><small>${agoTxt(n)} escribiste</small>${noteChip(n)}</div>`).join('')}</div>` : ''}
    <div class="cal">
      <div class="cal-head">
        <button class="close-btn" data-m="-1" title="Mes anterior">${ic('back')}</button>
        <b>${month.toLocaleDateString('es', { month: 'long', year: 'numeric' })}</b>
        <button class="close-btn flip" data-m="1" title="Mes siguiente">${ic('back')}</button>
      </div>
      <div class="cal-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="wd">${d}</span>`).join('')}${cells.join('')}</div>
      <p class="cal-sum">${monthNotes.length} ${monthNotes.length === 1 ? 'nota' : 'notas'} este mes</p>
    </div>
    <p class="group-label">${selDate.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <div class="dlist">${selList.length ? selList.map(noteChip).join('') : '<p class="m-empty">Nada escrito este día.</p>'}</div>
    <button class="btn" data-today>✍️ Escribir la entrada de hoy</button>`;
}

return { pickPhotos, insertPhotos, openViewer, openSketch, shareNote, shareLyric, openDiary, noteLines, dayKey };
})();
