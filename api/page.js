/* Link previews for profile links.
   WhatsApp, iMessage, X and others don't run the site's JavaScript, so a shared link like
   tenpages.vercel.app/@asha would otherwise only ever show the generic Tenpages card.
   This function sends the normal page, but with the title, description and picture filled
   in for that person (and that book, for /@asha/book/OL82563W links).
   It only reads things that are already public, and if anything goes wrong it sends the
   page unchanged, so the site itself never depends on it.

   Setup: in Vercel > Project > Settings > Environment Variables, add
   FIREBASE_PROJECT_ID with the same project ID you put in index.html. Without it, every
   link just gets the generic Tenpages card. */

const PROJECT = process.env.FIREBASE_PROJECT_ID || '';
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/`;
const COVERS = 'https://covers.openlibrary.org';
const LEVELS = [{ n: 1, name: 'Page Turner', at: 3 }, { n: 2, name: 'Regular', at: 10 }, { n: 3, name: 'Bookworm', at: 25 }, { n: 4, name: 'Critic', at: 50 }, { n: 5, name: 'Librarian', at: 100 }];
const WORDS = ['', 'Awful', 'Bad', 'Poor', 'Meh', 'Okay', 'Decent', 'Good', 'Great', 'Superb', 'Perfect'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const one = n => (Math.round(n * 10) / 10).toFixed(1);
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;

/* Firestore's REST format wraps every value, e.g. { stringValue: 'x' }. Unwrap it. */
function val(f) {
  if (!f || typeof f !== 'object') return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('nullValue' in f) return null;
  if ('mapValue' in f) return unwrap(f.mapValue.fields || {});
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(val);
  return undefined;
}
const unwrap = fields => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, val(v)]));

async function getJSON(fetchImpl, url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await fetchImpl(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}
const getDoc = async (f, path) => { const j = await getJSON(f, FIRESTORE + path); return j && j.fields ? unwrap(j.fields) : null; };

function levelOf(count) { let cur = null; for (const l of LEVELS) if (count >= l.at) cur = l; return cur; }
const coverOf = id => (id && id > 0 ? `${COVERS}/b/id/${id}-L.jpg` : null);

/* Work out the preview for a path like "asha" or "asha/book/OL82563W". */
async function previewFor(rest, origin, fetchImpl) {
  const m = /^([a-z0-9_]{3,20})(?:\/book\/(OL\d+W))?/i.exec(rest || '');
  if (!m) return null;
  const name = m[1].toLowerCase(), bookId = m[2] && m[2].toUpperCase();
  const url = `${origin}/@${name}${bookId ? '/book/' + bookId : ''}`;
  const generic = { title: `@${name} on Tenpages`, description: 'Score every book you read, out of 10.', url, image: `${origin}/og.png`, large: true };
  if (!PROJECT) return generic;

  const u = await getDoc(fetchImpl, `usernames/${name}`);
  if (!u || !u.uid) return generic;
  const prof = await getDoc(fetchImpl, `profiles/${u.uid}`); // private profiles can't be read, so they stay generic
  if (!prof || !prof.public) return generic;
  const display = prof.name || prof.username || name;
  const first = display.split(' ')[0];

  if (!bookId) {
    const st = prof.stats || {};
    const lvl = levelOf(st.books || 0);
    const description = st.books
      ? `${first} has scored ${plural(st.books, 'book')}, averaging ${one(st.avg || 0)}.${lvl ? ` Level ${lvl.n}, ${lvl.name}.` : ''}`
      : `See what ${first} is reading and how they score it.`;
    return { ...generic, title: `${display} (@${prof.username || name}) on Tenpages`, description };
  }

  const rec = await getDoc(fetchImpl, `users/${u.uid}/books/${bookId}`);
  let title = rec && rec.title, cover = rec && rec.cover;
  if (!title) {
    const w = await getJSON(fetchImpl, `https://openlibrary.org/works/${bookId}.json`);
    if (w && w.title) { title = w.title; cover = (w.covers || []).find(c => c > 0); }
  }
  if (!title) return generic;
  const description = rec && rec.rating
    ? `${first} gave ${title}${rec.author ? ` by ${rec.author}` : ''} ${rec.rating}/10 (${WORDS[rec.rating] || ''}). See their whole shelf on Tenpages.`
    : `See how ${first} scores ${title} on Tenpages.`;
  const image = coverOf(cover);
  return { title: `${first}’s score for ${title} | Tenpages`, description, url, image: image || `${origin}/og.png`, large: !image };
}

function metaBlock(p) {
  return `<!--meta:start-->
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(p.url)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(p.url)}">
<meta property="og:image" content="${esc(p.image)}">
${p.large ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n' : ''}<meta name="twitter:card" content="${p.large ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${esc(p.image)}">
<!--meta:end-->`;
}

async function render(rest, origin, fetchImpl) {
  const r = await fetchImpl(`${origin}/index.html`);
  if (!r.ok) throw new Error('index ' + r.status);
  let html = await r.text();
  try {
    const p = await previewFor(rest, origin, fetchImpl);
    if (p) html = html.replace(/<!--meta:start-->[\s\S]*?<!--meta:end-->/, metaBlock(p));
  } catch (e) { /* keep the generic preview */ }
  return html;
}

async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `https://${host}`;
  const q = new URL(req.url, origin).searchParams;
  const rest = (q.get('p') || '').replace(/^\/+/, '');
  try {
    const html = await render(rest, origin, fetch);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
    res.statusCode = 200;
    res.end(html);
  } catch (e) {
    // Couldn't build the page: send people to the app, which still understands this address.
    res.statusCode = 302;
    res.setHeader('Location', `/#/u/${rest.replace(/[^a-z0-9_/]/gi, '')}`);
    res.end();
  }
}

module.exports = handler;
module.exports.previewFor = previewFor;
module.exports.render = render;
