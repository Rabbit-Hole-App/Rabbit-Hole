// EXP-13 card layout v2 (docs/features/explain.md section 2, owner 2026-11-08): a new written Explanation is title, then prose, visual, prose [, visual, prose] in one
// reading flow. A visual is an rh-diagram fence (TutorDiagram) or an rh-illustration fence drawn from block.figures[id]. Static markup after an esbuild bundle (the other
// card tests' pattern); the anchoring check parses that markup with linkedom. What the browser shows (pixels, the picture loading) is the owner's check.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { parseIllustrationFence } from './explanation-lead.js';
import { alignField, decorate, fieldText } from './explanation-interactions.js';
import { explanationFieldText } from '../../control-plane/src/learn-primitives.js';

const dir = mkdtempSync(join(tmpdir(), 'explanation-layout-v2-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, 'card.cjs');
await esbuild.build({
  stdin: { contents: "export { Md } from './Md.jsx'; export { LearningBlockBody } from './LearningBlocks.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
    build.onResolve({ filter: /^(mermaid|shiki|mathlive)$/ }, args => ({ path: args.path, namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default { initialize() {}, async render() { return { svg: "<svg data-stub-diagram></svg>" }; } }; export class MathfieldElement {} export async function codeToHtml() { throw new Error("no shiki"); }' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);

const V2 = JSON.parse(readFileSync(new URL('./__fixtures__/explanation-v2-cooling.json', import.meta.url), 'utf8')).block;
const OLD = JSON.parse(readFileSync(new URL('./slash-examples/explanation-cooling.json', import.meta.url), 'utf8')).block;
const card = block => B.renderToStaticMarkup(B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'x', selected: true }));
const PROMPT = 'A steaming mug of coffee on a wooden table';
const withFigure = entry => ({ ...V2, figures: entry === undefined ? undefined : { steam: entry } });
const noFenceText = html => {
  assert.doesNotMatch(html, /rh-illustration|&quot;version&quot;|"version"|&quot;prompt&quot;/, 'the fence JSON is never text');
  assert.ok(!html.includes(PROMPT), 'the prompt is never shown');
};

test('an rh-illustration fence parses to its id, alt and caption, never its prompt; anything else is not a fence', () => {
  assert.deepEqual(parseIllustrationFence('{"version":1,"id":"steam","prompt":"secret words","alt":"A mug","caption":"Steam."}'), { id: 'steam', alt: 'A mug', caption: 'Steam.' });
  assert.deepEqual(parseIllustrationFence('{"version":1,"id":"a"}'), { id: 'a', alt: '', caption: '' });
  for (const bad of ['', 'not json', '{"version":2,"id":"a"}', '{"version":1}', '{"version":1,"id":"  "}', '{"version":1,"id":7}', 'null', '[]']) assert.equal(parseIllustrationFence(bad), null, bad);
});

test('a v2 card reads title, prose, diagram, prose, picture, prose in one flow, with no dropdown row', () => {
  const html = card(V2), at = text => html.indexOf(text);
  const order = [at('Why coffee cools fastest at the start'), at('temperature gap'), at('data-tutor-diagram'), at('Just after you pour'), at('data-figure-id="steam"'), at('Steam carries heat away fastest'), at('As it cools the gap shrinks')];
  assert.ok(order.every(n => n >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'every part sits where the author put it');
  assert.equal((html.match(/data-explanation-flow/g) || []).length, 1, 'one reading flow');
  assert.doesNotMatch(html, /data-explain-more|data-explanation-section/, 'no `more`, no dropdown row');
  noFenceText(html);
});

test('three visuals (owner 2026-11-08): diagram, diagram and the picture pic-3 each draw in place, in one flow', () => {
  const diagram = V2.body.match(/```rh-diagram[\s\S]*?```/)[0], picture = V2.body.match(/```rh-illustration[\s\S]*?```/)[0].replace(/"id":\s*"steam"/, '"id": "pic-3"');
  const html = card({ ...V2, body: `First part.\n\n${diagram}\n\nSecond part.\n\n${diagram}\n\nThird part.\n\n${picture}\n\nLast part.`, figures: { 'pic-3': V2.figures.steam } }), at = text => html.indexOf(text);
  assert.equal((html.match(/data-tutor-diagram/g) || []).length, 2);
  const order = [at('First part'), at('Second part'), at('Third part'), at('data-figure-id="pic-3"'), at('Last part')];
  assert.ok(order.every(n => n >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  noFenceText(html);
});

test('figure states: ready draws the figure and its caption; a fence with no ready entry (should not reach the client) draws nothing and the prose flows on', () => {
  const ready = card(V2);
  assert.match(ready, /data-figure-id="steam"><figure data-illustration="true"/);
  assert.match(ready, /<img src="\/lesson-assets\/slash-image-lighthouse-9bffc47d.png" alt="A steaming mug of coffee beside a thermometer"/);
  assert.match(ready, /data-illustration-caption[^>]*>Steam carries heat away fastest while the coffee is hottest\.</);
  noFenceText(ready);

  // Owner 2026-11-08: a learner never sees a failed picture, so no note and no placeholder: odd saved data renders as if the fence were not there.
  const gone = card({ ...V2, body: V2.body.replace(/```rh-illustration[\s\S]*?```\n\n/, '') });
  for (const entry of [undefined, { status: 'failed', problem: 'no answer' }, { status: 'pending' }, { src: '/x.png' }]) {
    const html = card(withFigure(entry));
    assert.doesNotMatch(html, /data-figure-id|data-illustration|<img|unavailable/i, JSON.stringify(entry));
    assert.match(html, /Just after you pour[\s\S]*As it cools the gap shrinks/, 'the prose keeps flowing');
    assert.equal(html, gone, 'exactly as if the fence were not there');
    noFenceText(html);
  }
  assert.doesNotMatch(card({ ...V2, body: 'A.\n\n```rh-illustration\n{"version":1,"id":"toString"}\n```' }), /data-figure-id/, 'only the card\'s own entries, never an inherited name');

  for (const body of ['Before.\n\n```rh-illustration\n{"prompt":"secret words"\n```\n\nAfter.', 'Before.\n\n```rh-illustration\n{"prompt":"secret words"']) {
    const html = card({ ...V2, body });
    assert.doesNotMatch(html, /secret words|data-figure-id/, 'a fence that does not parse, or is unclosed, draws nothing and never its JSON');
    assert.match(html, /Before\./);
  }
});

test('outside a written Explanation an rh-illustration fence is code as before; a saved card with `more` keeps its rows', () => {
  assert.match(B.renderToStaticMarkup(B.createElement(B.Md, { text: '```rh-illustration\n{"version":1,"id":"a"}\n```', fences: true })), /data-code-block/);
  const saved = card({ ...OLD, more: [{ label: 'A worked example', text: 'Start at 90 °C.' }] });
  assert.equal((saved.match(/data-explain-more/g) || []).length, 1);
  assert.match(saved, /A worked example/);
});

test('a saved card without the new fence renders exactly as before: figures change nothing, its single illustration still follows the opening paragraph', () => {
  assert.equal(card({ ...OLD, figures: { steam: V2.figures.steam } }), card(OLD));
  assert.doesNotMatch(card(OLD), /data-figure-id|data-illustration-note|data-illustration=/);
  const illustrated = card({ ...OLD, illustration: { cacheKey: 'illus:cup', alt: 'A cup', caption: 'A cup of coffee.' } });
  assert.ok(illustrated.indexOf('temperature gap') < illustrated.indexOf('data-illustration-frame') && illustrated.indexOf('data-illustration-frame') < illustrated.indexOf('<table'));
});

// E2 on a v2 card. Term anchors are in prose only: the figure is skipped by the DOM walk (data-explanation-skip) and the diagram is an island, so the rendered body
// aligns with the body's prose-only canonical text, and a term after the picture still decorates.
const PROSE_ONLY = md => explanationFieldText(md.replace(/^[ \t]*```[ \t]*rh-illustration[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gim, ''));
const bodyRoot = block => parseHTML(`<!doctype html><html><body>${card({ ...block, interactions: { version: 1, displayTextVersion: 1, contentRevision: 'r1-x', questions: [], terms: [] } })}</body></html>`).document;
test('interactions anchor on a v2 card: the body aligns past the diagram and the picture, and a term after the picture is wrapped', () => {
  const document = bodyRoot(V2), root = document.querySelector('[data-explanation-field="body"]');
  assert.ok(root, 'the body is an interactive field');
  assert.ok(root.querySelector('[data-explanation-skip] [data-figure-id], [data-explanation-skip][data-figure-id]'), 'the figure is skipped by the field walk');
  const canonical = PROSE_ONLY(V2.body), aligned = alignField(root, canonical);
  assert.ok(aligned, 'the rendered body aligns with the prose-only text');
  const cps = Array.from(canonical), start = label => Array.from(canonical.slice(0, canonical.indexOf(label))).length;
  const marks = ['temperature gap', 'cooling curve'].map((label, i) => ({ start: start(label), end: start(label) + Array.from(label).length, kind: 'term', id: `t${i}` }));
  assert.ok(marks.every(m => cps.slice(m.start, m.end).join('').length > 0));
  decorate(aligned, marks, document);
  assert.deepEqual([...root.querySelectorAll('[data-term-id]')].map(n => n.textContent), ['temperature gap', 'cooling curve']);
  assert.ok(alignField(bodyRoot(withFigure(undefined)).querySelector('[data-explanation-field="body"]'), canonical), 'and with a fence that draws nothing');
});

// Live /explain run 2026-11-08 (regen-out-explain-1): a body with $...$ maths drew no pills, because the KaTeX glyphs never matched the LaTeX in the canonical text.
// Maths is an island matched by its source, so the prose around it aligns: a term before, between and after the maths (and in a table with maths) is wrapped.
test('interactions anchor in a field that holds typeset maths', () => {
  const body = 'A fluid\'s boiling point depends on pressure, so the refrigerant can be colder than food. Heat always flows hot $\\to$ cold, and $Q_{out}=Q_{in}+W$ holds.\n\n| Feature | Evaporator |\n|---|---|\n| Phase | Liquid $\\to$ vapour |\n\nA display line \\(x^2\\) and\n\n$$Q_{in} + W$$\n\nthe compressor closes it.';
  const block = { type: 'explanation', title: 'Fridge', body }, document = bodyRoot(block), root = document.querySelector('[data-explanation-field="body"]');
  assert.ok(root.querySelectorAll('.katex').length >= 4, 'KaTeX typeset the maths');
  const canonical = fieldText(block, 'body'), aligned = alignField(root, canonical);
  assert.ok(aligned, 'the field aligns past every maths run');
  const start = label => Array.from(canonical.slice(0, canonical.indexOf(label))).length;
  const marks = ['refrigerant', 'cold', 'holds', 'vapour', 'compressor'].map((label, i) => ({ start: start(label), end: start(label) + Array.from(label).length, kind: 'term', id: `t${i}` }));
  decorate(aligned, marks, document);
  assert.deepEqual([...root.querySelectorAll('[data-term-id]')].map(n => n.textContent), ['refrigerant', 'cold', 'holds', 'vapour', 'compressor']);
  assert.equal(root.querySelector('.katex [data-term-id]'), null, 'nothing is wrapped inside the maths');
  assert.equal(alignField(root, canonical.replace('Q_{out}', 'Q_{oops}')), null, 'a maths run that does not match its source still refuses the field');
});

// Needs the control-plane mapping (learn-primitives.js markdownText, owned by the server lane): an rh-illustration fence adds nothing to a field's display text.
// Until then the card's own fieldText still carries the fence JSON, so on a live v2 card the body does not align and its pills are not drawn.
test('the canonical field text of a v2 body is its prose only', { todo: 'control-plane explanationFieldText must drop rh-illustration fences (server lane)' }, () => {
  assert.equal(fieldText(V2, 'body'), PROSE_ONLY(V2.body));
  assert.ok(alignField(bodyRoot(V2).querySelector('[data-explanation-field="body"]'), fieldText(V2, 'body')));
});
