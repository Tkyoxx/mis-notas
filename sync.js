window.NotasSync = (() => {
  'use strict';
  const KEYS = ['notas.notes', 'notas.deleted', 'notas.days', 'notas.folders', 'notas.settings', 'notas.lyrics', 'notas.videos',
    'notas.quotesNote', 'notas.stickerHint', 'sp.clientId'];
  const META = 'notas.sync';
  const ls = window.localStorage;
  const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;

  const getMeta = () => { try { return JSON.parse(ls.getItem(META)) || {}; } catch { return {}; } };
  const setMeta = m => rawSet.call(ls, META, JSON.stringify(m));
  const snapshot = () => { const d = {}; for (const k of KEYS) { const v = ls.getItem(k); if (v != null) d[k] = v; } return d; };
  const apply = data => { for (const k of KEYS) { const v = data?.[k]; v == null ? rawRemove.call(ls, k) : rawSet.call(ls, k, v); } };

  function xhr(method, body) {
    try {
      const x = new XMLHttpRequest();
      x.open(method, '/api/data', false);
      if (body) { x.setRequestHeader('Content-Type', 'application/json'); x.setRequestHeader('X-Notas', '1'); }
      x.send(body || null);
      return x.status === 200 ? JSON.parse(x.responseText) : null;
    } catch { return null; }
  }

  let available = false;
  const meta = getMeta();
  const server = xhr('GET');
  if (server) {
    available = true;
    const hasLocal = ls.getItem('notas.notes') != null;
    const neverSynced = meta.savedAt == null;
    if (server.savedAt && server.savedAt === meta.savedAt && !meta.dirty) {
    } else if (server.savedAt && !meta.dirty && !(neverSynced && hasLocal)) {
      apply(server.data);
      setMeta({ savedAt: server.savedAt });
    } else if (hasLocal || meta.dirty) {
      const r = xhr('PUT', JSON.stringify({ base: meta.savedAt ?? null, savedAt: Date.now(), data: snapshot() }));
      if (r) { if (r.merged) apply(r.data); setMeta({ savedAt: r.savedAt }); }
    }
  }

  let timer = 0, sending = null;
  function schedule() {
    const m = getMeta();
    if (!m.dirty) setMeta({ ...m, dirty: true });
    if (!available) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }
  async function flush() {
    clearTimeout(timer);
    while (sending) await sending.catch(() => {});
    if (!available || !getMeta().dirty) return;
    const m = getMeta();
    setMeta({ ...m, dirty: false });
    sending = fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Notas': '1' },
      body: JSON.stringify({ base: m.savedAt ?? null, savedAt: Date.now(), data: snapshot() }),
    }).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(r => {
      setOnline(true);
      const cur = getMeta();
      setMeta({ savedAt: r.savedAt, dirty: cur.dirty });
      if (r.merged) { apply(r.data); dispatchEvent(new Event('notas-sync')); }
    }).catch(() => { setMeta({ ...getMeta(), dirty: true }); setOnline(false); })
      .finally(() => { sending = null; });
    return sending;
  }

  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === ls && KEYS.includes(k)) schedule();
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === ls && KEYS.includes(k)) schedule();
  };
  addEventListener('pagehide', () => {
    if (!available || !getMeta().dirty) return;
    const m = getMeta();
    const body = JSON.stringify({ base: m.savedAt ?? null, savedAt: Date.now(), data: snapshot() });
    if (body.length < 60000) fetch('/api/data', { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Notas': '1' }, body });
  });

  let online = true;
  function setOnline(v) {
    if (v === online) return;
    online = v;
    dispatchEvent(new Event(v ? 'notas-online' : 'notas-offline'));
  }
  async function pull() {
    if (document.hidden || sending) return;
    try {
      const r = await fetch('/api/ver', { cache: 'no-store' });
      if (!r.ok) throw 0;
      const { savedAt } = await r.json();
      available = true;
      setOnline(true);
      const m = getMeta();
      if (m.dirty) { flush(); return; }
      if (!savedAt || savedAt === m.savedAt) return;
      const d = await (await fetch('/api/data', { cache: 'no-store' })).json();
      if (getMeta().dirty || sending) return;
      apply(d.data);
      setMeta({ savedAt: d.savedAt });
      dispatchEvent(new Event('notas-sync'));
    } catch { setOnline(false); }
  }
  setInterval(pull, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });

  return { get available() { return available; }, get online() { return online; }, flush, pull };
})();
