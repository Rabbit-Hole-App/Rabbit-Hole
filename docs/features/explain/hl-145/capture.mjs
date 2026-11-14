// HL-1/2/3 (release 145) screenshots on a local KEYLESS page: vite preview of a built dist-dev, every /api request answered here (no model, no key, no stack), anything else refused.
// Fixture: the v60 board export (film-explain/bank/board-export-canvas-bcb7f9f6-postwrite-v60.json): its Markdown file card (en.md, rev e0209...) and its "Split criteria: measuring impurity" card, which in
// the export has NO sourceRef (the owner's "no highlight, no symbol" case). Boards below are DERIVED from it: the file card alone; the file card + that card without a ref ("unlinked"); and with the
// sourceRef the server mints for the heading passage ("linked"). The server's mint (/api/learn/source-refs) and its artifact route attaching the ref to the card are emulated here, nothing else.
// Usage: node capture.mjs <outDir> <BASE> <before|after>       (cwd anywhere; Playwright is resolved from C:/s/explain-145)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [OUT, BASE, MODE] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE || '') || !['before', 'after'].includes(MODE)) throw Error('usage: capture.mjs <outDir> <http://127.0.0.1:port> <before|after>');
mkdirSync(OUT, { recursive: true });
const WEB = 'C:/s/explain-145/packages/web';
const { chromium } = createRequire(join(WEB, 'package.json'))('@playwright/test');
const F = 'C:/s/spec/film-explain/';
const exported = JSON.parse(readFileSync(`${F}bank/board-export-canvas-bcb7f9f6-postwrite-v60.json`, 'utf8'));
const markdown = readFileSync(`${F}serve/en.md`);
const mdCard = exported.state.blocks.find(b => b.type === 'file'), inlineCard = exported.state.blocks.find(b => b.inline);
const SRC = mdCard.fileRef.source, KEY = `file:${SRC.id}`;
const HEADING = 'Split criteria: measuring impurity';
const refFor = (id, quote) => ({ v: 1, id, kind: 'markdown', source: { key: KEY, rev: SRC.rev, name: 'en.md', home: null }, anchor: { quote } });
const REF_HEADING = refFor(`sref_${'a'.repeat(24)}`, { exact: HEADING, prefix: '', suffix: '' });
const unlinked = { ...inlineCard, id: 'c0ffee00-0000-4000-8000-000000000145', dx: 780, dy: 90 }; // a plain UUID id: the export's own id is the Ctrl+K inline-<request>-card form
const linked = { ...unlinked, sourceRef: REF_HEADING };
const BOARDS = { md: [mdCard], unlinked: [mdCard, unlinked], linked: [mdCard, linked] };
let which = 'md';
const YELLOW = { id: 'pdfh_yellow1', quote: { exact: 'meaning each child contains mostly one class', prefix: 'are as "pure" as possible, ', suffix: '.' } };
let highlights = [];

const ORG = 'demo-team', EMAIL = 'learner@example.com', APP = 'canvas-4d6b2a91';
const canvas = { name: APP, title: 'Decision Trees', description: '', kind: 'canvas', hosting: 'canvas', org: ORG, orgName: 'Demo', email: EMAIL, owner_email: EMAIL, visibility: 'private', members: [], teams: [],
  published: false, shared: false, board_saved: true, access: 'private', canView: true, canEdit: true, url: `/apps/${APP}`, inputs: {}, outputs: {}, created_at: '2026-11-13T12:00:00Z', deployed_at: '2026-11-13T12:00:00Z', observations: [], schedule: null };
const boardOf = () => ({ version: 1, board_id: '00000000-0000-4000-8000-000000000001', updated_by: 'hl145', updated_at: '2026-11-14T12:00:00.000Z', title: null, forked: false,
  sharing: { shared: false, view: null, edit: null, public_view: false }, state: { strokes: [], shapes: [], items: [], links: [], blocks: structuredClone(BOARDS[which]), groups: [], areas: [], exchanges: [], sources: [] } });
const replies = () => ({
  '/api/profile': { name: 'Learner', avatar: null, handle: 'learner', description: '' },
  '/api/apps': { org: ORG, orgName: 'Demo', email: EMAIL, apps: [canvas], folders: [] },
  [`/api/apps/${APP}`]: canvas,
  [`/api/apps/${APP}/learn-course`]: { course: null, canAuthor: true },
  '/api/workspaces': { active: ORG, email: EMAIL, workspaces: [{ slug: ORG, name: 'Demo', role: 'owner', kind: 'custom' }] },
  '/api/learn/cad/jobs': { blocks: [] },
});
const { chatRouteAnswer } = await import(pathToFileURL(join(WEB, 'e2e/dev-cp.mjs')).href);
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const log = [], refs = new Map([[REF_HEADING.id, REF_HEADING]]);
let quiet = 0, minted = 0;
const browser = await chromium.launch();
const ctxOpts = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' }; // a FRESH context per scene: the app keeps a local draft of the board, and a shared context made scene A load scene C's card (no ref)
const handler = async route => {
  const request = route.request(), url = new URL(request.url()), method = request.method(), path = url.pathname;
  if (url.origin !== BASE) { log.push(`ABORT outside ${url.hostname}`); return route.abort(); }
  if (!path.startsWith('/api/')) return route.continue();
  log.push(`${method} ${path}`);
  if (path === '/api/learn/user-settings') return route.fulfill({ json: { learner: 'hl145', settings: { depth: 'balanced', autoSuggest: true }, depthRevision: 0 } });
  if (path.startsWith('/api/learn/roadmap')) return route.fulfill({ status: 404, json: { error: 'Not available', code: 'roadmap_disabled' } });
  if (path === '/api/learn/chat/route') return route.fulfill({ json: chatRouteAnswer(request.postDataJSON() || {}) });
  if (path === '/api/learn/ask' && method === 'POST') {
    quiet += 2;
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: frame('chunk', { text: '​' }) + frame('answer_meta', { messageId: String(100 + quiet), actions: [], followUps: [], alternatives: [String(100 + quiet)], sources: [] })
      + frame('done', { ok: true, threadId: 'canvaschat-4d6b2a91-hl', userMessageId: String(99 + quiet), messageId: String(100 + quiet) }) });
  }
  if (path === '/api/learn/explain/jobs' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not available', code: 'explain_disabled' } });
  if (path === '/api/learn/inline/decide' && method === 'POST') return route.fulfill({ json: { decision: 'proceed', route: { capability: 'explain', outcome: 'card' }, paid: false, token: 'hl-token' } });
  if (path === '/api/learn/inline/route' && method === 'POST') return route.fulfill({ status: 404, json: { error: 'Not available' } });
  if (path === '/api/learn/inline/telemetry' && method === 'POST') return route.fulfill({ json: { ok: true } });
  // The written explanation: the card the v60 export holds, carrying the ref the request names (the server attaches the ref it minted to the card; emulated).
  if ((path === '/api/learn/artifact' || path === '/api/learn/inline/generate') && method === 'POST') {
    const asked = request.postDataJSON() || {}, ref = refs.get(asked.sourceRefId) || null;
    log.push(`ARTIFACT sourceRefId=${asked.sourceRefId || '-'}`);
    await new Promise(resolve => setTimeout(resolve, 900));
    const { id: _id, dx: _dx, dy: _dy, inline: _inline, ...rest } = inlineCard;
    return route.fulfill({ json: { result: 'artifact', primitive: 'explanation', block: { ...structuredClone(rest), ...(ref ? { sourceRef: ref } : {}) } } });
  }
  if (path === '/api/learn/source-refs' && method === 'POST') {
    const draft = request.postDataJSON() || {}, ref = refFor(`sref_${String(++minted).padStart(24, 'b')}`, draft.anchor?.quote);
    refs.set(ref.id, ref); log.push(`MINT ${JSON.stringify(draft.anchor?.quote?.exact || '')}`);
    return route.fulfill({ json: { ref } });
  }
  if (path === '/api/learn/source-refs/resolve' && method === 'POST') return route.fulfill({ json: { refs: (request.postDataJSON()?.ids || []).map(id => ({ id, status: 'current' })) } });
  if (/^\/api\/learn\/(tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course)/.test(path) && method !== 'GET') { log.push(`ABORT model-capable ${path}`); return route.fulfill({ status: 503, json: { error: 'no model' } }); }
  if (path === '/api/telemetry/client') return route.fulfill({ json: { ok: true } });
  if (path === '/api/learn/pdf-highlights' && method === 'GET') return route.fulfill({ json: { highlights, sha256: SRC.rev, changed: 0 } });
  if (path.startsWith('/api/learn/files/') && method === 'GET') {
    if (/\/(text|highlights)\b/.test(path)) return route.fulfill({ json: { highlights, sha256: SRC.rev, changed: 0 } });
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/markdown; charset=utf-8' }, body: markdown });
  }
  if (method !== 'GET') { if (new RegExp('/boards/.*/main$').test(path)) { try { const b = request.postDataJSON(); log.push('SAVE ' + JSON.stringify((b?.state?.blocks || b?.blocks || []).map(x => [String(x.id).slice(0, 8), !!x.sourceRef]))); } catch { /* not json */ } } return route.fulfill({ json: { ok: true, version: 2 } }); }
  if (path === '/api/canvases/dives') return route.fulfill({ status: 404, json: { error: 'Not found' } });
  if (path === '/api/ask/threads') return route.fulfill({ json: { threads: [] } });
  if (path === '/api/learn/chat/active') return route.fulfill({ json: { threadId: null } });
  if (path.startsWith(`/api/learn/boards/${APP}/`) && path.split('/').length === 6) return route.fulfill({ json: boardOf() });
  if (path.endsWith('/main/assets')) return route.fulfill({ json: { keys: [] } });
  const table = replies();
  if (path in table) return route.fulfill({ json: table[path] });
  if (['/api/watch', '/api/learn/usage', '/api/learn/graph-config', '/api/learn/image-jobs'].includes(path)) return route.fulfill({ json: {} });
  log.push(`404 ${path}`);
  return route.fulfill({ status: 404, json: { error: 'Not found' } });
};

const measures = {};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const open = async (board, { yellow = false } = {}) => {
  which = board; highlights = yellow ? [YELLOW] : [];
  const context = await browser.newContext(ctxOpts);
  await context.route('**/*', handler);
  const page = await context.newPage();
  page.on('pageerror', error => log.push(`PAGEERROR ${error.message.slice(0, 200)}`));
  await page.goto(`${BASE}/apps/${APP}`);
  await page.waitForSelector('[data-file-doc-md]', { timeout: 30000 });
  await wait(1500);
  return page;
};
const shot = (page, name, clip) => {
  if (clip) { const x = Math.max(0, Math.round(clip.x)), y = Math.max(0, Math.round(clip.y)); clip = { x, y, width: Math.max(10, Math.min(Math.round(clip.width), 1600 - x)), height: Math.max(10, Math.min(Math.round(clip.height), 900 - y)) }; }
  return page.screenshot({ path: join(OUT, `${name}.png`), ...(clip ? { clip } : {}) });
};
// Pan the canvas (wheel over its surface) until the heading stands in the upper middle of the visible canvas; the passage is then in view with room for the Ctrl+K window beside it.
const scrollHeading = async page => {
  for (let i = 0; i < 14; i++) {
    const y = await page.evaluate(text => { const h = [...document.querySelectorAll('[data-file-doc-md] h3')].find(el => el.textContent.trim() === text); return h ? h.getBoundingClientRect().top : null; }, HEADING);
    if (y === null) return false;
    if (Math.abs(y - 330) < 40) return true;
    await page.mouse.move(700, 450); await page.mouse.wheel(0, y - 330); await wait(350);
  }
  return false;
};
const selectText = (page, text) => page.evaluate(wanted => {
  const root = document.querySelector('[data-file-doc-md]'), walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.data.indexOf(wanted);
    if (at < 0) continue;
    const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + wanted.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    const box = range.getBoundingClientRect();
    return { x: box.left, y: box.top, w: box.width, h: box.height };
  }
  return null;
}, text);
const rectOf = (page, selector) => page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) }; }, selector);
const marks = page => page.evaluate(() => ({
  tutorSource: CSS.highlights.has('tutor-source') ? [...CSS.highlights.get('tutor-source')].length : 0,
  inlineTarget: CSS.highlights.has('inline-target') ? [...CSS.highlights.get('inline-target')].length : 0,
  wikiHighlight: CSS.highlights.has('wiki-highlight') ? [...CSS.highlights.get('wiki-highlight')].length : 0,
  headerButton: document.querySelector('[data-source-ref-open]')?.getAttribute('aria-label') || null,
  gutterButtons: [...document.querySelectorAll('[data-view-card]')].map(b => b.getAttribute('aria-label')),
  scrim: !!document.querySelector('[data-inline-scrim]'), scrimClip: (document.querySelector('[data-inline-scrim]')?.style.clipPath || '').slice(0, 200),
  cards: [...document.querySelectorAll('[data-block-id]')].map(el => el.getAttribute('data-block-id').slice(0, 8)),
}));

// ---- C: the keyboard Ctrl+K over selected words, before and after (the owner's "no highlight, no symbol" case) ----
if (!process.env.SKIP_C) {
  const page = await open('md');
  await scrollHeading(page); await wait(300);
  measures.C_selection = await selectText(page, HEADING);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Control+k');
  await page.waitForSelector('[data-inline-ai]', { timeout: 10000 });
  await wait(700);
  measures.C_window = await marks(page);
  await shot(page, `C1-${MODE}-ctrlk-window`);
  await page.keyboard.type('why does impurity matter for a split', { delay: 25 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('[data-block-id]').length >= 2, null, { timeout: 20000 }).catch(() => {});
  await wait(2500);
  measures.C_after_send = await marks(page);
  measures.C_log = log.filter(line => /MINT|ARTIFACT|source-refs|explain\/jobs/.test(line));
  await shot(page, `C2-${MODE}-card-made`);
  await page.context().close();
}

if (MODE === 'after') {
  // ---- A: pink beside the yellow Highlight, the two icons, both clicks ----
  try {
    const page = await open('linked', { yellow: true });
    await scrollHeading(page); await wait(600);
    await wait(2500);
    measures.A_marks = await marks(page);
    measures.A_dom = await page.evaluate(() => [...document.querySelectorAll('[data-block-id]')].map(el => ({ id: el.getAttribute('data-block-id').slice(0, 8), text: el.innerText.slice(0, 90).replace(/\n/g, ' | '), refs: el.querySelectorAll('[data-source-ref]').length, open: el.querySelectorAll('[data-source-ref-open]').length })));
    await shot(page, 'A1-pink-and-yellow');
    // The persistence proof: a hard reload of the page (same context, so the app's own local draft is what a reload really uses), then the same marks and icons.
    await page.reload(); await page.waitForSelector('[data-file-doc-md]', { timeout: 30000 }); await wait(2500); await scrollHeading(page); await wait(800);
    measures.A_marks_after_reload = await marks(page);
    await shot(page, 'A1c-after-reload-still-pink');
    const md = await rectOf(page, '[data-file-doc-text]');
    if (md) await shot(page, 'A1b-pink-and-yellow-zoom', { x: md.x, y: md.y, width: Math.min(md.w, 760), height: Math.min(md.h, 520) });
    measures.A_header = await rectOf(page, '[data-source-ref-open]'); // off-screen right at this zoom: it is hovered and shot after Go to card has brought the card to the middle
    // Hover the pink passage: Go to card in the gutter.
    const spot = await page.evaluate(text => { const h = [...document.querySelectorAll('[data-file-doc-md] h3')].find(el => el.textContent.trim() === text); const r = h?.getBoundingClientRect(); return r ? { x: r.left + 30, y: r.top + r.height / 2 } : null; }, HEADING);
    if (spot) { await page.mouse.move(spot.x, spot.y); await wait(500); }
    measures.A_gutter = await marks(page);
    await shot(page, 'A3-hover-go-to-card');
    const g = await rectOf(page, '[data-view-card]');
    if (g) await shot(page, 'A3b-hover-go-to-card-zoom', { x: Math.max(0, g.x - 520), y: Math.max(0, g.y - 50), width: 700, height: 110 });
    // Click Go to card: the camera moves to the explanation card.
    const before = await rectOf(page, '[data-block-id]:not(:has([data-file-doc-md]))');
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-block-id]')].map(el => ({ id: el.getAttribute('data-block-id'), md: !!el.querySelector('[data-file-doc-md]'), r: (r => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) })));
    measures.A_cards_before_card_click = cards;
    if (g) { await page.click('[data-view-card]', { timeout: 8000 }).catch(error => log.push(`CLICK gutter failed ${error.message.slice(0, 80)}`)); await wait(1600); }
    measures.A_cards_after_card_click = await page.evaluate(() => [...document.querySelectorAll('[data-block-id]')].map(el => ({ id: el.getAttribute('data-block-id'), md: !!el.querySelector('[data-file-doc-md]'), r: (r => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) })));
    measures.A_explanation_card_after_go_to_card = await centreOf('[data-block-id]:not(:has([data-file-doc-md]))');
    await shot(page, 'A4-after-go-to-card');
    const head = await rectOf(page, '[data-source-ref]');
    if (head) { await page.hover('[data-source-ref-open]', { timeout: 8000 }).catch(() => {}); await wait(400); await shot(page, 'A2-header-go-to-highlight', { x: head.x - 40, y: head.y - 30, width: Math.min(head.w + 80, 520), height: 90 }); }
    // Click Go to highlight in the card header: the camera moves back to the file card, the passage is emphasized.
    if (measures.A_header) { await page.click('[data-source-ref-open]', { timeout: 8000 }).catch(error => log.push(`CLICK header failed ${error.message.slice(0, 80)}`)); await wait(1200); }
    measures.A_cards_after_highlight_click = await page.evaluate(() => [...document.querySelectorAll('[data-block-id]')].map(el => ({ id: el.getAttribute('data-block-id'), md: !!el.querySelector('[data-file-doc-md]'), r: (r => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) })));
    measures.A_file_card_after_go_to_highlight = await centreOf('[data-block-id]:has([data-file-doc-md])');
    measures.A_heading_after_go_to_highlight = await page.evaluate(t => { const h = [...document.querySelectorAll('[data-file-doc-md] h3')].find(el => el.textContent.trim() === t); const r = h?.getBoundingClientRect(); return r ? { y: Math.round(r.top), x: Math.round(r.left) } : null; }, HEADING);
    await shot(page, 'A5-after-go-to-highlight');
    void before; void cardSel;
    await page.context().close();
  } catch (error) { log.push(`SCENE FAILED ${String(error.stack).slice(0, 400)}`); }
  // ---- B: the Ctrl+K dim with holes for the words and the saved pink passage ----
  try {
    const page = await open('linked', { yellow: false });
    await scrollHeading(page); await wait(500);
    measures.B_selection = await selectText(page, 'Gini impurity measures the probability that a randomly chosen sample');
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press('Control+k');
    await page.waitForSelector('[data-inline-ai]', { timeout: 10000 });
    await wait(1200);
    measures.B_window = await marks(page);
    await shot(page, 'B1-dim-with-pink-holes');
    await page.context().close();
  } catch (error) { log.push(`SCENE FAILED ${marker.slice(0, 12)} ${String(error.message).slice(0, 200)}`); }
}
writeFileSync(join(OUT, 'measures.json'), JSON.stringify({ mode: MODE, base: BASE, measures, log: log.slice(-80) }, null, 1));
await browser.close();
console.log(`done ${MODE}: ${Object.keys(measures).join(', ')}`);
