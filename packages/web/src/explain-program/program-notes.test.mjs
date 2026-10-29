// An Explanation card's Notes (ProgramNotes.jsx): bundled with esbuild and rendered with react-dom/server, as
// answer-footer.test.mjs renders its component. Clicks and the card's growth need a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'program-notes-')), outfile = join(dir, 'notes.cjs');
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as ProgramNotes } from './ProgramNotes.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const render = props => B.renderToStaticMarkup(B.createElement(B.ProgramNotes, { id: 'c1', open: false, onToggle: () => {}, ...props }));

// The genuine sandbox-ex1-b card's own assumptions (the recorded job response), plus one with delimited math.
const recorded = JSON.parse(readFileSync(new URL('./testdata/sandbox-ex1-b-job.json', import.meta.url), 'utf8')).job.result.program.manifest.assumptions;

test('no notes and no values, no Notes row', () => {
  assert.equal(render({ notes: [] }), '');
  assert.equal(render({ notes: undefined }), '');
  assert.equal(render({ notes: [], values: [] }), '');
});

// The frame's readouts as normalizeFrame gives them (label, text with its unit), here the sandbox-ex1-b card's own definitions.
const values = time => [
  { id: 'coffee', label: 'Coffee temperature', text: `${(90 - time).toFixed(1)} °C` },
  { id: 'minutes', label: 'Time elapsed', text: `${time} min` },
];
const valueItems = html => [...html.matchAll(/<li data-program-value="([^"]+)">([\s\S]*?)<\/li>/g)].map(match => [match[1], match[2].replace(/<[^>]+>/g, '')]);

// Owner, 2026-10-28: the readouts moved from a strip under the drawing into Notes, under "Values".
test('values only: Notes still shows, collapsed, with a Values section and no assumptions', () => {
  const html = render({ notes: [], values: values(0) });
  assert.match(html, /data-program-notes-toggle[^>]*aria-expanded="false"/);
  assert.match(html, /<ul id="c1-notes" hidden=""/);
  assert.match(html, />Values<\/p>/);
  assert.doesNotMatch(html, /data-program-assumptions|Assumptions/);
  assert.deepEqual(valueItems(html), [['coffee', 'Coffee temperature: 90.0 °C'], ['minutes', 'Time elapsed: 0 min']]);
});

test('values follow the view they are given: each render shows its own numbers', () => {
  assert.deepEqual(valueItems(render({ values: values(12), open: true })).map(item => item[1]), ['Coffee temperature: 78.0 °C', 'Time elapsed: 12 min']);
});

test('values and assumptions: Values first, then the assumptions under their own heading', () => {
  const html = render({ notes: recorded, values: values(0), open: true });
  assert.ok(html.indexOf('>Values</p>') < html.indexOf('>Assumptions</p>'));
  assert.equal(valueItems(html).length, 2);
  assert.equal([...html.matchAll(/<li>/g)].length, recorded.length);
  assert.match(html, /<ul id="c1-notes"[^>]* class="[^"]*text-sm[^"]*"/, '14 px text, as the notes');
});

test('assumptions only: no section headings, the notes as before', () => {
  assert.doesNotMatch(render({ notes: recorded, open: true }), /Values|Assumptions<\/p>/);
});

test('ProgramScene draws no readout strip under the frame and hands the readouts to Notes', () => {
  const scene = readFileSync(new URL('./ProgramScene.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(scene, /data-program-readouts/);
  assert.match(scene, /<ProgramNotes [^>]*values=\{view\.readouts\}/);
});

test('collapsed by default: a real button with aria-expanded false, controlling a hidden list', () => {
  const html = render({ notes: recorded });
  const button = html.match(/<button ([^>]*)>([\s\S]*?)<\/button>/);
  assert.ok(button, 'a button');
  assert.match(button[1], /type="button"/);
  assert.match(button[1], /aria-expanded="false"/);
  assert.match(button[1], /aria-controls="c1-notes"/);
  assert.match(button[1], /min-h-10/, 'a 40 px touch target');
  assert.match(button[1], /focus-visible:ring/);
  assert.match(button[2].replace(/<[^>]+>/g, ''), /^Notes$/);
  assert.match(html, /<ul id="c1-notes" hidden=""/);
});

test('open: one list item per note, never concatenated, in 14 px secondary text', () => {
  const html = render({ notes: recorded, open: true });
  assert.match(html, /aria-expanded="true"/);
  assert.doesNotMatch(html, /<ul[^>]* hidden/);
  const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match => match[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  assert.equal(items.length, recorded.length);
  recorded.forEach((note, index) => assert.ok(items[index].includes(note.slice(0, 40)), `note ${index} is its own item`));
  assert.match(html, /<ul[^>]*class="[^"]*text-sm[^"]*leading-relaxed[^"]*text-ink-2/);
  assert.match(html, /<ul[^>]*class="[^"]*max-h-60[^"]*overflow-y-auto/, 'very long notes scroll inside a bounded region');
});

test('math in a note is typeset by the shared renderer (KaTeX, trust off); a plain-text note stays literal', () => {
  const html = render({ notes: ['Newton: $T(t)=T_a+(T_0-T_a)e^{-kt}$', 'T_a = room temperature'], open: true });
  assert.match(html, /class="katex"/, 'the delimited formula is typeset');
  assert.match(html, /T_a = room temperature/, 'no special-casing of an undelimited note');
  assert.doesNotMatch(render({ notes: ['<img src=x onerror=alert(1)>'], open: true }), /<img/, 'text, never HTML');
});
