// SHARE-04 embed, server contract (contract.md "CI"): who may see what through an embed, framing headers, thumbnails, and that
// ordinary shared pages are unchanged. LOCAL stack only (local D1 and R2), no model call, prints no secrets.
// Part A is HTTP only (Node fetch, signed out, signed in as the owner, with and without the embed marker). Part B is one
// Chromium page on a distinct-origin host (embed-harness.mjs): which pages a third-party site can frame and which it cannot.
// The browser half that needs cookies (guest Chat count, blocked storage, wheel, owner powers) is embed-check.mjs.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/embed-access-check.mjs [shotsDir]
import { BASE, SITE, startHost, launchAvailable, sessionFor, run, api, post, makeCanvas, putCover, reporter, hostUrl, embedPath } from './embed-harness.mjs';

const TOTAL = 29; // bump with the checks below; the printed line is what CI reads
const { check, finish } = reporter('embed-access-check', TOTAL);

const owner = { session: await sessionFor(`embed-owner-${run}@example.com`, `emb_${run}`) };
const viewer = { session: await sessionFor(`embed-viewer-${run}@example.org`, `embv_${run}`) };
const M = { 'X-RH-Embed': '1' }; // the embed marker the embed page sends on every API call
const shared = t => `/api/learn/boards/shared/${t}`;
const get = (who, path, headers = {}) => api(who, path, { headers });
const noState = r => r.body == null || (r.body.state === undefined && r.body.blocks === undefined);
// Cache-Control of an authorized response: nothing a shared cache may keep.
const uncached = h => !/\b(public|s-maxage)\b/i.test(h.get('cache-control') || '') && /\b(no-store|no-cache|private)\b/i.test(h.get('cache-control') || '');

const pub = await makeCanvas(owner, `Embed public ${run}`);                  // public view link
const exp = await makeCanvas(owner, `Embed explore ${run}`, { publish: true }); // public link and an /e publication
const gone = await makeCanvas(owner, `Embed revoked ${run}`, { publish: true });  // revoked below
const off = await makeCanvas(owner, `Embed unshared ${run}`);
await off.unshare();
check('setup: a public link, a published canvas and its /e token', !!pub.view && !!exp.publication && !!gone.view && !!gone.publication);
await putCover(owner, pub); await putCover(owner, exp);

// ---- A. framing headers ----
const head = async path => { const r = await fetch(BASE + path, { redirect: 'manual' }); await r.arrayBuffer(); return r; };
const embeds = [embedPath('b', pub.view), embedPath('e', exp.publication)];
const embedHeads = await Promise.all(embeds.map(head));
check('the embed pages (/embed/b/<view token>, /embed/e/<publication token>) are served and may be framed by any site', embedHeads.every(r => r.status === 200 && /text\/html/.test(r.headers.get('content-type') || '') && /frame-ancestors \*/.test(r.headers.get('content-security-policy') || '') && !r.headers.get('x-frame-options')), embedHeads.map(r => `${r.status} ${r.headers.get('content-security-policy')} xfo=${r.headers.get('x-frame-options')}`).join(' | '));
const others = ['/sign-in', '/library', '/', `/b/${pub.view}`, `/e/${exp.publication}`, '/api/learn/boards/published'];
const otherHeads = await Promise.all(others.map(head));
check('every other page and API answer refuses third-party framing (frame-ancestors self and X-Frame-Options SAMEORIGIN)', otherHeads.every(r => /frame-ancestors 'self'/.test(r.headers.get('content-security-policy') || '') && (r.headers.get('x-frame-options') || '').toUpperCase() === 'SAMEORIGIN'), otherHeads.map((r, i) => `${others[i]}: ${r.status} xfo=${r.headers.get('x-frame-options')}`).join(' | '));
check('the embed route does not widen anything else: the plain /b page of the same canvas still refuses framing', !/frame-ancestors \*/.test(otherHeads[3].headers.get('content-security-policy') || ''));

// ---- B. public embed data ----
const dataB = await get(null, shared(pub.view), M), dataE = await get(null, shared(exp.publication), M);
check('signed out with the embed marker, a public view link and a publication each give the canvas, never cached by a shared cache', dataB.status === 200 && dataE.status === 200 && !noState(dataB) && !noState(dataE) && uncached(dataB.headers) && uncached(dataE.headers), `${dataB.status} ${dataB.headers.get('cache-control')} | ${dataE.status} ${dataE.headers.get('cache-control')}`);

// ---- C. unshared, revoked, Explore-removed ----
const dead = async (t, who = null) => { const d = await get(who, shared(t), M), a = await get(who, `${shared(t)}/ask`, M), th = await get(who, `${shared(t)}/thumbnail`, M); return { d, a, th }; };
const none = r => [r.d, r.a, r.th].every(x => [403, 404].includes(x.status)) && noState(r.d);
check('an unshared canvas: no data, no Chat, no thumbnail', none(await dead(off.view)));
await gone.setPublicView(false);
check('public view turned off: the embed gets no data, no Chat, no thumbnail (signed out)', none(await dead(gone.view)));
check('public view turned off: not even the owner\'s account cookie opens it through the embed marker', none(await dead(gone.view, owner)));
await gone.unpublish();
const ex = async t => { const d = await get(null, shared(t), M), a = await get(null, `${shared(t)}/ask`, M), th = await get(null, `/api/learn/boards/published/${t}/thumbnail`, M); return { d, a, th }; };
check('removed from Explore: the /e token gives no data, no Chat, no thumbnail', none(await ex(gone.publication)));
check('a wrong token gives the same nothing as a revoked one', none(await dead('Z'.repeat(32))));

// ---- D. thumbnails ----
const thumb = async path => { const r = await fetch(BASE + path, { redirect: 'manual' }); const bytes = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type'), source: r.headers.get('x-thumbnail-source'), cache: r.headers, bytes: bytes.length }; };
const tv = await thumb(`${shared(pub.view)}/thumbnail`), tp = await thumb(`/api/learn/boards/published/${exp.publication}/thumbnail`), te = await thumb(`${shared(exp.publication)}/thumbnail`);
check('the thumbnail is the owner\'s cover, by view token and by publication token, signed out', tv.status === 200 && tp.status === 200 && tv.source === 'custom' && tp.source === 'custom' && /^image\/png/.test(tv.type || '') && tv.bytes > 0, JSON.stringify([tv.status, tv.source, tp.status, tp.source]));
check('a thumbnail revalidates on every request: private and no-cache, never public or s-maxage', uncached(tv.cache) && uncached(tp.cache), `${tv.cache.get('cache-control')} | ${tp.cache.get('cache-control')}`);
check('the thumbnail is an image the page links, never framed: sandboxed and nosniff', /sandbox/.test(tv.cache.get('content-security-policy') || '') && tv.cache.get('x-content-type-options') === 'nosniff');
check('a publication token also works on the shared thumbnail path the embed uses', [200, 204].includes(te.status), String(te.status));
await pub.setPublicView(false); await exp.setPublicView(false); await exp.unpublish();
const after = await Promise.all([thumb(`${shared(pub.view)}/thumbnail`), thumb(`/api/learn/boards/published/${exp.publication}/thumbnail`)]);
check('after revocation both thumbnails answer 404', after.every(t => t.status === 404), after.map(t => t.status).join(','));
await pub.setPublicView(true);
check('and it is not remembered: public again, the same token serves it again', (await thumb(`${shared(pub.view)}/thumbnail`)).status === 200);

// ---- E. owner (or any signed-in visitor) through the embed is a public guest ----
const mine = await get(owner, shared(pub.view), M);
check('the owner viewing their own embed gets the public view: no owner fields in the data', mine.status === 200 && !JSON.stringify(mine.body).includes(`embed-owner-${run}`) && !/edit_token|edit/.test(Object.keys(mine.body || {}).join(',')), Object.keys(mine.body || {}).join(','));
const probeOwner = await get(owner, `${shared(pub.view)}/ask`, M);
check('the owner\'s account does not stand in for an embed session: no rh_embed, no Chat', probeOwner.status === 200 && probeOwner.body?.embed?.session === false && (probeOwner.body?.guest ?? null) === null, JSON.stringify(probeOwner.body));
const viewerSend = await post(viewer, `${shared(pub.view)}/ask`, { message: 'hello' }, { ...M, 'X-RH-Action-Key': `k-${run}-a` });
check('a signed-in visitor\'s Send through the embed is refused for the missing session before any model call or count', viewerSend.status === 403 && viewerSend.body?.code === 'embed_session_required', `${viewerSend.status} ${JSON.stringify(viewerSend.body)}`);

// ---- F. the embed session, over HTTP (the browser proves the cookie round trip in embed-check.mjs) ----
const tripwire = async () => { const r = await fetch(`${BASE}/__provider-tripwire`).catch(() => null); return r?.ok ? (await r.json()).hits.length : null; };
const hitsBefore = await tripwire();
const initNo = await post(null, '/api/learn/boards/embed-session', {});
check('the embed-session init without the embed marker is refused and sets nothing', initNo.status === 400 && !initNo.headers.get('set-cookie'));
const init = await post(null, '/api/learn/boards/embed-session', {}, M);
const cookie = init.headers.get('set-cookie') || '';
const id = /rh_embed=([A-Za-z0-9_-]{32})/.exec(cookie)?.[1];
check('init issues rh_embed: HttpOnly, Secure, SameSite=None, Partitioned, Path under /api/learn, and no rh_guest', init.status === 200 && !!id && /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=None/i.test(cookie) && /Partitioned/i.test(cookie) && /Path=\/api\/learn/i.test(cookie) && !/rh_guest/.test(cookie), cookie);
const again = await post(null, '/api/learn/boards/embed-session', {}, { ...M, cookie: `rh_embed=${id}` });
check('init with a valid session never rotates it', again.status === 200 && !again.headers.get('set-cookie'));
const withCookie = await get(null, `${shared(pub.view)}/ask`, { ...M, cookie: `rh_embed=${id}` });
check('the probe reports a session only when the cookie came back, and the allowance is 10', withCookie.body?.embed?.session === true && withCookie.body?.guest?.limit === 10, JSON.stringify(withCookie.body));
const noSession = await post(null, `${shared(pub.view)}/ask`, { message: 'hello' }, { ...M, 'X-RH-Action-Key': `k-${run}-b`, cookie: 'rh_guest=' + 'g'.repeat(32) });
check('a Send with no rh_embed (even with an rh_guest) is a 403 embed_session_required: nothing minted, nothing counted', noSession.status === 403 && noSession.body?.code === 'embed_session_required' && !noSession.headers.get('set-cookie'), `${noSession.status} ${JSON.stringify(noSession.body)}`);
const hitsAfter = await tripwire();
check('no provider request left the stack for any of this', hitsBefore === null || hitsAfter === hitsBefore, `${hitsBefore} -> ${hitsAfter}`);

// ---- G. ordinary shared pages are unchanged ----
const plain = await get(null, shared(pub.view)), plainProbe = await api(null, `${shared(pub.view)}/ask`);
check('without the marker a /b link behaves as before: data for a signed-out visitor, and the old rh_guest cookie (Lax, not partitioned) with no rh_embed', plain.status === 200 && !noState(plain) && plainProbe.body?.guest?.limit === 10 && /rh_guest=/.test(plainProbe.headers.get('set-cookie') || '') && /SameSite=Lax/i.test(plainProbe.headers.get('set-cookie') || '') && !/Partitioned|rh_embed/.test(plainProbe.headers.get('set-cookie') || ''), plainProbe.headers.get('set-cookie') || '');

// ---- H. framing, in a real browser on a distinct origin ----
const host = await startHost();
const browser = await launchAvailable();
const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const page = await context.newPage();
const frameOf = async (path, pred) => {
  await page.goto(hostUrl(host, 'a', path, '&lazy=0'));
  const want = BASE + path;
  // A blocked frame ends on chrome-error://chromewebdata/ (the host cannot read why); a framed page keeps its address.
  await page.waitForFunction(() => document.querySelector('iframe'), null, { timeout: 15000 });
  const frame = () => page.frames().find(f => f !== page.mainFrame());
  const end = Date.now() + 30000;
  while (Date.now() < end) { const f = frame(); if (f && (f.url().startsWith(BASE) || f.url().startsWith('chrome-error:'))) return { f, url: f.url() }; await new Promise(r => setTimeout(r, 100)); } // wait for the frame's navigation to commit
  return { f: frame(), url: frame()?.url() };
};
const blocked = [];
for (const p of ['/sign-in', '/library', `/b/${pub.view}`]) blocked.push([p, (await frameOf(p)).url]);
check('a third-party site cannot frame sign-in, the library or an ordinary shared page', blocked.every(([, u]) => u.startsWith('chrome-error:')), JSON.stringify(blocked));
const ok = await frameOf(embedPath('b', pub.view));
check('the same third-party site can frame the embed page, and it renders there', ok.url.startsWith(`${BASE}/embed/b/`) && await ok.f.locator('[data-embed-root]').waitFor({ timeout: 60000 }).then(() => true, () => false), ok.url);
// Internal frames of our own pages keep working: same-origin frames (frame-ancestors self), and blob documents.
await page.goto(`${BASE}/sign-in`);
const internal = await page.evaluate(async () => {
  const load = src => new Promise(resolve => { const f = document.createElement('iframe'); f.src = src; f.onload = () => resolve(f); document.body.append(f); });
  const own = await load('/sign-in'), blob = await load(URL.createObjectURL(new Blob(['<p id="in">inside</p>'], { type: 'text/html' })));
  return { own: own.contentDocument?.location.pathname ?? null, blob: !!blob.contentDocument?.getElementById('in') };
});
check('internal iframes still load on our own pages: a same-origin page and a blob document', internal.own === '/sign-in' && internal.blob, JSON.stringify(internal));
await browser.close(); await host.close();
void SITE;
finish();
