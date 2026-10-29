// The /explain pending card (owner brief 2026-10-28, loading card patch): compact while the job works, a spinner beside the
// server's stage only while it is working, and a size that is a temporary default, never saved, so the finished card takes its
// own frame-derived size unless the learner resized it. ExplainPending and LearningBlocks are bundled with esbuild and rendered
// with react-dom/server (no effects run, so nothing polls). Real layout, motion and dark mode are browser checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { explainPendingBlock, explainResultBlock, explainWorking } from './explain-client.js';

const dir = mkdtempSync(join(tmpdir(), 'explain-pending-')), outfile = join(dir, 'pending.cjs');
await esbuild.build({
  stdin: { contents: "export { default as ExplainPending } from './ExplainPending.jsx'; export { BLOCK_TYPES, EXPLAIN_PENDING_SIZE } from './LearningBlocks.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const RECORDED = JSON.parse(readFileSync(new URL('./explain-program/testdata/sandbox-ex1-b-job.json', import.meta.url), 'utf8'));
const pending = (stage = 'authoring', over = {}) => ({ ...explainPendingBlock({ job: { id: RECORDED.job.id, cardId: RECORDED.job.cardId, boardId: RECORDED.job.boardId, stage }, prompt: 'How a hot coffee cools' }), dx: 40, dy: 120, ...over });
const render = block => B.renderToStaticMarkup(B.createElement(B.ExplainPending, { block, onChange() {}, onChangeQuiet() {} }));
const sizeFor = (block, frame = null) => B.BLOCK_TYPES.animation.sizeFor(block, frame);

test('a pending card is compact: 440 wide, its height its content\'s, and that size is never written on the block', () => {
  const card = pending();
  assert.deepEqual(sizeFor(card), { width: 440, height: undefined });
  assert.equal(Object.hasOwn(card, 'w') || Object.hasOwn(card, 'h'), false, 'the placed card holds no size');
  const html = render(card);
  assert.doesNotMatch(html, /border-dashed|flex-1|justify-center/, 'no oversized dashed inner frame');
  assert.match(html, /data-explain-stop/, 'Stop stays');
});

test('the ready card takes the frame-derived size, not the placeholder; a learner\'s resize while pending is kept', () => {
  const ready = explainResultBlock(pending(), RECORDED.job, RECORDED.block);
  assert.ok(ready && !ready.explainJob);
  assert.equal(Object.hasOwn(ready, 'w') || Object.hasOwn(ready, 'h'), false, 'no placeholder size carried into the result');
  assert.deepEqual([ready.dx, ready.dy, ready.id], [40, 120, RECORDED.job.cardId], 'identity and position kept');
  assert.equal(sizeFor(ready), null, 'a program card waits for its frame (the canvas keeps the type default meanwhile), as before');
  const frame = { w: 640, h: 420 };
  const sized = sizeFor(ready, frame);
  assert.notEqual(sized.width, 440);
  assert.ok(sized.width >= 560 && sized.height > 220, 'the frame-derived program size');
  const resized = explainResultBlock(pending('authoring', { w: 500, h: 300 }), RECORDED.job, RECORDED.block);
  assert.deepEqual([resized.w, resized.h], [500, 300], 'a deliberate resize carries over');
});

test('a spinner and shimmer beside the server\'s stage only while it works', () => {
  for (const stage of ['queued', 'preparing', 'authoring', 'rendering']) {
    const html = render(pending(stage));
    assert.match(html, /data-explain-spinner/, stage);
    assert.match(html, /motion-safe:animate-spin/, `${stage}: reduced motion stops the spin`);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /<p data-explain-stage="true" aria-live="polite" class="text-sm shimmer">/, `${stage}: the live status keeps announcing`);
  }
  for (const stage of ['awaiting_approval', 'cancelled', 'failed', 'ready']) {
    const html = render(pending(stage));
    assert.doesNotMatch(html, /data-explain-spinner|shimmer/, stage);
    assert.match(html, /aria-live="polite"/, stage);
  }
  // Paused by the provider (stage failed or a non-terminal pause), stopped, failed: not working.
  const unavailable = { stage: 'authoring', terminal: false, stopReason: 'provider_unavailable', failure: { category: 'provider_unavailable' } };
  assert.equal(explainWorking(unavailable), false);
  assert.equal(explainWorking({ stage: 'cancelled', terminal: true }), false);
  assert.equal(explainWorking({ stage: 'failed', terminal: true }), false);
  assert.equal(explainWorking({ stage: 'awaiting_approval', terminal: false }), false);
  assert.equal(explainWorking({ stage: 'reviewing', terminal: false }), true);
});
