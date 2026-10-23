// SHARE-04 embed, the browser half (contract.md "CI"; Embed.txt section 5): a public canvas embedded in a page on ANOTHER site,
// guest Chat through the partitioned embed session, once with third-party storage available and once with it blocked.
// LOCAL stack only (local D1 and R2), no model call, prints no secrets. Chromium (Playwright), driven by CI; nobody runs it locally.
//
// The host site (embed-harness.mjs startHost) is a Node http server on a different origin than the app:
//   app           http://127.0.0.1:8878                 (the CI stack)
//   cross-site A  http://localhost:<port>/host?src=...  (an iframe of the app: a true third-party frame)
//   cross-site B  http://127.0.0.2:<port>/host?src=...  (a second embedding site: its own cookie jar when partitioned)
//   same-site     http://127.0.0.1:<port>/host?src=...  (same site as the app, other origin: the account cookie rides along)
// Profiles: 'available' is default Chromium; 'blocked' is a profile whose cross-site frames cannot keep the app's cookie. Blocking
// is verified before it is used (harness crossSiteCookieKept: a canary cookie served on the app's host is neither returned nor in
// context.cookies()); the same canary must be KEPT in the available profile, or the pair proves nothing.
//
// What is real and what is scripted. REAL: the host origin, the iframe, the embed page, every GET (data, assets, thumbnail),
// the embed-session init, the probe (its answer must equal whether rh_embed really came back), a Send without the cookie (the
// server's 403 embed_session_required), the browser's cookie jar and which cookie each request carries. SCRIPTED: the model.
// The keyless CI stack has no model key and the ask route answers 503 before it admits, so a Send that carries the cookie is
// answered here with the SSE frames the server sends, counted by the rh_embed value the browser actually sent, with the server's
// rules (10 per jar, a retry of the same action key and message counts once, the 11th is 429 guest_limit). The server's own
// admission (atomic insert, 16 concurrent sends, hashes only) is proven against real SQLite by control-plane embed-session.test.js.
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/embed-check.mjs [shotsDir]
import { mkdirSync } from 'node:fs';
import { BASE, startHost, launchAvailable, blockedProfile, crossSiteCookieKept, sessionFor, run, api, makeCanvas, reporter, hostUrl, embedPath } from './embed-harness.mjs';

const TOTAL = 31; // bump with the checks below; the printed line is what CI reads
const { check, finish } = reporter('embed-check', TOTAL);
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const owner = { session: await sessionFor(`embedc-owner-${run}@example.com`, `embc_${run}`) };
const viewer = { session: await sessionFor(`embedc-viewer-${run}@example.org`, `embcv_${run}`) };
const TITLE = `Embedded canvas ${run}`;
const pub = await makeCanvas(owner, TITLE);
const path = embedPath('b', pub.view, '?chat=1'), plain = embedPath('b', pub.view);
const host = await startHost();
const DRAFT = `Why does attention scale by sqrt(d) ${run}?`;
const ANSWER = 'The scale keeps the dot products from growing with the head size.';

// ---- the network, recorded; the ask route, scripted behind the cookie ----
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
async function wire(context) {
  const s = { requests: [], probes: [], sends: [], used: new Map() }; // used: rh_embed value -> Map(turn -> replays)
  context.on('request', r => s.requests.push({ method: r.method(), url: r.url() }));
  const allowance = jar => { const used = s.used.get(jar)?.size ?? 0; return { limit: 10, used, remaining: 10 - used }; };
  await context.route(url => /^\/api\/learn\/boards\/shared\/[^/]+\/ask$/.test(url.pathname) && url.origin === BASE, async route => {
    const req = route.request(), headers = await req.allHeaders();
    const jar = /(?:^|;\s*)rh_embed=([^;]+)/.exec(headers.cookie || '')?.[1] ?? null;
    if (req.method() === 'GET') {
      const real = await route.fetch({ headers }), body = await real.json().catch(() => null);
      s.probes.push({ cookieSent: !!jar, account: /(?:^|;\s*)small_session=/.test(headers.cookie || ''), session: body?.embed?.session ?? null });
      return jar && body?.embed?.session === true ? route.fulfill({ response: real, json: { ...body, guest: allowance(jar) } }) : route.fulfill({ response: real });
    }
    const message = JSON.parse(req.postData() || '{}').message, key = headers['x-rh-action-key'] || '';
    if (!jar) { const real = await route.fetch({ headers }); s.sends.push({ jar: null, status: real.status(), code: (await real.json().catch(() => ({}))).code }); return route.fulfill({ response: real }); }
    const turns = s.used.get(jar) ?? new Map(), turn = `${key}\n${message}`;
    s.used.set(jar, turns);
    s.sends.push({ jar, turn, status: null });
    if (turns.has(turn)) { if (turns.get(turn) >= 2) return route.fulfill({ status: 429, json: { error: 'This message was already answered. Ask something new.', limited: true } }); turns.set(turn, turns.get(turn) + 1); }
    else if (turns.size >= 10) { s.sends.at(-1).status = 429; return route.fulfill({ status: 429, json: { error: 'You have used your 10 free messages. Sign in to continue.', code: 'guest_limit', signIn: true, guest: allowance(jar) } }); }
    else turns.set(turn, 0);
    s.sends.at(-1).status = 200;
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse('chunk', { text: ANSWER }) + sse('done', { ok: true, guest: allowance(jar) }) });
  });
  return s;
}
const frameOf = page => page.frames().find(f => f !== page.mainFrame() && f.url().startsWith(BASE));
const embedOf = async (page, src = path) => { const fl = page.frameLocator('iframe').first(); await fl.locator('[data-embed-root]').waitFor({ timeout: 60000 }); return fl; };
const openChat = async fl => { await fl.locator('[data-embed-chat-button]').click(); await fl.locator('[data-shared-ask]').waitFor({ timeout: 30000 }); };
const camera = fl => fl.locator('[data-canvas-surface]').evaluate(n => [...n.children].find(c => c.style.transform)?.style.transform ?? null);
async function send(fl, text) {
  const field = fl.locator('[data-shared-ask] [data-chat-composer] textarea'), answers = fl.locator('[data-shared-chat] [data-answer]');
  const before = await answers.count();
  await field.fill(text); await field.press('Enter');
  await answers.nth(before).waitFor({ timeout: 20000 });
}
const left = async (fl, n) => fl.locator('[data-guest-remaining]').filter({ hasText: `${n} of 10 free messages left` }).waitFor({ timeout: 20000 }).then(() => true, () => false);

// =====================================================================================================================
// 1. third-party storage AVAILABLE
// =====================================================================================================================
const browser = await launchAvailable();
const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
check('the cookie canary: a cross-site frame keeps a Secure SameSite=None Partitioned cookie in the available profile (the control for the blocked run)', await crossSiteCookieKept(host, context));
const net = await wire(context);
const page = await context.newPage();
await page.goto(hostUrl(host, 'a', path, '&lazy=0&h=480'));
let fl = await embedOf(page);
check('[available] the embed loads inside a page on another origin, as an iframe of the app', frameOf(page)?.url().startsWith(`${BASE}/embed/b/`) && new URL(page.url()).hostname !== new URL(BASE).hostname, frameOf(page)?.url());
check('[available] it shows the canvas title, Open in Rabbit Hole and Fork, and Chat only behind its button', (await fl.locator('[data-embed-title]').innerText()).trim() === TITLE && await fl.locator('[data-embed-open]').isVisible() && await fl.locator('[data-embed-fork]').isVisible() && await fl.locator('[data-embed-chat-button]').isVisible() && await fl.locator('[data-shared-ask]').count() === 0);
check('[available] it has no menubar, no Progress, no owner controls and no comments panel', await fl.locator('[data-share-button], [data-unpublish], [data-menubar], [data-comments-panel]').count() === 0);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-embed-available.png` });
// Opening the embed made no AI, capture, notebook or render request.
const writes = net.requests.filter(r => r.method !== 'GET' && !/\/api\/learn\/boards\/embed-session$/.test(new URL(r.url).pathname));
const heavy = net.requests.filter(r => new URL(r.url).origin !== BASE || /\/api\/(learn\/(tutor|chat|next-steps|capture)|.*(notebook|render|capture|video))/i.test(new URL(r.url).pathname));
check('[available] opening it makes no AI, capture, notebook or render request: no write but the session init, nothing to another origin', writes.length === 0 && heavy.length === 0, JSON.stringify([...writes, ...heavy].slice(0, 5)));
const plainPage = await context.newPage();
await plainPage.goto(hostUrl(host, 'a', plain, '&lazy=0'));
check('[available] without ?chat=1 there is no Chat button and no entry point at all', await (await embedOf(plainPage, plain)).locator('[data-embed-chat-button], [data-shared-ask]').count() === 0);
await plainPage.close();

// Chat: the session is confirmed (cookie came back) before Send is offered.
await openChat(fl);
check('[available] Chat opens on the button; the probe says the cookie came back, and 10 of 10 are left', await left(fl, 10) && net.probes.some(p => p.cookieSent && p.session === true));
const jar = (await context.cookies()).filter(c => c.name === 'rh_embed');
check('[available] the browser holds one rh_embed cookie: HttpOnly, Secure, SameSite=None, partitioned (when Playwright reports the partition)', jar.length === 1 && jar[0].httpOnly && jar[0].secure && jar[0].sameSite === 'None' && (jar[0].partitionKey === undefined || !!jar[0].partitionKey), JSON.stringify(jar.map(c => ({ ...c, value: '' }))));
check('[available] no rh_guest and no account cookie was set by the embed', !(await context.cookies()).some(c => c.name === 'rh_guest' || c.name === 'small_session'));
for (let i = 1; i <= 10; i++) await send(fl, `${DRAFT} ${i}`);
check('[available] messages 1 to 10 are accepted and each is answered', net.sends.filter(s => s.status === 200).length === 10 && await fl.locator('[data-shared-chat] [data-answer]').count() === 10 && await left(fl, 0));
const field = fl.locator('[data-shared-ask] [data-chat-composer] textarea');
await field.fill('The eleventh question'); await field.press('Enter');
await fl.locator('[data-guest-spent]').waitFor({ timeout: 20000 });
check('[available] message 11 is refused with its draft kept, no new answer and no extra count', net.sends.at(-1).status === 429 && await field.inputValue() === 'The eleventh question' && await fl.locator('[data-shared-chat] [data-answer]').count() === 10 && await left(fl, 0));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-embed-spent.png` });
await page.reload();
fl = await embedOf(page); await openChat(fl);
check('[available] a reload keeps the count (no fresh trial): still 0 of 10 left, the same cookie', await left(fl, 0) && (await context.cookies()).filter(c => c.name === 'rh_embed').length === 1);

// A second embedding site is a separate jar (partitioned): its own 10.
const siteB = await context.newPage();
await siteB.goto(hostUrl(host, 'b', path, '&lazy=0'));
const flB = await embedOf(siteB); await openChat(flB);
check('[available] another embedding site gets its own session and its own 10 messages (partitioned storage)', await left(flB, 10) && (await context.cookies()).filter(c => c.name === 'rh_embed').length === 2);
// A retry of one Send (same action key and message) counts once.
const retried = await frameOf(siteB).evaluate(async () => {
  const init = { method: 'POST', headers: { 'content-type': 'application/json', 'X-RH-Embed': '1', 'X-RH-Action-Key': 'retry-key-0001' }, body: JSON.stringify({ message: 'retry me', history: [] }) };
  const token = location.pathname.split('/').pop();
  const a = await fetch(`/api/learn/boards/shared/${token}/ask`, init), b = await fetch(`/api/learn/boards/shared/${token}/ask`, init);
  return [a.status, b.status];
});
await siteB.reload();
const flB2 = await embedOf(siteB); await openChat(flB2);
check('[available] a retry with the same action key counts once: 9 of 10 left, not 8', retried[0] === 200 && retried[1] === 200 && await left(flB2, 9));
// Two tabs of one site share the count, both ways.
const tabB = await context.newPage();
await tabB.goto(hostUrl(host, 'b', path, '&lazy=0'));
const flT = await embedOf(tabB); await openChat(flT);
check('[available] a second tab of the same site starts from the shared count: 9 of 10', await left(flT, 9));
await send(flB2, `${DRAFT} tab one`);
await send(flT, `${DRAFT} tab two`);
check('[available] two tabs share one count: after one Send in each, 7 of 10 are left in both', await left(flT, 7) && (await send(flB2, `${DRAFT} tab one again`), await left(flB2, 6)));
await siteB.close(); await tabB.close();

// Open in Rabbit Hole / Fork / sign-in return: the full site in a new tab, nothing private in any URL.
await page.reload();
fl = await embedOf(page);
const [opened] = await Promise.all([context.waitForEvent('page'), fl.locator('[data-embed-open]').click()]);
await opened.waitForURL(u => u.origin === BASE, { timeout: 30000 });
check('[available] Open in Rabbit Hole opens the full site in a new tab on the same canvas, with no embed page and no text in the URL', new URL(opened.url()).pathname === `/b/${pub.view}` && !opened.url().includes(encodeURIComponent(DRAFT)) && await opened.locator('[data-fork-button]').waitFor({ timeout: 60000 }).then(() => true, () => false) && await opened.locator('[data-embed-root]').count() === 0, opened.url());
await context.addCookies([{ name: 'small_session', value: viewer.session, url: BASE }]);
await opened.reload();
await opened.locator('[data-shared-ask] [data-chat-composer]').waitFor({ timeout: 60000 });
check('[available] signing in and coming back to that tab works: the same canvas, signed in, no guest count', new URL(opened.url()).pathname === `/b/${pub.view}` && await opened.locator('[data-guest-remaining]').count() === 0);
await context.clearCookies({ name: 'small_session' });
await opened.close();
const [forked] = await Promise.all([context.waitForEvent('page'), fl.locator('[data-embed-fork]').click()]);
await forked.waitForURL(u => u.origin === BASE, { timeout: 30000 });
check('[available] Fork opens the full site in a new tab with the link token and nothing else private in the URL', forked.url().includes(pub.view) && !forked.url().includes(DRAFT) && !/[?&](draft|message|text)=/.test(forked.url()), forked.url());
await forked.close();

// Wheel: plain wheel over the embed scrolls the host page, never the canvas; ctrl+wheel zooms the canvas only.
const wheel = await context.newPage();
await wheel.setViewportSize({ width: 1000, height: 700 });
await wheel.goto(hostUrl(host, 'a', plain, '&lazy=0&h=480'));
const flW = await embedOf(wheel, plain);
await wheel.evaluate(() => document.getElementById('f0').scrollIntoView({ block: 'center' }));
const box = await wheel.locator('#f0').boundingBox(), scrollY = () => wheel.evaluate(() => window.scrollY);
const y0 = await scrollY(), cam0 = await camera(flW);
await wheel.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await wheel.mouse.wheel(0, 300);
await wheel.waitForFunction(y => window.scrollY > y, y0, { timeout: 15000 }).catch(() => {});
check('[available] a plain wheel over the embed scrolls the host page and leaves the canvas zoom alone', (await scrollY()) > y0 && await camera(flW) === cam0, `${y0} -> ${await scrollY()}; ${cam0} -> ${await camera(flW)}`);
const y1 = await scrollY();
await wheel.mouse.click(box.x + 40, box.y + box.height - 60); // focus the canvas on empty paper
await wheel.keyboard.down('Control'); await wheel.mouse.wheel(0, -240); await wheel.keyboard.up('Control');
const zoomed = await flW.locator('[data-canvas-surface]').evaluate(async (n, before) => { for (let i = 0; i < 100; i++) { const t = [...n.children].find(c => c.style.transform)?.style.transform; if (t && t !== before) return t; await new Promise(r => setTimeout(r, 100)); } return null; }, cam0);
check('[available] ctrl+wheel on the focused canvas zooms the canvas and does not scroll the host page', !!zoomed && await scrollY() === y1, `${cam0} -> ${zoomed}; scroll ${y1} -> ${await scrollY()}`);
await wheel.close();
await page.close();

// The owner viewing their own embed (same-site host, so the account cookie really rides along): a public guest, no powers.
const ownerCtx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
await ownerCtx.addCookies([{ name: 'small_session', value: owner.session, url: BASE }]);
const ownerNet = await wire(ownerCtx);
const ownerPage = await ownerCtx.newPage();
const versionBefore = (await api(owner, pub.board)).body.version;
await ownerPage.goto(hostUrl(host, 'same', path, '&lazy=0'));
const flO = await embedOf(ownerPage); await openChat(flO);
check('[available] the owner viewing their own embed gets the guest view: 10 of 10 guest messages, no Share, no Unpublish, no owner controls', await left(flO, 10) && await flO.locator('[data-share-button], [data-unpublish], [data-menubar], [data-owner-controls]').count() === 0);
const canvasBox = await ownerPage.locator('iframe').boundingBox();
await ownerPage.mouse.dblclick(canvasBox.x + 60, canvasBox.y + canvasBox.height - 80);
await ownerPage.keyboard.type('owner edit');
await send(flO, `${DRAFT} owner`);
const versionAfter = (await api(owner, pub.board)).body.version;
check('[available] the owner\'s edits in the embed stay in the tab: no write request, the source board version is unchanged', ownerNet.requests.filter(r => r.method !== 'GET' && !/\/ask$|\/embed-session$/.test(new URL(r.url).pathname)).length === 0 && versionAfter === versionBefore, `${versionBefore} -> ${versionAfter}`);
await ownerCtx.close();
check('[available] the control: the owner\'s account cookie really rode along on this same-site embed (so ignoring it is the server\'s doing), and every Send was counted by the rh_embed cookie', ownerNet.probes.some(p => p.account) && ownerNet.sends.length > 0 && ownerNet.sends.every(s => s.jar));
await context.close(); await browser.close();

// =====================================================================================================================
// 2. third-party storage BLOCKED
// =====================================================================================================================
const blocked = await blockedProfile(host);
check('the cookie canary: in the blocked profile a cross-site frame\'s cookie is neither returned nor stored (verified, not assumed)', await crossSiteCookieKept(host, blocked.context) === false);
const bnet = await wire(blocked.context);
const bpage = await blocked.context.newPage();
await bpage.goto(hostUrl(host, 'a', path, '&lazy=0&h=480'));
const flX = await embedOf(bpage);
check('[blocked] the embed still renders the canvas read-only', (await flX.locator('[data-embed-title]').innerText()).trim() === TITLE);
await openChat(flX).catch(async () => { await flX.locator('[data-embed-chat-button]').click(); });
await flX.locator('[data-embed-chat-fallback]').waitFor({ timeout: 30000 });
check('[blocked] Open Chat in Rabbit Hole is offered, and the browser really holds no rh_embed', await flX.locator('[data-embed-chat-fallback]').isVisible() && !(await blocked.context.cookies()).some(c => c.name === 'rh_embed'));
check('[blocked] the probe saw no cookie come back and said so; no Send went out', bnet.probes.length > 0 && bnet.probes.every(p => !p.cookieSent && p.session === false) && bnet.sends.length === 0, JSON.stringify(bnet.probes));
const bfield = flX.locator('[data-shared-ask] [data-chat-composer] textarea');
const canSend = await flX.locator('[data-shared-ask] [data-chat-composer] button[type="submit"]:not([disabled]), [data-shared-ask] [data-chat-composer] [data-send]:not([disabled])').count();
if (await bfield.count()) { await bfield.fill(DRAFT); await bfield.press('Enter'); }
check('[blocked] Send is not offered: no enabled Send, and Enter in the composer sends nothing', canSend === 0 && bnet.sends.length === 0 && !bnet.requests.some(r => r.method === 'POST' && /\/ask$/.test(new URL(r.url).pathname)));
const [handoff] = await Promise.all([blocked.context.waitForEvent('page'), flX.locator('[data-embed-chat-fallback]').click()]);
await handoff.waitForURL(u => u.origin === BASE, { timeout: 30000 });
const draftBack = handoff.locator('[data-shared-ask] [data-chat-composer] textarea');
await draftBack.waitFor({ timeout: 60000 });
check('[blocked] Open Chat in Rabbit Hole opens the full site on the same canvas with the draft preserved and not sent', new URL(handoff.url()).pathname === `/b/${pub.view}` && await draftBack.inputValue().then(v => v === DRAFT || DRAFT.startsWith(v) && v.length > 0, () => false) && !bnet.sends.length, `${handoff.url()} / ${await draftBack.inputValue().catch(() => null)}`);
const hostMessages = await bpage.evaluate(() => window.__messages), opener = await handoff.evaluate(() => !!window.opener);
check('[blocked] the draft travels by direct window messaging only: the new tab keeps its opener, the host page received no message holding the draft, and it is in no URL (the new tab\'s or any request the embed made)', opener && !hostMessages.some(m => m.includes(DRAFT)) && ![handoff.url(), ...bnet.requests.map(r => r.url)].some(u => decodeURIComponent(u).includes(DRAFT) || u.includes(encodeURIComponent(DRAFT))), JSON.stringify({ opener, hostMessages }));
await handoff.close();
await blocked.close();
await host.close();
void viewer;
finish();
