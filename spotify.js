window.Spotify = (() => {
  const K = { id: 'sp.clientId', tok: 'sp.tokens', ver: 'sp.verifier', st: 'sp.state' };
  const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
  ].join(' ');
  const API = 'https://api.spotify.com/v1';

  const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let tokens = load(K.tok);

  const redirectUri = () => location.origin + '/';
  const clientId = () => localStorage.getItem(K.id) || '';
  const setClientId = v => localStorage.setItem(K.id, (v || '').trim());
  const REMOTE = !!window.NOTAS_REMOTE;
  let remoteTok = null, remoteNone = 0;
  const isConnected = () => REMOTE
    ? Date.now() - remoteNone > 20000
    : !!(tokens && tokens.refresh_token && clientId());

  function shareWithPhone() {
    if (REMOTE) return;
    const body = tokens?.access_token
      ? { access_token: tokens.access_token, expires_at: tokens.expires_at + 240e3 }
      : { access_token: null };
    fetch('/api/spotify/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notas': '1' }, body: JSON.stringify(body) }).catch(() => {});
  }

  function b64url(bytes) {
    let s = '';
    bytes.forEach(b => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const randomStr = n => b64url(crypto.getRandomValues(new Uint8Array(n)));

  async function login() {
    if (!clientId()) throw fail('Falta el Client ID', 'NO_CLIENT');
    const verifier = randomStr(64);
    const state = randomStr(16);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    localStorage.setItem(K.ver, verifier);
    localStorage.setItem(K.st, state);
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: clientId(),
      scope: SCOPES,
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: b64url(new Uint8Array(digest)),
      state,
    });
    const url = 'https://accounts.spotify.com/authorize?' + q;
    if (window.desktopApp) {
      window.open(url, '_blank');
      waitForHandoff(state);
    } else {
      location.assign(url);
    }
  }

  async function handleRedirect() {
    const p = new URLSearchParams(location.search);
    if (!p.has('code') && !p.has('error')) return null;
    history.replaceState(null, '', location.pathname);
    if (p.get('error')) return { ok: false, error: p.get('error') };
    if (p.get('state') !== localStorage.getItem(K.st)) {
      try {
        const r = await fetch('/api/auth/handoff', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notas': '1' },
          body: JSON.stringify({ state: p.get('state'), code: p.get('code') }),
        });
        if (r.ok) return { ok: false, handoff: true };
      } catch {}
      return { ok: false, error: 'state' };
    }
    try {
      await tokenRequest({
        grant_type: 'authorization_code',
        code: p.get('code'),
        redirect_uri: redirectUri(),
        client_id: clientId(),
        code_verifier: localStorage.getItem(K.ver) || '',
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      localStorage.removeItem(K.ver);
      localStorage.removeItem(K.st);
    }
  }

  let handoffT = 0;
  function waitForHandoff(state, until = Date.now() + 10 * 60e3) {
    clearTimeout(handoffT);
    handoffT = setTimeout(async () => {
      if (Date.now() > until || localStorage.getItem(K.st) !== state) return;
      try {
        const j = await (await fetch('/api/auth/poll?state=' + encodeURIComponent(state))).json();
        if (j.code) {
          await tokenRequest({
            grant_type: 'authorization_code', code: j.code, redirect_uri: redirectUri(),
            client_id: clientId(), code_verifier: localStorage.getItem(K.ver) || '',
          });
          localStorage.removeItem(K.ver); localStorage.removeItem(K.st);
          window.desktopApp?.focus();
          self.onConnected?.();
          return;
        }
      } catch (e) {
        if (e.reason === 'AUTH') { self.onConnected?.(e); return; }
      }
      waitForHandoff(state, until);
    }, 1500);
  }

  async function tokenRequest(params) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.error === 'invalid_grant' && params.grant_type === 'refresh_token') logout();
      throw fail(j.error_description || j.error || 'No se pudo conectar', 'AUTH');
    }
    tokens = {
      access_token: j.access_token,
      refresh_token: j.refresh_token || tokens?.refresh_token,
      expires_at: Date.now() + (j.expires_in - 300) * 1000,
    };
    save(K.tok, tokens);
    shareWithPhone();
  }

  let refreshing = null;
  async function accessToken() {
    if (REMOTE) {
      if (remoteTok && Date.now() < remoteTok.expires_at - 30e3) return remoteTok.access_token;
      const j = await fetch('/api/spotify/token', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
      if (!j?.access_token) { remoteTok = null; remoteNone = Date.now(); throw fail('Conecta Spotify en la app de tu PC', 'NOT_CONNECTED'); }
      remoteNone = 0;
      remoteTok = j;
      return j.access_token;
    }
    if (!isConnected()) throw fail('Spotify no está conectado', 'NOT_CONNECTED');
    if (Date.now() < tokens.expires_at) return tokens.access_token;
    refreshing ||= tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: clientId(),
    }).finally(() => (refreshing = null));
    await refreshing;
    return tokens.access_token;
  }

  function fail(message, reason, status) {
    const e = new Error(message);
    e.reason = reason;
    e.status = status;
    return e;
  }

  async function api(path, { method = 'GET', body, retry = true } = {}) {
    const t = await accessToken();
    const r = await fetch(API + path, {
      method,
      headers: { Authorization: 'Bearer ' + t, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && retry) {
      if (REMOTE) remoteTok = null; else tokens.expires_at = 0;
      return api(path, { method, body, retry: false });
    }
    if (r.status === 204 || r.status === 202) return null;
    const text = await r.text();
    let j = null;
    try { j = text ? JSON.parse(text) : null; } catch {}
    if (!r.ok) throw fail(j?.error?.message || r.statusText, j?.error?.reason, r.status);
    return j;
  }

  function logout() {
    if (REMOTE) return;
    tokens = null;
    localStorage.removeItem(K.tok);
    shareWithPhone();
  }
  if (!REMOTE && tokens?.access_token && Date.now() < tokens.expires_at) setTimeout(shareWithPhone, 500);

  const devices = () => api('/me/player/devices').then(j => j?.devices || []);
  const transfer = (id, play = true) => api('/me/player', { method: 'PUT', body: { device_ids: [id], play } });

  async function withDevice(fn) {
    try {
      return await fn('');
    } catch (e) {
      if (e.status !== 404) throw e;
      const ds = await devices();
      if (!ds.length) throw fail('No hay dispositivos', 'NO_DEVICE', 404);
      const d = ds.find(x => x.is_active) || ds.find(x => x.type === 'Computer') || ds[0];
      await transfer(d.id, false);
      await sleep(500);
      return fn(d.id);
    }
  }
  const dev = id => (id ? `?device_id=${encodeURIComponent(id)}` : '');

  const self = {
    onConnected: null,
    isRemote: REMOTE,
    keepFresh() {
      if (REMOTE || !isConnected() || refreshing) return;
      if (Date.now() > tokens.expires_at - 60e3) accessToken().catch(() => {});
    },
    redirectUri, clientId, setClientId, isConnected, login, logout, handleRedirect,
    me: () => api('/me'),
    state: () => api('/me/player?additional_types=track,episode'),
    play: body => withDevice(id => api('/me/player/play' + dev(id), { method: 'PUT', body })),
    pause: () => api('/me/player/pause', { method: 'PUT' }),
    next: () => withDevice(id => api('/me/player/next' + dev(id), { method: 'POST' })),
    prev: () => withDevice(id => api('/me/player/previous' + dev(id), { method: 'POST' })),
    volume: v => api(`/me/player/volume?volume_percent=${Math.round(v)}`, { method: 'PUT' }),
    seek: ms => api(`/me/player/seek?position_ms=${Math.round(ms)}`, { method: 'PUT' }),
    shuffle: on => api(`/me/player/shuffle?state=${!!on}`, { method: 'PUT' }),
    repeat: mode => api(`/me/player/repeat?state=${mode}`, { method: 'PUT' }),
    search: q => {
      const base = `/search?type=track,playlist&q=${encodeURIComponent(q)}`;
      return api(base + '&limit=10').catch(e => (e.status === 400 ? api(base) : Promise.reject(e)));
    },
    playlists: () => api('/me/playlists?limit=30').catch(e => (e.status === 400 ? api('/me/playlists') : Promise.reject(e))),
    devices, transfer,
  };
  return self;
})();
