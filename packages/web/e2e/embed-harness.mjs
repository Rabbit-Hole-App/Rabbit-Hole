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
import https from 'node:https';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, firefox, webkit } from '@playwright/test';

export const BASE = process.env.BASE || 'http://127.0.0.1:8878';
export const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('the embed checks run against the local stack only');
const appHost = new URL(BASE).hostname;
const others = ['localhost', '127.0.0.1', '127.0.0.2'].filter(h => h !== appHost);
export const SITE = { a: others[0], b: others[1], same: appHost };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// /host?src=<path>&src=<path>&h=320&lazy=1 holds one iframe per src (an app path), between two tall spacers so the host page scrolls.
// /framed?src=<path> is one bare iframe. /hit is a recorded no-op the host page can fetch (nothing to see).
function page(url, app) {
  const srcs = url.searchParams.getAll('src').map(p => app + p).concat(url.searchParams.getAll('abs')), height = Number(url.searchParams.get('h')) || 320;
  const frames = srcs.map((s, i) => `<iframe id="f${i}" src="${esc(s)}" title="Embedded canvas ${i + 1}" ${url.searchParams.get('lazy') === '0' ? '' : 'loading="lazy"'} style="display:block;width:100%;height:${height}px;border:1px solid #ccc"></iframe>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Host page</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font:16px sans-serif"><script>window.__messages = []; addEventListener('message', e => window.__messages.push(typeof e.data === 'string' ? e.data : JSON.stringify(e.data)));</script><div id="above" style="height:900px">A blog post above the embed.</div>${frames}<div id="below" style="height:1400px">The rest of the blog post.</div></body></html>`;
}
// A throwaway self-signed certificate (openssl, 2 days). Without openssl the whole harness falls back to plain http and says so:
// WebKit may refuse a Secure cookie over http, so that run is then reported as such.
function selfSigned() {
  try {
    const dir = mkdtempSync(join(tmpdir(), 'embed-tls-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:127.0.0.2'], { stdio: 'ignore' });
    const tls = { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) };
    rmSync(dir, { recursive: true, force: true });
    return tls;
  } catch (error) { console.log(`no openssl (${error.code || error.message}): the embed checks run over plain http`); return null; }
}
// Every browser context the checks make: the self-signed certificate is accepted.
export const contextOptions = { ignoreHTTPSErrors: true, viewport: { width: 1000, height: 800 } };
// Starts the host site and, over the same certificate, an https front for the app (the stack itself is http): the browser sees the
// app at host.app, https://<app host>:<port>, so Secure and Partitioned cookies behave as on the real site. The front rewrites only
// Host, Origin and Referer going in and Location coming out, and streams everything else.
export async function startHost() {
  const tls = selfSigned(), scheme = tls ? 'https' : 'http', make = handler => (tls ? https.createServer(tls, handler) : http.createServer(handler));
  const listen = server => new Promise(resolve => server.listen(0, '0.0.0.0', () => resolve(server.address().port)));
  let app = BASE, front = null;
  if (tls) {
    const target = new URL(BASE);
    front = make((req, res) => {
      const headers = { ...req.headers, host: target.host };
      for (const name of ['origin', 'referer']) if (headers[name]) headers[name] = headers[name].replace(app, BASE);
      const up = http.request({ host: target.hostname, port: target.port, method: req.method, path: req.url, headers }, r => {
        const out = { ...r.headers };
        if (out.location) out.location = out.location.replace(BASE, app);
        res.writeHead(r.statusCode, out); r.pipe(res);
      });
      up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(up);
    });
    app = `https://${appHost}:${await listen(front)}`;
  }
  const server = make((req, res) => {
    const url = new URL(req.url, 'http://host.invalid');
    if (url.pathname === '/host' || url.pathname === '/framed') { res.writeHead(200, { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' }); return res.end(page(url, app)); }
    // The cookie canary: this server answers on the app's own host (another port; cookies ignore ports), so framed under a
    // different site it is a third-party cookie exactly like the app's. /canary sets one the way rh_embed is set; /canary/read
    // reports whether the browser sent it back.
    if (url.pathname === '/canary') { res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'canary=1; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=None; Partitioned' }); return res.end('<p>canary</p>'); }
    if (url.pathname === '/canary/read') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ sent: /(^|;\s*)canary=1/.test(req.headers.cookie || '') })); }
    res.writeHead(404); res.end('not found');
  });
  const port = await listen(server);
  const close = s => new Promise(resolve => { s.closeAllConnections?.(); s.close(resolve); });
  return { port, scheme, app, url: (site, path) => `${scheme}://${SITE[site]}:${port}${path}`, close: async () => { await close(server); if (front) await close(front); } };
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
  const context = await chromium.launchPersistentContext(dir, { headless: true, channel: 'chromium', ignoreHTTPSErrors: true }) // the full Chromium in new headless mode: the headless shell keeps no content settings, so a Preferences file changes nothing there;
  return { context, dir, kind, close: async () => {
    await context.close();
    // Evidence for a recipe that did not block: what the browser left in the profile's Preferences (were ours read or rewritten?).
    try { const left = JSON.parse(readFileSync(join(dir, 'Default', 'Preferences'), 'utf8')); console.log(`profile ${kind}: Preferences after the run: ${JSON.stringify({ default_content_setting_values: left.profile?.default_content_setting_values, exceptions: left.profile?.content_settings?.exceptions?.cookies, cookie_controls_mode: left.profile?.cookie_controls_mode, block_third_party_cookies: left.profile?.block_third_party_cookies })}`); } catch (error) { console.log(`profile ${kind}: no readable Preferences afterwards (${error.code || error.message})`); }
    rmSync(dir, { recursive: true, force: true });
  } };
}
// Does a cross-site frame keep a Secure; SameSite=None; Partitioned cookie in this context? The canary is served on the app's
// own host (host server /canary), framed under the cross-site host page; the answer is read two ways: what the browser sends
// back (/canary/read, from inside the same frame) and what context.cookies() holds. Both must agree.
export async function crossSiteCookieKept(host, context) {
  const page = await context.newPage();
  const abs = path => `${host.scheme}://${SITE.same}:${host.port}${path}`;
  await page.goto(host.url('a', `/framed?lazy=0&abs=${encodeURIComponent(abs('/canary'))}`));
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
  // Last recipe first tried by command line: third-party cookie phase-out test mode with partitioning off, so Partitioned is just a third-party cookie.
  {
    const browser = await chromium.launch({ channel: 'chromium', args: ['--test-third-party-cookie-phaseout', '--disable-features=PartitionedCookies'] });
    const context = await browser.newContext(contextOptions);
    if (!(await crossSiteCookieKept(host, context))) { console.log('blocked profile: chromium --test-third-party-cookie-phaseout (the canary cookie is not returned and not stored)'); return { context, kind: 'phaseout', close: () => browser.close() }; }
    tried.push('phaseout'); await browser.close();
  }
  for (const kind of ['exception', 'thirdParty', 'all']) {
    const p = await profile(kind, PREFS[kind](SITE.same));
    if (!(await crossSiteCookieKept(host, p.context))) { console.log(`blocked profile: ${kind} (the canary cookie is not returned and not stored)`); return p; }
    tried.push(kind);
    await p.close();
  }
  throw Error(`no browser profile blocked a cross-site frame's cookie (tried ${tried.join(', ')})`);
}

// ---- the stack's sessions and canvases (the same helpers share-revocation-check uses) ----
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
// plan(n) adds the checks a section is about to run; finish() fails when the number that ran differs from the number planned.
export function reporter(name, total = 0) {
  const results = [];
  let planned = total;
  const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` - ${detail}` : ''}`); };
  const plan = n => { planned += n; };
  const finish = () => {
    const passed = results.filter(Boolean).length;
    console.log(`${passed}/${planned} checks passed`);
    if (results.length !== planned) console.log(`FAIL ${name}: ran ${results.length} checks, planned ${planned}`);
    process.exit(passed === planned && results.length === planned ? 0 : 1);
  };
  return { check, finish, results, plan };
}

// ---- engines: Chromium, Firefox and WebKit (Playwright's WebKit build, never Safari) ----
// The Browsers step of fast-e2e installs Chromium only. A check run for another engine installs it on first use (and, on Linux,
// its system libraries) so no workflow edit is needed; with the engine already installed this launches at once.
const TYPES = { chromium, firefox, webkit };
export async function launchEngine(engine, options = {}) {
  const type = TYPES[engine];
  try { return await type.launch(options); } catch (error) {
    if (engine === 'chromium') throw error;
    console.log(`installing ${engine}`);
    for (let attempt = 1; ; attempt++) { // a package mirror or lock that hangs must not take the 15 minute check budget
      try { execFileSync('npx', ['--no-install', 'playwright', 'install', ...(process.platform === 'linux' ? ['--with-deps'] : []), engine], { stdio: 'inherit', shell: process.platform === 'win32', timeout: 240000 }); break; } catch (installError) { console.log(`install ${engine} attempt ${attempt} failed: ${String(installError.message).split(String.fromCharCode(10))[0]}`); if (attempt === 2) throw installError; }
    }
    return type.launch({ timeout: 60000, ...options });
  }
}

// A context in which a cross-site frame cannot keep the app's cookie, forced by the engine's own setting and verified with the
// canary (never assumed); null when the engine has no setting to force it (WebKit: its default decides, see embed-flows.mjs).
export async function forcedBlocked(engine, host) {
  if (engine === 'chromium') return blockedProfile(host);
  if (engine !== 'firefox') return null;
  // network.cookie.cookieBehavior 1: reject all third-party cookies (the default 5 partitions them instead).
  const browser = await launchEngine('firefox', { firefoxUserPrefs: { 'network.cookie.cookieBehavior': 1 } });
  const context = await browser.newContext(contextOptions);
  if (await crossSiteCookieKept(host, context)) { await browser.close(); throw Error('firefox kept the canary cookie with cookieBehavior 1'); }
  console.log('blocked profile: firefox cookieBehavior 1 (the canary cookie is not returned and not stored)');
  return { context, close: () => browser.close() };
}
