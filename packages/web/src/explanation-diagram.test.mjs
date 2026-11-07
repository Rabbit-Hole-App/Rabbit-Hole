// The written Explanation draws a new diagram as a TutorDiagram (an rh-diagram fence in the body or a More section) and keeps the legacy
// Mermaid reader for saved content. Static markup only, no browser: Md is bundled with esbuild as the other card tests do.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { renderTutorDiagram } from './tutor-diagrams/TutorDiagram.js';
import { diagramsAsText } from './diagram-fence.js';

const dir = mkdtempSync(join(tmpdir(), 'explanation-diagram-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, 'md.cjs');
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
const draw = text => B.renderToStaticMarkup(B.createElement(B.Md, { text, fences: true }));

const SPEC = { version: 1, diagram: { kind: 'flow', title: 'Does it stick?', nodes: [{ id: 'a', label: 'Warm the cup', role: 'process' }, { id: 'b', label: 'Cooler than the room?', role: 'decision' }, { id: 'c', label: 'Heat flows in', role: 'outcome' }, { id: 'd', label: 'Heat flows out', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'Yes' }, { from: 'b', to: 'd', label: 'No' }] } };
const fence = (spec = SPEC, info = 'rh-diagram') => '```' + info + '\n' + (typeof spec === 'string' ? spec : JSON.stringify(spec)) + '\n```';
const EXAMPLES = Object.values(JSON.parse(readFileSync(new URL('./tutor-diagrams/examples.json', import.meta.url), 'utf8')));

test('an rh-diagram fence in the body and in a More section is drawn as a TutorDiagram, not as code', () => {
  for (const text of [`Heat moves.\n\n${fence()}\n\nThat is all.`, fence(SPEC, 'RH-Diagram extra')]) {
    const html = draw(text);
    assert.match(html, /data-tutor-diagram="flow"/);
    assert.match(html, /Cooler than the room\?/);
    assert.doesNotMatch(html, /data-code-block/, 'the spec is not shown as source');
  }
  // ExplanationBody gives the body and every More section to the same Md with fences on (the section is a collapsed region, not a different reader).
  const body = readFileSync(new URL('./LearningBlocks.jsx', import.meta.url), 'utf8');
  assert.ok(body.includes('<Md text={block.body} onFile={onFile} fences />') && body.includes('<Md text={section.text} onFile={onFile} fences />'), 'body and sections');
});

test('card widths: the diagram fits 688 px exactly and stays within a scroll region at 320 px, with a viewBox that matches its size', () => {
  for (const sample of EXAMPLES) {
    const spec = sample.spec ?? sample;
    for (const [asked, most] of [[688, 688], [320, 400]]) {
      const { width, height, element } = renderTutorDiagram(spec, asked);
      assert.ok(width <= most && width >= 320, `${spec.diagram.kind} at ${asked}: ${width}`);
      assert.equal(element.props.viewBox, `0 0 ${width} ${height}`, spec.diagram.kind);
    }
  }
});

test('save and reload: the block round-trips through the board JSON and draws the same', () => {
  const block = { type: 'explanation', title: 'Why it cools', body: `Heat moves.\n\n${fence()}`, more: [{ label: 'Worked example', text: fence(EXAMPLES[1].spec ?? EXAMPLES[1]) }] };
  const saved = JSON.parse(JSON.stringify([block]))[0];
  assert.deepEqual(saved, block);
  assert.equal(draw(saved.body), draw(block.body));
  assert.equal(draw(saved.more[0].text), draw(block.more[0].text));
  assert.match(draw(saved.more[0].text), /data-tutor-diagram="comparison"/);
});

test('an invalid or unreadable spec keeps its text readable as code instead of a broken picture', () => {
  const html = draw(fence('{"version":1,"diagram":{"kind":"flow"}}'));
  assert.doesNotMatch(html, /data-tutor-diagram/);
  assert.match(html, /data-code-block/);
  assert.match(html, /rh-diagram/);
});

test('a saved Mermaid card (written before this change) still draws through the legacy reader, unchanged', () => {
  const html = draw('Old card.\n\n```mermaid\nflowchart TD\n  A["Go"] --> B["Stop"]\n```');
  assert.match(html, /data-md-diagram/, 'the legacy diagram wrapper');
  assert.doesNotMatch(html, /data-tutor-diagram/);
  // A chat answer keeps both as code (fences off): neither reader runs.
  const plain = B.renderToStaticMarkup(B.createElement(B.Md, { text: fence() + '\n\n```mermaid\nflowchart TD\n  A["x"] --> B["y"]\n```' }));
  assert.doesNotMatch(plain, /data-tutor-diagram|data-md-diagram/);
});

test('the Tutor reads a diagram as the library\'s plain description, never the JSON; text that does not parse is left as written', () => {
  const text = diagramsAsText(`Intro\n\n${fence()}\n\nEnd`);
  assert.match(text, /Does it stick\?/);
  assert.match(text, /Cooler than the room\? — Yes → Heat flows in/);
  assert.doesNotMatch(text, /"nodes"|rh-diagram/);
  const broken = fence('not json');
  assert.equal(diagramsAsText(broken), broken);
});

// S7-EXPAND: every one of the 19 library examples survives save-and-reload and is drawn by the real card (LearningBlockBody -> ExplanationBody -> Md).
const card = block => B.renderToStaticMarkup(B.createElement(B.LearningBlockBody, { block, onChange() {}, onChangeQuiet() {}, onFile() {}, appName: 'x', selected: true }));
const specOf = sample => sample.spec ?? sample;

test('19 examples: each draws from a saved block after a JSON round trip, in the card body and in a More section, with no code fallback', () => {
  assert.equal(EXAMPLES.length, 19);
  for (const [i, sample] of EXAMPLES.entries()) {
    const spec = specOf(sample), kind = spec.diagram.kind, name = `${i + 1}. ${kind}`;
    const block = { type: 'explanation', title: 'T', body: `Intro.\n\n${fence(spec)}\n\nEnd.`, more: [{ label: 'L', text: fence(spec) }] };
    const saved = JSON.parse(JSON.stringify([block]))[0];
    assert.deepEqual(saved, block, name);
    for (const [where, html] of [['card body', card(saved)], ['More section', draw(saved.more[0].text)]]) {
      assert.match(html, new RegExp(`data-tutor-diagram="${kind}"`), `${name} in the ${where}`);
      assert.doesNotMatch(html, /data-code-block/, `${name} in the ${where}: no fallback code block`);
      const [, drawn, high] = html.match(/<svg[^>]* width="([\d.]+)" height="([\d.]+)" viewBox="0 0 \1 \2"/) ?? [];
      assert.ok(drawn, `${name} in the ${where}: the viewBox matches the drawn width and height`);
      assert.match(html, /overflow-x:auto/, `${name}: inside the scroll region`);
    }
    assert.equal(card(saved).includes('Intro.') && card(saved).includes('End.'), true, `${name}: the prose around it stays`);
  }
});

test('19 examples at the card widths: the svg is as wide as its viewBox at 688 and fits a 400 px scroll window at 320', () => {
  for (const [i, sample] of EXAMPLES.entries()) {
    const spec = specOf(sample), name = `${i + 1}. ${spec.diagram.kind}`;
    for (const [asked, most] of [[688, 688], [320, 400]]) {
      const { width, height, element } = renderTutorDiagram(spec, asked);
      assert.equal(element.props.viewBox, `0 0 ${width} ${height}`, `${name} at ${asked}`);
      assert.equal(element.props.width, width, `${name} at ${asked}`);
      assert.ok(width >= 320 && width <= most, `${name} at ${asked}: ${width}`);
      assert.equal(element.props['data-tutor-diagram'], spec.diagram.kind);
    }
  }
});

test('a card with no diagram (or one the server dropped) draws prose only: no empty diagram box', () => {
  const html = card({ type: 'explanation', title: 'T', body: 'Prose only, the diagram was dropped.', more: [{ label: 'L', text: 'p' }] });
  assert.match(html, /Prose only/);
  assert.doesNotMatch(html, /data-tutor-diagram|overflow-x:auto|data-code-block|data-md-diagram/);
});

test('a saved legacy Mermaid card still draws through the legacy reader after a JSON reload', () => {
  const block = { type: 'explanation', title: 'Old', body: 'Old card.\n\n```mermaid\nflowchart TD\n  A["Go"] --> B["Stop"]\n```' };
  const html = card(JSON.parse(JSON.stringify(block)));
  assert.match(html, /data-md-diagram/);
  assert.doesNotMatch(html, /data-tutor-diagram/);
});
