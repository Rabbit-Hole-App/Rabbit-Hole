// Webpage card captures (webpage-capture.js, url-guard.js; C:/s/spec/day-1021/webcard-interface.md) with a fake capture
// browser and fake DoH: the private-network guard on the URL, every redirect and every subresource; limits and truncation;
// status mapping; and the screening gate - an unscreened capture is unreachable through /api/learn/files, share links and
// forks (server-side), a failed Refresh leaves the approved version, and cleanup keeps what any board references.
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnDb } from './learn-grade-fixture.js';
import { learnBoardsRoute } from '../src/learn-boards.js';
import { filesFetch } from '../src/learn-files.js';
import { pdfExcerptsFetch } from '../src/pdf-excerpts.js';
import { checkUrl, isPrivateIp } from '../src/url-guard.js';
import { WEBPAGE_LIMITS, capturePage, sweepWebpageSources, tilePlan, webpagesFetch } from '../src/webpage-capture.js';

// ---- fake DNS-over-HTTPS: host -> list of IPs, or 'nx'
function doh(table) {
  const calls = [];
  const fetcher = async url => {
    const u = new URL(url), name = u.searchParams.get('name'), type = u.searchParams.get('type');
    calls.push(`${name}/${type}`);
    const ips = table[name];
    if (ips === undefined || ips === 'nx') return Response.json({ Status: 3 });
    const want = type === 'A' ? 1 : 28;
    return Response.json({ Status: 0, Answer: ips.map(ip => ({ type: ip.includes(':') ? 28 : 1, data: ip })).filter(a => a.type === want) });
  };
  fetcher.calls = calls;
  return fetcher;
}
const PUBLIC = { 'example.com': ['93.184.215.14'], 'cdn.example.com': ['2606:4700::1'], 'news.example.org': ['203.0.114.9'] };

test('isPrivateIp: loopback, RFC1918, CGNAT, link-local metadata, IPv6 ULA/loopback/link-local and mapped forms', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1',
    '255.255.255.255', '::1', '::', 'fd00::1', 'fc00::5', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::a9fe:a9fe', '2002:0a00:0001::1', 'ff02::1', 'nonsense']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['93.184.215.14', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700::1', '::ffff:8.8.8.8']) assert.equal(isPrivateIp(ip), false, ip);
});

test('checkUrl refuses schemes, ports, credentials, private literals and private DNS answers; resolves each host once', async () => {
  const fetcher = doh({ ...PUBLIC, 'internal.example.com': ['10.0.0.5'], 'mixed.example.com': ['93.184.215.14', '192.168.0.2'], 'v6.example.com': ['fd12::1'], 'meta.example.com': ['169.254.169.254'] });
  const blocked = async raw => { const v = await checkUrl(raw, { fetcher }); assert.equal(v.ok, false, raw); assert.equal(v.kind, 'blocked', raw); };
  for (const raw of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/', 'data:text/html,hi', 'gopher://example.com', 'not a url',
    'http://localhost/', 'http://app.localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://[::1]/', 'http://[fd00::1]/',
    'http://[::ffff:127.0.0.1]/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://printer/', 'http://user:pw@example.com/',
    'https://example.com:8443/', 'http://example.com:22/', 'http://internal.example.com/', 'http://mixed.example.com/', 'http://v6.example.com/', 'http://meta.example.com/']) await blocked(raw);
  assert.deepEqual(await checkUrl('https://nowhere.example.net/', { fetcher }), { ok: false, kind: 'unavailable', reason: 'This site could not be found.' });
  assert.deepEqual(await checkUrl('https://example.com/a?b=1', { fetcher }), { ok: true, url: 'https://example.com/a?b=1' });
  assert.equal((await checkUrl('http://example.com:80/', { fetcher })).ok, true);
  const cache = new Map(), before = fetcher.calls.length;
  await checkUrl('https://example.com/1', { fetcher, cache }); await checkUrl('https://example.com/2', { fetcher, cache });
  assert.equal(fetcher.calls.length - before, 2, 'one A and one AAAA lookup per host per capture');
});

test('tilePlan: 1400 px tiles; the last tile is the bottom max(280, rest) px; short pages pad to 280; every side within JEV 280-1568', () => {
  assert.deepEqual(tilePlan(100), [{ index: 0, y: 0, h: 280 }]);
  assert.deepEqual(tilePlan(280), [{ index: 0, y: 0, h: 280 }]);
  assert.deepEqual(tilePlan(1400), [{ index: 0, y: 0, h: 1400 }]);
  assert.deepEqual(tilePlan(1500), [{ index: 0, y: 0, h: 1400 }, { index: 1, y: 1220, h: 280 }]);
  assert.deepEqual(tilePlan(3000), [{ index: 0, y: 0, h: 1400 }, { index: 1, y: 1400, h: 1400 }, { index: 2, y: 2720, h: 280 }]);
  for (const height of [1, 279, 281, 1399, 1401, 1679, 1680, 1681, 5555, 20_000]) {
    const tiles = tilePlan(height), bottom = tiles.at(-1).y + tiles.at(-1).h;
    assert.equal(bottom, Math.max(280, height), `${height}: covers the page exactly`);
    for (const t of tiles) assert.ok(t.h >= 280 && t.h <= 1568 && WEBPAGE_LIMITS.width <= 1568 && t.y >= 0, `${height}: ${JSON.stringify(t)}`);
    tiles.slice(0, -1).forEach((t, i) => assert.equal(t.y, i * 1400));
  }
});

// ---- fake capture browser: pages by URL; each page may redirect, request subresources, and answer the in-page evaluations.
function fakeBrowser(site, log = { aborted: [], continued: [], headers: [] }) {
  let handler = null, current = null;
  const fire = async (url, navigation) => {
    let outcome = null;
    const frame = {};
    await handler({
      url: () => url, isNavigationRequest: () => navigation, frame: () => (navigation ? mainFrame : frame),
      headers: () => ({ 'user-agent': 'x', cookie: 'learner=1', Authorization: 'Bearer x' }),
      abort: async () => { outcome = 'abort'; log.aborted.push(url); },
      continue: async ({ headers } = {}) => { outcome = 'continue'; log.continued.push(url); log.headers.push(headers); },
    });
    return outcome;
  };
  const mainFrame = {};
  const page = {
    setViewport: async () => {}, setRequestInterception: async on => assert.equal(on, true),
    on: (event, fn) => { if (event === 'request') handler = fn; },
    mainFrame: () => mainFrame,
    goto: async url => {
      for (let hop = url, n = 0; ; n += 1) {
        if (await fire(hop, true) !== 'continue') throw new Error('net::ERR_BLOCKED_BY_CLIENT');
        const p = site[hop];
        if (!p) throw new Error('net::ERR_NAME_NOT_RESOLVED');
        if (p.timeout) { const e = new Error('Navigation timeout of 20000 ms exceeded'); e.name = 'TimeoutError'; throw e; }
        if (p.redirect) { hop = p.redirect; continue; }
        current = { url: hop, ...p };
        for (const sub of p.requests || []) await fire(sub, false);
        return { status: () => p.status ?? 200 };
      }
    },
    waitForNetworkIdle: async () => {},
    url: () => current.url,
    title: async () => current.title ?? 'A page',
    evaluate: async (fn, ...args) => {
      if (fn.name === 'pageFacts') return { height: current.height ?? 1000, password: !!current.password, textLength: current.textLength ?? 5000 };
      if (fn.name === 'scrollThrough') return undefined;
      if (fn.name === 'textRuns') { log.textArgs = args; return { runs: current.runs || [], truncated: !!current.textTruncated }; }
      throw new Error(`unexpected evaluate ${fn.name}`);
    },
    screenshot: async ({ type, clip }) => { log.shots = [...(log.shots || []), { type, ...clip }]; return new Uint8Array(current.tileBytes ?? 1000).fill(clip.y % 251); },
  };
  return { createBrowserContext: async () => ({ newPage: async () => page, close: async () => { log.contextClosed = true; } }), disconnect: async () => { log.disconnected = true; }, log };
}

test('capturePage: every redirect hop and every subresource is checked; private ones are refused; cookies never sent', async () => {
  const fetcher = doh({ ...PUBLIC, 'evil.example.com': ['127.0.0.1'] });
  const site = {
    'https://example.com/start': { redirect: 'https://news.example.org/a' },
    'https://news.example.org/a': { title: '  Hello   world ', height: 3000, runs: [{ text: 'Top', x: 1, y: 2, w: 3, h: 4 }, { text: 'Mid', x: 1, y: 1500, w: 3, h: 4 }, { text: 'Low', x: 1, y: 2900, w: 3, h: 4 }],
      requests: ['https://cdn.example.com/app.js', 'http://169.254.169.254/latest/meta-data/', 'https://evil.example.com/x.png', 'file:///etc/passwd', 'data:image/png;base64,AA', 'http://[::1]:80/'] },
  };
  const browser = fakeBrowser(site), log = browser.log;
  const page = await capturePage(browser, 'https://example.com/start', { fetcher });
  assert.equal(page.status, 'ready');
  assert.equal(page.title, 'Hello world');
  assert.equal(page.finalUrl, 'https://news.example.org/a');
  assert.deepEqual(log.aborted, ['http://169.254.169.254/latest/meta-data/', 'https://evil.example.com/x.png', 'file:///etc/passwd', 'http://[::1]:80/']);
  assert.equal(page.blockedRequests, 4);
  assert.equal(log.contextClosed, true, 'each capture closes its own browser context');
  assert.ok(log.continued.includes('https://cdn.example.com/app.js') && log.continued.includes('data:image/png;base64,AA'));
  for (const h of log.headers) assert.deepEqual(Object.keys(h).filter(k => /cookie|authorization/i.test(k)), [], 'no cookie or Authorization header');
  assert.deepEqual(page.tiles.map(t => [t.y, t.h]), [[0, 1400], [1400, 1400], [2720, 280]]);
  assert.deepEqual(log.shots.map(s => [s.type, s.x, s.y, s.width, s.height]), [['jpeg', 0, 0, 1280, 1400], ['jpeg', 0, 1400, 1280, 1400], ['jpeg', 0, 2720, 1280, 280]]);
  assert.deepEqual(page.runs.map(r => [r.text, r.tile]), [['Top', 0], ['Mid', 1], ['Low', 2]]);
  assert.deepEqual(page.truncated, { height: false, bytes: false, text: false });
  assert.deepEqual(log.textArgs, [200_000, 3000]);
});

test('capturePage: a redirect into a private network, an unknown host, errors, timeouts and login walls map to clear statuses', async () => {
  const fetcher = doh({ ...PUBLIC, 'evil.example.com': ['10.0.0.9'] });
  const run = async (site, url = 'https://example.com/') => capturePage(fakeBrowser(site), url, { fetcher });
  let out = await run({ 'https://example.com/': { redirect: 'https://evil.example.com/' } });
  assert.deepEqual(out, { status: 'blocked', reason: 'Private network addresses cannot be captured.' });
  out = await run({ 'https://example.com/': { redirect: 'http://169.254.169.254/' } });
  assert.equal(out.status, 'blocked');
  out = await run({ 'https://example.com/': { redirect: 'ftp://example.com/x' } });
  assert.equal(out.status, 'blocked');
  out = await run({ 'https://example.com/': { redirect: 'https://gone.example.net/' } });
  assert.deepEqual(out, { status: 'unavailable', reason: 'This site could not be found.' }, 'DNS failure on a hop');
  assert.equal((await run({}, 'https://news.example.org/x')).status, 'unavailable', 'navigation DNS failure');
  assert.deepEqual(await run({ 'https://example.com/': { timeout: true } }), { status: 'unavailable', reason: 'This page took too long to load.' });
  for (const status of [401, 403]) assert.equal((await run({ 'https://example.com/': { status } })).status, 'login_required', String(status));
  for (const status of [404, 410, 500, 503]) assert.deepEqual(await run({ 'https://example.com/': { status } }), { status: 'unavailable', reason: `This page answered with an error (${status}).` });
  assert.equal((await run({ 'https://example.com/': { password: true, textLength: 300 } })).status, 'login_required', 'a login form with little else');
  assert.equal((await run({ 'https://example.com/': { password: true, textLength: 9000 } })).status, 'ready', 'a long article with a sign-in box is a page');
  assert.equal((await run({ 'https://example.com/': { redirect: 'https://example.com/accounts/login' }, 'https://example.com/accounts/login': { textLength: 400 } })).status, 'login_required');
});

test('capturePage limits: 20,000 px height, 10 MB of tiles, 200 KB of text, each labelled truncated', async () => {
  const fetcher = doh(PUBLIC);
  let page = await capturePage(fakeBrowser({ 'https://example.com/': { height: 50_000, runs: [{ text: 'deep', x: 0, y: 30_000, w: 1, h: 1 }] } }), 'https://example.com/', { fetcher });
  assert.equal(page.height, 20_000);
  assert.equal(page.pageHeight, 50_000);
  assert.deepEqual(page.truncated, { height: true, bytes: false, text: false });
  assert.equal(page.tiles.at(-1).y + page.tiles.at(-1).h, 20_000);
  assert.deepEqual(page.runs, [], 'text below the captured height is dropped');
  page = await capturePage(fakeBrowser({ 'https://example.com/': { height: 19_000, tileBytes: 3 * 1024 * 1024 } }), 'https://example.com/', { fetcher });
  assert.equal(page.tiles.length, 3, '3 x 3 MB fit in 10 MB; the fourth does not');
  assert.equal(page.height, 4200);
  assert.equal(page.tiles.reduce((n, t) => n + t.bytes.length, 0) <= 10 * 1024 * 1024, true);
  assert.equal(page.truncated.bytes, true);
  page = await capturePage(fakeBrowser({ 'https://example.com/': { textTruncated: true } }), 'https://example.com/', { fetcher });
  assert.equal(page.truncated.text, true);
  page = await capturePage(fakeBrowser({ 'https://example.com/': { height: 120 } }), 'https://example.com/', { fetcher });
  assert.deepEqual(page.tiles.map(t => [t.y, t.h]), [[0, 280]], 'a short page is padded to 280 px');
});

// ---- the routes, on the 0023 tables (node:sqlite), with the stub control plane the file-access tests use
const PEOPLE = { owner: { email: 'owner@test', org: 'team' }, friend: { email: 'friend@elsewhere', org: 'elsewhere' } };
const OWN = '/api/learn/boards/demo-app/main';
const STATE = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };

function bucket() {
  const objects = new Map();
  const object = (key, o) => ({ key, size: o.bytes.length, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata, body: new Response(o.bytes).body,
    arrayBuffer: async () => o.bytes.slice().buffer, text: async () => new TextDecoder().decode(o.bytes) });
  return {
    objects,
    put: async (key, value, opts = {}) => { objects.set(key, { bytes: new Uint8Array(value instanceof Uint8Array ? value : await new Response(value).arrayBuffer()), ...opts }); },
    get: async key => (objects.has(key) ? object(key, objects.get(key)) : null),
    head: async key => (objects.has(key) ? object(key, objects.get(key)) : null),
    delete: async key => { objects.delete(key); },
    list: async () => ({ objects: [] }),
  };
}

async function setup(t) {
  const { LEARN_DB, sqlite } = learnDb(t);
  const CONTROL_PLANE = {
    fetch: async request => {
      const who = PEOPLE[(request.headers.get('cookie') || '').replace('small_session=', '')];
      if (!who) return new Response('sign in', { status: 401 });
      const path = new URL(request.url).pathname;
      if (path === '/api/me') return Response.json(who);
      if (path === '/api/apps/demo-app' && who === PEOPLE.owner) return Response.json({ name: 'demo-app', ...who });
      return new Response('no', { status: 404 });
    },
  };
  const env = { LEARN_DB, CONTROL_PLANE, LEARN_MEDIA: bucket(), BROWSER: {} };
  const headers = as => ({ 'Content-Type': 'application/json', ...(as ? { cookie: `small_session=${as}` } : {}) });
  const board = async (method, path, as, body) => {
    const response = await learnBoardsRoute(path, new Request(`https://dev.test${path}`, { method, headers: headers(as), body: body && JSON.stringify(body) }), env);
    return { status: response.status, body: await response.json() };
  };
  let verdict = { status: 'passed', reason: 'ok' }, screened = [];
  const site = { 'https://example.com/': { title: 'Example', height: 1500, runs: [{ text: 'Example Domain', x: 10, y: 20, w: 200, h: 30 }] } };
  const deps = () => ({ fetcher: doh(PUBLIC), browser: fakeBrowser(site), screen: async (_env, manifest, tiles, text) => { screened.push({ manifest, tiles, text }); if (verdict instanceof Error) throw verdict; return verdict; } });
  const capture = async (as, body) => {
    const response = await webpagesFetch(new Request('https://dev.test/api/learn/webpages', { method: 'POST', headers: headers(as), body: JSON.stringify({ app: 'demo-app', board: 'main', ...body }) }), env, deps());
    return { status: response.status, body: await response.json() };
  };
  const route = async (method, path, as, body) => {
    const response = await webpagesFetch(new Request(`https://dev.test${path}`, { method, headers: headers(as), body: body && JSON.stringify(body) }), env, deps());
    return { status: response.status, body: await response.json() };
  };
  const file = async (id, as, query = '') => (await filesFetch(new Request(`https://dev.test/api/learn/files/${id}${query}`, { headers: headers(as) }), env)).status;
  const rows = () => sqlite.prepare("SELECT id, status, declared_type FROM file_sources WHERE family = 'webpage' ORDER BY created_at, id").all();
  await board('PUT', OWN, 'owner', { state: STATE });
  return { env, sqlite, board, capture, route, file, rows, site, screened, setVerdict: v => { verdict = v; } };
}
// What a card's fileRef would name for a capture, ready or not (a crafted client may name unscreened ids).
const refOf = (ids, manifestId) => ({ v: 1, source: { id: manifestId, rev: 'x' }, family: 'webpage', bundle: ids.map(id => ({ role: 'tile', source: { id, rev: 'x' } })) });
const webCard = fileRef => ({ id: 'w1', type: 'webpage', url: 'https://example.com/', fileRef });

test('capture -> screening passed: rows stored, tiles served to the owner, the reply carries capture and fileRef', async t => {
  const { capture, file, rows, screened, env } = await setup(t);
  const out = await capture('owner', { url: 'https://example.com/' });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.status, 'ready');
  assert.match(out.body.lineage, /^wc_[0-9a-f]{24}$/);
  assert.equal(out.body.title, 'Example');
  assert.deepEqual(rows().map(r => r.status), ['stored', 'stored', 'stored', 'stored']);
  assert.equal(screened.length, 1);
  assert.deepEqual(screened[0].tiles.map(t => [t.y, t.h, t.width, t.type]), [[0, 1400, 1280, 'image/jpeg'], [1220, 280, 1280, 'image/jpeg']], 'every tile, bottom included');
  assert.equal(screened[0].text, 'Example Domain');
  const { capture: cap, fileRef } = out.body;
  assert.equal(cap.manifestId, fileRef.source.id);
  assert.deepEqual(fileRef.bundle.map(b => b.role), ['tile', 'tile', 'text']);
  for (const part of fileRef.bundle) assert.equal(await file(part.source.id, 'owner'), 200);
  // The card reads its files through ?app=&board= as soon as the reply lands, before its board save (dev clone 2026-10-22: 404).
  for (const id of [fileRef.source.id, ...fileRef.bundle.map(b => b.source.id)]) assert.equal(await file(id, 'owner', '?app=demo-app&board=main'), 200, 'through the board before its save');
  const manifestKey = rows().find(r => r.declared_type === 'webpage-manifest');
  const stored = JSON.parse(new TextDecoder().decode([...env.LEARN_MEDIA.objects.entries()].find(([k]) => k.startsWith(`file-sources/${manifestKey.id}/`))[1].bytes));
  assert.deepEqual(Object.keys(stored).sort(), ['blockedRequests', 'fetchedAt', 'finalUrl', 'height', 'lineage', 'pageHeight', 'screening', 'text', 'tiles', 'title', 'truncated', 'url', 'v', 'width']);
});

test('an unscreened capture is unreachable through files, a share link and a fork; it opens everywhere only once Retry passes', async t => {
  const { capture, board, file, route, rows, setVerdict, sqlite } = await setup(t);
  setVerdict({ status: 'inconclusive', reason: 'unsure' });
  const out = await capture('owner', { url: 'https://example.com/' });
  assert.equal(out.body.status, 'inconclusive');
  assert.equal(out.body.fileRef, null, 'no fileRef for a capture that has not passed');
  assert.ok(rows().every(r => r.status === 'uploading'));
  const ids = rows().map(r => r.id), manifestId = rows().find(r => r.declared_type === 'webpage-manifest').id;
  // A crafted card naming the unscreened ids: indexed (the owner's sources) but never served.
  await board('PUT', OWN, 'owner', { state: { ...STATE, blocks: [webCard(refOf(ids, manifestId))] }, version: 1 });
  const links = (await board('POST', `${OWN}/share`, 'owner', { shared: true, view: true })).body.sharing;
  const forked = await board('POST', '/api/learn/boards/fork', 'friend', { source: { token: links.view } });
  assert.equal(forked.status, 201, JSON.stringify(forked.body));
  for (const id of ids) {
    assert.equal(await file(id, 'owner'), 404, 'owner, before screening');
    assert.equal(await file(id, 'owner', '?app=demo-app&board=main'), 404, 'owner through the board');
    assert.equal(await file(id, 'friend', `?share=${links.view}`), 404, 'a share link');
    assert.equal(await file(id, 'friend', `?app=${forked.body.name}&board=main`), 404, 'a fork');
  }
  assert.equal((await route('GET', `/api/learn/webpages/${manifestId}?app=demo-app&board=main`, 'friend')).status, 404, 'status is the owner\'s');
  assert.equal((await route('POST', `/api/learn/webpages/${manifestId}/screen`, 'friend', { app: 'demo-app', board: 'main' })).status, 404, 'Retry is the owner\'s');
  setVerdict({ status: 'passed', reason: 'ok' });
  const retried = await route('POST', `/api/learn/webpages/${manifestId}/screen`, 'owner', { app: 'demo-app', board: 'main' });
  assert.equal(retried.body.status, 'ready');
  for (const id of ids) {
    assert.equal(await file(id, 'owner'), 200);
    assert.equal(await file(id, 'friend', `?share=${links.view}`), 200);
    assert.equal(await file(id, 'friend', `?app=${forked.body.name}&board=main`), 200);
  }
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM file_sources WHERE status = 'stored'").get().n, ids.length);
});

test('screening failed: hidden with a reason, rows failed and bytes deleted; error and inconclusive keep Retry; status poll goes stale to error', async t => {
  const { capture, route, rows, setVerdict, env, file } = await setup(t);
  setVerdict({ status: 'failed', reason: 'explicit' });
  const out = await capture('owner', { url: 'https://example.com/' });
  assert.equal(out.body.status, 'blocked');
  assert.equal(out.body.screening.status, 'failed');
  assert.ok(rows().every(r => r.status === 'failed'));
  assert.equal([...env.LEARN_MEDIA.objects.keys()].filter(k => k.startsWith('file-sources/')).length, 0, 'bytes deleted');
  for (const r of rows()) assert.equal(await file(r.id, 'owner'), 404);
  const failedId = rows().find(r => r.declared_type === 'webpage-manifest').id;
  assert.equal((await route('POST', `/api/learn/webpages/${failedId}/screen`, 'owner', { app: 'demo-app', board: 'main' })).body.status, 'blocked', 'a failed capture has no Retry');
  setVerdict(new Error('boom'));
  const thrown = await capture('owner', { url: 'https://example.com/' });
  assert.equal(thrown.body.status, 'error');
  setVerdict({ status: 'weird' });
  assert.equal((await capture('owner', { url: 'https://example.com/' })).body.status, 'error', 'an unknown verdict fails closed');
});

test('status poll: screening while recent, error once stale (Worker cut off), Retry then screens', async t => {
  const { capture, route, rows, env, setVerdict } = await setup(t);
  setVerdict({ status: 'error', reason: 'x' });
  await capture('owner', { url: 'https://example.com/' });
  const id = rows().find(r => r.declared_type === 'webpage-manifest').id;
  await env.LEARN_MEDIA.put(`webpage-status/${id}.json`, new TextEncoder().encode(JSON.stringify({ status: 'pending', at: Date.now() })));
  assert.equal((await route('GET', `/api/learn/webpages/${id}?app=demo-app&board=main`, 'owner')).body.status, 'screening');
  assert.equal((await route('POST', `/api/learn/webpages/${id}/screen`, 'owner', { app: 'demo-app', board: 'main' })).body.status, 'screening', 'no second screening while one runs');
  await env.LEARN_MEDIA.put(`webpage-status/${id}.json`, new TextEncoder().encode(JSON.stringify({ status: 'pending', at: Date.now() - 4 * 60_000 })));
  assert.equal((await route('GET', `/api/learn/webpages/${id}?app=demo-app&board=main`, 'owner')).body.status, 'error');
  setVerdict({ status: 'passed' });
  assert.equal((await route('POST', `/api/learn/webpages/${id}/screen`, 'owner', { app: 'demo-app', board: 'main' })).body.status, 'ready');
  assert.equal((await route('GET', `/api/learn/webpages/${id}?app=demo-app&board=main`, 'owner')).body.status, 'ready');
});

test('a failed Refresh leaves the approved version stored and served; the new version never replaces it', async t => {
  const { capture, board, file, setVerdict, site } = await setup(t);
  const first = await capture('owner', { url: 'https://example.com/' });
  await board('PUT', OWN, 'owner', { state: { ...STATE, blocks: [webCard(first.body.fileRef)] }, version: 1 });
  site['https://example.com/'].title = 'Changed';
  for (const verdict of [{ status: 'failed' }, { status: 'inconclusive' }]) {
    setVerdict(verdict);
    const refresh = await capture('owner', { url: 'https://example.com/', lineage: first.body.lineage });
    assert.equal(refresh.body.lineage, first.body.lineage, 'Refresh keeps the lineage');
    assert.equal(refresh.body.fileRef, null);
    assert.notEqual(refresh.body.manifestId, first.body.capture.manifestId);
  }
  site['https://example.com/'] = { status: 503 };
  assert.equal((await capture('owner', { url: 'https://example.com/', lineage: first.body.lineage })).body.status, 'unavailable');
  for (const part of [first.body.fileRef.source, ...first.body.fileRef.bundle.map(b => b.source)]) assert.equal(await file(part.id, 'owner', '?app=demo-app&board=main'), 200);
});

test('refusals: a private URL is 400 with nothing stored; a viewer cannot capture; no BROWSER is 503; the daily cap is 429', async t => {
  const { capture, rows, env, sqlite } = await setup(t);
  const bad = await capture('owner', { url: 'http://169.254.169.254/latest/meta-data/' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.status, 'blocked');
  assert.equal((await capture('owner', { url: 'https://example.com/', lineage: 'nope' })).status, 400);
  assert.equal((await capture('friend', { url: 'https://example.com/' })).status, 404);
  assert.equal((await capture(null, { url: 'https://example.com/' })).status, 401);
  assert.deepEqual(rows(), []);
  const response = await webpagesFetch(new Request('https://dev.test/api/learn/webpages', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'small_session=owner' }, body: JSON.stringify({ app: 'demo-app', url: 'https://example.com/' }) }), { ...env, BROWSER: undefined }, { fetcher: doh(PUBLIC) });
  assert.equal(response.status, 503);
  const insert = sqlite.prepare(`INSERT INTO file_sources (id, org, owner_email, app, family, name, media_type, declared_type, bytes, sha256, r2_key, status, created_at)
    VALUES (?, 'team', 'owner@test', 'demo-app', 'webpage', 'm', 'application/json', 'webpage-manifest', 1, 'x', 'k', 'stored', ?)`);
  for (let i = 0; i < 30; i += 1) insert.run(`fs_${String(i).padStart(24, '0')}`, Date.now());
  assert.equal((await capture('owner', { url: 'https://example.com/' })).status, 429);
});

test('cleanup keeps every referenced capture (own board, fork); deletes unreferenced ones after 30 days and unscreened ones after a day', async t => {
  const { capture, board, rows, env, sqlite, setVerdict } = await setup(t);
  const kept = await capture('owner', { url: 'https://example.com/' });
  const forkedOnly = await capture('owner', { url: 'https://example.com/' });
  const orphan = await capture('owner', { url: 'https://example.com/' });
  setVerdict({ status: 'inconclusive' });
  await capture('owner', { url: 'https://example.com/' });
  // forkedOnly is on the board when it is forked, then removed from the owner's board: only the fork references it.
  await board('PUT', OWN, 'owner', { state: { ...STATE, blocks: [webCard(kept.body.fileRef), { ...webCard(forkedOnly.body.fileRef), id: 'w2' }] }, version: 1 });
  const links = (await board('POST', `${OWN}/share`, 'owner', { shared: true, view: true })).body.sharing;
  assert.equal((await board('POST', '/api/learn/boards/fork', 'friend', { source: { token: links.view } })).status, 201);
  await board('PUT', OWN, 'owner', { state: { ...STATE, blocks: [webCard(kept.body.fileRef)] }, version: 2 });
  const owner = PEOPLE.owner, now = Date.now();
  assert.equal(await sweepWebpageSources(env, owner, now), 0, 'nothing is old enough');
  assert.equal(await sweepWebpageSources(env, owner, now + 2 * 86_400_000), 4, 'the unscreened capture after a day (3 tiles/text + manifest)');
  const deleted = await sweepWebpageSources(env, owner, now + 31 * 86_400_000);
  assert.equal(deleted, 4, 'only the orphan capture after 30 days');
  const status = id => sqlite.prepare('SELECT status FROM file_sources WHERE id = ?').get(id).status;
  assert.equal(status(kept.body.capture.manifestId), 'stored');
  assert.equal(status(forkedOnly.body.capture.manifestId), 'stored', 'a fork still references it');
  assert.equal(status(orphan.body.capture.manifestId), 'deleted');
  for (const part of orphan.body.fileRef.bundle) assert.ok(![...env.LEARN_MEDIA.objects.keys()].some(k => k.startsWith(`file-sources/${part.source.id}/`)), 'orphan bytes removed');
  assert.ok([...env.LEARN_MEDIA.objects.keys()].some(k => k.startsWith(`file-sources/${kept.body.fileRef.bundle[0].source.id}/`)));
  assert.equal(rows().filter(r => r.status === 'uploading').length, 0);
});

test('highlights under web:<lineage>: refused before screening; tied to the manifest version; another version counts as changed', async t => {
  const { capture, board, setVerdict, env } = await setup(t);
  const call = async (method, path, body) => {
    const response = await pdfExcerptsFetch(new Request(`https://dev.test${path}`, { method, headers: { 'Content-Type': 'application/json', cookie: 'small_session=owner' }, body: body && JSON.stringify(body) }), env);
    return { status: response.status, body: await response.json() };
  };
  setVerdict({ status: 'inconclusive' });
  const pending = await capture('owner', { url: 'https://example.com/' });
  const key = `web:${pending.body.lineage}`;
  assert.equal((await call('GET', `/api/learn/pdf-highlights?app=demo-app&key=${key}&manifest=${pending.body.manifestId}`)).status, 404, 'an unscreened capture has no highlights route');
  setVerdict({ status: 'passed' });
  const v1 = await capture('owner', { url: 'https://example.com/', lineage: pending.body.lineage });
  const id = `pdfh_${'a'.repeat(24)}`;
  const put = await call('PUT', `/api/learn/pdf-highlights/${id}`, { app: 'demo-app', key, manifest: v1.body.capture.manifestId, sha256: v1.body.capture.sha256,
    kind: 'text', page: { index: 1 }, rects: [[1, 2, 3, 4]], rotate: 0, view: [0, 0, 1280, 1500], quote: { exact: 'Example' } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  let got = await call('GET', `/api/learn/pdf-highlights?app=demo-app&key=${key}&manifest=${v1.body.capture.manifestId}`);
  assert.equal(got.body.sha256, v1.body.capture.sha256);
  assert.equal(got.body.highlights.length, 1);
  const v2 = await capture('owner', { url: 'https://example.com/', lineage: pending.body.lineage });
  got = await call('GET', `/api/learn/pdf-highlights?app=demo-app&key=${key}&manifest=${v2.body.capture.manifestId}`);
  assert.deepEqual([got.body.highlights.length, got.body.changed], [0, 1], 'old highlights stay on the old version, never re-attached');
  got = await call('GET', `/api/learn/pdf-highlights?app=demo-app&key=${key}&manifest=${v1.body.capture.manifestId}`);
  assert.equal(got.body.highlights.length, 1, 'still shown on the version they were made on');
});
