const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const cache = new Map();

const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const toSec = s => (s ? s.split(':').reduce((a, b) => a * 60 + Number(b), 0) : 0);
const BAD = ['lyric', 'letra', 'audio', 'visualizer', 'en vivo', 'live', 'cover', 'karaoke', 'sped up', 'slowed',
  'reaccion', 'reaction', '8d', 'nightcore', 'remix', 'instrumental', 'tutorial', 'acustico', 'acoustic', 'fan made', 'shorts',
  'behind the scenes', 'making of', 'no video oficial', 'no oficial',
  'subtitulado', 'subtitulos', 'traduccion', 'sub espanol', 'sub english', 'translation', 'concierto', 'concert',
  'tour', 'session', 'sesion', 'upscale', 'dance', 'gala', 'desde el', 'tribute', 'tributo', 'parodia', 'parody'];

async function get(url, ms = 9000) {
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-419,es;q=0.9,en;q=0.8', Cookie: 'CONSENT=YES+cb; SOCS=CAI' },
    signal: AbortSignal.timeout(ms),
  });
}

function collect(data) {
  const out = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (o.videoRenderer) { out.push(o.videoRenderer); return; }
    for (const k in o) walk(o[k]);
  })(data);
  return out;
}

async function embeddable(id) {
  try {
    const r = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, 6000);
    return r.ok;
  } catch { return false; }
}

async function searchVideo(name, artist, dur) {
  const key = norm(name) + '|' + norm(artist);
  if (cache.has(key)) return cache.get(key);

  const artists = String(artist).split(/,|&| x | feat\.? | ft\.? | y /i).map(norm).filter(Boolean);
  const main = artists[0] || '';
  const q = `${main} ${name} official video`;
  const r = await get('https://www.youtube.com/results?sp=EgIQAQ%3D%3D&search_query=' + encodeURIComponent(q));
  const html = await r.text();
  const m = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) return [];
  const vids = collect(JSON.parse(m[1])).slice(0, 20);

  const squash = s => s.replace(/[^a-z0-9]/g, '');
  const N = norm(name).split(/[([]| - /)[0].trim();
  const nameWords = norm(name);
  const badRe = new RegExp(String.raw`\b(${BAD.map(w => w.replace(/\s+/g, String.raw`\s+`)).join('|')})s?\b`);
  const scored = vids.map((v, i) => {
    const title = (v.title?.runs || []).map(x => x.text).join('');
    const channel = v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '';
    const len = toSec(v.lengthText?.simpleText);
    const T = norm(title), C = norm(channel);
    const both = squash(T + ' ' + C);
    let score = (20 - i) * 0.2;
    const artistHit = artists.filter(a => squash(a).length > 1 && both.includes(squash(a))).length;
    if (!artistHit) return null;
    score += 3 + artistHit;
    if (/ - topic$/.test(C)) return null;
    if (N && !squash(T).includes(squash(N))) return null;
    const own = (main && squash(C).includes(squash(main))) || /vevo$/.test(squash(C));
    const official = /official (music )?video|video oficial|videoclip|official mv|\(official\)|video official/.test(T);
    if (!own && !official) return null;
    if (own) score += 2;
    if (official) score += 4;
    const bad = T.match(badRe);
    if (bad && !nameWords.includes(bad[1])) return null;
    if (len && dur) {
      const d = len - dur;
      if (d < -20) score -= 5;
      else if (Math.abs(d) <= 25) score += 2;
      else if (d > 240) score -= 4;
    }
    return { id: v.videoId, title, channel, len, score, offset: 0 };
  }).filter(v => v && v.id && v.len && v.score > -2).sort((a, b) => b.score - a.score).slice(0, 6);

  const ok = await Promise.all(scored.map(v => embeddable(v.id)));
  const results = scored.filter((_, i) => ok[i]).map(({ score, ...v }) => v);
  if (cache.size >= 300) cache.delete(cache.keys().next().value);
  cache.set(key, results);
  return results;
}

module.exports = { searchVideo };
