// Shared harness for the SHARE-04 embed checks (embed-check.mjs, embed-access-check.mjs). Not a check itself.
//
// A real embedding site: a tiny Node http server on a DIFFERENT origin than the app, serving host pages that hold the embed
// iframe(s). The app is http://127.0.0.1:8878 (the CI stack). The host page is reached under three names, one server:
//   - cross-site A  http://localhost:<port>   (a different host than 127.0.0.1: the iframe is truly cross-site)
//   - cross-site B  http://127.0.0.2:<port>   (a second embedding site: its own cookie jar when cookies are partitioned)
//   - same-site     http://<app host>:<port>  (same site as the app, a different origin: the account cookie rides along)
// Loopback needs no hosts-file entry: the whole 127.0.0.0/8 answers on Linux and the three names are three sites.
//
// Two browser profiles, both real Chromium:
//   - 'available': default Chromium, third-party and partitioned storage available.
//   - 'blocked'  : cookies for the app are refused inside a cross-site frame. Done with a Preferences file written into the
//     profile before launch; blocking is never assumed - blockedProfile() launches, asks the app to set a cookie from inside a
//     cross-site frame and only returns a profile in which context.cookies() really holds nothing.
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

export const BASE = process.env.BASE || 'http://127.0.0.1:8878';
export const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('the embed checks run against the local stack only');
const appHost = new URL(BASE).hostname;
const others = ['localhost', '127.0.0.1', '127.0.0.2'].filter(h => h !== appHost);
export const SITE = { a: others[0], b: others[1], same: appHost };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// /host?src=<path>&src=<path>&h=320&lazy=1 holds one iframe per src (an app path), between two tall spacers so the host page scrolls.
// /framed?src=<path> is one bare iframe. /hit is a recorded no-op the host page can fetch (nothing to see).
function page(url) {
  const srcs = url.searchParams.getAll('src').map(p => BASE + p).concat(url.searchParams.getAll('abs')), height = Number(url.searchParams.get('h')) || 320;
  const frames = srcs.map((s, i) => `<iframe id="f${i}" src="${esc(s)}" title="Embedded canvas ${i + 1}" ${url.searchParams.get('lazy') === '0' ? '' : 'loading="lazy"'} style="display:block;width:100%;height:${height}px;border:1px solid #ccc"></iframe>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Host page</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font:16px sans-serif"><div id="above" style="height:900px">A blog post above the embed.</div>${frames}<div id="below" style="height:1400px">The rest of the blog post.</div></body></html>`;
}
export async function startHost() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://host.invalid');
    if (url.pathname === '/host' || url.pathname === '/framed') { res.writeHead(200, { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' }); return res.end(page(url)); }
    // The cookie canary: this server answers on the app's own host (another port; cookies ignore ports), so framed under a
    // different site it is a third-party cookie exactly like the app's. /canary sets one the way rh_embed is set; /canary/read
    // reports whether the browser sent it back.
    if (url.pathname === '/canary') { res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'canary=1; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=None; Partitioned' }); return res.end('<p>canary</p>'); }
    if (url.pathname === '/canary/read') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ sent: /(^|;\s*)canary=1/.test(req.headers.cookie || '') })); }
    res.writeHead(404); res.end('not found');
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  const port = server.address().port;
  return { port, url: (site, path) => `http://${SITE[site]}:${port}${path}`, close: () => new Promise(resolve => server.close(resolve)) };
}
export const embedPath = (kind, token, query = '') => `/embed/${kind}/${token}${query}`;
export const hostUrl = (host, site, paths, extra = '') => host.url(site, `/host?${[].concat(paths).map(p => `src=${encodeURIComponent(p)}`).join('&')}${extra}`);

// ---- profiles ----
export const launchAvailable = () => chromium.launch();
const PREFS = {
  // Refuse cookies set or read for the app's host while the top-level site is a different one (the cookie settings'
  // "primary,secondary" pattern: the cookie's host, then the top-level site).
  exception: host => ({ profile: { content_settings: { exceptions: { cookies: Object.fromEntries(['localhost', '127.0.0.1', '127.0.0.2'].filter(h => h !== host).map(h => [`${host},${h}`, { setting: 2 }])) } } } }),
  // Third-party cookie blocking as the browser setting (partitioned cookies may still pass; the verification below decides).
  thirdParty: () => ({ profile: { cookie_controls_mode: 1, block_third_party_cookies: true } }),
  // Every cookie refused (a last resort: first-party pages lose their cookies too).
  all: () => ({ profile: { default_content_setting_values: { cookies: 2 } } }),
};
// Launches a persistent context with the named Preferences. The caller owns closing it (and removing dir).
async function profile(kind, prefs) {
  const dir = mkdtempSync(join(tmpdir(), `embed-${kind}-`));
  mkdirSync(join(dir, 'Default'), { recursive: true });
  writeFileSync(join(dir, 'Default', 'Preferences'), JSON.stringify(prefs));
  const context = await chromium.launchPersistentContext(dir, { headless: true });
  return { context, dir, kind, close: async () => { await context.close(); rmSync(dir, { recursive: true, force: true }); } };
}
// Does a cross-site frame keep a Secure; SameSite=None; Partitioned cookie in this context? The canary is served on the app's
// own host (host server /canary), framed under the cross-site host page; the answer is read two ways: what the browser sends
// back (/canary/read, from inside the same frame) and what context.cookies() holds. Both must agree.
export async function crossSiteCookieKept(host, context) {
  const page = await context.newPage();
  const abs = path => `http://${SITE.same}:${host.port}${path}`;
  await page.goto(host.url('a', `/framed?abs=${encodeURIComponent(abs('/canary'))}`));
  const frame = page.frames().find(f => f.url() === abs('/canary'));
  if (!frame) throw Error('the canary frame did not load');
  const sent = await frame.evaluate(async () => (await (await fetch('/canary/read')).json()).sent);
  await page.close();
  const stored = (await context.cookies()).some(c => c.name === 'canary');
  if (sent !== stored) throw Error(`canary disagrees: the browser sent it back: ${sent}, the jar holds it: ${stored}`);
  return sent;
}
// The first profile in which that canary is refused. Blocking is proven, never assumed: a profile that keeps the cookie is closed
// and the next recipe tried; if none blocks, the check fails with every attempt listed.
export async function blockedProfile(host) {
  const tried = [];
  for (const kind of ['exception', 'thirdParty', 'all']) {
    const p = await profile(kind, PREFS[kind](SITE.same));
    if (!(await crossSiteCookieKept(host, p.context))) { console.log(`blocked profile: ${kind} (the canary cookie is not returned and not stored)`); return p; }
    tried.push(kind);
    await p.close();
  }
  throw Error(`no browser profile blocked a cross-site frame's cookie (tried ${tried.join(', ')})`);
}

// ---- the stack's sessions and canvases (the same helpers share-revocation-check uses) ----
import { readFileSync } from 'node:fs';
const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
export const sessionFor = async (email, handle) => (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, secret, handle }) })).json()).session;
export const run = Date.now().toString(36);
// who = null is a signed-out request. Extra headers win.
export const api = async (who, path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual', ...init, headers: { ...(who ? { cookie: `small_session=${who.session}` } : {}), 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: r.status, headers: r.headers, body: await r.clone().json().catch(() => null), res: r };
};
export const post = (who, path, body = {}, headers = {}) => api(who, path, { method: 'POST', body: JSON.stringify(body), headers });
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
export const SEED = title => ({
  strokes: [], links: [], items: [], groups: [], areas: [], exchanges: [],
  shapes: [{ id: 'seed-rect', kind: 'rect', x1: 80, y1: 140, x2: 320, y2: 240, ...style, text: title }],
  blocks: [{ id: 'w1', type: 'wiki', dx: 0, dy: 0, title: 'Softmax function', section: 0 }],
});
// A public canvas: { owner, name, view (token), publication? }. publish = also in Explore (needs the owner's handle).
export async function makeCanvas(owner, title, { publish = false } = {}) {
  const made = (await post(owner, '/api/canvases', { title })).body;
  const board = `/api/learn/boards/${made.name}/main`;
  const view = (await post(owner, `${board}/share`, { shared: true, view: true, public_view: true, state: SEED(title) })).body.sharing.view;
  let publication = null;
  if (publish) {
    await post(owner, `/api/apps/${made.name}/publish`, {});
    publication = (await api(owner, board)).body.sharing.publication;
  }
  return { name: made.name, board, view, publication, setPublicView: on => post(owner, `${board}/share`, { shared: true, view: true, public_view: on, state: SEED(title) }),
    unshare: () => post(owner, `${board}/share`, { shared: false, state: SEED(title) }), unpublish: () => post(owner, `/api/apps/${made.name}/unpublish`, {}) };
}
// A 1x1 PNG for the owner's custom cover.
export const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
export const putCover = (owner, c) => fetch(`${BASE}${c.board}/thumbnail/custom`, { method: 'PUT', body: PNG, headers: { cookie: `small_session=${owner.session}`, 'content-type': 'image/png' } });

// ---- reporting: the printed count line is what the gate and CI read ----
export function reporter(name, total) {
  const results = [];
  const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` - ${detail}` : ''}`); };
  const finish = () => {
    const passed = results.filter(Boolean).length;
    console.log(`${passed}/${total} checks passed`);
    if (results.length !== total) console.log(`FAIL ${name}: ran ${results.length} checks, expected ${total}`);
    process.exit(passed === total && results.length === total ? 0 : 1);
  };
  return { check, finish, results };
}
