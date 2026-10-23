// The 50 MiB board-file cap and the file source routes on the real Cloudflare edge (canvas-file-imports.md section 7; owner
// acceptance point 5, 2026-10-16), against a session's own dev clone only (rabbit-hole-web-dev-<session>), with the page's
// checks bypassed: raw fetches and a raw TLS socket. Then a 25-50 MiB video uploaded through the page, reopened, played and
// seeked in a fresh browser context against the clone. Test sessions come from rabbit-hole-cp-dev; the bypass secret is read
// by name from the repo-root .env and never printed. No model call.
// Usage: BASE=https://rabbit-hole-web-dev-<session>.tryrabbithole.workers.dev [ENV_FILE=<.env>] node e2e/file-edge-check.mjs
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:tls';
import { DEV_CP } from './dev-cp.mjs';
import { largeVideo } from './large-video-fixture.mjs';

const BASE = process.env.BASE || '';
if (!/^https:\/\/rabbit-hole-web-dev-[a-z0-9-]+\.tryrabbithole\.workers\.dev$/.test(BASE)) throw Error('file-edge-check runs against a session dev clone only (BASE=https://rabbit-hole-web-dev-<session>.tryrabbithole.workers.dev)');
const envText = readFileSync(process.env.ENV_FILE || 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const secret = envText.match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1].replace(/^"|"$/g, '').trim();
if (!secret) throw Error('RABBIT_HOLE_DEV_TEST_BYPASS is not in the env file');
const run = Date.now().toString(36).slice(-6);
const UA = { 'User-Agent': 'file-edge-check' };
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ email: `file-edge-${run}@example.com`, secret, handle: `fedge_${run}` }) })).json()).session;
if (!session) throw Error('no test session from rabbit-hole-cp-dev');
const authed = { cookie: `small_session=${session}`, ...UA };
const made = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { ...authed, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `File edge ${run}` }) })).json();
if (!made.name) throw Error(`no canvas: ${JSON.stringify(made).slice(0, 200)}`);
const board = `${BASE}/api/learn/boards/${made.name}/main`;
const MiB = 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const webmOf = size => { const bytes = new Uint8Array(size); bytes.set([0x1a, 0x45, 0xdf, 0xa3]); return bytes; };

let failed = 0, steps = 0;
const ok = (name, condition, extra = '') => { steps += 1; if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const STATE = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
await fetch(board, { method: 'PUT', headers: { ...authed, 'Content-Type': 'application/json' }, body: JSON.stringify({ state: STATE }) });
const assetUrl = key => `${board}/assets/${encodeURIComponent(key)}`;
const listed = async () => (await (await fetch(`${board}/assets`, { headers: authed })).json()).keys || [];
const put = (key, body, extra = {}) => fetch(assetUrl(key), { method: 'PUT', body, duplex: 'half', headers: { ...authed, 'Content-Type': 'video/webm', ...extra } });

// 1. Exactly 50 MiB with its Content-Length: stored whole (streamed to R2 through FixedLengthStream).
let t0 = Date.now();
const exact = await put(`edge:${run}:exact`, webmOf(50 * MiB));
const exactText = await exact.text(), exactBody = (() => { try { return JSON.parse(exactText); } catch { return {}; } })();
ok('exactly 52428800 bytes is accepted on the edge', exact.status === 200 && exactBody.size === 50 * MiB, `${exact.status} size ${exactBody.size} in ${Date.now() - t0} ms${exact.ok ? '' : `, ray ${exact.headers.get('cf-ray')}: ${exactText.replace(/\s+/g, ' ').slice(0, 200)}`}`);
const back = await fetch(assetUrl(`edge:${run}:exact`), { headers: { ...authed, Range: 'bytes=52428700-' } });
ok('and served back by range from its last 100 bytes', back.status === 206 && back.headers.get('content-range') === `bytes 52428700-52428799/${50 * MiB}`, `${back.status} ${back.headers.get('content-range')}`);

// 2. One byte more with its Content-Length: refused before reading.
t0 = Date.now();
const over = await put(`edge:${run}:over`, webmOf(50 * MiB + 1)).then(async response => `${response.status} ${(await response.json().catch(() => ({}))).error || ''}`, error => `connection closed (${error.cause?.code || error.message})`);
ok('52428801 bytes is refused on the edge', /^413 This file is over 50 MiB/.test(over), `${over} in ${Date.now() - t0} ms`);

// 3. One byte more, chunked, no Content-Length: refused, nothing stored. The Worker counts a body without a length to 1 MiB
// and then answers 411 (upload-body.js); the edge may also hand the Worker the length it buffered, which the cap refuses (413).
const big = webmOf(50 * MiB + 1);
t0 = Date.now();
const chunked = await put(`edge:${run}:chunked`, new ReadableStream({ start(controller) { for (let at = 0; at < big.length; at += 4 * MiB) controller.enqueue(big.slice(at, at + 4 * MiB)); controller.close(); } }))
  .then(async response => `${response.status} ${(await response.json().catch(() => ({}))).error || ''}`, error => `connection closed (${error.cause?.code || error.message})`);
ok('52428801 bytes chunked with no Content-Length is refused on the bytes', /^(411|413) /.test(chunked) || chunked.startsWith('connection closed'), `${chunked} in ${Date.now() - t0} ms`);

// 4. A false, small Content-Length: HTTP framing gives the Worker only the declared bytes, so a client cannot slip more past
// the count. Sent over a raw socket: declared 1000 with 2 MiB written. The stored file is the 1000 bytes actually read.
const host = new URL(BASE).hostname;
const raw = await new Promise(resolve => {
  const socket = connect({ host, port: 443, servername: host, ALPNProtocols: ['http/1.1'] }, () => {
    socket.write(`PUT ${new URL(assetUrl(`edge:${run}:false`)).pathname} HTTP/1.1\r\nHost: ${host}\r\nCookie: small_session=${session}\r\nUser-Agent: file-edge-check\r\nContent-Type: video/webm\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n`);
    socket.write(Buffer.from(webmOf(2 * MiB)));
  });
  let text = '';
  socket.on('data', data => { text += data.toString('latin1'); });
  socket.on('error', error => resolve(`error ${error.code || error.message}`));
  socket.on('close', () => resolve(text.split('\r\n')[0] + ' ' + (text.match(/\{.*\}/s)?.[0] || '')));
  setTimeout(() => { socket.destroy(); resolve(text ? text.split('\r\n')[0] : 'timeout'); }, 60000);
});
// A Content-Length larger than the bytes sent: 2 MiB declared, 1000 bytes written, then the client ends its side.
const shortRaw = await new Promise(resolve => {
  const socket = connect({ host, port: 443, servername: host, ALPNProtocols: ['http/1.1'] }, () => {
    socket.write([`PUT ${new URL(assetUrl(`edge:${run}:short`)).pathname} HTTP/1.1`, `Host: ${host}`, `Cookie: small_session=${session}`, 'User-Agent: file-edge-check',
      'Content-Type: video/webm', `Content-Length: ${2 * MiB}`, 'Connection: close', '', ''].join('\r\n'));
    socket.end(Buffer.from(webmOf(1000)));
  });
  let text = '';
  const t1 = Date.now();
  const status = () => text.split('\r\n')[0];
  socket.on('data', data => { text += data.toString('latin1'); });
  socket.on('error', error => resolve(`error ${error.code || error.message} after ${Date.now() - t1} ms`));
  socket.on('close', () => resolve(`${text ? `${status()} ${text.match(/\{"error".*\}/s)?.[0] || ''}` : 'closed with no response'} after ${Date.now() - t1} ms`));
  setTimeout(() => { socket.destroy(); resolve(`no answer in 90 s${text ? `: ${status()}` : ''}`); }, 90000);
});
const falseStored = await fetch(assetUrl(`edge:${run}:false`), { headers: authed });
const falseBytes = falseStored.ok ? (await falseStored.arrayBuffer()).byteLength : null;
ok('a false small Content-Length stores only the bytes actually read (1000 of 2 MiB sent)', falseBytes === 1000, `${raw.trim().slice(0, 80)}; stored ${falseBytes}`);
// The same lie against a file source, whose declared size is fixed at create: refused, nothing stored.
const declared = webmOf(4000);
const created = await (await fetch(`${BASE}/api/learn/files`, { method: 'POST', headers: { ...authed, 'Content-Type': 'application/json' }, body: JSON.stringify({ app: made.name, board: 'main', name: 'lie.webm', type: 'video/webm', size: 4000, sha256: sha(declared), family: 'video' }) })).json();
const short = await fetch(`${BASE}${created.upload?.url}`, { method: 'PUT', body: declared.slice(0, 1000), headers: { ...authed, 'Content-Type': 'video/webm' } });
ok('a source upload shorter than its declared size is refused', short.status === 400 && (await fetch(`${BASE}/api/learn/files/${created.source?.id}`, { headers: authed })).status === 404, String(short.status));
const keys = await listed();
ok('a Content-Length larger than the bytes sent ends without a hang and stores nothing', !/^no answer/.test(shortRaw) && !/ 2\d\d /.test(shortRaw) && !keys.includes(`edge:${run}:short`), shortRaw);
ok('none of the refused uploads was stored', keys.includes(`edge:${run}:exact`) && !keys.includes(`edge:${run}:over`) && !keys.includes(`edge:${run}:chunked`) && !keys.includes(`edge:${run}:short`), keys.filter(key => key.startsWith('edge:')).join(', '));

// 5. A file source on the edge: 30 MiB streamed, hashed (DigestStream) and served back byte for byte.
const source = webmOf(30 * MiB).map((b, i) => (i < 4 ? b : (i * 13) % 251));
const madeSource = await (await fetch(`${BASE}/api/learn/files`, { method: 'POST', headers: { ...authed, 'Content-Type': 'application/json' }, body: JSON.stringify({ app: made.name, board: 'main', name: 'edge.webm', type: 'video/webm', size: source.length, sha256: sha(source), family: 'video' }) })).json();
const upSource = await fetch(`${BASE}${madeSource.upload?.url}`, { method: 'PUT', body: source, headers: { ...authed, 'Content-Type': 'video/webm' } });
const gotSource = await fetch(`${BASE}/api/learn/files/${madeSource.source?.id}`, { headers: authed });
const wrong = webmOf(30 * MiB), claimed = webmOf(30 * MiB); claimed[123] = 9; // declared: the hash of other bytes
const madeWrong = await (await fetch(`${BASE}/api/learn/files`, { method: 'POST', headers: { ...authed, 'Content-Type': 'application/json' }, body: JSON.stringify({ app: made.name, board: 'main', name: 'wrong.webm', type: 'video/webm', size: wrong.length, sha256: sha(claimed), family: 'video' }) })).json();
const putWrong = await fetch(`${BASE}${madeWrong.upload?.url}`, { method: 'PUT', body: wrong, headers: { ...authed, 'Content-Type': 'video/webm' } });
ok('30 MiB whose sha256 is not the declared one: R2 refuses it and nothing is stored', putWrong.status === 400 && (await fetch(`${BASE}/api/learn/files/${madeWrong.source?.id}`, { headers: authed })).status === 404, String(putWrong.status));
ok('a 30 MiB file source uploads, hashes and downloads byte for byte on the edge', upSource.status === 200 && gotSource.ok && sha(new Uint8Array(await gotSource.arrayBuffer())) === sha(source), `${upSource.status} ${gotSource.status}`);

// 7. Owner checks (a)-(e), 2026-10-16, on both routes over a raw socket: the request line, headers and body exactly as sent.
// end: the client also ends its side after the body. Only for a body shorter than its Content-Length; otherwise the socket stays
// open for the answer, as a browser's does (the edge closes a half-closed request whose body the Worker did not read).
const rawPut = (path, declared, bytes, type = 'video/webm', { end = false } = {}) => new Promise(resolve => {
  const socket = connect({ host, port: 443, servername: host, ALPNProtocols: ['http/1.1'] }, () => {
    socket.write([`PUT ${path} HTTP/1.1`, `Host: ${host}`, `Cookie: small_session=${session}`, 'User-Agent: file-edge-check', `Content-Type: ${type}`,
      ...(declared === null ? ['Transfer-Encoding: chunked'] : [`Content-Length: ${declared}`]), 'Connection: close', '', ''].join('\r\n'));
    const body = declared === null ? Buffer.concat([Buffer.from(`${bytes.length.toString(16)}\r\n`), Buffer.from(bytes), Buffer.from('\r\n0\r\n\r\n')]) : Buffer.from(bytes);
    if (end) socket.end(body); else socket.write(body);
  });
  let text = '';
  socket.on('data', data => { text += data.toString('latin1'); if (/\}\s*$/.test(text)) setTimeout(() => socket.destroy(), 300); });
  socket.on('error', error => resolve(`error ${error.code || error.message}`));
  socket.on('close', () => resolve(text ? `${text.split('\r\n')[0].replace('HTTP/1.1 ', '')} ${text.match(/\{"(error|key|source)".*\}/s)?.[0]?.slice(0, 120) || ''}` : 'closed with no response'));
  setTimeout(() => { socket.destroy(); resolve(`no answer in 120 s${text ? `: ${text.split('\r\n')[0]}` : ''}`); }, 120000);
});
const assetPath = key => new URL(assetUrl(key)).pathname;
const storedSize = async key => { const r = await fetch(assetUrl(key), { headers: authed }); return r.ok ? (await r.arrayBuffer()).byteLength : r.status; };
// (b) board: a declared size inside the cap with a larger body behind it: only the declared bytes are read and stored.
const capTrick = await rawPut(assetPath(`edge:${run}:captrick`), 50 * MiB, webmOf(60 * MiB));
ok('(b) board: Content-Length 52428800 with 60 MiB behind it stores exactly 52428800 bytes', (await storedSize(`edge:${run}:captrick`)) === 50 * MiB, capTrick);
// (c) board: no length (chunked) at the 1 MiB boundary.
const at = await rawPut(assetPath(`edge:${run}:mib`), null, new Uint8Array(1048576), 'application/octet-stream');
const past = await rawPut(assetPath(`edge:${run}:mib1`), null, new Uint8Array(1048577), 'application/octet-stream');
const atSize = await storedSize(`edge:${run}:mib`), pastSize = await storedSize(`edge:${run}:mib1`);
ok('(c) board: chunked 1048576 bytes is stored', atSize === 1048576, `${at}; stored ${atSize}`);
ok('(c) board: chunked 1048577 bytes is refused with 411, or stored whole when the edge hands the Worker its length', (/^411 .*Send this file with its Content-Length/.test(past) && pastSize === 404) || (/^200 /.test(past) && pastSize === 1048577), `${past}; stored ${pastSize}`);
// Files: a source declared 4000 bytes.
const fsBytes = webmOf(4000).map((b, i) => (i < 4 ? b : i % 199));
const fsMade = await (await fetch(`${BASE}/api/learn/files`, { method: 'POST', headers: { ...authed, 'Content-Type': 'application/json' }, body: JSON.stringify({ app: made.name, board: 'main', name: 'raw.webm', type: 'video/webm', size: 4000, sha256: sha(fsBytes), family: 'video' }) })).json();
const fsPath = new URL(`${BASE}${fsMade.upload?.url}`).pathname;
const notStored = async () => (await fetch(`${BASE}/api/learn/files/${fsMade.source?.id}`, { headers: authed })).status === 404;
const fa = await rawPut(fsPath, 4000, fsBytes.slice(0, 1000), 'video/webm', { end: true });
ok('(a) files: Content-Length 4000 with 1000 bytes sent is not finalized', !/^200 /.test(fa) && await notStored(), fa);
const fb1 = await rawPut(fsPath, 1000, fsBytes);
ok('(b) files: Content-Length 1000 for a 4000-byte source is refused, not finalized', /^400 /.test(fb1) && await notStored(), fb1);
const fb2 = await rawPut(fsPath, 4001, webmOf(4001));
ok('(b) files: Content-Length over the declared size is refused, not finalized', /^413 /.test(fb2) && await notStored(), fb2);
const changed = Uint8Array.from(fsBytes); changed[3000] ^= 1;
const fd = await rawPut(fsPath, 4000, Buffer.concat([Buffer.from(changed), Buffer.alloc(1000)]));
ok('(d) files: the declared size of other bytes (and more behind them): R2 refuses the sha256, not finalized', /^400 /.test(fd) && await notStored(), fd);
const fc = await rawPut(fsPath, null, fsBytes.slice(0, 3000));
ok('(b, chunked) files: a chunked body short of the declared size is refused, not finalized', /^(400|411) /.test(fc) && await notStored(), fc);
const fine = await rawPut(fsPath, 4000, fsBytes);
ok('files: the declared bytes then finalize', /^200 /.test(fine) && !(await notStored()), fine);
const owned = await listed();
ok('(e) no refused upload left a board file', !owned.includes(`edge:${run}:mib1`) || pastSize === 1048577, owned.filter(key => key.startsWith('edge:')).join(', '));

// 6. A 25-50 MiB video through the page, then a fresh browser context on the same account: loads, plays, seeks.
const browser = await chromium.launch();
const clip = await largeVideo(browser);
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
await page.goto(`${BASE}/apps/${made.name}`);
// A new test account picks its handle first (HandleGate); the dev control plane does not set one.
const handle = page.getByText('Choose your handle');
if (await handle.waitFor({ timeout: 20000 }).then(() => true, () => false)) {
  await page.locator('input').first().fill(`fedge_${run}`);
  await page.getByRole('button', { name: 'Continue' }).click();
}
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 90000 });
await page.waitForTimeout(3000);
const uploaded = page.waitForResponse(response => response.request().method() === 'PUT' && /\/assets\/drop%3A/.test(response.url()), { timeout: 180000 });
t0 = Date.now();
await page.locator('input[type="file"][accept*=".ipynb"]').setInputFiles(clip.path);
await page.locator('[data-upload-destination] [data-upload-choice="canvas"]').click(); // Owner brief 2026-10-22 item 3: the picker asks where the file goes first; Add to canvas is the drop road
await canvas.locator('video[controls]').first().waitFor({ timeout: 30000 }).catch(() => {});
const putClip = await uploaded.catch(() => null);
ok(`a ${(clip.size / MiB).toFixed(1)} MiB WebM uploaded through the page saves to the account`, putClip?.status() === 200, `${putClip?.status()} in ${Date.now() - t0} ms`);
await context.close();
const fresh = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await fresh.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const other = await fresh.newPage();
await other.goto(`${BASE}/apps/${made.name}`);
const video = other.locator('[aria-label="Lesson canvas"] video[controls]').first();
await video.waitFor({ timeout: 120000 }).catch(() => {});
const played = await video.evaluate(async element => {
  const when = (name, ms = 60000) => new Promise((resolve, reject) => { element.addEventListener(name, resolve, { once: true }); setTimeout(() => reject(Error(`no ${name}`)), ms); });
  if (element.readyState < 1) await when('loadedmetadata');
  element.muted = true;
  await element.play();
  for (let waited = 0; element.currentTime < 0.5 && waited < 10000; waited += 100) await new Promise(resolve => setTimeout(resolve, 100));
  const advanced = element.currentTime;
  element.pause();
  const target = element.duration * 0.75, seeked = when('seeked');
  element.currentTime = target;
  await seeked;
  return { duration: element.duration, advanced, target, at: element.currentTime };
}).catch(error => ({ error: error.message }));
ok('a fresh browser context against the clone loads it, plays it and seeks to three quarters', Number.isFinite(played.duration) && played.advanced >= 0.5 && Math.abs(played.at - played.target) < 0.5, JSON.stringify(played));
await browser.close();

console.log(failed ? `${failed} FAILED` : 'all passed');
console.log(`file-edge-check ${steps - failed}/${steps}`);
process.exit(failed ? 1 : 0);
