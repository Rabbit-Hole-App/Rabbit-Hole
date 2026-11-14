// PV-1 evidence (release 143): a published (/b share link) canvas that opened on an empty view. Local keyless stack on 127.0.0.1:8998 only (never production, never 8878). No model call.
// Boards are DERIVED from the v60 export (board-export-canvas-bcb7f9f6-postwrite-v60.json): its explanation cards and its text item, moved/rebuilt as stated per fixture below.
// Each fixture is shared (public view link) and opened twice: as its owner (the view-only page: readOnly) and signed out (a public guest: the temporary-copy page, localCopy).
//   cards    : the export's explanation cards, all offset dx +4000 / dy +5000 (no file card). Already handled by CV-6 (regression: must open on a card before and after).
//   exch     : three chat exchanges only (question and answer), offset dx +4000 / dy +5000, no card.
//   bare     : no card or exchange: the export's text item plus two text items, a rectangle and an ellipse, laid out near world (5000, 4000).
//   barehuge : no card: one cluster near (6000, 3000), another far away near (160000, 90000).
// Usage: node shots-pv.mjs <label> <worktree-with-the-stack>
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire('C:/s/explain-134/package.json');
const { chromium } = require('@playwright/test');
const BASE = 'http://127.0.0.1:8998', phase = process.argv[2], W = process.argv[3], OUT = 'C:/s/spec/pv-143-evidence/shots';
if (!phase || !W) { console.error('usage: node shots-pv.mjs <label> <worktree>'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const secret = readFileSync(`${W}/packages/control-plane/.dev.vars`, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const sessionBody = await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pv-${run}@example.com`, secret, handle: `pv_${run}` }) })).json();
const session = sessionBody.session ?? sessionBody.token ?? sessionBody.cookie;
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json', ...(init.headers || {}) } }); let body = null; try { body = await r.json(); } catch { /* none */ } return { status: r.status, body }; };
const exported = JSON.parse(readFileSync('C:/s/spec/film-explain/bank/board-export-canvas-bcb7f9f6-postwrite-v60.json', 'utf8'));
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const text = (id, x, y, words) => ({ id, kind: 'text', x, y, w: 360, text: words, color: '#37352f', opacity: 1, level: 'body', fresh: false });
const base = () => ({ strokes: [], links: [], items: [], blocks: [], shapes: [], groups: [], areas: [], exchanges: [] });

const fixtures = {
  cards: () => ({ ...base(), blocks: exported.state.blocks.filter(b => b.type !== 'file' && !b.id.startsWith('inline-')).map(b => ({ ...JSON.parse(JSON.stringify(b)), dx: (b.dx || 0) + 4000, dy: (b.dy || 0) + 5000 })) }),
  exch: () => ({ ...base(), exchanges: [
    { id: 'pv-q1', question: 'Why does a bootstrap sample contain only about 63% of the unique rows?', answer: 'Each draw misses a given row with probability 1 - 1/n, so after n draws a row is missed with probability about 1/e.', status: 'done', dx: 4000, dy: 5000 },
    { id: 'pv-q2', question: 'What does Gini impurity of 0.5 mean?', answer: 'A binary node with half of each class: as mixed as it can be.', status: 'done', dx: 4000, dy: 5400 },
    { id: 'pv-q3', question: 'Why a weighted average of child impurities?', answer: 'Bigger children matter more to the split.', status: 'done', dx: 4000, dy: 5800 }] }),
  bare: () => ({ ...base(),
    items: [{ ...exported.state.items[0], x: 5000, y: 4000 }, text('pv-t2', 5000, 4120, 'Impurity falls fastest on the first split.'), text('pv-t3', 5420, 4300, 'Out-of-bag rows score the forest for free.')],
    shapes: [{ id: 'pv-r1', kind: 'rect', x1: 5000, y1: 4400, x2: 5300, y2: 4560, ...style, text: 'Gini' }, { id: 'pv-e1', kind: 'ellipse', x1: 5400, y1: 4420, x2: 5700, y2: 4580, ...style, text: 'Entropy' }] }),
  barehuge: () => ({ ...base(),
    items: [text('pv-h1', 6000, 3000, 'Top-left cluster: a decision tree splits on the feature that lowers impurity most.'), text('pv-h2', 6200, 3200, 'Gini and entropy rank splits alike.'), text('pv-h3', 160000, 90000, 'A far note.')],
    shapes: [{ id: 'pv-h4', kind: 'rect', x1: 6000, y1: 3400, x2: 6300, y2: 3560, ...style, text: 'Split' }] }),
};

const browser = await chromium.launch();
const measures = { phase, worktree: W, fixtures: { cards: 'v60 explanation cards (no file card), all dx +4000 / dy +5000', exch: 'three chat exchanges only, dx +4000 / dy +5000..5800', bare: 'v60 text item + 2 text items + rect + ellipse near world (5000, 4000)', barehuge: 'two text items + a rect near (6000, 3000) and one far text item near (160000, 90000)' } };
const probe = page => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const seen = [...document.querySelectorAll('[data-block-id], [data-item-id], [data-shape-id]')].map(el => { const r = el.getBoundingClientRect(); return { kind: el.dataset.blockId ? 'card' : el.dataset.itemId ? 'item' : 'shape', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  const inView = seen.filter(r => r.w > 0 && r.h > 0 && r.x < vw && r.x + r.w > 0 && r.y < vh && r.y + r.h > 0);
  return { drawn: seen.length, inView: inView.length, inViewKinds: Object.fromEntries(['card', 'item', 'shape'].map(k => [k, inView.filter(r => r.kind === k).length])), zoomText: document.body.innerText.match(/\b(\d{2,3})%/)?.[1] || null };
});
for (const [name, make] of Object.entries(fixtures)) {
  const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `pv ${name} ${phase} ${run}` }) })).body;
  const shared = await api(`/api/learn/boards/${canvas.name}/main/share`, { method: 'POST', body: JSON.stringify({ shared: true, view: true, public_view: true, state: make() }) });
  if (!shared.body?.sharing?.view) { measures[name] = { error: `share failed ${shared.status}` }; continue; }
  const link = `${BASE}/b/${shared.body.sharing.view}`;
  measures[name] = {};
  for (const who of ['owner', 'guest']) {
    const context = await browser.newContext({ viewport: { width: 1700, height: 1050 } });
    if (who === 'owner') await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
    const page = await context.newPage();
    await page.goto(link);
    try { await page.locator('[data-block-id], [data-item-id], [data-shape-id]').first().waitFor({ timeout: 60000 }); } catch { measures[name][who] = { error: 'nothing drawn' }; await context.close(); continue; }
    await page.waitForTimeout(5000);
    measures[name][who] = await probe(page);
    await page.screenshot({ path: `${OUT}/pv-${name}-${who}-${phase}.png` });
    await context.close();
  }
}
await browser.close();
writeFileSync(`${OUT}/measures-pv-${phase}.json`, JSON.stringify(measures, null, 2));
console.log(JSON.stringify(measures));
