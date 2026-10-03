(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ic = window.icon;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('No se pudo guardar 😢'); } },
};

const PAPERS = {
  nube:    { name: 'Nube',    c: '#FFFFFF', t: '#9FA6BC' },
  crema:   { name: 'Crema',   c: '#FFF4D6', t: '#F2B730' },
  rosa:    { name: 'Rosa',    c: '#FFE2EB', t: '#FF6F9C' },
  lavanda: { name: 'Lavanda', c: '#ECE5FF', t: '#9277FF' },
  menta:   { name: 'Menta',   c: '#DBF5E8', t: '#2FBF80' },
  cielo:   { name: 'Cielo',   c: '#DCEDFF', t: '#3D97FF' },
  durazno: { name: 'Durazno', c: '#FFE5D3', t: '#FF8B4D' },
  noche:   { name: 'Noche',   c: '#1D1A44', t: '#B7A8FF' },
};
const EMOJI_FONT = "'Noto Color Emoji'";
const FONTS = {
  clasica:   { name: 'Clásica',   f: `'Inter', ${EMOJI_FONT}, system-ui, sans-serif`, s: 1 },
  suave:     { name: 'Suave',     f: `'Nunito', ${EMOJI_FONT}, sans-serif`, s: 1.03 },
  elegante:  { name: 'Elegante',  f: `'Playfair Display', ${EMOJI_FONT}, serif`, s: 1.04 },
  poetica:   { name: 'Poética',   f: `'Cormorant Garamond', ${EMOJI_FONT}, serif`, s: 1.18 },
  mano:      { name: 'A mano',    f: `'Caveat', ${EMOJI_FONT}, cursive`, s: 1.36 },
  romantica: { name: 'Romántica', f: `'Dancing Script', ${EMOJI_FONT}, cursive`, s: 1.24 },
  maquina:   { name: 'Máquina',   f: `'Courier Prime', ${EMOJI_FONT}, monospace`, s: .98 },
};
const PATTERNS = { none: 'Liso', lines: 'Líneas', grid: 'Cuadros', dots: 'Puntos' };
const ACCENTS = ['#FF4F8B', '#A26BFF', '#0A84FF', '#1FBF8F', '#FF8A3D', '#FF3B5C'];
const EMOJI = ('🌸 🌷 🌹 🌺 🌻 🌼 💐 🍀 🌿 🍃 🍂 🍄 🌵 🌙 ⭐ 🌟 ✨ 💫 ☁️ 🌈 ☀️ ❄️ 🪐 🌊 🐚 🦋 🐝 🐞 🐱 🐰 🐻 🐼 🦊 🐶 🐥 🦄 🐢 🐙 🦢 🕊️ ' +
  '🍓 🍒 🍑 🍋 🍉 🍊 🧁 🍰 🍩 🍪 🍫 ☕ 🍵 🧋 🎀 🎈 🎁 💌 🕯️ 🔮 📚 ✏️ 🖋️ 📷 🎧 🎵 🎶 🎸 🎹 👑 💍 🔥 💭 ' +
  '💖 💗 💓 💕 💞 💘 ❤️ 🧡 💛 💚 💙 💜 🤍 🖤 🫶 🥰 😊 😌 🥹 😴 🤭 😇 🌝 🙈').split(' ');
const FOLDER_STYLE = {
  poemas: { paper: 'lavanda', font: 'poetica', align: 'center', emoji: '🌙', ph: 'Deja que las palabras floten…' },
  diario: { paper: 'crema', font: 'mano', pattern: 'lines', emoji: '📖', ph: 'Querido diario, hoy…' },
  ideas:  { paper: 'cielo', font: 'suave', pattern: 'dots', emoji: '💡', ph: '¿Qué se te ocurrió?' },
  lindas: { paper: 'rosa', font: 'suave', emoji: '🌸', ph: 'Algo lindo que pasó hoy…' },
};
const DEFAULT_FOLDERS = [
  { id: 'poemas', name: 'Poemas', emoji: '🌙' },
  { id: 'ideas', name: 'Ideas', emoji: '💡' },
  { id: 'diario', name: 'Diario', emoji: '📖' },
  { id: 'lindas', name: 'Cosas lindas', emoji: '🌸' },
];
const QUOTES = [
  'Escribe lo que sientes; mañana te lo vas a agradecer.',
  'Las cosas pequeñas también merecen un lugar bonito.',
  'Un poema no tiene que ser perfecto, solo tuyo.',
  'Hoy también cuenta como un buen día para empezar.',
  'Guarda aquí lo que no quieres olvidar.',
  'Tu cabeza es un jardín: anota lo que florece.',
  'Pon una canción, respira y escribe una línea.',
];

let notes = store.get('notas.notes', null);
let folders = store.get('notas.folders', DEFAULT_FOLDERS);
const settings = Object.assign({ theme: 'auto', accent: ACCENTS[0], name: '', motion: 'auto' }, store.get('notas.settings', {}));
if (!settings.motionAuto1) { settings.motion = 'auto'; settings.motionAuto1 = true; }
let filter = 'all';
let query = '';
let cur = null;

if (!Array.isArray(notes)) { notes = seed(); saveNotes(); }

const deleted = store.get('notas.deleted', {});
function markDeleted(id) { deleted[id] = Date.now(); store.set('notas.deleted', deleted); }
const alive = n => !(deleted[n.id] >= (n.updated || 0));

if (notes.some(n => !alive(n))) { notes = notes.filter(alive); saveNotes(); }

function seed() {
  const now = Date.now();
  const base = { stickers: [], song: null, pinned: false, fav: false, pattern: 'none', align: 'left' };
  return [
    { ...base, id: 'seed-hola', folder: null, emoji: '✨', paper: 'rosa', font: 'suave', pinned: true,
      title: 'Hola, empieza aquí',
      html: '<p>Este es tu rincón para escribir notas, poemas y cosas lindas.</p><ul class="checklist"><li data-checked="">Toca una nota para abrirla</li><li>Mantén presionada una nota para ver más opciones</li><li>Cambia la letra con <b>Aa</b> y el papel con la paleta 🎨</li><li>Pon stickers y arrástralos donde quieras</li><li>Toca la isla negra de arriba para conectar Spotify 🎧</li></ul>',
      stickers: [{ e: '🌷', x: .88, y: 46, r: 12, s: 46 }], created: now - 1000, updated: now - 1000 },
    { ...base, id: 'seed-poema', folder: 'poemas', emoji: '🌙', paper: 'lavanda', font: 'poetica', align: 'center', fav: true,
      title: 'Tarde de mandarina',
      html: '<p>Guardo la tarde en un bolsillo,<br>con su luz de mandarina;<br>por si mañana llueve adentro,<br>tener un sol de golosina.</p>',
      stickers: [{ e: '🍊', x: .82, y: 70, r: -14, s: 40 }], created: now - 3600e3, updated: now - 3600e3 },
    { ...base, id: 'seed-lindas', folder: 'lindas', emoji: '🌸', paper: 'menta', font: 'mano', pattern: 'lines',
      title: 'Cosas lindas de hoy',
      html: '<ul class="checklist"><li data-checked="">Café calientito en la mañana ☕</li><li data-checked="">Una canción nueva que me encantó</li><li>El cielo naranja de las 6 pm</li></ul>',
      created: now - 86400e3, updated: now - 86400e3 },
    { ...base, id: 'seed-ideas', folder: 'ideas', emoji: '💡', paper: 'cielo', font: 'clasica', pattern: 'dots',
      title: 'Ideas para el finde',
      html: '<p>Picnic con playlist nueva, pintar con acuarelas y maratón de pelis de Ghibli 🎬</p>',
      created: now - 2 * 86400e3, updated: now - 2 * 86400e3 },
  ];
}

const OK_TAGS = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'H2', 'H3', 'BLOCKQUOTE', 'SPAN', 'IMG']);
const MEDIA_SRC = /^\/media\/[\w-]{8,64}\.(webp|png|jpg)$/;
function sanitize(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const walk = el => [...el.children].forEach(c => {
    if (!OK_TAGS.has(c.tagName)) { c.replaceWith(...(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(c.tagName) ? [] : c.childNodes)); return walk(el); }
    [...c.attributes].forEach(a => {
      const keep = (c.tagName === 'UL' && a.name === 'class' && a.value === 'checklist') || (c.tagName === 'LI' && a.name === 'data-checked')
        || (c.tagName === 'DIV' && ((a.name === 'class' && a.value === 'media') || (a.name === 'contenteditable' && a.value === 'false')))
        || (c.tagName === 'IMG' && ((a.name === 'src' || a.name === 'data-thumb') ? MEDIA_SRC.test(a.value) : a.name === 'class' && /^(photo|sketch)$/.test(a.value)));
      if (!keep) c.removeAttribute(a.name);
    });
    walk(c);
  });
  walk(doc.body);
  return doc.body.innerHTML;
}
function normalize(n) {
  const str = (v, d = '') => (typeof v === 'string' ? v : d);
  const song = n.song && typeof n.song.uri === 'string' && n.song.uri.startsWith('spotify:')
    ? { uri: n.song.uri, name: str(n.song.name), artist: str(n.song.artist), art: /^https:\/\//.test(n.song.art) ? n.song.art : '', context: str(n.song.context) || null }
    : null;
  return {
    id: /^[\w-]{1,40}$/.test(n.id) ? n.id : uid(),
    title: str(n.title).slice(0, 300), html: sanitize(n.html),
    folder: typeof n.folder === 'string' ? n.folder : null,
    emoji: str(n.emoji, '📝').slice(0, 16) || '📝',
    paper: PAPERS[n.paper] ? n.paper : 'nube', font: FONTS[n.font] ? n.font : 'clasica',
    pattern: PATTERNS[n.pattern] ? n.pattern : 'none', align: n.align === 'center' ? 'center' : 'left',
    stickers: (Array.isArray(n.stickers) ? n.stickers : []).filter(s => s && typeof s.e === 'string').map(s => ({
      e: s.e.slice(0, 16), x: clamp(+s.x || .5, 0, 1), y: Math.max(0, +s.y || 40), r: clamp(+s.r || 0, -180, 180), s: clamp(+s.s || 44, 16, 140) })),
    song, pinned: !!n.pinned, fav: !!n.fav,
    created: +n.created || Date.now(), updated: +n.updated || Date.now(),
    ...(n.lock && ['s', 'i', 't', 'd'].every(k => typeof n.lock[k] === 'string') ? { lock: { v: 1, s: n.lock.s, i: n.lock.i, t: n.lock.t, d: n.lock.d }, title: '', html: '' } : {}),
  };
}

function persistable(n) { return n.lock ? { ...n, title: '', html: '' } : n; }
function saveNotes() { store.set('notas.notes', notes.map(persistable)); }
function saveFolders() { store.set('notas.folders', folders); }
function saveSettings() { store.set('notas.settings', settings); }
let saveT;
function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(saveNotes, 300); }

const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', settings.accent);
  $('meta[name="theme-color"]').content = dark ? '#0E0D12' : '#F4F1F8';
}
mq.addEventListener('change', applyTheme);
addEventListener('blur', () => document.body.classList.add('app-blur'));
addEventListener('focus', () => document.body.classList.remove('app-blur'));

const plainCache = new Map();
function plain(html) {
  const hit = plainCache.get(html);
  if (hit !== undefined) return hit;
  if (plainCache.size > 600) plainCache.clear();
  const text = plainRaw(html);
  plainCache.set(html, text);
  return text;
}
function plainRaw(html) {
  const s = (html || '').replace(/<\/(p|div|li|h2|h3|blockquote)>|<br\s*\/?>/gi, '\n');
  return (new DOMParser().parseFromString(s, 'text/html').body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function ago(ts) {
  const s = (ts - Date.now()) / 1000, a = Math.abs(s);
  if (a < 45) return 'ahora';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  const d = new Date(ts);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
function greeting() {
  const h = new Date().getHours();
  const g = h < 5 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const date = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${g}${settings.name ? ', ' + settings.name : ''} · ${date}`;
}

function renderHeader() {
  $('#greet').textContent = greeting();
  const q = QUOTES[Math.floor(Date.now() / 86400e3) % QUOTES.length];
  $('#quote').innerHTML = `<span class="q-ic">${ic('sparkles')}</span><span>${esc(q)}</span>`;
}
function animateTitle() {
  const t = $('#big-title');
  t.innerHTML = [...'Mis notas'].map((c, i) => c === ' ' ? ' ' : `<span class="ch" style="--i:${i}">${c}</span>`).join('') + '<span class="spark">✨</span>';
}

function folderCount(id) {
  if (id === 'all') return notes.length;
  if (id === 'favs') return notes.filter(n => n.fav).length;
  return notes.filter(n => n.folder === id).length;
}
function renderChips() {
  const all = [{ id: 'all', name: 'Todas', emoji: '✨' }, { id: 'favs', name: 'Favoritas', emoji: '💖' }, ...folders];
  $('#chips').innerHTML = all.map((f, i) => `
    <button class="chip ${filter === f.id ? 'on' : ''}" data-f="${esc(f.id)}" style="--i:${i}">
      <span class="e">${esc(f.emoji)}</span>${esc(f.name)}<span class="n">${folderCount(f.id)}</span>
    </button>`).join('') +
    `<button class="chip add" data-add style="--i:${all.length}" title="Nueva carpeta">${ic('plus')}</button>`;
}

function visible() {
  const q = query.toLowerCase();
  return notes
    .filter(n => filter === 'all' || (filter === 'favs' ? n.fav : n.folder === filter))
    .filter(n => !q || (n.title + ' ' + plain(n.html)).toLowerCase().includes(q))
    .sort((a, b) => b.updated - a.updated);
}

function cardHTML(n, i, animate) {
  const p = PAPERS[n.paper] || PAPERS.nube, f = FONTS[n.font] || FONTS.clasica;
  if (n.lock) return `
  <article class="card papered locked ${animate ? 'anim' : ''}" data-id="${esc(n.id)}" data-paper="${n.paper}"
    style="--paper:${p.c};--tint:${p.t};--nf:${f.f};--fs:${f.s};--i:${i}">
    <div class="card-top"><span class="card-emoji">🔒</span><span class="badges">${n.pinned ? ic('pin') : ''}${n.fav ? `<span class="fv">${ic('heartFill')}</span>` : ''}</span></div>
    <h3>Nota privada</h3>
    <div class="lock-lines"><i></i><i></i><i style="width:60%"></i></div>
    <time>${ago(n.updated)}</time>
  </article>`;
  const im = (n.html || '').match(/<img\b[^>]*>/);
  const thumb = im && ((im[0].match(/data-thumb="([^"]+)"/) || im[0].match(/src="([^"]+)"/)) || [])[1];
  const text = plain(n.html);
  const title = n.title || (text ? '' : 'Nota sin título');
  const stk = n.stickers?.[0]?.e;
  return `
  <article class="card papered ${n.paper === 'noche' ? 'stars' : ''} ${animate ? 'anim' : ''}" data-id="${esc(n.id)}" data-paper="${n.paper}" data-align="${n.align}"
    style="--paper:${p.c};--tint:${p.t};--nf:${f.f};--fs:${f.s};--i:${i}">
    <div class="card-top">
      <span class="card-emoji">${esc(n.emoji)}</span>
      <span class="badges">${n.pinned ? ic('pin') : ''}${n.fav ? `<span class="fv">${ic('heartFill')}</span>` : ''}</span>
    </div>
    ${thumb && MEDIA_SRC.test(thumb) ? `<img class="card-img ${/class="sketch"/.test(im[0]) ? 'sketch' : ''}" src="${esc(thumb)}" alt="" loading="lazy" decoding="async">` : ''}
    ${title ? `<h3>${esc(title)}</h3>` : ''}
    ${text ? `<p>${esc(text.slice(0, 260))}</p>` : ''}
    ${n.song ? `<div class="card-song"><img src="${esc(n.song.art)}" alt="" loading="lazy"><span>${esc(n.song.name)}</span></div>` : ''}
    <time>${ago(n.updated)}</time>
    ${stk && !n.song ? `<span class="card-stk">${esc(stk)}</span>` : ''}
  </article>`;
}

function renderList(animate = false) {
  const items = visible();
  const list = $('#list');
  $('#count').textContent = notes.length === 1 ? '1 nota' : `${notes.length} notas`;
  $('#quote').hidden = !!query;
  if (!items.length) {
    const empty = query
      ? { e: '🔎', t: 'Nada por aquí', s: `No encontré “${esc(query)}”.` }
      : filter === 'favs'
        ? { e: '💖', t: 'Aún no hay favoritas', s: 'Toca el corazón en una nota para guardarla aquí.' }
        : { e: '🌱', t: 'Todo listo para empezar', s: 'Toca el lápiz para escribir tu primera nota.' };
    list.innerHTML = `<div class="empty"><span class="big">${empty.e}</span><h3>${empty.t}</h3><p>${empty.s}</p></div>`;
    return;
  }
  let i = 0, html = '';
  const pinned = query ? [] : items.filter(n => n.pinned);
  const rest = query ? items : items.filter(n => !n.pinned);
  if (pinned.length) {
    html += `<h2 class="sec-title">${ic('pin')}Fijadas</h2><div class="grid">${pinned.map(n => cardHTML(n, i++, animate)).join('')}</div>`;
  }
  if (rest.length) {
    const label = query ? 'Resultados' : pinned.length ? 'Notas' : '';
    html += `${label ? `<h2 class="sec-title">${label}</h2>` : '<div style="height:18px"></div>'}<div class="grid">${rest.map(n => cardHTML(n, i++, animate)).join('')}</div>`;
  }
  list.innerHTML = html;
}

function refreshHome(animate = false) { renderChips(); renderList(animate); }

$('#chips').addEventListener('click', async e => {
  const b = e.target.closest('.chip');
  if (!b || suppressClick) return;
  if (b.hasAttribute('data-add')) return newFolder();
  if (filter === b.dataset.f) return;
  filter = b.dataset.f;
  refreshHome(true);
  $(`.chip[data-f="${CSS.escape(filter)}"]`)?.scrollIntoView?.({ inline: 'center', behavior: 'smooth', block: 'nearest' });
});
$('#chips').addEventListener('contextmenu', e => {
  const b = e.target.closest('.chip[data-f]');
  if (!b || ['all', 'favs'].includes(b.dataset.f)) return;
  e.preventDefault();
  folderMenu(b.dataset.f);
});
longPress($('#chips'), '.chip[data-f]', b => { if (!['all', 'favs'].includes(b.dataset.f)) folderMenu(b.dataset.f); });

async function newFolder() {
  const v = await prompt({ title: 'Nueva carpeta', message: 'Puedes empezar con un emoji, ej. “🌻 Plantas”', placeholder: 'Nombre' });
  if (!v) return;
  const m = v.trim().match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
  const f = { id: uid(), emoji: m ? m[1] : '📁', name: (m ? m[2] : v).trim() || 'Carpeta' };
  folders.push(f); saveFolders();
  filter = f.id; refreshHome(true);
  toast(`Carpeta “${f.name}” creada ${f.emoji}`);
}
function folderMenu(id) {
  const f = folders.find(x => x.id === id);
  if (!f) return;
  actionSheet({
    title: `${f.emoji} ${f.name}`,
    actions: [
      { label: 'Renombrar', icon: 'type', fn: async () => {
        const v = await prompt({ title: 'Renombrar carpeta', value: f.name });
        if (v && v.trim()) { f.name = v.trim(); saveFolders(); renderChips(); }
      } },
      { label: 'Eliminar carpeta', icon: 'trash', danger: true, fn: async () => {
        const ok = await confirmBox({ title: '¿Eliminar carpeta?', message: 'Las notas no se borran, pasan a “Todas”.', ok: 'Eliminar', danger: true });
        if (!ok) return;
        folders = folders.filter(x => x.id !== id);
        notes.forEach(n => { if (n.folder === id) n.folder = null; });
        saveFolders(); saveNotes();
        if (filter === id) filter = 'all';
        refreshHome(true);
      } },
    ],
  });
}

let suppressClick = false;
$('#list').addEventListener('click', e => {
  const c = e.target.closest('.card');
  if (!c || suppressClick) return;
  openNote(c.dataset.id);
});
$('#list').addEventListener('contextmenu', e => {
  const c = e.target.closest('.card');
  if (!c) return;
  e.preventDefault();
  cardMenu(c.dataset.id);
});
longPress($('#list'), '.card', c => cardMenu(c.dataset.id));

function longPress(root, sel, fn) {
  let t, el, x0, y0;
  const cancel = () => { clearTimeout(t); el?.classList.remove('pressing'); el = null; };
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    el = e.target.closest(sel);
    if (!el) return;
    x0 = e.clientX; y0 = e.clientY;
    el.classList.add('pressing');
    t = setTimeout(() => {
      navigator.vibrate?.(12);
      suppressClick = true; setTimeout(() => (suppressClick = false), 450);
      const target = el; cancel(); fn(target);
    }, 480);
  });
  root.addEventListener('pointermove', e => { if (el && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => root.addEventListener(ev, cancel));
}

function cardMenu(id) {
  const n = notes.find(x => x.id === id);
  if (!n) return;
  actionSheet({
    title: n.lock ? '🔒 Nota privada' : n.title || 'Nota sin título',
    actions: [
      { label: n.pinned ? 'Desfijar' : 'Fijar arriba', icon: 'pin', fn: () => { n.pinned = !n.pinned; saveNotes(); refreshHome(); } },
      { label: 'Compartir como imagen', icon: 'share', fn: async () => { if (await Lock.reveal(n)) { Extras.shareNote(n); if (cur !== n) Lock.hide(n); } } },
      { label: n.lock ? 'Quitar candado' : 'Hacer privada', icon: n.lock ? 'unlock' : 'lock', fn: () => (n.lock ? Lock.remove(n) : Lock.add(n)) },
      { label: n.fav ? 'Quitar de favoritas' : 'Favorita', emoji: '💖', fn: () => { n.fav = !n.fav; saveNotes(); refreshHome(); if (n.fav) burstAt($(`.card[data-id="${id}"]`)); } },
      { label: 'Mover a carpeta…', icon: 'folder', fn: () => moveMenu(n, () => refreshHome()) },
      { label: 'Duplicar', icon: 'copy', fn: () => { duplicate(n); refreshHome(); } },
      { label: 'Eliminar', icon: 'trash', danger: true, fn: () => askDelete(n) },
    ],
  });
}
function moveMenu(n, done) {
  actionSheet({
    title: 'Mover a…',
    actions: [{ id: null, name: 'Sin carpeta', emoji: '✨' }, ...folders].map(f => ({
      label: `${f.name}${n.folder === f.id ? '  ✓' : ''}`, emoji: f.emoji,
      fn: () => { n.folder = f.id; n.updated = Date.now(); saveNotes(); done?.(); toast(`Movida a ${f.emoji} ${f.name}`); },
    })),
  });
}
function duplicate(n) {
  const c = structuredClone(n);
  Object.assign(c, { id: uid(), title: n.title ? n.title + ' (copia)' : '', pinned: false, created: Date.now(), updated: Date.now() });
  notes.push(c); saveNotes();
  toast('Nota duplicada 📄');
  return c;
}
async function askDelete(n, fromEditor = false) {
  const ok = await confirmBox({ title: '¿Eliminar esta nota?', message: 'No se puede deshacer.', ok: 'Eliminar', danger: true });
  if (!ok) return;
  if (fromEditor) closeEditor(true);
  const card = $(`.card[data-id="${n.id}"]`);
  const finish = () => { notes = notes.filter(x => x.id !== n.id); markDeleted(n.id); saveNotes(); refreshHome(); };
  if (card) { await sleep(fromEditor ? 450 : 0); card.classList.add('bye'); setTimeout(finish, 430); } else finish();
}

let qT;
$('#search').addEventListener('input', e => {
  clearTimeout(qT);
  qT = setTimeout(() => { query = e.target.value.trim(); renderList(true); }, 120);
});

$('#btn-new').addEventListener('click', e => {
  burstAt(e.currentTarget, ['✨', '💫', '🌸', '⭐'], 12);
  createNote(['all', 'favs'].includes(filter) ? null : filter, { fav: filter === 'favs' });
});
function todayEntry() {
  const k = Extras.dayKey(Date.now());
  const has = notes.find(n => n.folder === 'diario' && !n.lock && Extras.dayKey(n.created) === k);
  if (has) return openNote(has.id);
  const t = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  createNote(folders.some(f => f.id === 'diario') ? 'diario' : null, { title: t[0].toUpperCase() + t.slice(1), emoji: '📖' });
}
function createNote(folder, extra = {}) {
  const d = FOLDER_STYLE[folder] || {};
  const n = {
    id: uid(), title: '', html: '', folder,
    emoji: d.emoji || (folders.find(f => f.id === folder)?.emoji) || pick(['🌸', '✨', '🌙', '🌷', '💌', '🦋', '🍓', '☁️', '🌈']),
    paper: d.paper || pick(['rosa', 'lavanda', 'menta', 'cielo', 'crema', 'durazno']),
    font: d.font || 'clasica', pattern: d.pattern || 'none', align: d.align || 'left',
    stickers: [], song: null, pinned: false, fav: false, created: Date.now(), updated: Date.now(),
    ...extra,
  };
  notes.push(n);
  setTimeout(() => openNote(n.id, true), 140);
  return n;
}

const ed = $('#editor'), body = $('#ed-body'), titleEl = $('#ed-title'), paper = $('#paper'), tray = $('#tray');
let isNew = false;

function openNote(id, fresh = false) {
  const target = notes.find(n => n.id === id);
  if (!target) return;
  if (target.lock && !Lock.isOpen(target)) { Lock.reveal(target).then(ok => ok && openNote(id, fresh)); return; }
  cur = target;
  isNew = fresh;
  applyNoteStyle();
  $('#ed-cover').textContent = cur.emoji;
  titleEl.value = cur.title;
  body.innerHTML = cur.html;
  const ph = FOLDER_STYLE[cur.folder]?.ph || pick(['Escribe algo bonito…', 'Había una vez…', '¿Qué hay en tu cabeza hoy?', 'Empieza con una palabra…']);
  body.dataset.ph = ph;
  renderStickers(); renderSongCard(); updateFav(); updateMeta();
  autosize();
  $('#ed-scroll').scrollTop = 0;
  closeTray();
  ed.classList.add('open'); ed.setAttribute('aria-hidden', 'false');
  $('#stage').classList.add('behind');
  $('#scrim').classList.add('on');
  document.body.classList.add('editing');
  collapseIsland();
  if (fresh) setTimeout(() => titleEl.focus({ preventScroll: true }), 420);
}

function isEmpty(n) { return !n.title.trim() && !plain(n.html) && !n.stickers.length && !n.song; }

function closeEditor(skipRender = false) {
  if (!cur) return;
  closeTray();
  const n = cur;
  cur = null;
  document.activeElement?.blur();
  ed.classList.remove('open'); ed.setAttribute('aria-hidden', 'true');
  $('#stage').classList.remove('behind');
  $('#scrim').classList.remove('on');
  document.body.classList.remove('editing');
  if (isEmpty(n)) { notes = notes.filter(x => x.id !== n.id); markDeleted(n.id); }
  else if (n.lock) Lock.seal(n).then(ok => ok && Lock.hide(n));
  saveNotes();
  if (skipRender === true) return;
  refreshHome(isNew);
  requestAnimationFrame(() => $(`.card[data-id="${n.id}"]`)?.classList.add('pulse'));
}

function applyNoteStyle() {
  const p = PAPERS[cur.paper] || PAPERS.nube, f = FONTS[cur.font] || FONTS.clasica;
  ed.dataset.paper = cur.paper;
  ed.dataset.align = cur.align;
  ed.classList.toggle('stars', cur.paper === 'noche');
  ed.style.setProperty('--paper', p.c);
  ed.style.setProperty('--tint', p.t);
  ed.style.setProperty('--nf', f.f);
  ed.style.setProperty('--fs', f.s);
  paper.className = 'paper' + (cur.pattern !== 'none' ? ' pat-' + cur.pattern : '');
  tuneLines();
  document.fonts?.ready.then(() => requestAnimationFrame(tuneLines));
}

function tuneLines() {
  if (!cur || cur.pattern !== 'lines') return;
  const fs = parseFloat(getComputedStyle(body).fontSize) || 17;
  const lh = Math.round(clamp(fs * 1.8, 30, 38));
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;font-family:var(--nf);font-size:${fs}px;line-height:${lh}px`;
  probe.innerHTML = 'Hg<span style="display:inline-block;width:1px;height:0;vertical-align:baseline"></span>';
  paper.appendChild(probe);
  const base = probe.lastElementChild.offsetTop;
  probe.remove();
  body.style.setProperty('--lh', lh + 'px');
  body.style.setProperty('--base', base + 'px');
}

function touch() {
  if (!cur) return;
  cur.updated = Date.now();
  scheduleSave(); updateMeta(); markDay();
  if (cur.lock) Lock.sealSoon(cur);
}
function markDay() {
  const k = Extras.dayKey(Date.now()), days = store.get('notas.days', []);
  if (days[days.length - 1] === k || days.includes(k)) return;
  days.push(k);
  store.set('notas.days', days.slice(-3650));
}
function insertAtCaret(html, at) {
  if (!cur) return;
  body.focus({ preventScroll: true });
  const sel = getSelection();
  if (at) { const r = document.caretRangeFromPoint?.(at.x, at.y); if (r && body.contains(r.startContainer)) { sel.removeAllRanges(); sel.addRange(r); } }
  else if (savedRange && body.contains(savedRange.startContainer)) { sel.removeAllRanges(); sel.addRange(savedRange); }
  else placeCaretEnd(body);
  document.execCommand('insertHTML', false, html);
  bodyChanged();
}
function bodyChanged() { if (!cur) return; cur.html = body.innerHTML; touch(); }
function updateMeta() {
  if (!cur) return;
  const words = (plain(cur.html).match(/\S+/g) || []).length;
  const d = new Date(cur.updated).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const folder = folders.find(f => f.id === cur.folder);
  $('#ed-meta').textContent = `${d} · ${words} ${words === 1 ? 'palabra' : 'palabras'}${folder ? ' · ' + folder.emoji + ' ' + folder.name : ''}`;
}
function updateFav() { $('#ed-fav').classList.toggle('on', !!cur.fav); }
function autosize() { titleEl.style.height = 'auto'; titleEl.style.height = titleEl.scrollHeight + 'px'; }

$('#ed-back').addEventListener('click', () => closeEditor());
$('#scrim').addEventListener('click', () => closeEditor());

titleEl.addEventListener('input', () => { cur.title = titleEl.value.replace(/\n/g, ' '); autosize(); touch(); });
titleEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); body.focus(); placeCaretEnd(body); }
});
function placeCaretEnd(el) {
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

body.addEventListener('input', () => {
  if (/^(<(p|div)>)?<br>(<\/(p|div)>)?$/.test(body.innerHTML)) body.innerHTML = '';
  cur.html = body.innerHTML;
  touch();
});
body.addEventListener('paste', e => {
  e.preventDefault();
  const files = [...(e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
  if (files.length) { Extras.insertPhotos(files); return; }
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
});
$('#ed-scroll').addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.type.startsWith('image/'))) { e.preventDefault(); ed.classList.add('dropping'); } });
$('#ed-scroll').addEventListener('dragleave', () => ed.classList.remove('dropping'));
$('#ed-scroll').addEventListener('drop', e => {
  ed.classList.remove('dropping');
  const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  Extras.insertPhotos(files, { x: e.clientX, y: e.clientY });
});
const lockMedia = () => body.querySelectorAll('.media:not([contenteditable])').forEach(m => m.setAttribute('contenteditable', 'false'));
new MutationObserver(lockMedia).observe(body, { childList: true, subtree: true });
let mediaDown = null;
body.addEventListener('pointerdown', e => { mediaDown = e.target.closest?.('img.photo, img.sketch') ? [e.clientX, e.clientY] : null; });
body.addEventListener('click', e => {
  const img = e.target.closest('img.photo, img.sketch');
  if (!img || !mediaDown || Math.hypot(e.clientX - mediaDown[0], e.clientY - mediaDown[1]) > 8) return;
  e.preventDefault();
  Extras.openViewer(img);
});
body.addEventListener('click', e => {
  const li = e.target.closest('ul.checklist > li');
  if (!li) return;
  const r = li.getBoundingClientRect();
  if (e.clientX - r.left > 32) return;
  e.preventDefault();
  li.toggleAttribute('data-checked');
  if (li.hasAttribute('data-checked')) burst(r.left + 12, r.top + 14, ['✨', '💖', '⭐'], 7, 50);
  cur.html = body.innerHTML; touch();
});

$('#ed-fav').addEventListener('click', e => {
  cur.fav = !cur.fav; updateFav(); touch();
  if (cur.fav) burstAt(e.currentTarget, ['💖', '💗', '💕', '✨'], 14);
});

$('#ed-cover').addEventListener('click', () => openTray('cover'));

$('#ed-more').addEventListener('click', () => {
  const n = cur;
  actionSheet({
    actions: [
      { label: n.pinned ? 'Desfijar' : 'Fijar arriba', icon: 'pin', fn: () => { n.pinned = !n.pinned; touch(); toast(n.pinned ? 'Nota fijada 📌' : 'Nota desfijada'); } },
      { label: 'Mover a carpeta…', icon: 'folder', fn: () => moveMenu(n, updateMeta) },
      { label: 'Compartir como imagen', icon: 'share', fn: () => Extras.shareNote(n) },
      { label: n.lock ? 'Quitar candado' : 'Hacer privada', icon: n.lock ? 'unlock' : 'lock', fn: () => (n.lock ? Lock.remove(n) : Lock.add(n)) },
      { label: 'Copiar texto', icon: 'copy', fn: async () => {
        try { await navigator.clipboard.writeText(`${n.title}\n\n${plain(n.html)}`.trim()); toast('Texto copiado 📋'); } catch { toast('No se pudo copiar'); }
      } },
      { label: 'Descargar como .txt', icon: 'download', fn: () => download(`${(n.title || 'nota').replace(/[\\/:*?"<>|]/g, '')}.txt`, `${n.title}\n\n${plain(n.html)}`.trim(), 'text/plain') },
      { label: 'Duplicar', icon: 'copy', fn: () => { const c = duplicate(n); closeEditor(true); setTimeout(() => openNote(c.id), 450); } },
      { label: 'Eliminar nota', icon: 'trash', danger: true, fn: () => askDelete(n, true) },
    ],
  });
});

let trayMode = null, savedRange = null;

document.addEventListener('selectionchange', () => {
  const s = getSelection();
  if (s.rangeCount && body.contains(s.anchorNode)) {
    savedRange = s.getRangeAt(0).cloneRange();
    if (trayMode === 'format') updateFmtState();
  }
});
function restoreSel() {
  body.focus({ preventScroll: true });
  if (savedRange && body.contains(savedRange.startContainer)) {
    const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange);
  } else placeCaretEnd(body);
}
function exec(cmd, val) {
  restoreSel();
  document.execCommand(cmd, false, val);
  cur.html = body.innerHTML; touch();
  updateFmtState();
}
function closestInBody(node, sel) {
  const el = node?.nodeType === 1 ? node : node?.parentElement;
  const r = el?.closest(sel);
  return r && body.contains(r) ? r : null;
}
function toggleChecklist() {
  restoreSel();
  const ul = closestInBody(getSelection().anchorNode, 'ul');
  if (ul) {
    if (ul.classList.contains('checklist')) document.execCommand('insertUnorderedList');
    else ul.classList.add('checklist');
  } else {
    document.execCommand('insertUnorderedList');
    closestInBody(getSelection().anchorNode, 'ul')?.classList.add('checklist');
  }
  cur.html = body.innerHTML; touch();
}

[tray, $('#ed-tools')].forEach(el => el.addEventListener('mousedown', e => {
  if (!e.target.closest('input')) e.preventDefault();
}));

$('#ed-tools').addEventListener('click', e => {
  const b = e.target.closest('.tool');
  if (!b) return;
  const t = b.dataset.tool;
  if (t === 'check') { closeTray(); toggleChecklist(); return; }
  if (t === 'media') {
    closeTray();
    actionSheet({ actions: [
      { label: 'Foto o imagen', icon: 'image', fn: () => Extras.pickPhotos() },
      { label: 'Dibujar a mano', icon: 'pen', fn: () => Extras.openSketch() },
    ] });
    return;
  }
  trayMode === t ? closeTray() : openTray(t);
});

function openTray(mode) {
  trayMode = mode;
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === mode || (mode === 'cover' && b.dataset.tool === 'sticker')));
  tray.innerHTML = trayHTML(mode);
  hydrateIcons(tray);
  if (mode === 'format') updateFmtState();
  tray.classList.add('open');
}
function closeTray() {
  trayMode = null;
  tray.classList.remove('open');
  $$('.tool').forEach(b => b.classList.remove('on'));
}

function trayHTML(mode) {
  if (mode === 'format') return `
    <div class="tray-h">Formato</div>
    <div class="seg">
      <button data-block="h2">Título</button><button data-block="h3">Subtítulo</button>
      <button data-block="p">Texto</button><button data-block="blockquote">Cita</button>
    </div>
    <div class="fmt-row">
      <button class="fbtn" data-cmd="bold" title="Negrita"><i data-ic="bold"></i></button>
      <button class="fbtn" data-cmd="italic" title="Cursiva"><i data-ic="italic"></i></button>
      <button class="fbtn" data-cmd="underline" title="Subrayado"><i data-ic="underline"></i></button>
      <button class="fbtn" data-cmd="strikeThrough" title="Tachado"><i data-ic="strike"></i></button>
    </div>
    <div class="fmt-row">
      <button class="fbtn" data-cmd="insertUnorderedList" title="Lista"><i data-ic="list"></i></button>
      <button class="fbtn" data-act="check" title="Pendientes"><i data-ic="checks"></i></button>
      <button class="fbtn ${cur.align === 'left' ? 'on' : ''}" data-align="left" title="Alinear a la izquierda"><i data-ic="alignLeft"></i></button>
      <button class="fbtn ${cur.align === 'center' ? 'on' : ''}" data-align="center" title="Centrado (modo poema)"><i data-ic="alignCenter"></i></button>
    </div>`;
  if (mode === 'font') return `
    <div class="tray-h">Letra <small>se aplica a toda la nota</small></div>
    <div class="font-list">${Object.entries(FONTS).map(([k, f]) => `
      <button class="font-opt ${cur.font === k ? 'on' : ''}" data-font="${k}">
        <span class="s" style="font-family:${f.f};font-size:${Math.round(26 * f.s)}px">Aa</span><span class="n">${f.name}</span>
      </button>`).join('')}
    </div>`;
  if (mode === 'paper') return `
    <div class="tray-h">Papel</div>
    <div class="swatches">${Object.entries(PAPERS).map(([k, p]) => `
      <button class="sw ${cur.paper === k ? 'on' : ''}" data-paper="${k}" title="${p.name}" style="--c:${p.c}"></button>`).join('')}
    </div>
    <div class="tray-sub">Estilo de hoja</div>
    <div class="seg">${Object.entries(PATTERNS).map(([k, v]) => `<button data-pattern="${k}" class="${cur.pattern === k ? 'on' : ''}">${v}</button>`).join('')}</div>`;
  if (mode === 'sticker' || mode === 'cover') return `
    <div class="tray-h">${mode === 'cover' ? 'Ícono de la nota' : 'Stickers'} <small>${mode === 'cover' ? 'elige uno' : 'arrastra · doble toque para quitar'}</small></div>
    <div class="emoji-grid">${EMOJI.map(e => `<button class="emo" data-emo="${e}">${e}</button>`).join('')}</div>`;
  return '';
}

function updateFmtState() {
  if (trayMode !== 'format') return;
  $$('[data-cmd]', tray).forEach(b => {
    let on = false;
    try { on = document.queryCommandState(b.dataset.cmd); } catch {}
    b.classList.toggle('on', on);
  });
  const block = (() => { try { return document.queryCommandValue('formatBlock').toLowerCase(); } catch { return ''; } })();
  const inCheck = !!closestInBody(getSelection().anchorNode, 'ul.checklist');
  $('[data-act="check"]', tray)?.classList.toggle('on', inCheck);
  if (inCheck) $('[data-cmd="insertUnorderedList"]', tray)?.classList.remove('on');
  $$('[data-block]', tray).forEach(b => b.classList.toggle('on', block === b.dataset.block || (b.dataset.block === 'p' && ['div', 'p', ''].includes(block))));
}

tray.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !cur) return;
  const d = b.dataset;
  if (d.cmd) exec(d.cmd);
  else if (d.block) exec('formatBlock', `<${d.block}>`);
  else if (d.act === 'check') { toggleChecklist(); updateFmtState(); }
  else if (d.align) {
    cur.align = d.align; applyNoteStyle(); touch();
    $$('[data-align]', tray).forEach(x => x.classList.toggle('on', x === b));
  } else if (d.font) {
    cur.font = d.font; applyNoteStyle(); touch(); autosize();
    $$('.font-opt', tray).forEach(x => x.classList.toggle('on', x === b));
  } else if (d.paper) {
    cur.paper = d.paper; applyNoteStyle(); touch();
    $$('.sw', tray).forEach(x => x.classList.toggle('on', x === b));
  } else if (d.pattern) {
    cur.pattern = d.pattern; applyNoteStyle(); touch();
    $$('[data-pattern]', tray).forEach(x => x.classList.toggle('on', x === b));
  } else if (d.emo) {
    if (trayMode === 'cover') {
      cur.emoji = d.emo; touch();
      const c = $('#ed-cover'); c.textContent = d.emo; c.classList.remove('swap'); void c.offsetWidth; c.classList.add('swap');
      closeTray();
    } else addSticker(d.emo);
  }
});

const layer = $('#stickers');
let stickerHint = store.get('notas.stickerHint', false);

function renderStickers(popIndex = -1) {
  layer.innerHTML = cur.stickers.map((s, i) =>
    `<span class="stk ${i === popIndex ? 'pop' : ''}" data-i="${i}" style="left:${s.x * 100}%;top:${s.y}px;--r:${s.r}deg;font-size:${s.s}px">${esc(s.e)}</span>`).join('');
}
function addSticker(e) {
  const sc = $('#ed-scroll');
  const y = sc.scrollTop + sc.clientHeight * rnd(.25, .5) - paper.offsetTop;
  cur.stickers.push({ e, x: +rnd(.18, .82).toFixed(3), y: Math.round(y), r: Math.round(rnd(-20, 20)), s: Math.round(rnd(38, 58)) });
  renderStickers(cur.stickers.length - 1);
  touch();
  if (!stickerHint) { stickerHint = true; store.set('notas.stickerHint', true); toast('Arrástralo donde quieras · doble toque para quitarlo'); }
}
function removeSticker(i, el) {
  el.classList.add('bye');
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, ['💨', '✨'], 6, 40);
  setTimeout(() => { cur.stickers.splice(i, 1); renderStickers(); touch(); }, 330);
}
let lastTap = { t: 0, i: -1 };
layer.addEventListener('pointerdown', e => {
  const el = e.target.closest('.stk');
  if (!el) return;
  e.preventDefault();
  const i = +el.dataset.i, s = cur.stickers[i];
  const pr = paper.getBoundingClientRect();
  const x0 = e.clientX, y0 = e.clientY;
  let moved = false;
  el.setPointerCapture(e.pointerId);
  el.classList.remove('pop');
  el.classList.add('drag');
  const move = ev => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) moved = true;
    if (!moved) return;
    s.x = +clamp((ev.clientX - pr.left) / pr.width, .03, .97).toFixed(3);
    s.y = Math.round(Math.max(16, ev.clientY - pr.top));
    el.style.left = s.x * 100 + '%';
    el.style.top = s.y + 'px';
  };
  const up = () => {
    el.removeEventListener('pointermove', move);
    el.classList.remove('drag');
    if (moved) { touch(); return; }
    const now = Date.now();
    if (now - lastTap.t < 380 && lastTap.i === i) { lastTap = { t: 0, i: -1 }; removeSticker(i, el); }
    else lastTap = { t: now, i };
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up, { once: true });
  el.addEventListener('pointercancel', up, { once: true });
});
layer.addEventListener('wheel', e => {
  const el = e.target.closest('.stk');
  if (!el) return;
  e.preventDefault();
  const s = cur.stickers[+el.dataset.i];
  s.s = Math.round(clamp(s.s - e.deltaY * .06, 22, 130));
  el.style.fontSize = s.s + 'px';
  touch();
}, { passive: false });

function renderSongCard() {
  const c = $('#ed-songcard'), s = cur.song;
  $('#ed-song').classList.toggle('has-song', !!s);
  if (!s) { c.hidden = true; c.innerHTML = ''; return; }
  c.hidden = false;
  c.innerHTML = `<img src="${esc(s.art)}" alt=""><div class="nm"><div class="t">${esc(s.name)}</div><div class="a">${esc(s.artist)}</div></div><span class="pb">${ic('play')}</span>`;
}
$('#ed-songcard').addEventListener('click', () => cur?.song && Music.playSong(cur.song));
$('#ed-song').addEventListener('click', () => {
  const n = cur;
  if (!n.song) return attachCurrentSong();
  actionSheet({
    title: `${n.song.name} · ${n.song.artist}`,
    actions: [
      { label: 'Reproducir', icon: 'play', fn: () => Music.playSong(n.song) },
      { label: 'Cambiar por la que suena', icon: 'music', fn: attachCurrentSong },
      { label: 'Quitar canción', icon: 'x', danger: true, fn: () => { n.song = null; renderSongCard(); touch(); } },
    ],
  });
});
function attachCurrentSong() {
  if (!Spotify.isConnected()) { toast('Primero conecta tu Spotify 🎧'); openMusic(); return; }
  const t = Music.track();
  if (!t) { toast('No hay ninguna canción sonando ahora'); return; }
  cur.song = { uri: t.uri, name: t.name, artist: Music.artist(t), art: Music.art(t, 'md'), context: Music.st?.context?.uri || null };
  renderSongCard(); touch();
  const r = $('#ed-song').getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, ['🎵', '🎶', '✨'], 10);
  toast('Canción guardada en la nota 🎶');
}

const fx = $('#fx');
function burst(x, y, chars = ['💖', '✨'], n = 10, dist = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    const a = (Math.PI * 2 * i) / n + rnd(-.3, .3), d = rnd(dist * .5, dist);
    s.textContent = pick(chars);
    s.style.cssText = `--x:${x}px;--y:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px;--rot:${rnd(-90, 90)}deg;--s:${rnd(12, 22)}px;--d:${rnd(700, 1100)}ms`;
    fx.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  }
}
function burstAt(el, chars, n) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, chars, n);
}

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

function actionSheet({ title, actions }) {
  const w = document.createElement('div');
  w.className = 'as-wrap';
  w.innerHTML = `<div class="as">
    <div class="as-group">${title ? `<div class="as-title">${esc(title)}</div>` : ''}${actions.map((a, i) => `
      <button class="as-btn ${a.danger ? 'danger' : ''}" data-i="${i}">${a.icon ? ic(a.icon) : a.emoji ? `<span class="em">${esc(a.emoji)}</span>` : ''}${esc(a.label)}</button>`).join('')}
    </div>
    <div class="as-group"><button class="as-btn as-cancel">Cancelar</button></div>
  </div>`;
  document.body.appendChild(w);
  requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('on')));
  const close = () => { w.classList.remove('on'); setTimeout(() => w.remove(), 450); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  w.addEventListener('click', e => {
    const b = e.target.closest('.as-btn');
    if (!b && e.target.closest('.as')) return;
    close();
    if (b?.dataset.i != null) setTimeout(() => actions[+b.dataset.i].fn(), 180);
  });
}

function dialog({ title, message, input, value = '', placeholder = '', ok = 'OK', cancel = 'Cancelar', danger, secret }) {
  return new Promise(res => {
    const w = document.createElement('div');
    w.className = 'al-wrap';
    w.innerHTML = `<div class="al" role="dialog">
      <h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : '<p></p>'}
      ${input ? `<input value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="40" ${secret ? 'type="password" inputmode="numeric" autocomplete="off" class="pin"' : ''}>` : ''}
      <div class="al-btns"><button data-v="0">${esc(cancel)}</button><button data-v="1" class="${danger ? 'danger' : ''}">${esc(ok)}</button></div>
    </div>`;
    document.body.appendChild(w);
    const inp = $('input', w);
    requestAnimationFrame(() => requestAnimationFrame(() => { w.classList.add('on'); inp?.focus(); inp?.select(); }));
    const done = v => {
      w.classList.remove('on'); setTimeout(() => w.remove(), 300);
      document.removeEventListener('keydown', onKey, true);
      res(v ? (input ? inp.value : true) : (input ? null : false));
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
    };
    document.addEventListener('keydown', onKey, true);
    w.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); });
  });
}
const prompt = o => dialog({ ...o, input: true, ok: o.ok || 'Guardar' });
const confirmBox = o => dialog(o);

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let sheetOpen = null;
function openSheet(id) {
  closeTray();
  if (sheetOpen && sheetOpen.id !== id) sheetOpen.classList.remove('open');
  sheetOpen = $('#' + id);
  sheetOpen.classList.add('open');
  $('#scrim-top').classList.add('on');
  document.body.classList.add('sheet-open');
  if (!cur) $('#stage').classList.add('behind');
  collapseIsland();
}
function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen.classList.remove('open');
  sheetOpen = null;
  $('#scrim-top').classList.remove('on');
  document.body.classList.remove('sheet-open');
  if (!cur) $('#stage').classList.remove('behind');
}
$('#scrim-top').addEventListener('click', closeSheet);
$$('[data-close]').forEach(b => b.addEventListener('click', closeSheet));
$$('.sheet').forEach(enableSheetDrag);
function enableSheetDrag(sh) {
  const g = $('.sheet-grab', sh);
  let y0 = 0, dy = 0, drag = false;
  g.addEventListener('pointerdown', e => { drag = true; y0 = e.clientY; dy = 0; sh.style.transition = 'none'; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointermove', e => {
    if (!drag) return;
    dy = Math.max(0, e.clientY - y0);
    sh.style.transform = `translate(-50%, ${dy}px)`;
  });
  const end = () => {
    if (!drag) return;
    drag = false;
    sh.style.transition = ''; sh.style.transform = '';
    if (dy > 110) closeSheet();
  };
  g.addEventListener('pointerup', end);
  g.addEventListener('pointercancel', end);
}

$('#btn-settings').addEventListener('click', () => { renderSettings(); openSheet('settings'); });
$('#btn-diary').addEventListener('click', () => Extras.openDiary());
function renderSettings() {
  $('#set-name').value = settings.name;
  $$('#set-theme button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.theme));
  $$('#set-motion button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.motion));
  $('#set-motion-sub').textContent = Perf.describe();
  Lock.hasPin().then(h => ($('#set-pin-status').textContent = h ? 'Cambiar PIN' : 'Crear PIN'));
  $('#set-accent').innerHTML = ACCENTS.map(c => `<button class="dot ${c === settings.accent ? 'on' : ''}" data-c="${c}" style="--c:${c}" title="${c}"></button>`).join('');
  $('#set-sp-status').textContent = Spotify.isRemote
    ? (Music.st ? 'A través de tu PC ✓' : 'Se conecta en tu PC')
    : Spotify.isConnected() ? 'Conectado ✓' : 'Sin conectar';
  renderRemote();
}
$('#set-name').addEventListener('input', e => { settings.name = e.target.value.trim(); saveSettings(); renderHeader(); });
$('#set-theme').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  settings.theme = b.dataset.v; saveSettings(); applyTheme(); renderSettings();
});
$('#set-motion').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  settings.motion = b.dataset.v; saveSettings(); Perf.apply(); renderSettings();
  toast({ auto: 'Automático ✨ la app elige según tu PC y la batería', fluid: 'Animaciones fluidas ✨ (60 cuadros)', eco: 'Modo ahorro 🍃 (liviano para portátiles)' }[settings.motion]);
});
$('#set-pin').addEventListener('click', () => Lock.changePin());
$('#set-accent').addEventListener('click', e => {
  const b = e.target.closest('.dot'); if (!b) return;
  settings.accent = b.dataset.c; saveSettings(); applyTheme(); renderSettings();
  burstAt(b, ['✨', '💫'], 8);
});
$('#set-spotify').addEventListener('click', () => openMusic());
$('#set-export').addEventListener('click', () => {
  download(`mis-notas-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'mis-notas', v: 1, notes: notes.map(persistable), folders, settings }, null, 2), 'application/json');
  toast('Copia de seguridad descargada 💾');
});
$('#set-import').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.notes)) throw 0;
    const byId = new Map(notes.map(n => [n.id, n]));
    data.notes.filter(n => n && typeof n === 'object').map(normalize).forEach(n => byId.set(n.id, n));
    notes = [...byId.values()];
    (data.folders || []).forEach(fd => {
      if (fd && typeof fd.id === 'string' && /^[\w-]{1,40}$/.test(fd.id) && !folders.some(x => x.id === fd.id))
        folders.push({ id: fd.id, name: String(fd.name || 'Carpeta').slice(0, 40), emoji: String(fd.emoji || '📁').slice(0, 16) });
    });
    saveNotes(); saveFolders(); refreshHome(true);
    toast(`Importé ${data.notes.length} notas ✨`);
  } catch { toast('Ese archivo no parece una copia de Mis Notas'); }
});

const island = $('#island');
const Music = {
  st: null, at: 0, volLock: 0, lastVol: 50, lastId: null, timer: null,
  track() { return this.st?.item || null; },
  artist(t) { return t?.artists?.map(a => a.name).join(', ') || t?.show?.name || ''; },
  art(t, size = 'sm') {
    const imgs = t?.album?.images || t?.images || t?.show?.images || [];
    if (!imgs.length) return '';
    if (size === 'lg') return imgs[0].url;
    return size === 'sm' ? imgs[imgs.length - 1].url : (imgs[1] || imgs[0]).url;
  },
  pos() {
    const s = this.st;
    if (!s?.item) return 0;
    let p = s.progress_ms || 0;
    if (s.is_playing) p += performance.now() - this.at;
    return Math.min(p, s.item.duration_ms);
  },
  async poll() {
    clearTimeout(this.timer);
    if (Spotify.isConnected() && !document.hidden) {
      try {
        const t0 = performance.now();
        const s = await Spotify.state();
        this.set(s, (t0 + performance.now()) / 2);
      } catch (e) { this.err(e, true); }
    }
    const fast = island.classList.contains('expanded') || sheetOpen?.id === 'music' || LyricsView.isOpen();
    this.timer = setTimeout(() => this.poll(), LyricsView.isOpen() ? 1500 : fast ? 2000 : 4500);
  },
  set(s, at = performance.now()) {
    const prev = this.st;
    if (s?.item && prev?.item && s.item.id === prev.item.id && s.is_playing && prev.is_playing) {
      const predicted = (prev.progress_ms || 0) + (at - this.at);
      const diff = s.progress_ms - predicted;
      if (Math.abs(diff) < 350) s.progress_ms = Math.round(predicted + diff * .35);
    }
    this.st = s; this.at = at; renderIsland();
  },
  soon(ms = 500) { clearTimeout(this.timer); this.timer = setTimeout(() => this.poll(), ms); },
  async act(fn, optimistic) {
    if (optimistic && this.st) { optimistic(this.st); this.at = performance.now(); renderIsland(); }
    try { await fn(); } catch (e) { this.err(e); }
    this.soon();
  },
  err(e, silent) {
    const r = e?.reason, st = e?.status;
    if (r === 'NOT_CONNECTED' || r === 'AUTH') { renderIsland(); if (!silent && r === 'AUTH') toast('Tu sesión de Spotify venció, vuelve a conectar'); return; }
    if (silent) return;
    if (r === 'NO_DEVICE') toast('Abre Spotify en tu compu o celular primero 🎧');
    else if (r === 'PREMIUM_REQUIRED') toast('Controlar la música necesita Spotify Premium');
    else if (r === 'VOLUME_CONTROL_DISALLOW') toast('Ese dispositivo no deja cambiar el volumen');
    else if (st === 403) toast('Spotify no permitió eso (¿Premium o el dispositivo lo bloquea?)');
    else if (st === 429) toast('Vamos muy rápido, espera un segundito ⏳');
    else toast('Spotify: ' + (e?.message || 'algo salió mal'));
  },
  playSong(song) {
    if (!Spotify.isConnected()) { toast('Primero conecta tu Spotify 🎧'); openMusic(); return; }
    const body = song.context && !song.context.includes(':artist:')
      ? { context_uri: song.context, offset: { uri: song.uri } }
      : { uris: [song.uri] };
    this.act(() => Spotify.play(body).catch(() => Spotify.play({ uris: [song.uri] })));
    toast(`▶ ${song.name}`);
  },
};

const fmt = ms => { const s = Math.floor((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function renderIsland() {
  const on = Spotify.isConnected();
  const s = Music.st, t = Music.track();
  const playing = !!(t && s.is_playing);
  island.classList.toggle('off', !on);
  island.classList.toggle('idle', on && !t);
  island.classList.toggle('has', !!t);
  island.classList.toggle('playing', playing);
  document.body.classList.toggle('sp-playing', playing);
  document.body.classList.toggle('sp-has', !!t);

  $('.isl-title', island).textContent = !on ? 'Conectar Spotify' : t ? `${t.name} · ${Music.artist(t)}` : 'Nada sonando';

  if (t) {
    if (t.id !== Music.lastId) {
      const first = Music.lastId === null;
      Music.lastId = t.id;
      const setSrc = (img, url) => (url ? (img.src = url) : img.removeAttribute('src'));
      setSrc($('.isl-art img', island), Music.art(t, 'sm'));
      setSrc($('.pl-cover', island), Music.art(t, 'md'));
      const nm = $('.pl-name', island);
      nm.classList.remove('long');
      nm.firstElementChild.textContent = t.name;
      requestAnimationFrame(() => {
        if (nm.firstElementChild.scrollWidth > nm.clientWidth + 2) {
          nm.firstElementChild.textContent = `${t.name}  ${t.name}`;
          nm.style.setProperty('--dur', Math.max(8, t.name.length * .35) + 's');
          nm.classList.add('long');
        }
      });
      $('.pl-artist', island).textContent = Music.artist(t);
      artColor(Music.art(t, 'sm')).then(c => island.style.setProperty('--sp', c || '#1ED760'));
      if (!first) { island.classList.remove('bump'); void island.offsetWidth; island.classList.add('bump'); }
      if (sheetOpen?.id === 'music') markNowPlaying();
    }
    $('[data-sp="shuffle"]', island).classList.toggle('on', !!s.shuffle_state);
    const rp = $('[data-sp="repeat"]', island);
    rp.classList.toggle('on', s.repeat_state !== 'off');
    rp.innerHTML = ic(s.repeat_state === 'track' ? 'repeat1' : 'repeat');
    const v = s.device?.volume_percent;
    if (v != null && Date.now() > Music.volLock) setVolUI(v);
    $('.pl-dev', island).textContent = s.device?.name || '';
    tickProgress();
  } else {
    Music.lastId = null;
    island.style.removeProperty('--sp');
    const msg = $('.isl-msg', island);
    if (!on && Spotify.isRemote) {
      $('.msg-t', msg).textContent = 'Tu música, desde la PC';
      $('.msg-s', msg).textContent = 'Conecta Spotify en la app Mis Notas de tu PC y aquí podrás manejarla.';
      $('.msg-btns', msg).innerHTML = '';
    } else if (!on) {
      $('.msg-t', msg).textContent = 'Tu música, aquí arriba';
      $('.msg-s', msg).textContent = 'Conecta Spotify para ver qué suena, cambiar canción, buscar y subir el volumen.';
      $('.msg-btns', msg).innerHTML = `<button class="pill green" data-sp="open">${ic('spotify')}Conectar</button>`;
    } else {
      $('.msg-t', msg).textContent = 'No hay nada sonando';
      $('.msg-s', msg).textContent = 'Abre Spotify en algún dispositivo o busca algo para escuchar.';
      $('.msg-btns', msg).innerHTML = `<button class="pill green" data-sp="open">${ic('search')}Buscar música</button>`;
    }
  }
}

function tickProgress() {
  const t = Music.track();
  if (!t || !island.classList.contains('expanded')) return;
  const p = Music.pos();
  $('.pl-fill', island).style.transform = `scaleX(${Math.min(1, p / t.duration_ms)})`;
  $('.t0', island).textContent = fmt(p);
  $('.t1', island).textContent = '-' + fmt(t.duration_ms - p);
}
setInterval(() => {
  tickProgress();
  const t = Music.track();
  if (t && Music.st.is_playing && Music.pos() >= t.duration_ms - 200) Music.soon(700);
}, 500);

function setVolUI(v) {
  const r = $('.range', island);
  r.value = v;
  r.style.setProperty('--v', v + '%');
  $('.pl-mute', island).innerHTML = ic(v == 0 ? 'volOff' : v < 45 ? 'volLow' : 'vol');
}

function artColor(url) {
  return new Promise(res => {
    if (!url) return res(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 16;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const wt = (mx - mn) / 255 * (mx / 255) + .02;
          r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
        }
        res(`rgb(${Math.round(r / w)},${Math.round(g / w)},${Math.round(b / w)})`);
      } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

function expandIsland() {
  if (island.classList.contains('expanded')) return;
  island.classList.add('expanded');
  tickProgress();
  Music.soon(50);
}
function collapseIsland() { island.classList.remove('expanded'); }

island.addEventListener('click', e => {
  const b = e.target.closest('[data-sp]');
  if (!island.classList.contains('expanded')) { expandIsland(); return; }
  if (!b) return;
  switch (b.dataset.sp) {
    case 'open': collapseIsland(); openMusic(); break;
    case 'lyrics': collapseIsland(); openLyrics(); break;
    case 'toggle': togglePlay(); break;
    case 'next': Music.act(() => Spotify.next()); break;
    case 'prev':
      if (Music.pos() > 4000) Music.act(() => Spotify.seek(0), s => { s.progress_ms = 0; });
      else Music.act(() => Spotify.prev());
      break;
    case 'shuffle': Music.act(() => Spotify.shuffle(!Music.st.shuffle_state), s => { s.shuffle_state = !s.shuffle_state; }); break;
    case 'repeat': {
      const nx = { off: 'context', context: 'track', track: 'off' }[Music.st.repeat_state] || 'off';
      Music.act(() => Spotify.repeat(nx), s => { s.repeat_state = nx; });
      break;
    }
    case 'mute': {
      const v = +$('.range', island).value;
      const nv = v > 0 ? 0 : (Music.lastVol || 50);
      if (v > 0) Music.lastVol = v;
      setVolUI(nv); Music.volLock = Date.now() + 2500;
      Music.act(() => Spotify.volume(nv));
      break;
    }
  }
  if (b.classList.contains('pl-btn') || b.classList.contains('pl-mute')) b.animate?.([{ transform: 'scale(.8)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'cubic-bezier(.34,1.56,.64,1)' });
});
function togglePlay() {
  if (Music.st?.is_playing) Music.act(() => Spotify.pause(), s => { s.progress_ms = Music.pos(); s.is_playing = false; });
  else Music.act(() => Spotify.play(), s => { s.is_playing = true; });
}
island.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === island) { e.preventDefault(); expandIsland(); } });

$('.pl-bar', island).addEventListener('click', e => {
  const t = Music.track();
  if (!t) return;
  const r = e.currentTarget.getBoundingClientRect();
  const ms = clamp((e.clientX - r.left) / r.width, 0, 1) * t.duration_ms;
  Music.act(() => Spotify.seek(ms), s => { s.progress_ms = ms; });
});
let volT;
$('.range', island).addEventListener('input', e => {
  const v = +e.target.value;
  setVolUI(v);
  Music.volLock = Date.now() + 2500;
  clearTimeout(volT);
  volT = setTimeout(() => Spotify.volume(v).catch(err => Music.err(err)), 220);
});
document.addEventListener('pointerdown', e => {
  if (island.classList.contains('expanded') && !island.contains(e.target) && !e.target.closest('.as-wrap,.al-wrap')) collapseIsland();
});

function openLyrics() {
  closeTray();
  collapseIsland();
  LyricsView.open();
  Music.soon(50);
}
$('#btn-lyrics').addEventListener('click', openLyrics);

function saveQuote(text, t) {
  let n = notes.find(x => x.id === store.get('notas.quotesNote', null));
  if (!n) {
    n = {
      id: uid(), title: 'Frases de canciones', html: '', folder: folders.some(f => f.id === 'lindas') ? 'lindas' : null,
      emoji: '🎶', paper: 'lavanda', font: 'poetica', pattern: 'none', align: 'center',
      stickers: [{ e: '💿', x: .86, y: 44, r: 10, s: 42 }], song: null, pinned: false, fav: false, created: Date.now(), updated: Date.now(),
    };
    notes.push(n);
    store.set('notas.quotesNote', n.id);
  }
  n.html += `<blockquote>${esc(text)}</blockquote><p>♪ ${esc(t.name)} · ${esc(Music.artist(t))}</p><p><br></p>`;
  n.updated = Date.now();
  if (cur?.id === n.id) body.innerHTML = n.html;
  saveNotes();
  refreshHome();
  toast('Frase guardada en “Frases de canciones” 💌');
}

$('#btn-music').addEventListener('click', () => {
  if (Spotify.isConnected() && Music.track()) expandIsland();
  else openMusic();
});

const mBody = $('#music-body');
let mQuery = '', mCache = { pls: null, me: null };

function openMusic() {
  openSheet('music');
  $('#sp-q').value = mQuery;
  renderMusic();
  Music.soon(100);
}

function renderMusic() {
  const connected = Spotify.isConnected();
  $('#music-search').hidden = !connected;
  if (!connected) { mBody.innerHTML = setupHTML(); hydrateIcons(mBody); return; }
  if (mQuery) return doSearch(mQuery);
  renderMusicHome();
}

function setupHTML() {
  if (Spotify.isRemote) return `
    <div class="setup-hero">
      <div class="logo"><i data-ic="spotify"></i></div>
      <h3>Tu Spotify vive en la PC</h3>
      <p>Abre <b>Mis Notas</b> en tu PC y conecta Spotify ahí (isla negra → Conectar).<br>En cuanto lo hagas, aquí podrás cambiar canciones, buscar y subir el volumen ✨</p>
    </div>`;
  const good = 'http://127.0.0.1:5173/';
  const bad = Spotify.redirectUri() !== good;
  return `
    ${bad ? `<div class="warn">⚠️ Estás abriendo la app desde <b>${esc(location.protocol === 'file:' ? 'el archivo directo' : location.origin)}</b> y Spotify no lo va a aceptar.
      Abre <b>iniciar.bat</b> y entra por <a href="${good}">${good}</a>; conecta desde ahí.</div>` : ''}
    <div class="setup-hero">
      <div class="logo"><i data-ic="spotify"></i></div>
      <h3>Conecta tu Spotify</h3>
      <p>Solo se hace una vez y toma 2 minutos ✨</p>
    </div>
    <div class="steps">
      <div class="step" style="--i:0"><div>Entra a <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a> con tu cuenta de Spotify y toca <b>Create app</b>.</div></div>
      <div class="step" style="--i:1"><div>Ponle cualquier nombre (ej. “Mis Notas”), marca <b>Web API</b> y en <b>Redirect URI</b> pega esto:
        <div class="code"><span id="sp-redirect">${esc(Spotify.redirectUri())}</span><button id="sp-copy" title="Copiar">${ic('copy')}</button></div></div></div>
      <div class="step" style="--i:2"><div>Guarda, abre la app y copia el <b>Client ID</b>. Pégalo aquí:
        <input class="field" id="sp-client" placeholder="Client ID" value="${esc(Spotify.clientId())}" autocomplete="off" spellcheck="false"></div></div>
    </div>
    <button class="btn sp" id="sp-login">${ic('spotify')}Conectar con Spotify</button>
    <p class="note">Para cambiar canciones y volumen necesitas <b>Spotify Premium</b> y tener Spotify abierto en algún dispositivo. Nada de esto sale de tu equipo 💖</p>`;
}

mBody.addEventListener('click', async e => {
  const b = e.target.closest('button, .row, .plc');
  if (!b) return;
  if (b.id === 'sp-copy') {
    try { await navigator.clipboard.writeText(Spotify.redirectUri()); toast('Copiado 📋'); } catch { toast('No se pudo copiar'); }
  } else if (b.id === 'sp-login') {
    const id = $('#sp-client').value.trim();
    if (!/^[0-9a-f]{32}$/i.test(id)) { toast('Ese Client ID no parece correcto (son 32 letras/números)'); $('#sp-client').focus(); return; }
    Spotify.setClientId(id);
    b.textContent = 'Abriendo Spotify…';
    Spotify.login().catch(err => toast(err.message));
  } else if (b.id === 'sp-logout') {
    const ok = await confirmBox({ title: '¿Desconectar Spotify?', message: 'Puedes volver a conectarlo cuando quieras.', ok: 'Desconectar', danger: true });
    if (!ok) return;
    Spotify.logout(); Music.st = null; mCache = { pls: null, me: null };
    renderIsland(); renderMusic();
  } else if (b.dataset.refresh != null) {
    renderMusicHome();
  } else if (b.dataset.dev) {
    Music.act(() => Spotify.transfer(b.dataset.dev, true));
    toast('Cambiando a ' + b.querySelector('.t').textContent + ' 🔊');
    setTimeout(renderMusicHome, 1200);
  } else if (b.dataset.uri) {
    const body = b.dataset.ctx ? { context_uri: b.dataset.ctx, offset: { uri: b.dataset.uri } } : { uris: [b.dataset.uri] };
    Music.act(() => Spotify.play(body));
    toast('▶ ' + (b.querySelector('.t')?.textContent || ''));
    b.animate?.([{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 300 });
  } else if (b.dataset.ctxplay) {
    Music.act(() => Spotify.play({ context_uri: b.dataset.ctxplay }));
    toast('▶ ' + (b.querySelector('.t')?.textContent || 'Playlist'));
  }
});

async function renderMusicHome() {
  mBody.innerHTML = `
    <div class="me-row" id="sp-me"><div class="ph skel"></div><div class="nm">Spotify<small>Conectado</small></div>
      <button class="link-btn" id="sp-logout">${ic('logout')}Desconectar</button></div>
    <div class="m-sec">Dispositivos <button data-refresh>Actualizar</button></div>
    <div id="sp-devs">${'<div class="row"><div class="ph skel"></div><div class="rt"><div class="skel" style="height:14px;width:50%"></div></div></div>'.repeat(2)}</div>
    <div class="m-sec">Tus playlists</div>
    <div class="pl-grid" id="sp-pls">${'<div class="plc"><div class="im skel"></div></div>'.repeat(6)}</div>`;
  const meEl = $('#sp-me'), devEl = $('#sp-devs'), plEl = $('#sp-pls');
  const alive = el => document.contains(el);
  try {
    mCache.me ||= await Spotify.me();
    if (!alive(meEl)) return;
    const me = mCache.me, img = me.images?.[0]?.url;
    $('.ph', meEl)?.replaceWith(Object.assign(document.createElement(img ? 'img' : 'div'), img ? { src: img, alt: '' } : { className: 'ph', textContent: '🎧' }));
    $('.nm', meEl).innerHTML = `${esc(me.display_name || 'Tu cuenta')}<small>Conectado${me.product ? ' · ' + esc(me.product === 'premium' ? 'Premium' : me.product) : ''}</small>`;
  } catch (e) { Music.err(e, true); }
  try {
    const ds = await Spotify.devices();
    if (!alive(devEl)) return;
    const devIcon = t => t === 'Smartphone' ? 'phone' : t === 'Computer' ? 'laptop' : 'speaker';
    devEl.innerHTML = ds.length
      ? ds.map((d, i) => `<div class="row dev ${d.is_active ? 'now' : ''}" data-dev="${esc(d.id)}" style="--i:${i}">
          <div class="ph">${ic(devIcon(d.type))}</div>
          <div class="rt"><div class="t">${esc(d.name)}</div><div class="s">${d.is_active ? 'Sonando aquí' : esc(d.type)}${d.volume_percent != null ? ' · vol ' + d.volume_percent + '%' : ''}</div></div>
          ${d.is_active ? `<span class="go">${ic('check')}</span>` : ''}</div>`).join('')
      : `<div class="m-empty">No veo dispositivos 🙈<br>Abre Spotify en tu compu o celular y toca “Actualizar”.</div>`;
  } catch (e) { devEl.innerHTML = `<div class="m-empty">No pude ver los dispositivos</div>`; Music.err(e, true); }
  try {
    mCache.pls ||= (await Spotify.playlists())?.items?.filter(Boolean) || [];
    const pls = mCache.pls;
    if (!alive(plEl)) return;
    plEl.innerHTML = pls.length
      ? pls.map((p, i) => `<div class="plc" data-ctxplay="${esc(p.uri)}" style="--i:${i}">
          ${p.images?.[0]?.url ? `<img class="im" src="${esc(p.images[0].url)}" alt="" loading="lazy">` : '<div class="im"></div>'}
          <div class="t">${esc(p.name)}</div><div class="s">${p.tracks?.total ?? p.items?.total ?? ''} canciones</div></div>`).join('')
      : `<div class="m-empty">Aún no tienes playlists</div>`;
  } catch (e) { plEl.innerHTML = `<div class="m-empty">No pude cargar tus playlists</div>`; Music.err(e, true); }
}

let sT, sSeq = 0;
$('#sp-q').addEventListener('input', e => {
  clearTimeout(sT);
  mQuery = e.target.value.trim();
  sT = setTimeout(() => mQuery ? doSearch(mQuery) : renderMusicHome(), 320);
});
async function doSearch(q) {
  const seq = ++sSeq;
  mBody.innerHTML = '<div class="m-sec">Canciones</div>' + '<div class="row"><div class="ph skel"></div><div class="rt"><div class="skel" style="height:14px;width:60%"></div><div class="skel" style="height:11px;width:40%;margin-top:6px"></div></div></div>'.repeat(5);
  try {
    const r = await Spotify.search(q);
    if (seq !== sSeq) return;
    const tracks = r?.tracks?.items?.filter(Boolean) || [];
    const pls = r?.playlists?.items?.filter(Boolean) || [];
    const nowId = Music.track()?.id;
    mBody.innerHTML = (tracks.length ? `<div class="m-sec">Canciones</div>` + tracks.map((t, i) => `
        <div class="row ${t.id === nowId ? 'now' : ''}" data-uri="${esc(t.uri)}" data-ctx="${esc(t.album?.uri || '')}" data-tid="${esc(t.id)}" style="--i:${i}">
          <img src="${esc(Music.art(t, 'sm'))}" alt="" loading="lazy">
          <div class="rt"><div class="t">${esc(t.name)}</div><div class="s">${esc(Music.artist(t))} · ${esc(t.album?.name || '')}</div></div>
          <span class="go">${ic('play')}</span></div>`).join('') : '') +
      (pls.length ? `<div class="m-sec">Playlists</div><div class="pl-grid">` + pls.slice(0, 8).map((p, i) => `
        <div class="plc" data-ctxplay="${esc(p.uri)}" style="--i:${i}">
          ${p.images?.[0]?.url ? `<img class="im" src="${esc(p.images[0].url)}" alt="" loading="lazy">` : '<div class="im"></div>'}
          <div class="t">${esc(p.name)}</div><div class="s">${esc(p.owner?.display_name || '')}</div></div>`).join('') + '</div>' : '') ||
      `<div class="m-empty">No encontré nada para “${esc(q)}” 🎧</div>`;
  } catch (e) {
    if (seq !== sSeq) return;
    mBody.innerHTML = `<div class="m-empty">No se pudo buscar 😕</div>`;
    Music.err(e);
  }
}
function markNowPlaying() {
  const id = Music.track()?.id;
  $$('.row[data-tid]', mBody).forEach(r => r.classList.toggle('now', r.dataset.tid === id));
}

async function remoteApi(method = 'GET', path = '/api/remote', body) {
  const r = await fetch(path, {
    method, cache: 'no-store',
    headers: { 'X-Notas': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
async function renderRemote() {
  const box = $('#set-remote-box');
  if (Spotify.isRemote || !NotasSync.available) { box.hidden = true; return; }
  try { paintRemote(await remoteApi()); box.hidden = false; } catch { box.hidden = true; }
}
function paintRemote(s) {
  const sw = $('#set-remote-on');
  sw.classList.toggle('on', s.enabled);
  sw.setAttribute('aria-checked', s.enabled);
  $('#set-remote-pair').hidden = !s.enabled;
  $('#set-remote-devices').innerHTML = s.enabled ? s.devices.map(d => `
    <div class="cell dev">
      <span class="cell-ic" style="background:#8E8E93">${ic('phone')}</span>
      <span class="lbl">${esc(d.name)}<small class="cell-sub">Visto ${ago(d.lastSeen || d.created)}</small></span>
      <button class="link-btn" data-forget="${esc(d.id)}">${ic('x')}Quitar</button>
    </div>`).join('') : '';
}
$('#set-remote-on').addEventListener('click', async e => {
  const on = !e.currentTarget.classList.contains('on');
  try {
    const s = await remoteApi('POST', '/api/remote', { enabled: on });
    paintRemote(s);
    if (on) {
      toast(s.running ? 'Listo ✨ Si Windows pregunta por el firewall, toca «Permitir»' : 'No se pudo abrir la conexión para el celular');
      if (s.running && !s.devices.length) setTimeout(openPair, 600);
    }
  } catch { toast('No se pudo cambiar ese ajuste'); }
});
$('#set-remote-pair').addEventListener('click', () => openPair());
$('#set-remote-devices').addEventListener('click', async e => {
  const b = e.target.closest('[data-forget]');
  if (!b) return;
  const ok = await confirmBox({ title: '¿Quitar este celular?', message: 'Ya no podrá ver tus notas. Puedes volver a conectarlo con un código nuevo.', ok: 'Quitar', danger: true });
  if (ok) paintRemote(await remoteApi('POST', '/api/remote/forget', { id: b.dataset.forget }));
});

let pairTimer = 0;
async function openPair() {
  openSheet('pair');
  const body = $('#pair-body');
  body.innerHTML = '<div class="pair-wait"><div class="skel" style="width:220px;height:220px;border-radius:24px;margin:0 auto"></div></div>';
  let info, before;
  try {
    before = (await remoteApi()).devices.length;
    info = await remoteApi('POST', '/api/remote/pair');
  } catch { body.innerHTML = '<p class="m-empty">No se pudo crear el código 😕</p>'; return; }
  if (!info.url) {
    body.innerHTML = '<p class="m-empty">No encontré la red de tu casa 🙈<br>Conecta la PC al Wi-Fi o cable del router y vuelve a intentar.</p>';
    return;
  }
  body.innerHTML = `
    <div class="pair">
      <div class="pair-qr">${info.qr}</div>
      <p class="pair-t">Escanéalo con la cámara de tu celular</p>
      <p class="pair-s">El código sirve una sola vez y vence en <b id="pair-left">5:00</b></p>
      <div class="steps">
        <div class="step" style="--i:0"><div>Conecta el celular al <b>mismo Wi-Fi</b> que esta PC.</div></div>
        <div class="step" style="--i:1"><div>Abre la <b>cámara</b> y apunta al código (o escribe en Chrome: <span class="code-inline">${esc(info.urls[0].replace(/\/pair\?.*/, ''))}</span>).</div></div>
        <div class="step" style="--i:2"><div>Para tenerla como app: en Chrome toca <b>⋮ → Agregar a la pantalla principal</b>.</div></div>
      </div>
      <p class="note">¿No abre? Revisa que Windows permita <b>Mis Notas</b> en redes <b>privadas</b> (Firewall de Windows) y que tu red esté marcada como privada.</p>
    </div>`;
  clearInterval(pairTimer);
  pairTimer = setInterval(async () => {
    if (sheetOpen?.id !== 'pair') { clearInterval(pairTimer); return; }
    const left = Math.max(0, info.expiresAt - Date.now());
    const el = $('#pair-left');
    if (el) el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    if (!left) {
      clearInterval(pairTimer);
      $('.pair-qr', body)?.classList.add('expired');
      $('.pair-s', body).innerHTML = 'El código venció. <button class="link-btn again">Crear otro</button>';
      $('.again', body).addEventListener('click', () => openPair());
      return;
    }
    try {
      const s = await remoteApi();
      if (s.devices.length > before) {
        clearInterval(pairTimer);
        const d = s.devices[s.devices.length - 1];
        body.innerHTML = `<div class="pair-ok"><div class="big">✅</div><h3>¡Celular conectado!</h3><p>${esc(d.name)}</p></div>`;
        burstAt($('.pair-ok .big', body), ['📱', '✨', '💖', '🎉'], 18);
        setTimeout(() => { closeSheet(); renderSettings(); openSheet('settings'); }, 2600);
      }
    } catch {}
  }, 1500);
}

const Perf = (() => {
  let hw = null, battery = null;
  function detect() {
    let gpu = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      gpu = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '';
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
    const software = !gpu || /swiftshader|llvmpipe|basic render|software|microsoft basic/i.test(gpu);
    const dedicated = /nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro|vii)|rx \d{3,4}|arc a\d/i.test(gpu);
    const integrated = !dedicated && /intel|uhd|iris|hd graphics|radeon.{0,24}graphics|vega|mali|adreno|powervr|apple/i.test(gpu);
    let tier = 'fluid', why = 'tarjeta de video dedicada';
    if (software || cores <= 2 || mem <= 2) { tier = 'lite'; why = software ? 'sin aceleración gráfica' : 'equipo con pocos recursos'; }
    else if (dedicated) { tier = 'fluid'; }
    else if (integrated || cores <= 4 || mem <= 4) { tier = 'eco'; why = integrated ? 'gráficos integrados' : 'equipo modesto'; }
    return { tier, why, gpu };
  }
  const order = ['fluid', 'eco', 'lite'];
  function tier() {
    if (settings.motion === 'fluid') return 'fluid';
    if (settings.motion === 'eco') return 'lite';
    hw ||= detect();
    let i = order.indexOf(hw.tier);
    if (battery && !battery.charging) i = Math.min(2, i + 1);
    return order[i];
  }
  function describe() {
    const names = { fluid: 'Fluidas', eco: 'Ahorro', lite: 'Liviano' };
    if (settings.motion !== 'auto') return settings.motion === 'fluid' ? '60 cuadros por segundo' : 'Liviano: el mínimo consumo';
    hw ||= detect();
    return `Automático · ahora: ${names[tier()]} (${battery && !battery.charging ? 'usando batería' : hw.why})`;
  }
  function apply() {
    const t = tier();
    document.body.dataset.tier = t;
    document.body.classList.toggle('lite', t === 'lite');
    if (typeof Ambient !== 'undefined') Ambient.restart();
  }
  navigator.getBattery?.().then(b => {
    battery = b;
    b.addEventListener('chargingchange', () => { apply(); if (sheetOpen?.id === 'settings') renderSettings(); });
    apply();
  }).catch(() => {});
  return { tier, describe, apply };
})();

const Lock = (() => {
  const open = new WeakSet();
  let pin = null, pinAt = 0, sealT = 0;
  const post = async (path, b) => {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notas': '1' }, body: JSON.stringify(b) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) throw Object.assign(new Error('espera'), { wait: j.wait });
    if (r.status === 403) throw Object.assign(new Error('pin'), { wait: j.wait });
    if (!r.ok) throw new Error(j.error || 'error');
    return j;
  };
  const hasPin = () => fetch('/api/lock').then(r => r.json()).then(j => !!j.hasPin).catch(() => false);
  const ask = (title, message) => dialog({ title, message, input: true, secret: true, placeholder: '••••', ok: 'Listo' });
  const remember = p => { pin = p; pinAt = Date.now(); };
  const fresh = () => pin && Date.now() - pinAt < 5 * 60e3;
  function waitMsg(e) { toast(e.wait ? `Demasiados intentos. Espera ${e.wait} s 🔒` : 'PIN incorrecto'); }

  async function createPin() {
    const a = await ask('Crea tu PIN 🔒', 'De 4 a 8 números. Lo necesitarás para abrir tus notas privadas. Si lo olvidas no se pueden recuperar.');
    if (!a) return null;
    if (!/^\d{4,8}$/.test(a)) { toast('El PIN debe tener de 4 a 8 números'); return null; }
    const b = await ask('Repite tu PIN', 'Para confirmar.');
    if (b !== a) { toast('Los PIN no coinciden'); return null; }
    await post('/api/lock/setup', { pin: a });
    remember(a);
    toast('PIN creado 🔒');
    return a;
  }
  async function getPin(reason = 'Escribe tu PIN para verla.') {
    if (fresh()) return pin;
    if (!(await hasPin())) return createPin();
    const p = await ask('Nota privada 🔒', reason);
    return p || null;
  }
  async function reveal(n) {
    if (!n.lock || open.has(n)) return true;
    for (let tries = 0; tries < 3; tries++) {
      const p = await getPin();
      if (!p) return false;
      try {
        const { text } = await post('/api/lock/open', { pin: p, box: n.lock });
        const o = JSON.parse(text);
        n.title = o.title || ''; n.html = o.html || '';
        open.add(n); remember(p);
        return true;
      } catch (e) { pin = null; waitMsg(e); if (e.wait) return false; }
    }
    return false;
  }
  function hide(n) {
    if (!n.lock || cur === n) return;
    n.title = ''; n.html = ''; open.delete(n);
  }
  async function seal(n) {
    if (!n.lock || !open.has(n)) return true;
    const p = fresh() ? pin : await getPin('Escribe tu PIN para guardar los cambios.');
    if (!p) return false;
    try {
      const { box } = await post('/api/lock/seal', { pin: p, text: JSON.stringify({ title: n.title, html: n.html }) });
      n.lock = box; remember(p); saveNotes();
      return true;
    } catch (e) { waitMsg(e); return false; }
  }
  function sealSoon(n) { clearTimeout(sealT); sealT = setTimeout(() => seal(n), 1500); }
  async function add(n) {
    const p = fresh() ? pin : (await hasPin()) ? await ask('Hacer privada 🔒', 'Escribe tu PIN.') : await createPin();
    if (!p) return;
    try {
      const { box } = await post('/api/lock/seal', { pin: p, text: JSON.stringify({ title: n.title, html: n.html }) });
      n.lock = box; open.add(n); remember(p);
      if (cur !== n) hide(n);
      saveNotes(); refreshHome();
      toast('Nota privada 🔒 Nadie la ve sin tu PIN');
    } catch (e) { waitMsg(e); }
  }
  async function remove(n) {
    if (!(await reveal(n))) return;
    delete n.lock; open.delete(n);
    n.updated = Date.now();
    saveNotes(); refreshHome();
    toast('Candado quitado 🔓');
  }
  async function changePin() {
    if (!(await hasPin())) return createPin();
    const old = await ask('Cambiar PIN', 'Escribe tu PIN actual.');
    if (!old) return;
    const locked = notes.filter(n => n.lock);
    const plain = new Map();
    try {
      for (const n of locked) plain.set(n, open.has(n) ? JSON.stringify({ title: n.title, html: n.html }) : (await post('/api/lock/open', { pin: old, box: n.lock })).text);
    } catch (e) { waitMsg(e); return; }
    const a = await ask('Nuevo PIN', 'De 4 a 8 números.');
    if (!a || !/^\d{4,8}$/.test(a)) { if (a) toast('El PIN debe tener de 4 a 8 números'); return; }
    if ((await ask('Repite el nuevo PIN', '')) !== a) { toast('Los PIN no coinciden'); return; }
    try {
      await post('/api/lock/setup', { pin: a, oldPin: old });
      for (const [n, text] of plain) n.lock = (await post('/api/lock/seal', { pin: a, text })).box;
      remember(a); saveNotes();
      toast('PIN cambiado 🔒');
    } catch (e) { waitMsg(e); }
  }
  return { reveal, hide, seal, sealSoon, add, remove, changePin, hasPin, isOpen: n => open.has(n) };
})();

window.NotasApp = {
  get notes() { return notes; }, get cur() { return cur; }, get folders() { return folders; },
  PAPERS, FONTS, store, Music,
  openNote, todayEntry, refreshHome, toast, dialog, openSheet, closeSheet, enableSheetDrag, burstAt, plain,
  insertAtCaret, bodyChanged, isLocked: n => !!n.lock,
};

const Ambient = (() => {
  const stageEl = $('#stage');
  const blobs = $$('.blobs i');
  const bars = [...$$('.eq i', island), ...$$('.mini-eq i')];
  const art = $('.isl-art', island);
  const K = [[0, 0, 1], [6, 5, 1.12], [-5, 9, .94]];
  const T = [[24, 0], [30, -8], [34, -14]];
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let timer = 0, raf = 0, lastAct = performance.now(), lastPick = 0;
  const level = bars.map(() => .3), goal = bars.map(() => .3);
  const fluid = () => Perf.tier() === 'fluid';
  const lite = () => Perf.tier() === 'lite';
  const running = () => !!(timer || raf);
  function stop() { clearInterval(timer); cancelAnimationFrame(raf); timer = raf = 0; }
  let lastFrame = 0;
  function loop(now) {
    raf = 0;
    if (now - lastFrame < 30) { raf = requestAnimationFrame(loop); return; }
    lastFrame = now;
    if (tick()) raf = requestAnimationFrame(loop);
  }
  const awake = () => performance.now() - lastAct < 20000;
  const homeVisible = () => !lite() && awake() && !still.matches && !document.hidden && !stageEl.classList.contains('behind')
    && !document.body.classList.contains('ly-open') && !document.body.classList.contains('app-blur');
  const musicVisible = () => !still.matches && !document.hidden && document.body.classList.contains('sp-playing') && !document.body.classList.contains('ly-open');
  function tick() {
    const t = performance.now() / 1000;
    const home = homeVisible(), music = musicVisible();
    if (home && !lite()) blobs.forEach((b, i) => {
      const [dur, delay] = T[i];
      const q = (((t - delay) / dur) % 2 + 2) % 2, pp = q > 1 ? 2 - q : q;
      const p = (.5 - Math.cos(pp * Math.PI) / 2) * 2, j = Math.min(1, Math.floor(p)), f = p - j;
      const m = n => (K[j][n] + (K[j + 1][n] - K[j][n]) * f).toFixed(2);
      b.style.transform = `translate(${m(0)}vmax, ${m(1)}vmax) scale(${m(2)})`;
    });
    if (music) {
      if (t - lastPick > .12) { lastPick = t; goal.forEach((_, i) => (goal[i] = .25 + Math.random() * .75)); }
      const k = fluid() ? .28 : 1;
      bars.forEach((b, i) => { level[i] += (goal[i] - level[i]) * k; b.style.transform = `scaleY(${level[i].toFixed(3)})`; });
      art.style.transform = `rotate(${((t * 51) % 360).toFixed(1)}deg)`;
    }
    if (!home && !music) { stop(); return false; }
    return true;
  }
  function update() {
    if (homeVisible() || musicVisible()) {
      if (!running()) { if (fluid()) raf = requestAnimationFrame(loop); else { tick(); timer = setInterval(tick, lite() ? 125 : 80); } }
    } else if (!document.body.classList.contains('sp-playing')) bars.forEach(b => (b.style.transform = ''));
  }
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(update).observe(stageEl, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', update);
  const poke = () => { const was = awake(); lastAct = performance.now(); if (!was || !running()) update(); };
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'focus'].forEach(ev => addEventListener(ev, poke, { passive: true, capture: true }));
  return { update, restart() { stop(); update(); } };
})();

document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, [contenteditable="true"]');
  if (e.key === 'Escape') {
    if (trayMode) closeTray();
    else if (island.classList.contains('expanded')) collapseIsland();
    else if (sheetOpen) closeSheet();
    else if (cur) closeEditor();
    return;
  }
  if (typing) return;
  if (e.key === ' ' && Spotify.isConnected() && Music.track()) {
    e.preventDefault();
    togglePlay();
    toast(Music.st.is_playing ? '▶ Reproduciendo' : '⏸ En pausa');
  } else if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
    LyricsView.isOpen() ? LyricsView.close() : openLyrics();
  } else if (e.key.toLowerCase() === 'n' && !cur && !sheetOpen && !e.ctrlKey && !e.metaKey) {
    $('#btn-new').click();
  } else if (e.key === '/' && !cur) {
    e.preventDefault(); $('#search').focus();
  }
});

addEventListener('notas-sync', () => {
  const mergeInto = (list, stored) => {
    const byId = new Map(list.map(x => [x.id, x]));
    for (const x of stored || []) {
      const o = byId.get(x.id);
      if (!o) list.push(x);
      else if ((x.updated || 0) > (o.updated || 0) && o !== cur) Object.assign(o, x);
    }
  };
  Object.assign(deleted, store.get('notas.deleted', {}));
  const stored = store.get('notas.notes', []).filter(alive);
  notes = notes.filter(n => alive(n) || n === cur);
  const keep = new Set(stored.map(n => n.id));
  notes = notes.filter(n => keep.has(n.id) || !(String(n.id).startsWith('seed-') && n.updated === n.created));
  mergeInto(notes, stored);
  mergeInto(folders, store.get('notas.folders', []));
  if (!cur) refreshHome();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNotes();
  else { Music.soon(100); renderHeader(); }
});
addEventListener('beforeunload', saveNotes);

function setupWindowChrome() {
  const D = window.desktopApp;
  if (!D) return;
  document.body.classList.add('desktop');
  const bar = document.createElement('div');
  bar.innerHTML = `<div class="win-drag" aria-hidden="true"></div>
    <div class="win-ctrls" role="group" aria-label="Ventana">
      <button data-w="min" title="Minimizar">${ic('winMin')}</button>
      <button data-w="max" title="Maximizar">${ic('winMax')}</button>
      <button data-w="close" class="x" title="Cerrar">${ic('x')}</button>
    </div>`;
  const [drag, ctrlsEl] = bar.children;
  document.body.prepend(drag);
  document.body.append(ctrlsEl);
  const ctrls = $('.win-ctrls');
  ctrls.addEventListener('click', e => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    ({ min: D.minimize, max: D.toggleMaximize, close: D.close })[b.dataset.w]();
  });
  D.onState?.(s => {
    document.body.classList.toggle('win-max', !!s.maximized);
    document.body.classList.toggle('win-full', !!s.fullscreen);
    const m = $('[data-w="max"]', ctrls);
    m.innerHTML = ic(s.maximized ? 'winRestore' : 'winMax');
    m.title = s.maximized ? 'Restaurar' : 'Maximizar';
  });
}

async function boot() {
  hydrateIcons();
  setupWindowChrome();
  applyTheme();
  renderHeader();
  animateTitle();
  $('#chips').classList.add('intro');
  refreshHome(true);
  setTimeout(() => $('#chips').classList.remove('intro'), 1400);
  Perf.apply();
  Ambient.update();
  renderIsland();

  Spotify.onConnected = err => {
    if (err) { toast('No se pudo conectar Spotify, intenta de nuevo'); return; }
    toast('¡Spotify conectado! 🎧✨');
    renderIsland();
    if (sheetOpen?.id === 'music') renderMusic();
    setTimeout(() => { burstAt(island, ['🎵', '🎶', '✨', '💚'], 16); expandIsland(); }, 400);
  };
  if (Spotify.isRemote) {
    document.body.classList.add('remote');
    addEventListener('notas-offline', () => toast('Sin conexión con tu PC 💤 Lo que escribas se guarda y se envía al volver'));
    addEventListener('notas-online', () => toast('Conectado con tu PC ✨'));
  }
  setInterval(() => Spotify.keepFresh(), 60e3);
  if (new URLSearchParams(location.search).has('conectado')) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => dialog({
      title: '¡Conectado a tu PC! 📱✨',
      message: 'Tus notas y tu música ahora también están aquí. Para tenerla como app: en Chrome toca ⋮ → «Agregar a la pantalla principal».',
      ok: '¡Genial!', cancel: 'Cerrar',
    }), 900);
  }
  const r = await Spotify.handleRedirect();
  if (r?.handoff) {
    await dialog({ title: '¡Spotify conectado! 💚', message: 'Ya puedes cerrar esta pestaña y volver a la app Mis Notas.', ok: 'Listo', cancel: 'Cerrar' });
  } else if (r?.ok) {
    toast('¡Spotify conectado! 🎧✨');
    renderIsland();
    setTimeout(() => { burstAt(island, ['🎵', '🎶', '✨', '💚'], 16); expandIsland(); }, 600);
  } else if (r && !r.ok) {
    toast(r.error === 'access_denied' ? 'Cancelaste la conexión con Spotify' : 'No se pudo conectar Spotify: ' + r.error);
  }
  LyricsView.init({
    track: () => Music.track(),
    pos: () => Music.pos(),
    playing: () => !!Music.st?.is_playing,
    toggle: () => (Spotify.isConnected() && Music.track() ? togglePlay() : toast('Pon algo en Spotify primero 🎧')),
    next: () => Music.act(() => Spotify.next()),
    prev: () => (Music.pos() > 4000 ? Music.act(() => Spotify.seek(0), s => { s.progress_ms = 0; }) : Music.act(() => Spotify.prev())),
    seek: ms => Music.act(() => Spotify.seek(ms), s => { s.progress_ms = ms; }),
    artist: t => Music.artist(t),
    art: (t, size) => Music.art(t, size),
    fonts: FONTS,
    motion: () => Perf.tier(),
    shareLine: (text, track, art) => Extras.shareLyric(text, track, art),
    search: q => Spotify.search(q),
    playlists: () => Spotify.playlists(),
    play: body => Music.act(() => Spotify.play(body)),
    getVolume: () => Music.st?.device?.volume_percent ?? null,
    setVolume: v => {
      if (!Music.st?.device) return;
      Music.st.device.volume_percent = v; Music.volLock = Date.now() + 2500; setVolUI(v);
      Spotify.volume(v).catch(err => Music.err(err));
    },
    toast, burst, saveQuote,
  });
  Music.poll();
}
boot();
})();
