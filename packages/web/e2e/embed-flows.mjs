// SHARE-04 embed, the browser half (contract.md "CI"; Embed.txt section 5): a public canvas embedded in a page on ANOTHER site,
// guest Chat through the partitioned embed session, the hand-off to the full site, in Chromium, Firefox and WebKit
// (embed-check.mjs, embed-firefox-check.mjs and embed-webkit-check.mjs each call runEmbed once; CI runs them as separate checks).
// LOCAL stack only (local D1 and R2), no model call, prints no secrets. Driven by CI; nobody runs it locally.
//
// The host site (embed-harness.mjs startHost) is a Node http server on a different origin than the app:
//   app           http://127.0.0.1:8878                 (the CI stack)
//   cross-site A  http://localhost:<port>/host?src=...  (an iframe of the app: a true third-party frame)
//   cross-site B  http://127.0.0.2:<port>/host?src=...  (a second embedding site: its own cookie jar when partitioned)
//   same-site     http://127.0.0.1:<port>/host?src=...  (same site as the app, other origin: the account cookie rides along)
// Which flow runs is decided by the browser, never by its name: a canary cookie served on the app's host (Secure; SameSite=None;
// Partitioned) is framed under the cross-site host page, and what the browser sends back and what its jar holds decide.
//   canary kept  -> the AVAILABLE flow: guest admission 1-10, refusal of 11, reload, two tabs, retry, owner, wheel, hand-off.
//   canary lost  -> the BLOCKED flow: no cookie, Open Chat in Rabbit Hole, the draft hand-off and its failure path.
// The BLOCKED flow also runs in a context forced to refuse the cookie where the engine can be told to (Chromium: a Preferences
// file; Firefox: network.cookie.cookieBehavior 1), verified by the same canary. WebKit means Playwright's WebKit build, not Safari.
//
// What is real and what is scripted. REAL: the host origin, the iframe, the embed page, every GET (data, assets, thumbnail),
// the embed-session init, the probe (its answer must equal whether rh_embed really came back), a Send without the cookie (the
// server's 403 embed_session_required), the browser's cookie jar and which cookie each request carries, the hand-off messages.
// SCRIPTED: the model. The keyless CI stack has no model key and the ask route answers 503 before it admits, so a Send that
// carries the cookie is answered here with the SSE frames the server sends, counted by the rh_embed value the browser actually
// sent, with the server's rules (10 per jar, a retry of the same action key and message counts once, the 11th is 429
// guest_limit). The server's own admission (atomic insert, 16 concurrent sends, hashes only) is proven against real SQLite by
// control-plane embed-session.test.js. The 60 s offer expiry and single use of a hand-off are proven by web embed-api.test.mjs.
import { mkdirSync } from 'node:fs';
import { contextOptions, startHost, launchEngine, forcedBlocked, crossSiteCookieKept, sessionFor, run, api, makeCanvas, reporter, hostUrl, embedPath } from './embed-harness.mjs';

const AVAILABLE = 26, BLOCKED = 11; // checks per flow; bump with the checks below (the flow fails if the number that ran differs)
const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export async function runEmbed(engine) {
  const { check, finish, results, plan } = reporter(`embed-${engine}`);
  const SHOTS = process.argv[2] || null;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const owner = { session: await sessionFor(`embedc-${engine}-owner-${run}@example.com`, `emb${engine.slice(0, 2)}_${run}`) };
  const viewer = { session: await sessionFor(`embedc-${engine}-viewer-${run}@example.org`, `embv${engine.slice(0, 2)}_${run}`) };
  const TITLE = `Embedded canvas ${engine} ${run}`;
  const pub = await makeCanvas(owner, TITLE);
  const path = embedPath('b', pub.view, '?chat=1'), plain = embedPath('b', pub.view);
  const host = await startHost();
  const SITE_A = new URL(hostUrl(host, 'a', '/x')).hostname, SITE_B = new URL(hostUrl(host, 'b', '/x')).hostname;
  const APP = host.app; // what the browser sees: the app behind https (the stack itself is http, BASE)
  const DRAFT = `Why does attention scale by sqrt(d) ${engine} ${run}?`;
  const ANSWER = 'The scale keeps the dot products from growing with the head size.';

  // ---- the network, recorded; the ask route, scripted behind the cookie ----
  async function wire(context) {
    const s = { requests: [], probes: [], sends: [], inits: [], used: new Map() }; // used: embedding site -> Map(turn -> replays)
    context.on('request', r => s.requests.push({ method: r.method(), url: r.url() }));
    // The browser's own word on its cookie: the init answers created:true when the request it sent carried no valid rh_embed and
    // created:false when it carried one (a real round trip through the browser's jar, no script involved).
    context.on('requestfinished', async r => {
      if (!/\/api\/learn\/boards\/embed-session$/.test(new URL(r.url()).pathname)) return;
      try {
        const site = new URL(r.frame().page().mainFrame().url()).hostname;
        s.inits.push({ site, created: (await (await r.response()).json()).created });
      } catch (error) { s.inits.push({ error: String(error).slice(0, 120) }); }
    });
    const allowance = jar => { const used = s.used.get(jar)?.size ?? 0; return { limit: 10, used, remaining: 10 - used }; };
    const json = text => { try { return JSON.parse(text); } catch { return null; } };
    await context.route(url => /^\/api\/learn\/boards\/shared\/[^/]+\/ask$/.test(url.pathname) && url.origin === APP, async route => {
      const req = route.request(), headers = await req.allHeaders();
      // The count is kept per embedding site, as a partitioned jar keeps it. A Playwright request does not list a partitioned
      // cookie among its headers, so the cookie is read from the browser's jar: present means this browser holds a session.
      const site = new URL(req.frame().page().mainFrame().url()).hostname;
      const mine = (await context.cookies()).filter(c => c.name === 'rh_embed');
      const cookie = mine.length === 1 ? mine[0] : mine.find(c => JSON.stringify(c.partitionKey ?? '').includes(site)) ?? null;
      const fromHeader = /(?:^|;\s*)rh_embed=/.test(headers.cookie || '');
      const jar = fromHeader || cookie ? site : null;
      // route.fetch does not take a partitioned cookie from the jar: the cookie the browser holds for this site goes on the request.
      if (cookie && !fromHeader) headers.cookie = [headers.cookie, `rh_embed=${cookie.value}`].filter(Boolean).join('; ');
      if (req.method() === 'GET') {
        const real = await route.fetch({ headers }), text = await real.text(), body = json(text);
        s.probes.push({ cookieSent: !!jar, account: /(?:^|;\s*)small_session=/.test(headers.cookie || ''), session: body?.embed?.session ?? null });
        if (jar && body?.embed?.session === true) return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify({ ...body, guest: allowance(jar) }) });
        return route.fulfill({ status: real.status(), headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: text });
      }
      const message = json(req.postData() || '{}')?.message, key = headers['x-rh-action-key'] || '';
      if (!jar) { const real = await route.fetch({ headers }), text = await real.text(); s.sends.push({ jar: null, status: real.status(), code: json(text)?.code }); return route.fulfill({ status: real.status(), headers: { 'content-type': 'application/json' }, body: text }); }
      const turns = s.used.get(jar) ?? new Map(), turn = `${key}\n${message}`;
      s.used.set(jar, turns);
      s.sends.push({ jar, turn, status: null });
      if (turns.has(turn)) { if (turns.get(turn) >= 2) return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'This message was already answered. Ask something new.', limited: true }) }); turns.set(turn, turns.get(turn) + 1); }
      else if (turns.size >= 10) { s.sends.at(-1).status = 429; return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'You have used your 10 free messages. Sign in to continue.', code: 'guest_limit', signIn: true, guest: allowance(jar) }) }); }
      else turns.set(turn, 0);
      s.sends.at(-1).status = 200;
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse('chunk', { text: ANSWER }) + sse('done', { ok: true, guest: allowance(jar) }) });
    });
    return s;
  }
  const frameOf = page => page.frames().find(f => f !== page.mainFrame() && f.url().startsWith(APP));
  const embedOf = async page => { const fl = page.frameLocator('iframe').first(); await fl.locator('[data-embed-root]').waitFor({ timeout: 60000 }); return fl; };
  const openChat = async fl => { await fl.locator('[data-embed-chat-button]').click(); await fl.locator('[data-shared-ask]').waitFor({ timeout: 30000 }); };
  const camera = fl => fl.locator('[data-canvas-surface]').evaluate(n => [...n.children].find(c => c.style.transform)?.style.transform ?? null);
  async function send(fl, text) {
    const field = fl.locator('[data-shared-ask] [data-chat-composer] textarea'), answers = fl.locator('[data-shared-chat] [data-answer]');
    const before = await answers.count();
    await field.fill(text); await field.press('Enter');
    await answers.nth(before).waitFor({ timeout: 20000 });
  }
  // At 0 the page replaces the "N of 10 free messages left" line with the used-up notice.
  const left = async (fl, n) => (n === 0 ? fl.locator('[data-guest-spent]') : fl.locator('[data-guest-remaining]').filter({ hasText: `${n} of 10 free messages left` })).waitFor({ timeout: 20000 }).then(() => true, () => false);
  const flow = async (name, expected, body) => { const before = results.length; plan(expected); await body(); if (results.length - before !== expected) check(`${name}: ran ${results.length - before} checks, expected ${expected}`, false); };
  // Closes every tab the page opens while `on` (a full site tab that never answers).
  const closeNextTab = context => { const state = { on: false, closed: 0 }; context.on('page', p => { if (state.on) { state.closed++; p.close().catch(() => {}); } }); return state; };
  // A smooth wheel scroll is still moving when scrollY first changes: wait until two reads 150 ms apart agree.
  const settled = async page => { let last = -1; for (let i = 0; i < 60; i++) { const y = await page.evaluate(() => window.scrollY); if (y === last) return y; last = y; await new Promise(r => setTimeout(r, 150)); } return last; };
  // Asks the embed session init again from inside the frame: created:false only if THIS frame sent a valid rh_embed (idempotent).
  const initProbe = page => frameOf(page).evaluate(async () => (await (await fetch('/api/learn/boards/embed-session', { method: 'POST', headers: { 'X-RH-Embed': '1' } })).json()).created);
  // A point on bare canvas paper (no card, shape, button or link under it), in the page's coordinates: the canvas ignores the wheel over a card.
  async function barePoint(page, locator = 'iframe') {
    const box = await page.locator(locator).boundingBox();
    const at = await frameOf(page).evaluate(() => {
      const surface = document.querySelector('[data-canvas-surface]').getBoundingClientRect(), cx = surface.x + surface.width / 2, cy = surface.y + surface.height / 2;
      const points = [];
      for (let y = surface.y + 20; y < surface.bottom - 20; y += 24) for (let x = surface.x + 20; x < surface.right - 20; x += 24) points.push({ x, y, d: Math.hypot(x - cx, y - cy) });
      for (const p of points.sort((m, n) => m.d - n.d)) {
        const el = document.elementFromPoint(p.x, p.y);
        if (el?.closest('[data-canvas-surface]') && !el.closest('[data-block-id],[data-item-id],[data-shape-id],[role="dialog"],[data-zoom],[data-canvas-minimap],button,a')) return { x: p.x, y: p.y };
      }
      return null;
    });
    return at && { x: box.x + at.x, y: box.y + at.y };
  }
  const hostMessages = page => page.evaluate(() => window.__messages);
  const hasDraft = u => decodeURIComponent(u).includes(DRAFT) || u.includes(encodeURIComponent(DRAFT));
  // The host page (another origin) forges every hand-off message it can into the embed's window: none may be believed.
  const forge = (page, token) => page.evaluate(token => {
    const w = document.querySelector('iframe').contentWindow;
    for (const type of ['rh-embed-handoff-ack', 'rh-embed-handoff-request', 'rh-embed-handoff']) w.postMessage({ type, token, chatDraft: 'forged' }, '*');
  }, token);
  // A visitor's edit: the rectangle tool and a drag, as the shared-canvas checks make one (the page gets its unsaved-changes notice).
  async function draw(page, fl) {
    await page.locator('iframe').scrollIntoViewIfNeeded();
    const box = await page.locator('iframe').boundingBox();
    const bare = await barePoint(page);
    await page.mouse.click(bare?.x ?? box.x + 40, bare?.y ?? box.y + box.height - 40);
    const at = (x, y) => frameOf(page).evaluate(([x, y]) => {
      const world = document.querySelector('[data-canvas-surface] > div[style*="scale"]'), m = new DOMMatrix(getComputedStyle(world).transform), b = world.parentElement.getBoundingClientRect();
      return { x: b.left + m.e + x * m.a, y: b.top + m.f + y * m.d };
    }, [x, y]);
    const [from, to] = [await at(420, 360), await at(560, 440)];
    await page.keyboard.press('r');
    await page.mouse.move(box.x + from.x, box.y + from.y); await page.mouse.down(); await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 6 }); await page.mouse.up();
    await page.keyboard.press('Escape');
    await fl.locator('[data-guest-draft-notice]').waitFor({ timeout: 8000 }).catch(() => {});
    if (await fl.locator('[data-guest-draft-notice]').count() === 1) return true;
    // The rectangle did not register: move a card instead (the same kind of edit).
    const card = await fl.locator('[data-block-id]').first().boundingBox();
    if (card) { await page.mouse.move(card.x + card.width / 2, card.y + 12); await page.mouse.down(); await page.mouse.move(card.x + card.width / 2 + 90, card.y + 70, { steps: 8 }); await page.mouse.up(); }
    await fl.locator('[data-guest-draft-notice]').waitFor({ timeout: 8000 }).catch(() => {});
    const ok = await fl.locator('[data-guest-draft-notice]').count() === 1;
    if (!ok && SHOTS) await page.screenshot({ path: `${SHOTS}/draw-failed-${engine}.png` });
    return ok;
  }

  // ===================================================================================================================
  // the browser, and which flow it gets
  // ===================================================================================================================
  const browser = await launchEngine(engine, engine === 'firefox' ? { firefoxUserPrefs: { 'network.cookie.cookieBehavior': 5 } } : {}); // 5: Firefox's own default, state partitioning
  const context = await browser.newContext(contextOptions);
  plan(1);
  const kept = await crossSiteCookieKept(host, context);
  check(`[${engine}] canary: a Secure SameSite=None Partitioned cookie from the app's host in a cross-site frame is ${kept ? 'kept' : 'NOT kept'} by this browser (decides the flow; Chromium must keep it)`, engine !== 'chromium' || kept);

  // ===================================================================================================================
  // AVAILABLE: the browser keeps and returns the partitioned cookie
  // ===================================================================================================================
  async function available() {
    const tag = `[${engine} available]`;
    const net = await wire(context);
    const page = await context.newPage();
    await page.goto(hostUrl(host, 'a', path, '&lazy=0&h=480'));
    let fl = await embedOf(page);
    check(`${tag} the embed loads inside a page on another origin, as an iframe of the app`, frameOf(page)?.url().startsWith(`${APP}/embed/b/`) && new URL(page.url()).hostname !== new URL(APP).hostname, frameOf(page)?.url());
    check(`${tag} it shows the canvas title, Open in Rabbit Hole and Fork, and Chat only behind its button`, (await fl.locator('[data-embed-title]').innerText()).trim() === TITLE && await fl.locator('[data-embed-open]').isVisible() && await fl.locator('[data-embed-fork]').isVisible() && await fl.locator('[data-embed-chat-button]').isVisible() && await fl.locator('[data-shared-ask]').count() === 0);
    check(`${tag} it has no menubar, no Progress, no owner controls and no comments panel`, await fl.locator('[data-share-button], [data-unpublish], [data-menubar], [data-comments-panel]').count() === 0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-embed-${engine}.png` });
    const own = net.requests.filter(r => new URL(r.url).port !== String(host.port));
    const writes = own.filter(r => r.method !== 'GET' && !/\/api\/learn\/boards\/embed-session$/.test(new URL(r.url).pathname));
    const heavy = own.filter(r => new URL(r.url).origin !== APP || /\/api\/(learn\/(tutor|chat|next-steps|capture)|.*(notebook|render|capture|video))/i.test(new URL(r.url).pathname));
    check(`${tag} opening it makes no AI, capture, notebook or render request: no write but the session init, nothing to another origin`, writes.length === 0 && heavy.length === 0, JSON.stringify([...writes, ...heavy].slice(0, 5)));
    const plainPage = await context.newPage();
    await plainPage.goto(hostUrl(host, 'a', plain, '&lazy=0'));
    check(`${tag} without ?chat=1 there is no Chat button and no entry point at all`, await (await embedOf(plainPage)).locator('[data-embed-chat-button], [data-shared-ask]').count() === 0);
    await plainPage.close();

    await openChat(fl);
    check(`${tag} Chat opens on the button; the probe says the cookie came back, and 10 of 10 are left`, await left(fl, 10) && net.probes.some(p => p.cookieSent && p.session === true), JSON.stringify(net.probes));
    const jar = (await context.cookies()).filter(c => c.name === 'rh_embed');
    check(`${tag} the browser holds one rh_embed cookie: HttpOnly, Secure (partitioned where the driver reports the partition)`, jar.length === 1 && jar[0].httpOnly && jar[0].secure && (jar[0].partitionKey === undefined || !!jar[0].partitionKey), JSON.stringify(jar.map(c => ({ ...c, value: '' }))));
    check(`${tag} no rh_guest and no account cookie was set by the embed`, !(await context.cookies()).some(c => c.name === 'rh_guest' || c.name === 'small_session'));
    for (let i = 1; i <= 10; i++) await send(fl, `${DRAFT} ${i}`);
    check(`${tag} messages 1 to 10 are accepted and each is answered`, net.sends.filter(s => s.status === 200).length === 10 && await fl.locator('[data-shared-chat] [data-answer]').count() === 10 && await left(fl, 0), JSON.stringify({ sends: net.sends.map(s => s.status), answers: await fl.locator('[data-shared-chat] [data-answer]').count(), remaining: await fl.locator('[data-guest-remaining]').allInnerTexts() }));
    const field = fl.locator('[data-shared-ask] [data-chat-composer] textarea');
    await field.fill('The eleventh question');
    const [spentTab] = await Promise.all([context.waitForEvent('page'), field.press('Enter')]);
    await spentTab.waitForURL(u => u.origin === APP, { timeout: 30000 });
    check(`${tag} message 11 is not sent: the used-up notice is up, Send hands the draft to the full site in a new tab instead, no request is made and no answer is added`, await fl.locator('[data-guest-spent]').isVisible() && net.sends.length === 10 && net.sends.every(s => s.status === 200) && await fl.locator('[data-shared-chat] [data-answer]').count() === 10 && new URL(spentTab.url()).pathname === `/b/${pub.view}`, JSON.stringify({ sends: net.sends.length, url: spentTab.url() }));
    await spentTab.close();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-spent-${engine}.png` });
    await page.reload();
    fl = await embedOf(page);
    const initAfterReload = await initProbe(page);
    await openChat(fl);
    check(`${tag} a reload keeps the count (no fresh trial): the browser sent its cookie back (init created:false), still 0 of 10 left, still one cookie`, await left(fl, 0) && initAfterReload === false && (await context.cookies()).filter(c => c.name === 'rh_embed').length === 1, JSON.stringify({ initAfterReload }));

    const siteB = await context.newPage();
    await siteB.goto(hostUrl(host, 'b', path, '&lazy=0'));
    const flB = await embedOf(siteB);
    const initB = await initProbe(siteB); // site A already holds a cookie: created:true here means B's frame sent none, a separate jar
    await openChat(flB);
    const partitioned = initB === true;
    if (!partitioned) console.log(`FINDING [${engine}] a second embedding site sent the first site's rh_embed cookie back (init created:false): this browser does not partition it, so its count is per browser, not per embedding site. ${JSON.stringify(net.inits)}`);
    check(`${tag} another embedding site gets its own session (its first init created:true although site A already holds one) and its own 10 messages: partitioned storage${partitioned ? '' : ' (FINDING: not partitioned in this browser, see the FINDING line; only Chromium is required to partition)'}`, await left(flB, 10) && (partitioned || engine !== 'chromium'), JSON.stringify({ initB }));
    const retried = await frameOf(siteB).evaluate(async () => {
      const init = { method: 'POST', headers: { 'content-type': 'application/json', 'X-RH-Embed': '1', 'X-RH-Action-Key': 'retry-key-0001' }, body: JSON.stringify({ message: 'retry me', history: [] }) };
      const token = location.pathname.split('/').pop();
      const a = await fetch(`/api/learn/boards/shared/${token}/ask`, init), b = await fetch(`/api/learn/boards/shared/${token}/ask`, init);
      return [a.status, b.status];
    });
    await siteB.reload();
    const flB2 = await embedOf(siteB); await openChat(flB2);
    check(`${tag} a retry with the same action key counts once: 9 of 10 left, not 8`, retried[0] === 200 && retried[1] === 200 && await left(flB2, 9));
    const tabB = await context.newPage();
    await tabB.goto(hostUrl(host, 'b', path, '&lazy=0'));
    const flT = await embedOf(tabB); await openChat(flT);
    check(`${tag} a second tab of the same site starts from the shared count: 9 of 10`, await left(flT, 9));
    await send(flB2, `${DRAFT} tab one`);
    await send(flT, `${DRAFT} tab two`);
    check(`${tag} two tabs share one count: after one Send in each, 7 of 10 are left in both`, await left(flT, 7) && (await send(flB2, `${DRAFT} tab one again`), await left(flB2, 6)));
    await siteB.close(); await tabB.close();

    // Open in Rabbit Hole / sign-in return.
    await page.reload();
    fl = await embedOf(page);
    const [opened] = await Promise.all([context.waitForEvent('page'), fl.locator('[data-embed-open]').click()]);
    await opened.waitForURL(u => u.origin === APP, { timeout: 30000 });
    check(`${tag} Open in Rabbit Hole opens the full site in a new tab on the same canvas, with no embed page and no text in the URL`, new URL(opened.url()).pathname === `/b/${pub.view}` && !hasDraft(opened.url()) && await opened.locator('[data-fork-button]').waitFor({ timeout: 60000 }).then(() => true, () => false) && await opened.locator('[data-embed-root]').count() === 0, opened.url());
    await context.addCookies([{ name: 'small_session', value: viewer.session, url: APP }]);
    await opened.reload();
    await opened.locator('[data-shared-ask] [data-chat-composer]').waitFor({ timeout: 60000 });
    check(`${tag} signing in and coming back to that tab works: the same canvas, signed in, no guest count`, new URL(opened.url()).pathname === `/b/${pub.view}` && await opened.locator('[data-guest-remaining]').count() === 0);
    await context.clearCookies({ name: 'small_session' });
    await opened.close();

    // The hand-off of the visitor's edits: kept until the new tab acknowledges; on failure Retry and Fork original instead.
    const tabs = closeNextTab(context);
    const edited = await draw(page, fl);
    const stored = await frameOf(page).evaluate(() => Object.keys(sessionStorage).filter(k => /guest-draft/.test(k))).catch(e => String(e));
    if (edited) {
      const t0 = Date.now();
      tabs.on = true;
      await fl.locator('[data-embed-fork]').click();
      await forge(page, pub.view); // while the offer is pending, the embedding page can change nothing
      await fl.locator('[data-embed-handoff-failed]').waitFor({ timeout: 40000 });
      const took = Date.now() - t0;
      tabs.on = false;
      check(`${tag} when the new tab never acknowledges (closed at once), the embed says so after about 15 s and offers Retry and Fork original instead; the edits are still there`, took >= 10000 && took <= 35000 && edited && await fl.locator('[data-embed-handoff-retry]').isVisible() && await fl.locator('[data-embed-handoff-original]').isVisible() && await fl.locator('[data-guest-draft-notice]').count() === 1, `${took} ms, edited ${edited}, closed ${tabs.closed}`);
      check(`${tag} a forged request or acknowledgement from the embedding page is ignored: the failure stands, and the embedding page received no message from the hand-off`, await fl.locator('[data-embed-handoff-failed]').isVisible() && (await hostMessages(page)).length === 0, JSON.stringify(await hostMessages(page)));
      const [retry] = await Promise.all([context.waitForEvent('page'), fl.locator('[data-embed-handoff-retry]').click()]);
      await retry.waitForURL(u => u.origin === APP, { timeout: 30000 });
      await fl.locator('[data-embed-handoff-failed]').waitFor({ state: 'hidden', timeout: 30000 });
      check(`${tag} Retry opens a new tab that acknowledges: the failure notice goes, the tab is the full site (flags only in the URL)`, new URL(retry.url()).pathname === `/b/${pub.view}` && !/state|shape|rect/.test(retry.url()) && await retry.locator('[data-fork-button]').waitFor({ timeout: 60000 }).then(() => true, () => false), retry.url());
      await retry.close();
      tabs.on = true;
      await fl.locator('[data-embed-fork]').click();
      await fl.locator('[data-embed-handoff-failed]').waitFor({ timeout: 40000 });
      tabs.on = false;
      const [original] = await Promise.all([context.waitForEvent('page'), fl.locator('[data-embed-handoff-original]').click()]);
      await original.waitForURL(u => u.origin === APP, { timeout: 30000 });
      check(`${tag} Fork original instead is an explicit choice: it opens the original canvas to fork, with no hand-off flag and nothing of the edits in the URL`, new URL(original.url()).pathname === `/b/${pub.view}` && !/from=embed/.test(original.url()) && /fork=1/.test(original.url()), original.url());
      await original.close();

    } else {
      for (const what of ['when the new tab never acknowledges the embed says so after about 15 s, offers Retry and Fork original instead, and keeps the edits', 'a forged request or acknowledgement from the embedding page is ignored', 'Retry opens a new tab that acknowledges and the failure notice goes', 'Fork original instead is an explicit choice']) check(`${tag} ${what}`, false, `the rectangle drag raised no unsaved-changes notice, so there was nothing to hand off (guest-draft keys in the frame: ${JSON.stringify(stored)}, cards ${await fl.locator('[data-block-id]').count()}, canvas ${JSON.stringify(await fl.locator('[data-canvas-surface]').boundingBox())}, iframe ${JSON.stringify(await page.locator('iframe').boundingBox())})`);
    }

    // Wheel: plain wheel over the embed scrolls the host page, never the canvas; ctrl+wheel zooms the canvas only.
    const wheel = await context.newPage();
    await wheel.setViewportSize({ width: 1000, height: 700 });
    await wheel.goto(hostUrl(host, 'a', plain, '&lazy=0&h=480'));
    const flW = await embedOf(wheel);
    await wheel.evaluate(() => document.getElementById('f0').scrollIntoView({ block: 'center' }));
    const box = await wheel.locator('#f0').boundingBox(), scrollY = () => wheel.evaluate(() => window.scrollY);
    const y0 = await scrollY(), cam0 = await camera(flW);
    await wheel.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await wheel.mouse.wheel(0, 300);
    await wheel.waitForFunction(y => window.scrollY > y, y0, { timeout: 15000 }).catch(() => {});
    check(`${tag} a plain wheel over the embed scrolls the host page and leaves the canvas zoom alone`, (await scrollY()) > y0 && await camera(flW) === cam0, `${y0} -> ${await scrollY()}; ${cam0} -> ${await camera(flW)}`);
    const y1 = await settled(wheel);
    const box2 = await wheel.locator('#f0').boundingBox(); // the wheel scrolled the page: measure again
    const bare = await barePoint(wheel, '#f0') ?? { x: box2.x + 40, y: box2.y + box2.height - 60 };
    await wheel.mouse.click(bare.x, bare.y);
    if (engine === 'chromium') { // Playwright's wheel carries no Control modifier in Chromium: send the wheel with it through the protocol
      const cdp = await context.newCDPSession(wheel);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: bare.x, y: bare.y, deltaX: 0, deltaY: -240, modifiers: 2 });
    } else { await wheel.mouse.move(bare.x, bare.y); await wheel.keyboard.down('Control'); await wheel.mouse.wheel(0, -240); await wheel.keyboard.up('Control'); }
    const zoomed = await flW.locator('[data-canvas-surface]').evaluate(async (n, before) => { for (let i = 0; i < 100; i++) { const t = [...n.children].find(c => c.style.transform)?.style.transform; if (t && t !== before) return t; await new Promise(r => setTimeout(r, 100)); } return null; }, cam0);
    check(`${tag} ctrl+wheel on the focused canvas zooms the canvas and does not scroll the host page`, !!zoomed && await scrollY() === y1, `${cam0} -> ${zoomed}; scroll ${y1} -> ${await scrollY()}; clicked ${JSON.stringify(bare)}; under it: ${await frameOf(wheel).evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName} ${e.getAttribute('data-block-id') || e.className?.toString().slice(0, 60) || ''}` : null; }, [bare.x - box2.x, bare.y - box2.y])}`);
    await wheel.close();
    await page.close();

    // The owner viewing their own embed (same-site host, so the account cookie really rides along): a public guest, no powers.
    const ownerCtx = await browser.newContext(contextOptions);
    await ownerCtx.addCookies([{ name: 'small_session', value: owner.session, url: APP }]);
    const ownerNet = await wire(ownerCtx);
    const ownerPage = await ownerCtx.newPage();
    const versionBefore = (await api(owner, pub.board)).body.version;
    await ownerPage.goto(hostUrl(host, 'same', path, '&lazy=0'));
    const flO = await embedOf(ownerPage); await openChat(flO);
    check(`${tag} the owner viewing their own embed gets the guest view: 10 of 10 guest messages, no Share, no Unpublish, no owner controls`, await left(flO, 10) && await flO.locator('[data-share-button], [data-unpublish], [data-menubar], [data-owner-controls]').count() === 0, JSON.stringify({ probes: ownerNet.probes, inits: ownerNet.inits, remaining: await flO.locator('[data-guest-remaining], [data-guest-spent]').allInnerTexts() }));
    await draw(ownerPage, flO);
    await send(flO, `${DRAFT} owner`);
    const versionAfter = (await api(owner, pub.board)).body.version;
    check(`${tag} the owner's edits in the embed stay in the tab: no write request, the source board version is unchanged`, ownerNet.requests.filter(r => r.method !== 'GET' && !/\/ask$|\/embed-session$/.test(new URL(r.url).pathname)).length === 0 && versionAfter === versionBefore, `${versionBefore} -> ${versionAfter}`);
    check(`${tag} the control: the owner's account cookie rode along on this same-site embed (so ignoring it is the server's doing), and every Send was counted by the rh_embed cookie`, ownerNet.probes.some(p => p.account) && ownerNet.sends.length > 0 && ownerNet.sends.every(s => s.jar));
    await ownerCtx.close();
  }

  // ===================================================================================================================
  // BLOCKED: the frame cannot keep the cookie
  // ===================================================================================================================
  async function blocked(ctx, how) {
    const tag = `[${engine} blocked: ${how}]`;
    check(`${tag} the canary is neither returned nor stored here (verified, not assumed)`, await crossSiteCookieKept(host, ctx) === false);
    const net = await wire(ctx);
    const page = await ctx.newPage();
    const logged = [];
    page.on('console', m => { if (m.type() === 'error' && logged.length < 6) logged.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => { if (logged.length < 6) logged.push(`pageerror: ${String(e.message).slice(0, 200)} ${String(e.stack).slice(0, 500)}`); });
    await page.goto(hostUrl(host, 'a', path, '&lazy=0&h=480'));
    let fl;
    try { fl = await embedOf(page); } catch {
      // The embed never mounted in a frame whose storage is refused: evidence for the report, then the flow stops.
      const inside = await frameOf(page)?.evaluate(() => ({ text: document.body.innerText.slice(0, 300), html: document.documentElement.outerHTML.length, storage: (() => { try { sessionStorage.getItem('x'); localStorage.getItem('x'); return 'ok'; } catch (e) { return String(e.name); } })() })).catch(e => String(e));
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/blocked-${engine}-${how}-no-embed.png` });
      check(`${tag} the embed still renders the canvas read-only`, false, JSON.stringify({ frame: frameOf(page)?.url(), inside, logged }));
      await page.close();
      return;
    }
    check(`${tag} the embed still renders the canvas read-only`, (await fl.locator('[data-embed-title]').innerText()).trim() === TITLE);
    await openChat(fl);
    await fl.locator('[data-embed-chat-fallback]').waitFor({ timeout: 30000 });
    check(`${tag} Open Chat in Rabbit Hole is offered, and the browser really holds no rh_embed`, await fl.locator('[data-embed-chat-fallback]').isVisible() && !(await ctx.cookies()).some(c => c.name === 'rh_embed'));
    check(`${tag} the probe saw no cookie come back and said so; no Send went out`, net.probes.length > 0 && net.probes.every(p => !p.cookieSent && p.session === false) && net.sends.length === 0, JSON.stringify(net.probes));
    const field = fl.locator('[data-shared-ask] [data-chat-composer] textarea');
    await field.fill(DRAFT);
    check(`${tag} nothing is sent while the cookie is missing: no Send request, no count, the draft stays in the composer`, net.sends.length === 0 && !net.requests.some(r => r.method === 'POST' && /\/ask$/.test(new URL(r.url).pathname)) && await field.inputValue() === DRAFT);

    // Failure path first: the new tab is closed before it can answer.
    const tabs = closeNextTab(ctx);
    tabs.on = true;
    const t0 = Date.now();
    await fl.locator('[data-embed-chat-fallback]').click();
    await forge(page, pub.view);
    await fl.locator('[data-embed-handoff-failed]').waitFor({ timeout: 40000 });
    const took = Date.now() - t0;
    tabs.on = false;
    check(`${tag} if the tab never acknowledges, the embed says the draft did not arrive after about 15 s and offers Retry; the draft is still in the composer and nothing was sent`, took >= 10000 && took <= 35000 && await fl.locator('[data-embed-handoff-retry]').isVisible() && await field.inputValue() === DRAFT && net.sends.length === 0, `${took} ms`);
    // Retry: this tab is allowed to answer.
    const [handoff] = await Promise.all([ctx.waitForEvent('page'), fl.locator('[data-embed-handoff-retry]').click()]);
    await handoff.waitForURL(u => u.origin === APP, { timeout: 30000 });
    const draftBack = handoff.locator('[data-shared-ask] [data-chat-composer] textarea');
    await draftBack.waitFor({ timeout: 60000 });
    await fl.locator('[data-embed-handoff-failed]').waitFor({ state: 'hidden', timeout: 30000 });
    const arrived = await draftBack.evaluate((f, want) => new Promise(resolve => { const t = Date.now(); const tick = () => (f.value === want || Date.now() - t > 20000 ? resolve(f.value) : setTimeout(tick, 100)); tick(); }), DRAFT);
    check(`${tag} Retry opens the full site on the same canvas, it acknowledges, the failure notice goes and the draft arrives, not sent`, new URL(handoff.url()).pathname === `/b/${pub.view}` && arrived === DRAFT && net.sends.length === 0, `${handoff.url()} / ${arrived}`);
    const messages = await hostMessages(page), opener = await handoff.evaluate(() => !!window.opener);
    check(`${tag} the draft travels by direct window messaging only: the new tab keeps its opener, the embedding page received no message, and the draft is in no URL (the new tab's or any request the embed made)`, opener && messages.length === 0 && ![handoff.url(), ...net.requests.map(r => r.url)].some(hasDraft), JSON.stringify({ opener, messages }));
    check(`${tag} Chat context carries over and is never auto-sent: the new tab shows the Chat with the canvas's context, and no ask request was made by anyone`, await handoff.locator('[data-shared-ask]').isVisible() && !net.requests.some(r => r.method === 'POST' && /\/ask$/.test(new URL(r.url).pathname)));
    await handoff.close();
    // A reload keeps this state: still no cookie, still the fallback, no fresh trial.
    await page.reload();
    fl = await embedOf(page); await openChat(fl);
    await fl.locator('[data-embed-chat-fallback]').waitFor({ timeout: 30000 });
    check(`${tag} a reload changes nothing: still no cookie, still Open Chat in Rabbit Hole, still nothing counted`, !(await ctx.cookies()).some(c => c.name === 'rh_embed') && net.sends.length === 0 && net.probes.every(p => !p.cookieSent));
    check(`${tag} messages 10 and 11 cannot happen here: no Send was admitted, no count exists to exhaust (the admission rules are checked where the cookie is kept)`, net.sends.length === 0);
    await page.close();
  }

  // ===================================================================================================================
  if (kept) await flow('available', AVAILABLE, available);
  else await flow('blocked (the default context)', BLOCKED, () => blocked(context, 'default'));
  await context.close(); await browser.close();
  const forced = await forcedBlocked(engine, host).catch(error => { plan(1); check(`[${engine}] a context that refuses the cookie could be made and verified`, false, error.message); return null; });
  if (forced) { await flow('blocked (forced)', BLOCKED, () => blocked(forced.context, 'forced')); await forced.close(); }
  else console.log(`[${engine}] no way to force blocking here${kept ? '; the blocked flow was not run' : ' (the default context already blocked)'}`);
  await host.close();
  finish();
}
