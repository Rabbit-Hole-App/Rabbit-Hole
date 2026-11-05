// /whiteboard in the browser (roadmap rabbit-hole-whiteboard-roadmap-v1.md W1.5-W1.6): the job client, the card's block mapping, the review
// card's copy and the Length select. The card is bundled with esbuild and rendered with react-dom/server (no effects run, so nothing polls);
// playing, downloading and Ctrl+K inside the player are e2e/whiteboard-mvp-check.mjs's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { RETRY_LABELS, WHITEBOARD_ROUTES, whiteboardAssetUrl, whiteboardClient, whiteboardPollDelay, whiteboardRefusal, whiteboardRunning } from './client.js';
import { describeWhiteboard, downloadName, pendingBlock, settleWhiteboard, stageWord, videoOf } from './card.js';
import { approvesJob, durationRefinement, jobReviewCopy, startAdapter } from '../generation-proposal-chat.js';
import { commandDefinition, settingsOf, validateSettings } from '../generation-confirmation-schema.js';

const dir = mkdtempSync(join(tmpdir(), 'whiteboard-card-')), outfile = join(dir, 'card.cjs');
await esbuild.build({
  stdin: { contents: "export { default as WhiteboardVideoCard } from './WhiteboardVideoCard.jsx'; export { AnimationBoard } from './animation3d/board-context.js'; export { BLOCK_TYPES, describeBlock } from './LearningBlocks.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'error',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty', '.wasm': 'empty', '.woff2': 'empty', '.ttf': 'empty' },
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /\?(url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset' }));
    build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default ""' }));
  } }],
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const JOB = { id: 'wj_1', cardId: 'card-0001', boardId: 'b1', stage: 'queued' };
const waiting = (stage = 'queued', over = {}) => ({ ...pendingBlock({ ...JOB, stage }, { boardId: 'b1', requestId: 'req-00000001', threadId: 'canvaschat-1' }), ...over });
const READY = { ...JOB, stage: 'ready', title: 'Gradient descent', plan: { goal: 'See one update step.' }, result: { artifactId: 'wa_fixture60', revision: 1, planHash: '0'.repeat(64), measured: { seconds: 60, frames: 1800 } } };
const render = (block, owner = true) => B.renderToStaticMarkup(B.createElement(B.AnimationBoard.Provider, { value: owner ? { kind: 'owner', boardId: 'b1' } : null },
  B.createElement(B.WhiteboardVideoCard, { block, appName: 'canvas-abc', onChange() {}, onChangeQuiet() {} })));

test('the client names wb-server\'s routes: create, status, approve and refine by name, the result outside the jobs root, assets by kind', async () => {
  const calls = [];
  const client = whiteboardClient(async (path, init) => { calls.push([path, init ? JSON.parse(init.body) : null]); return {}; }, 'b1');
  await client.create({ requestId: 'r', cardId: 'c', prompt: 'p' });
  await client.get('wj_1'); await client.action('wj_1', 'approve', { proposal: { proposal_id: 'x' } }); await client.action('wj_1', 'refine', { message: 'duration: 30' }); await client.result('wa_1');
  assert.deepEqual(calls, [['/api/learn/whiteboard/jobs', { boardId: 'b1', requestId: 'r', cardId: 'c', prompt: 'p' }], ['/api/learn/whiteboard/jobs/wj_1?board=b1', null],
    ['/api/learn/whiteboard/jobs/wj_1/approve', { boardId: 'b1', proposal: { proposal_id: 'x' } }], ['/api/learn/whiteboard/jobs/wj_1/refine', { boardId: 'b1', message: 'duration: 30' }], ['/api/learn/whiteboard/results/wa_1?board=b1', null]]);
  assert.equal(WHITEBOARD_ROUTES.results, '/api/learn/whiteboard/results');
  assert.equal(whiteboardAssetUrl('canvas-abc', 'wa_1', 'final', { download: true }), '/api/learn/whiteboard/assets?app=canvas-abc&workspace=&artifact=wa_1&kind=final&download=1');
  assert.equal(whiteboardAssetUrl('canvas-abc', 'wa_1', 'captions'), '/api/learn/whiteboard/assets?app=canvas-abc&workspace=&artifact=wa_1&kind=captions');
  assert.deepEqual(RETRY_LABELS, {}, 'W1 offers no recovery action');
});

test('refusals are the owner-approved words by code only; anything else is the caller\'s own line', () => {
  assert.equal(whiteboardRefusal({ data: { code: 'card_busy', error: 'anything' } }), 'This card already has a whiteboard video in progress.');
  assert.equal(whiteboardRefusal({ data: { code: 'canvas_busy' } }), 'Another whiteboard video is being made on this canvas.');
  assert.equal(whiteboardRefusal({ data: { code: 'duration_invalid' } }), 'Invalid whiteboard request.');
  assert.equal(whiteboardRefusal({ data: { code: 'proposal_used' } }), 'This proposal already made a whiteboard video. Ask for a new version in chat to make another.');
  assert.equal(whiteboardRefusal({ data: { code: 'something_new', error: 'Server words' } }), null, 'unmapped server text is never shown');
  assert.equal(whiteboardRefusal(new Error('offline')), null);
});

test('a running job is read every 10 s, backing off after failures; a final refusal stops the reads; a plan waiting for review is not polled', () => {
  assert.deepEqual([whiteboardPollDelay(), whiteboardPollDelay({ status: 503 }, 1), whiteboardPollDelay({ status: 503 }, 2), whiteboardPollDelay({ status: 0 }, 9)], [10000, 10000, 20000, 60000]);
  for (const status of [401, 403, 404, 410]) assert.equal(whiteboardPollDelay({ status }, 1), null, status);
  assert.deepEqual(['queued', 'planning', 'authoring', 'narrating', 'rendering', 'awaiting_approval', 'ready', 'failed'].map(stage => whiteboardRunning({ stage })), [true, true, true, true, true, false, false, false]);
});

test('every stage reads one of the roadmap 1.3 stage words; a waiting plan says to review it; an unknown stage says nothing', () => {
  assert.deepEqual(['queued', 'planning', 'awaiting_approval', 'authoring', 'narrating', 'timing', 'rendering', 'reviewing', 'ready', 'mystery'].map(stageWord),
    ['Planning', 'Planning', 'Review your whiteboard', 'Writing', 'Narrating', 'Narrating', 'Drawing', 'Checking', 'Ready', null]);
});

test('settle: a ready job lands its video once (title, goal, artifact), a stage change rides quietly, another card\'s job never lands', () => {
  const block = waiting('authoring');
  const ready = settleWhiteboard(block, READY);
  assert.equal(ready.action, 'apply');
  assert.deepEqual(ready.block.whiteboard, { artifactId: 'wa_fixture60', revision: 1, planHash: '0'.repeat(64), measured: { seconds: 60, frames: 1800 }, status: 'ready' });
  assert.deepEqual([ready.block.title, ready.block.goal, ready.block.whiteboardJob], ['Gradient descent', 'See one update step.', undefined]);
  assert.ok(videoOf(ready.block));
  const moved = settleWhiteboard(block, { ...JOB, stage: 'rendering', title: 'Gradient descent' });
  assert.deepEqual([moved.action, moved.block.whiteboardJob.stage, moved.block.title], ['progress', 'rendering', 'Gradient descent']);
  assert.equal(settleWhiteboard(moved.block, { ...JOB, stage: 'rendering', title: 'Gradient descent' }).action, 'keep');
  const failed = settleWhiteboard(block, { ...JOB, stage: 'failed', failure: { message: '"Gradient descent" was not finished: the drawing could not be rendered.' } });
  assert.deepEqual([failed.action, failed.block.whiteboardJob.message], ['progress', '"Gradient descent" was not finished: the drawing could not be rendered.']);
  for (const other of [{ ...READY, id: 'wj_2' }, { ...READY, cardId: 'card-0002' }, { ...READY, boardId: 'b2' }, null]) assert.equal(settleWhiteboard(block, other).action, 'keep');
  assert.equal(settleWhiteboard(block, { ...READY, result: null }).action, 'unreadable');
});

test('the download is the card title as an ASCII slug of at most 60 characters', () => {
  assert.equal(downloadName('Gradient descent: one worked example'), 'gradient-descent-one-worked-example.mp4');
  assert.equal(downloadName('Fourier série — à la carte'), 'fourier-serie-a-la-carte.mp4');
  assert.equal(downloadName('x'.repeat(80)).length, 60 + '.mp4'.length);
  assert.equal(downloadName('数学'), 'whiteboard.mp4');
});

test('the pending card shows the stage word; the ready card plays the video with captions, the caption line and Download; others see the placeholder', () => {
  const pending = render(waiting('narrating'));
  assert.match(pending, /data-whiteboard-pending="narrating"[^>]*>.*Narrating<\/p>/s);
  assert.match(render(waiting('failed', { whiteboardJob: { ...waiting().whiteboardJob, stage: 'failed', message: 'not finished' } })), /not finished/);
  const ready = render(settleWhiteboard(waiting('authoring'), READY).block);
  assert.match(ready, /<div data-player="true"[^>]*><video data-whiteboard-player="true" controls="" preload="metadata" poster="[^"]*kind=poster"[^>]*src="[^"]*kind=final"/);
  assert.match(ready, /<track kind="captions" srcLang="en" src="[^"]*kind=captions"\/>/);
  assert.match(ready, />AI-narrated whiteboard video</);
  assert.match(ready, /<a data-whiteboard-download="true" href="[^"]*kind=final&amp;download=1" download="gradient-descent\.mp4"[^>]*>Download<\/a>/);
  for (const block of [waiting('narrating'), settleWhiteboard(waiting('authoring'), READY).block]) {
    const shared = render(block, false);
    assert.match(shared, />This video is not available to you\.</);
    assert.doesNotMatch(shared, /<video|data-whiteboard-pending/, 'no player and no job read where the viewer is not the owner');
  }
  assert.doesNotMatch(pending + ready, /\.\.\.|…/);
});

test('the card is registered (no Insert sample) and the Tutor reads its title and goal', () => {
  assert.equal(B.BLOCK_TYPES.whiteboardVideo.label, 'Whiteboard');
  assert.equal(B.BLOCK_TYPES.whiteboardVideo.sample, undefined, 'made only by /whiteboard');
  const ready = settleWhiteboard(waiting('authoring'), READY).block;
  assert.deepEqual(B.describeBlock(ready), describeWhiteboard(ready));
  assert.match(describeWhiteboard(ready).text, /Gradient descent[\s\S]*Goal: See one update step\./);
});

test('Ctrl+K never opens from inside the player: inlineTarget refuses a focused [data-player]', () => {
  const source = readFileSync(new URL('../AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(source, /const inlineTarget = [\s\S]{0,1200}held\.closest\?\.\('[^']*\[data-player\]'\)/);
});

test('the review card: Generate approves the job, the heading and cost line are 1.3\'s, a length change re-plans, Length offers 10 to 60 s', () => {
  const p = { command: 'whiteboard-video', proposal_id: 'p1', version: 2, input: { job: 'wj_1' }, settings: { duration_seconds: 30 }, usage: { max_credits: 391 } };
  assert.equal(approvesJob(p), true);
  assert.equal(startAdapter(p, { approveExplain() {} }), 'job');
  assert.deepEqual(jobReviewCopy(p), { eyebrow: 'Review your whiteboard', note: 'up to 391 credits' });
  assert.deepEqual(jobReviewCopy({ ...p, usage: null }), { eyebrow: 'Review your whiteboard' }, 'no server figure, no cost line');
  assert.equal(durationRefinement({ settings: { duration_seconds: 60 } }, p), 'duration: 30');
  assert.equal(durationRefinement({ settings: { duration_seconds: 30 } }, p), null);
  assert.equal(durationRefinement({ settings: { duration_seconds: 60 } }, { ...p, command: 'animation' }), null);
  const [length] = settingsOf('whiteboard-video');
  assert.deepEqual([length.key, length.label, length.type, length.default, length.editable], ['duration_seconds', 'Length', 'select', 60, true]);
  assert.deepEqual(length.options.map(o => o.label), ['10 seconds', '20 seconds', '30 seconds', '40 seconds', '50 seconds', '60 seconds']);
  const def = commandDefinition('whiteboard-video');
  assert.deepEqual([def.cancel, def.review_policy, def.editable_fields], [true, 'always', ['duration_seconds']]);
  assert.ok(validateSettings('whiteboard-video', { duration_seconds: 70 }).error, 'W1 serves at most 60 s');
});
