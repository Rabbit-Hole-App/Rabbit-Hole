import { chromium } from '@playwright/test';

// Dropping and uploading .ipynb and .py onto the canvas (owner, 2026-10-08; docs/features/canvas-file-drop.md), against the
// LOCAL stack only: a real session on a fresh canvas. Every drop opens "Add to canvas" with the file name and its choices;
// Cancel and Escape add nothing; each choice places its card; an invalid notebook says so and keeps the dialog; nothing
// asks a model or uploads to /api/learn/media; a notebook card never runs on its own. Prints no secrets.
// A video over 25 MiB is uploaded, saved, reopened and seeked in a fresh browser, and the server's 50 MiB cap is sent past
// the page's check (canvas-file-imports.md section 7; the fixture is generated, large-video-fixture.mjs).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<.dev.vars>] node e2e/canvas-file-drop-check.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { largeVideo } from './large-video-fixture.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('canvas-file-drop-check runs against the local stack only');
const run = Date.now().toString(36).slice(-6);
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `drop-${run}@example.com`, secret, handle: `drop_${run}` }) })).json()).session;
const made = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: `File drop ${run}` }) })).json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const asks = [], media = [];
// Only what the check watches is answered here; everything else is the local stack's.
await page.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.pathname === '/api/learn/media') { media.push(url.pathname); return route.fulfill({ status: 500, json: {} }); }
  // Next Steps' hook on canvas open is an expected request (professor-next-steps.md), answered by the stack's fixtures.
  if (request.method() === 'POST' && url.pathname !== '/api/learn/tutor/next-steps' && /ask|selection|learn-course|journey|tutor/.test(url.pathname)) { asks.push(url.pathname); return route.fulfill({ status: 500, json: {} }); }
  return route.continue();
});
// The notebook site is another origin: a blank page that only records what the card sends it (init is expected; run-all never).
await page.route(/canvas-notebook/, route => route.fulfill({ contentType: 'text/html', body: '<script>window.seen = []; addEventListener("message", e => seen.push(e.data && e.data.type))</script>' }));
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const canvas = page.locator('[aria-label="Lesson canvas"]');
const surface = canvas.locator('div.touch-none').first();
const dialog = page.getByRole('dialog', { name: 'Add to canvas' });
const choice = id => dialog.locator(`[data-import-choice="${id}"]`);

await page.goto(`${BASE}/apps/${made.name}`);
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 60000 });
await page.waitForTimeout(3000);

// A real drop event at a point on the canvas, carrying one file (or several: `name` and `text` as arrays).
const drop = async (name, text, at = { x: 0.5, y: 0.5 }) => {
  const box = await surface.boundingBox();
  const target = await surface.elementHandle();
  await page.evaluate(([element, fileNames, bodies, x, y]) => {
    const transfer = new DataTransfer();
    fileNames.forEach((fileName, index) => transfer.items.add(new File([bodies[index]], fileName, { type: '' })));
    const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, [target, [name].flat(), [text].flat(), box.x + box.width * at.x, box.y + box.height * at.y]);
  await page.waitForTimeout(500);
};
const NOTEBOOK = JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [
  { cell_type: 'markdown', metadata: {}, source: '# Imported notes' },
  { cell_type: 'code', metadata: {}, execution_count: 1, source: 'print("hi")', outputs: [{ output_type: 'display_data', metadata: {}, data: { 'text/html': '<script>window.ran = 1</script>' } }] },
] });
const PY = 'def greet(name):\n    return f"hi {name}"\n';
const choicesOf = async () => (await dialog.locator('[data-import-choice]').allInnerTexts()).map(t => t.trim());

// --- .ipynb: the dialog, Cancel, then a notebook card ---
await drop('analysis.ipynb', NOTEBOOK);
ok('a dropped .ipynb opens Add to canvas with its file name', await dialog.count() === 1 && (await dialog.locator('[data-import-file]').innerText()).trim() === 'analysis.ipynb');
ok('a notebook offers Notebook or File attachment, Notebook first', JSON.stringify(await choicesOf()) === JSON.stringify(['Notebook', 'File attachment']) && await choice('notebook').getAttribute('aria-checked') === 'true');
ok('the dialog offers Add to canvas and Cancel', await dialog.getByRole('button', { name: 'Add to canvas' }).count() === 1 && await dialog.getByRole('button', { name: 'Cancel' }).count() === 1);
const notebooksBefore = await canvas.locator('[data-notebook-header]').count();
await dialog.getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(300);
ok('Cancel adds nothing', await dialog.count() === 0 && await canvas.locator('[data-notebook-header]').count() === notebooksBefore);
await drop('analysis.ipynb', NOTEBOOK);
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(1200);
ok('Notebook places a notebook card', await dialog.count() === 0 && await canvas.locator('[data-notebook-header]').count() === notebooksBefore + 1);
ok('no saved output script ran on the page', !(await page.evaluate(() => window.ran)));

// --- .py: Escape, then a code card ---
await drop('train.py', PY);
ok('a dropped .py offers Code card, Notebook or File attachment', JSON.stringify(await choicesOf()) === JSON.stringify(['Code card', 'Notebook', 'File attachment']));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok('Escape adds nothing', await dialog.count() === 0 && await canvas.getByText('def greet(name):').count() === 0);
await drop('train.py', PY);
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(800);
ok('Code card places the code under its file name, with nothing run', await canvas.getByText('train.py').count() >= 1 && await canvas.getByText('def greet(name):').count() === 1);

// --- a drop at the top of the canvas lands above that card: the card goes where it was dropped ---
const codeTop = async () => (await canvas.getByText('def greet(name):').boundingBox()).y;
const before = await codeTop();
await drop('notes.py', '# notes\n', { x: 0.5, y: 0.02 });
await choice('attachment').click();
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(800);
const attachment = canvas.locator('[data-file-attachment]').filter({ hasText: 'notes.py' });
ok('File attachment places the file with its name and Download', await attachment.count() === 1 && await attachment.getByRole('link', { name: 'Download' }).count() === 1);
ok('dropped at the top, it lands above the code card', (await attachment.boundingBox()).y < await codeTop(), `attachment ${(await attachment.boundingBox()).y}, code ${await codeTop()} (was ${before})`);

// --- an invalid notebook: the error names the file, the dialog stays, File attachment still works ---
await drop('broken.ipynb', '{not json');
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(400);
ok('an invalid notebook says so in the dialog, naming the file, and nothing is placed', await dialog.count() === 1 && /^broken\.ipynb is not valid notebook JSON/.test((await dialog.locator('[data-import-error]').innerText()).trim()));
await choice('attachment').click();
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(600);
ok('then kept as a File attachment, as it is', await dialog.count() === 0 && await canvas.locator('[data-file-attachment]').filter({ hasText: 'broken.ipynb' }).count() === 1);

// --- Repository graph Release 2, lane DROP: a code file is a Code card or a File attachment, never a notebook ---
const blocks = () => canvas.locator('[data-block-id]').evaluateAll(list => new Set(list.map(el => el.dataset.blockId)).size);
await drop('app.ts', 'export const a = 1;\n');
ok('a dropped .ts offers Code card or File attachment, Code card first', JSON.stringify(await choicesOf()) === JSON.stringify(['Code card', 'File attachment']) && await choice('code').getAttribute('aria-checked') === 'true');
const beforeCode = await blocks();
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(800);
ok('Code card places one card for the .ts', await dialog.count() === 0 && await blocks() === beforeCode + 1, `${beforeCode} -> ${await blocks()}`);
// Binary content is refused in the dialog, naming the file; nothing is placed.
await drop('blob.js', 'MZ\u0000\u0000');
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(400);
ok('a binary .js is refused in the dialog, naming the file', await dialog.count() === 1 && /^blob\.js looks like a binary file/.test((await dialog.locator('[data-import-error]').innerText()).trim()));
await dialog.getByRole('button', { name: 'Cancel' }).click();
// Several files in one drop: one dialog, each file and what it becomes, the sum, then all at once; Cancel adds none.
const beforeBatch = await blocks();
await drop(['a.js', 'b.go', 'c.py'], ['let a;\n', 'package b\n', 'c = 1\n']);
ok('a drop of three files is one dialog listing each', await dialog.count() === 1 && await dialog.locator('[data-import-row]').count() === 3);
ok('it says what it will create', (await dialog.locator('[data-import-summary]').innerText()).trim() === 'Adds 3 code cards.');
await dialog.getByRole('combobox', { name: 'Add c.py as' }).selectOption('notebook');
ok('changing one file changes the sum', (await dialog.locator('[data-import-summary]').innerText()).trim() === 'Adds 2 code cards and 1 notebook.');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok('Escape on several adds none of them', await dialog.count() === 0 && await blocks() === beforeBatch);
await drop(['a.js', 'b.go'], ['let a;\n', 'package b\n']);
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(1000);
ok('Add to canvas places every file of the drop', await dialog.count() === 0 && await blocks() === beforeBatch + 2, `${beforeBatch} -> ${await blocks()}`);
// A drag that began on this page (a card's image, a Files row) is not a file drop, even carrying a file.
const beforeInPage = await blocks();
await page.evaluate(() => document.body.dispatchEvent(new DragEvent('dragstart', { bubbles: true })));
await drop('inpage.js', 'let x;\n');
ok('a drag that began on the page opens no dialog and adds nothing', await dialog.count() === 0 && await blocks() === beforeInPage);
await page.evaluate(() => document.body.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
await drop('outside.js', 'let y;\n');
ok('after it ends, a file from outside opens the dialog again', await dialog.count() === 1);
await dialog.getByRole('button', { name: 'Cancel' }).click();

// --- Insert > Upload a file opens the same dialog ---
await page.locator('input[type="file"][accept*=".ipynb"]').setInputFiles({ name: 'upload.py', mimeType: 'text/x-python', buffer: Buffer.from('x = 1\n') });
await page.waitForTimeout(500);
ok('Upload a file opens the same dialog', await dialog.count() === 1 && (await dialog.locator('[data-import-file]').innerText()).trim() === 'upload.py');
await dialog.getByRole('button', { name: 'Cancel' }).click();

// --- A video over 25 MiB (canvas-file-imports.md section 7): Upload a file, saved to the account, reopened and seeked in a
// fresh browser; the server's own 50 MiB cap on the real Worker, with the page's check bypassed ---
const MiB = 1024 * 1024;
const big = await largeVideo(browser);
const ownBoard = `${BASE}/api/learn/boards/${encodeURIComponent(made.name)}/main`;
const authed = { cookie: `small_session=${session}` };
const uploaded = page.waitForResponse(response => response.request().method() === 'PUT' && /\/assets\/drop%3A/.test(response.url()), { timeout: 120000 });
const clipsBefore = await canvas.locator('video[controls]').count();
await page.locator('input[type="file"][accept*=".ipynb"]').setInputFiles(big.path);
// Caching 34 MiB in IndexedDB comes first: wait for the card, at most 30 s.
await canvas.locator('video[controls]').nth(clipsBefore).waitFor({ timeout: 30000 }).catch(() => {});
ok(`Upload a file places a ${(big.size / MiB).toFixed(1)} MiB WebM as a video card, with no dialog`, await dialog.count() === 0 && await canvas.locator('video[controls]').count() === clipsBefore + 1);
const put = await uploaded.catch(() => null);
ok('the board saves the video to the account (the page no longer keeps it back over 25 MiB)', put?.status() === 200, put ? `PUT ${put.status()}` : 'no PUT within 120 s');
const savedState = (await (await fetch(ownBoard, { headers: authed })).json()).state;
const clipKey = (savedState?.blocks || []).find(block => block.type === 'file' && block.kind === 'clip')?.assetKey;
ok('the saved board keeps the clip as an asset key, not its bytes', !!clipKey && JSON.stringify(savedState).length < 200000, `${clipKey}, board ${JSON.stringify(savedState || {}).length} chars`);
const stored = clipKey ? await fetch(`${ownBoard}/assets/${encodeURIComponent(clipKey)}`, { headers: authed }) : null;
const storedHash = stored?.ok ? createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex') : null;
ok('the stored file is the original, byte for byte', storedHash === big.sha256, `${stored?.status} ${storedHash?.slice(0, 12)} vs ${big.sha256.slice(0, 12)}`);
const ranged = clipKey ? await fetch(`${ownBoard}/assets/${encodeURIComponent(clipKey)}`, { headers: { ...authed, Range: 'bytes=1000-1999' } }) : null;
ok('the server answers a byte range', ranged?.status === 206 && ranged.headers.get('content-range') === `bytes 1000-1999/${big.size}` && (await ranged.arrayBuffer()).byteLength === 1000, `${ranged?.status} ${ranged?.headers.get('content-range')}`);

// A fresh browser: nothing cached, the same account.
const fresh = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await fresh.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await fresh.route(/canvas-notebook/, route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
const other = await fresh.newPage();
await other.goto(`${BASE}/apps/${made.name}`);
const video = other.locator('[aria-label="Lesson canvas"] video[controls]').first();
await video.waitFor({ timeout: 90000 }).catch(() => {});
const played = await video.evaluate(async element => {
  const when = (name, ms = 30000) => new Promise((resolve, reject) => { element.addEventListener(name, resolve, { once: true }); setTimeout(() => reject(Error(`no ${name}`)), ms); });
  if (element.readyState < 1) await when('loadedmetadata');
  const duration = element.duration;
  element.muted = true;
  await element.play();
  // Playing: the clock passes half a second (10 s at most).
  for (let waited = 0; element.currentTime < 0.5 && waited < 10000; waited += 100) await new Promise(resolve => setTimeout(resolve, 100));
  const advanced = element.currentTime;
  element.pause();
  const target = duration * 0.75;
  const seeked = when('seeked');
  element.currentTime = target;
  await seeked;
  return { duration, advanced, target, at: element.currentTime };
}).catch(error => ({ error: error.message }));
ok('a fresh browser on the same account loads the video from the account', Number.isFinite(played.duration) && played.duration > 7, JSON.stringify(played));
ok('it plays there', played.advanced >= 0.5, String(played.advanced));
ok('and seeks to three quarters', Math.abs(played.at - played.target) < 0.5, `${played.at} of ${played.duration}`);
await fresh.close();

// The server's cap on the real Worker, as a client that skips the page's check would send it: exactly 50 MiB with a
// Content-Length (streamed to R2), one byte more refused, and one byte more with no Content-Length (chunked) refused too.
const webmOf = size => { const bytes = new Uint8Array(size); bytes.set([0x1a, 0x45, 0xdf, 0xa3]); return bytes; };
const raw = (key, body, extra = {}) => fetch(`${ownBoard}/assets/${encodeURIComponent(key)}`, { method: 'PUT', body, duplex: 'half', headers: { ...authed, 'Content-Type': 'video/webm', ...extra } });
const exact = await raw(`bypass:${run}:exact`, webmOf(50 * MiB));
ok('exactly 50 MiB is accepted by the server', exact.status === 200 && (await exact.json()).size === 50 * MiB, String(exact.status));
const over = await raw(`bypass:${run}:over`, webmOf(50 * MiB + 1));
ok('50 MiB + 1 byte is refused by the server', over.status === 413 && /over 50 MiB/.test((await over.json()).error), String(over.status));
const chunks = webmOf(50 * MiB + 1);
// Without a length the Worker stops at its separate 1 MiB fallback limit and returns 411. Some local transports reset
// the connection while this larger body is still being sent; that proves no status contract, only refusal plus the
// no-stored-object assertion below. The isolated workerd boundary check covers the exact fallback independently.
const chunked = await raw(`bypass:${run}:chunked`, new ReadableStream({ start(controller) { for (let at = 0; at < chunks.length; at += 4 * MiB) controller.enqueue(chunks.slice(at, at + 4 * MiB)); controller.close(); } }))
  .then(async response => ({ status: response.status, body: await response.json() }), error => ({ closed: error.cause?.code || error.message }));
if (chunked.closed) console.log(`info no-length transport closed (${chunked.closed}); fallback status unobserved, checking no stored object`);
ok('an upload without Content-Length requires a length past the fallback limit (or closes without storing)',
  (chunked.status === 411 && chunked.body?.error === 'Send this file with its Content-Length.') || !!chunked.closed, JSON.stringify(chunked));
const listed = (await (await fetch(`${ownBoard}/assets`, { headers: authed })).json()).keys || [];
ok('neither refused upload was stored', listed.includes(`bypass:${run}:exact`) && !listed.includes(`bypass:${run}:over`) && !listed.includes(`bypass:${run}:chunked`), listed.filter(key => key.startsWith('bypass:')).join(', '));
const notVideo = await raw(`bypass:${run}:fake`, new Uint8Array(30 * MiB));
ok('30 MiB that only claims to be a video is refused', notVideo.status === 415, String(notVideo.status));

// --- nothing asked a model, uploaded media or ran a notebook ---
ok('no ask, journey or course request', asks.length === 0, asks.join(', '));
ok('no media upload', media.length === 0, media.join(', '));
const seen = (await Promise.all(page.frames().filter(f => /canvas-notebook/.test(f.url())).map(f => f.evaluate(() => window.seen || [])))).flat();
ok('the notebook card was opened with its cells and never told to run', seen.includes('init') && !seen.includes('run-all'), seen.join(', '));

await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
