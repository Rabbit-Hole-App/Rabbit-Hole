// Card feedback, rendered (checklist R1.03 and R1.04): CardFeedback.jsx is bundled with esbuild and rendered with react-dom/server, as
// answer-footer.test.mjs renders AnswerFooter. This pins the semantics and the classes that decide when the pair is seen; whether it
// is actually visible on hover, on keyboard focus and after the pointer leaves is measured in the browser check (card-feedback-command-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'card-feedback-render-')), outfile = join(dir, 'feedback.cjs');
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { CardFeedback, CardFeedbackScope, CardFeedbackSummary } from './CardFeedback.jsx'; export { feedbackStoreFor, isFeedbackCard } from './card-feedback.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const GENERATED = { id: 'g1', type: 'explanation', title: 'Balance sheets', body: 'Assets equal liabilities plus equity.' };
let canvases = 0;
// A canvas whose server already holds `rows`; the store is the one the cards and Progress share for that app and board.
async function scope(rows = []) {
  const s = { app: `canvas-${String(++canvases).padStart(8, '0')}`, board: 'main' };
  await B.feedbackStoreFor(s, { read: async () => rows, write: async () => ({ revision: 1 }) }).refresh();
  return s;
}
const draw = (block, s) => B.renderToStaticMarkup(B.createElement(B.CardFeedbackScope.Provider, { value: s }, B.createElement(B.CardFeedback, { block })));
const buttons = html => [...html.matchAll(/<button ([^>]*)>/g)].map(([, attrs]) => ({ thumb: attrs.match(/data-card-thumb="(\w+)"/)?.[1], label: attrs.match(/aria-label="([^"]+)"/)?.[1], title: attrs.match(/title="([^"]+)"/)?.[1], pressed: attrs.match(/aria-pressed="(\w+)"/)?.[1], type: attrs.match(/type="(\w+)"/)?.[1] }));

test('one pair under a generated card: a labelled group of two real buttons, Understood and Still unclear', async () => {
  const html = draw(GENERATED, await scope());
  assert.equal((html.match(/data-card-thumbs/g) || []).length, 1, 'exactly one pair');
  assert.match(html, /role="group" aria-label="Rate this card"/);
  assert.deepEqual(buttons(html), [
    { thumb: 'up', label: 'Understood', title: 'Understood', pressed: 'false', type: 'button' },
    { thumb: 'down', label: 'Still unclear', title: 'Still unclear', pressed: 'false', type: 'button' },
  ]);
  assert.match(html, /data-thumbnail-hide/, 'a card thumbnail does not capture it');
});

test('focus-visible buttons have pressed labels: the chosen thumb is aria-pressed, blue by class, and filled; the other is not', async () => {
  for (const [value, pressed] of [['up', ['true', 'false']], ['down', ['false', 'true']]]) {
    const html = draw(GENERATED, await scope([{ cardId: 'g1', value, revision: 1, title: 'Balance sheets' }]));
    assert.deepEqual(buttons(html).map(b => b.pressed), pressed, value);
    assert.match(html, /aria-pressed:text-accent/, 'the application blue for either direction');
    assert.doesNotMatch(html, /text-(pass|fail|success|danger|green|red)/, 'not the assessment colours');
    assert.equal((html.match(/fill="currentColor"/g) || []).length, 1, 'only the chosen icon is filled');
  }
  assert.match(draw(GENERATED, await scope()), /focus-visible:outline-2/, 'a visible focus ring');
});

test('selection does not force opacity: the reveal classes are the same with and without a rating, and none is always on', async () => {
  const reveal = html => html.match(/data-card-thumbs[^>]*class="([^"]+)"/)[1].split(/\s+/);
  const plain = reveal(draw(GENERATED, await scope())), rated = reveal(draw(GENERATED, await scope([{ cardId: 'g1', value: 'up', revision: 1, title: '' }])));
  assert.deepEqual(rated, plain, 'a chosen thumb does not change when the pair shows');
  assert.ok(plain.includes('opacity-0'), 'hidden at rest');
  assert.ok(plain.includes('group-hover:opacity-100'), 'the card under the pointer reveals it');
  assert.ok(plain.includes('has-[:focus-visible]:opacity-100'), 'keyboard focus on the pair reveals it');
  assert.ok(!plain.includes('opacity-100'), 'no bare always-visible class');
  assert.ok(!plain.some(c => /^(group-)?focus-within:|^aria-|selected|current/.test(c)), 'neither card focus nor selection reveals it');
});

test('no pair without the owner\'s scope (a shared reader, a review fixture) or on a card that is not generated', async () => {
  const s = await scope([{ cardId: 'g1', value: 'up', revision: 1, title: '' }]);
  assert.equal(draw(GENERATED, null), '', 'no scope: a shared view');
  const imported = [
    { id: 'p', type: 'file', kind: 'pdf', label: 'Paper' }, { id: 'e', type: 'explanation', title: 'Excerpt', excerpt: { kind: 'text' } },
    { id: 'm', type: 'explanation', title: 'Markdown', fileRef: { id: 'f' } }, { id: 'v', type: 'video', videoId: 'abc' },
    { id: 'x', type: 'explanation', title: 'Pending', explainJob: { id: 'j' } }, { id: 'f', type: 'explanation', title: 'Failed', status: 'failed' },
  ];
  for (const block of imported) assert.equal(draw(block, s), '', `${block.id}`);
  assert.notEqual(draw(GENERATED, s), '');
});

test('scope switch ignores old response: the pair shows the value of the canvas it is drawn on', async () => {
  const a = await scope([{ cardId: 'g1', value: 'up', revision: 1, title: '' }]), b = await scope([{ cardId: 'g1', value: 'down', revision: 1, title: '' }]);
  assert.deepEqual(buttons(draw(GENERATED, a)).map(x => x.pressed), ['true', 'false']);
  assert.deepEqual(buttons(draw(GENERATED, b)).map(x => x.pressed), ['false', 'true']);
  assert.deepEqual(buttons(draw(GENERATED, a)).map(x => x.pressed), ['true', 'false'], 'switching back shows the first canvas again, unmixed');
});
