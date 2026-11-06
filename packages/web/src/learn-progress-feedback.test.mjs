// The Progress pane's "Your feedback" section, rendered (checklist R1.05): LearnProgress.jsx is bundled with esbuild and rendered with
// react-dom/server, as answer-footer.test.mjs renders AnswerFooter. A server render runs no effects, so the pane shows the state it
// starts in (no goal, or a goal still loading) and the feedback store is read before the render. What is pinned here: the self-report
// section is there with or without a goal, it is the learner's own words and separate from the assessed panel, it reads its own list,
// and a failure in it changes nothing else on the pane.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'learn-progress-feedback-')), outfile = join(dir, 'progress.cjs');
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as LearnProgress } from './LearnProgress.jsx'; export { feedbackStoreFor } from './card-feedback.js'; export { progressModel } from './learn-progress-client.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

let canvases = 0;
const row = (cardId, value, title) => ({ cardId, value, revision: 1, title });
// A canvas whose feedback list the server answers with `rows` (or fails). Its store is the one Progress reads.
async function canvas(rows, { fails = false } = {}) {
  const scope = { app: `canvas-${String(++canvases).padStart(8, '0')}`, board: 'main' };
  await B.feedbackStoreFor(scope, { read: async () => { if (fails) throw new Error('offline'); return rows; }, write: async () => ({ revision: 2 }) }).refresh();
  return scope;
}
const NO_GOAL = { state: { goals: [], activeGoalId: null, revision: 0 } };
const WITH_GOAL = { state: { goals: [{ goalId: 'lg_1', label: 'Read a balance sheet', lifecycle: 'active', criteria: [{ criterionId: 'c1', label: 'Read assets' }] }], activeGoalId: 'lg_1', revision: 1 } };
const pane = (scope, { coaching = NO_GOAL, ops = null } = {}) => B.renderToStaticMarkup(B.createElement(B.LearnProgress, {
  scope, coaching, composer: { focus() {}, prepare() {} }, onClose() {}, chat: ops ? { canvasOps: ops } : null,
}));
const section = html => html.match(/<section data-card-feedback-summary[\s\S]*?<\/section>/)?.[0] ?? '';
const withoutSection = html => html.replace(section(html), '');
const cards = html => [...html.matchAll(/data-card-feedback-card="([^"]+)"/g)].map(m => m[1]);

test('no_goal contains feedback and Set a goal: the section shows with no personal goal, beside the usual explanation', async () => {
  const html = pane(await canvas([row('g1', 'up', 'Balance sheets'), row('g2', 'down', 'Cash flow'), row('g3', 'down', null)]));
  assert.match(html, /data-progress-pane="no_goal"/);
  assert.match(html, /No learning goal set yet\./);
  assert.match(html, /data-progress-set-goal[^>]*>Set a goal</);
  const feedback = section(html);
  assert.match(feedback, /<h3[^>]*>Your feedback<\/h3>/);
  assert.match(feedback, /Private to you\. What you said about a card, not an assessment of what you know\./);
  assert.match(feedback, /Understood \(1\)/);
  assert.match(feedback, /Still unclear \(2\)/);
  assert.match(feedback, /Balance sheets/);
  assert.match(feedback, /Untitled card/, 'a card with no title still has a row');
  assert.ok(html.indexOf('data-progress-empty') < html.indexOf('data-card-feedback-summary'), 'the feedback follows the no-goal explanation');
  assert.deepEqual(cards(html), ['g1', 'g2', 'g3']);
});

test('with a goal the section is still there, after the assessed panel and apart from it', async () => {
  const html = pane(await canvas([row('g1', 'up', 'Balance sheets')]), { coaching: WITH_GOAL });
  assert.match(html, /data-progress-pane="loading"/);
  assert.match(html, /data-progress-goal/);
  assert.ok(html.indexOf('data-progress-goal') < html.indexOf('data-card-feedback-summary'));
  assert.doesNotMatch(section(html), /skill|demonstrated|data-progress-count|data-progress-skill/i, 'no assessed wording in the self-report');
  assert.doesNotMatch(withoutSection(html), /Understood|Still unclear|data-card-feedback/, 'nothing of it outside its own section');
});

test('feedback does not change mastery counts: the rest of the pane is the same with no ratings, many ratings or none loaded', async () => {
  const none = await canvas([]), many = await canvas([row('a', 'up', 'A'), row('b', 'up', 'B'), row('c', 'down', 'C')]);
  for (const coaching of [NO_GOAL, WITH_GOAL]) {
    const base = withoutSection(pane(none, { coaching }));
    assert.equal(withoutSection(pane(many, { coaching })), base, 'ratings add nothing to the assessed panel');
    assert.doesNotMatch(base, /data-progress-count|data-progress-skill/);
  }
  // Feedback is not an input of the assessed model at all.
  const inputs = { goals: WITH_GOAL.state.goals, activeGoalId: 'lg_1', load: { status: 'ready', view: { goalRef: { goalId: 'lg_1' }, criteria: [{ criterionId: 'c1', status: 'practising', evidenceIds: [] }], pendingAssessments: [] } } };
  const model = B.progressModel(inputs);
  assert.deepEqual([model.count, model.total], [0, 1]);
  assert.deepEqual(B.progressModel({ ...inputs, feedback: [row('a', 'up', 'A')] }).count, 0, 'a thumb is not a demonstration');
  assert.match(section(pane(many)), /Understood \(2\)/);
});

test('two canvases do not mix ratings', async () => {
  const one = await canvas([row('a', 'up', 'Only on one')]), two = await canvas([row('z', 'down', 'Only on two')]);
  const first = pane(one), second = pane(two);
  assert.deepEqual([cards(first), cards(second)], [['a'], ['z']]);
  assert.match(first, /Only on one/); assert.doesNotMatch(first, /Only on two/);
  assert.match(second, /Only on two/); assert.doesNotMatch(second, /Only on one/);
  assert.doesNotMatch(section(first), /Still unclear/); assert.doesNotMatch(section(second), /Understood \(/);
});

test('removed card has no focus action: a rated card that is no longer on the canvas is not listed, so nothing links to it', async () => {
  const scope = await canvas([row('here', 'up', 'Still here'), row('gone', 'down', 'Deleted')]);
  const located = [];
  const ops = { hasBlock: id => id === 'here', locate: id => located.push(id) };
  const html = pane(scope, { ops });
  assert.deepEqual(cards(html), ['here']);
  assert.doesNotMatch(html, /Deleted/);
  assert.doesNotMatch(section(html), /Still unclear/, 'the group that held only the removed card is gone');
  // Every card gone: the section says so rather than leaving a dead row.
  const empty = pane(scope, { ops: { hasBlock: () => false, locate: id => located.push(id) } });
  assert.deepEqual(cards(empty), []);
  assert.match(section(empty), /Nothing rated yet\./);
  assert.deepEqual(located, [], 'rendering never moves the camera');
});

test('feedback error leaves assessed panel intact: its own message and retry, and the rest of the pane is unchanged', async () => {
  const ok = await canvas([]), broken = await canvas([], { fails: true });
  for (const coaching of [NO_GOAL, WITH_GOAL]) {
    const html = pane(broken, { coaching });
    const feedback = section(html);
    assert.match(feedback, /role="alert"[^>]*data-card-feedback-error[^>]*>Your feedback could not be loaded\./);
    assert.match(feedback, /<button[^>]*>Retry<\/button>/);
    assert.doesNotMatch(feedback, /Nothing rated yet/, 'a failed read is not an empty list');
    assert.equal(withoutSection(html), withoutSection(pane(ok, { coaching })), 'the assessed panel is exactly what it was');
    assert.doesNotMatch(withoutSection(html), /could not be loaded|lost/i, 'no suggestion that saved answers are gone');
  }
  assert.match(section(pane(await canvas([]))), /Nothing rated yet\./, 'an empty canvas has an explicit empty message');
});

test('nothing renders before the first read, so opening Progress never flashes an empty list', async () => {
  const unread = { app: 'canvas-unread01', board: 'main' };
  B.feedbackStoreFor(unread, { read: async () => [], write: async () => ({}) });
  assert.equal(section(pane(unread)), '');
});
