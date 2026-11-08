// The delivered Tutor Explanation (CORE.09, BE.06a "Node renderer checks"; files 04 and 06): LearningBlockBody's ExplanationBody rendered with react-dom
// into linkedom after an esbuild bundle (as card-prompt-reveal.test.mjs does). The file 06 Markdown fixtures `fixture-deep-body` (Mermaid) and
// `fixture-deep-more` (a pipe table) are read from the HTML reference and checked in both regions, swapped. Mermaid and Shiki are stubbed: the
// stub's render can be made to fail, which must leave the prose and the escaped diagram source. Real SVG, scrolling, size and focus are the
// owner's deployed-main check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';

const { window, document } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
Object.assign(globalThis, { window, document, HTMLElement: window.HTMLElement, Node: window.Node, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const heights = [];
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
// The header's status read is the only request: the source ref resolves as current.
const requests = [];
globalThis.fetch = async (url, init = {}) => { requests.push(String(url)); const ids = JSON.parse(init.body || '{}').ids || [];
  return new Response(JSON.stringify({ refs: ids.map(id => ({ id, status: 'current' })) }), { status: 200, headers: { 'content-type': 'application/json' } }); };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'node', clipboard: { writeText: async () => {} } } });
globalThis.MERMAID_STUB = { fail: false, rendered: [] };

const dir = mkdtempSync(join(tmpdir(), 'explanation-card-')), outfile = join(dir, 'explanation.cjs');
await esbuild.build({
  stdin: { contents: "export { LearningBlockBody, headerSource } from './LearningBlocks.jsx'; export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /^(mermaid|shiki)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /^mermaid$/, namespace: 'stub' }, () => ({ contents: 'export default { initialize() {}, async render(id, code) { const s = globalThis.MERMAID_STUB; if (s.fail) throw new Error("Parse error on line 2\\nmore"); s.rendered.push(code); return { svg: "<svg data-stub-diagram></svg>" }; } };' }));
    build.onLoad({ filter: /^shiki$/, namespace: 'stub' }, () => ({ contents: 'export async function codeToHtml() { throw new Error("no shiki in node"); }' }));
  } }],
});
globalThis.MessageChannel = class { constructor() { const port1 = { onmessage: null }; this.port1 = port1; this.port2 = { postMessage: data => setImmediate(() => port1.onmessage?.({ data })) }; } };
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// The two embedded fixtures, exactly as file 06 carries them.
const html = readFileSync(new URL('../../../docs/features/explain-on-canvas/handoff/ui/06-explanation-depth.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const fixture = id => html.match(new RegExp(`<script type="text/markdown" id="${id}">\\n([\\s\\S]*?)</script>`))[1];
const DEEP_BODY = fixture('fixture-deep-body'), DEEP_MORE = fixture('fixture-deep-more');
const REV = 'b'.repeat(64);
const sourceRef = { v: 1, id: `sref_${'2'.repeat(24)}`, kind: 'markdown', source: { key: `file:fs_${'3'.repeat(24)}`, rev: REV, name: 'en.md', home: null }, anchor: { quote: { exact: 'Each internal node tests one feature', prefix: '', suffix: '' } } };
const card = (over = {}) => ({ id: 'card-1', type: 'explanation', dx: 0, dy: 0, stepId: 'st_1', title: 'Why trees, and what a tree actually does', body: DEEP_BODY, more: [{ label: 'Compare two splits', text: DEEP_MORE }], sourceRef, ...over });

const settle = () => B.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
let root = null;
async function mount(block, props = {}) {
  if (root) await B.act(async () => root.unmount());
  document.getElementById('app').replaceChildren();
  root = B.createRoot(document.getElementById('app'));
  await B.act(async () => root.render(B.createElement(B.LearningBlockBody, { block, onChange() {}, onFile() {}, appName: 'demo', selected: true, onExpandHeight: h => heights.push(h), ...props })));
  await settle();
}
test.after(async () => { if (root) await B.act(async () => root.unmount()); });
const $ = selector => document.querySelector(selector);
const click = target => B.act(async () => { target.dispatchEvent(new window.Event('click', { bubbles: true })); });
// Document order: a before b.
const before = (a, b) => !!(a.compareDocumentPosition(b) & 4);

test('the pinned header stands above ONE reading flow that holds the body and the section toggles; the header holds Explanation, the accepted title and Source: en.md with View passage', async () => {
  await mount(card());
  const head = $('[data-explanation-head]'), scroll = $('[data-explanation] > [data-scroll]');
  assert.ok(head && scroll, 'the two regions exist');
  assert.ok(before(head, scroll), 'header, then the reading flow');
  assert.match(head.className, /shrink-0/, 'the header never shrinks');
  assert.match(scroll.className, /min-h-0 flex-1 overflow-y-auto/, 'the reading flow is the one flexible scroller');
  assert.ok(!head.contains(scroll), 'the header is outside the scroller');
  assert.equal($('[data-explanation-rail]'), null, 'no separate rail: the sections are part of the reading flow');
  assert.ok(scroll.contains($('[data-explain-more]')), 'the toggles scroll with the body');
  assert.match(head.textContent, /Explanation/);
  assert.equal(head.querySelector('h3').textContent, 'Why trees, and what a tree actually does');
  assert.match(head.querySelector('h3').className, /text-xl/, 'the larger heading');
  const row = head.querySelector('[data-source-ref]');
  assert.match(row.textContent, /Source: en\.md/);
  assert.equal(row.getAttribute('data-source-ref-status'), 'current', 'the server status was read');
  const view = row.querySelector('button[data-view-section]');
  assert.equal(view.getAttribute('aria-label'), 'View passage', 'the approved card 07 label (GAP-04)');
  assert.equal(view.getAttribute('title'), 'View passage');
  assert.match(view.innerHTML, /lucide-scan-text/, 'the ScanText glyph the Markdown View card button shares');
  assert.ok(requests.every(url => url.endsWith('/api/learn/source-refs/resolve')), 'only the status read');
  assert.equal(B.headerSource(card()), true, 'the canvas skips its footer source row for this card (counted once)');
});

test('fixture-deep-body in the body: Mermaid is selected inside the scroller; fixture-deep-more opens in place as a real table inside the reading flow and the card grows down', async () => {
  globalThis.MERMAID_STUB.rendered.length = 0;
  heights.length = 0;
  await mount(card());
  const scroll = $('[data-explanation] > [data-scroll]');
  const diagram = scroll.querySelector('[data-md-diagram] [data-mermaid]');
  assert.ok(diagram, 'the mermaid fence is the diagram, not a code block');
  assert.match(diagram.innerHTML, /data-stub-diagram/);
  assert.match(globalThis.MERMAID_STUB.rendered[0], /^flowchart TD\n {2}A\["Age under 30\?"\]/, 'the fence source reaches the renderer unchanged');
  assert.match(scroll.textContent, /One leaf, one region/);
  const toggle = $('[data-explain-more]');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  const controls = toggle.getAttribute('aria-controls');
  assert.equal(document.getElementById(controls), null, 'closed: nothing mounted');
  scroll.scrollTop = 40;
  await click(toggle);
  await settle();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  const section = document.getElementById(controls);
  assert.ok(section, 'aria-controls names the opened section');
  assert.ok(before(toggle, section) && section.parentElement.contains(toggle), 'right under its own toggle');
  assert.ok(scroll.contains(section), 'inside the one reading flow');
  assert.equal($('[data-explanation] > [data-scroll]'), scroll, 'the same scroller element: never remounted');
  assert.equal(scroll.scrollTop, 40, 'its scroll position is kept');
  const table = section.querySelector('table');
  assert.deepEqual([...table.querySelectorAll('th')].map(th => th.textContent), ['Split', 'Group 1', 'Group 2', 'Gini after']);
  assert.deepEqual([...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent)), [['A', '3 / 1', '1 / 3', '0.375'], ['B', '2 / 2', '2 / 2', '0.5']]);
  assert.ok(heights.length > 0, 'the opened height is still reported so the frame grows with it');
  await click(toggle);
  await settle();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(document.getElementById(controls), null, 'closed again');
  assert.equal(heights.at(-1), 0, 'and the growth is released');
});

test('swapped: the table in the body and the Mermaid flowchart in the expanded section', async () => {
  globalThis.MERMAID_STUB.rendered.length = 0;
  await mount(card({ body: DEEP_MORE, more: [{ label: 'See the tree', text: DEEP_BODY }] }));
  const scroll = $('[data-explanation] > [data-scroll]');
  assert.ok(scroll.querySelector('table th'), 'the table renders in the scroller');
  assert.ok(scroll.querySelector('[data-explain-table] > table'), 'inside its horizontal scroller (the TutorDiagram frame)');
  assert.equal(scroll.querySelector('[data-md-diagram]'), null);
  await click($('[data-explain-more]'));
  await settle();
  const expansion = scroll.querySelector('section[aria-label]');
  assert.ok(expansion.querySelector('[data-md-diagram] [data-mermaid]'), 'the section draws its diagram');
  assert.equal(globalThis.MERMAID_STUB.rendered.length, 1);
});

test('a renderer failure keeps the prose and shows the escaped diagram source, never markup from it', async () => {
  globalThis.MERMAID_STUB.fail = true;
  try {
    const body = 'Read the tree first.\n\n```mermaid\nflowchart TD\n  A["<b>Age</b> under 30?"]\n  A --> B["Approve"]\n```\n\nThen the leaves.';
    await mount(card({ body, more: [] }));
    const scroll = $('[data-explanation] > [data-scroll]');
    assert.match(scroll.textContent, /Read the tree first\./);
    assert.match(scroll.textContent, /Then the leaves\./);
    const fallback = scroll.querySelector('[data-mermaid-fallback]');
    assert.ok(fallback, 'the fallback view');
    assert.match(fallback.querySelector('[role="status"]').textContent, /^Parse error on line 2$/);
    assert.match(fallback.querySelector('pre').textContent, /A\["<b>Age<\/b> under 30\?"\]/, 'the source, as text');
    assert.equal(fallback.querySelector('b'), null, 'escaped: no element made from it');
  } finally { globalThis.MERMAID_STUB.fail = false; }
});

test('a direct-question card has no source row; a legacy card has no toggles; a topic anchor keeps no kicker', async () => {
  await mount(card({ sourceRef: undefined, stepId: undefined }));
  assert.equal($('[data-source-ref]'), null, 'no ref: no row');
  assert.ok($('[data-explanation-head] h3') && $('[data-explanation] > [data-scroll]'));
  assert.equal(B.headerSource(card({ sourceRef: undefined })), false);
  await mount({ id: 'old', type: 'explanation', dx: 0, dy: 0, title: 'An id is an index', body: 'Token ids are positions.' });
  assert.equal($('[data-explain-more]'), null, 'no sections: no toggles');
  assert.match($('[data-explanation] > [data-scroll]').textContent, /Token ids are positions\./);
  await mount({ id: 'topic', type: 'explanation', dx: 0, dy: 0, title: 'Attention', anchor: { source: 'dive' }, body: '' });
  assert.doesNotMatch($('[data-explanation-head]').textContent, /Explanation/, 'a topic anchor is not an explanation yet');
  assert.ok($('[data-explanation-head][data-focus-hide]'), 'Focus still hides the header');
  assert.equal(B.headerSource({ type: 'explanation', anchor: { source: 'dive' }, sourceRef }), false);
});
