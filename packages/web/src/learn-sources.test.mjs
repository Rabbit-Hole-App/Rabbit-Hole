import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSource, toggleSource, isAttached, attachedKinds } from './learn-sources.js';

const repo = { id: 'repo:karpathy/nanoGPT', kind: 'repository', label: 'karpathy/nanoGPT' };
const paper = { id: 'paper:2501.1234', kind: 'paper', label: 'arXiv 2501.1234' };

test('a new source arrives attached - it was just brought in on purpose', () => {
  const sources = withSource([], repo);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].attached, true);
  assert.equal(sources[0].label, 'karpathy/nanoGPT');
});

// Opening the same paper twice must not stack two rows.
test('registering the same source twice changes nothing', () => {
  const once = withSource([], paper);
  assert.equal(withSource(once, paper).length, 1);
});

// The whole point: detaching must survive the thing that registered it running again.
test('re-registering does not re-attach something you detached', () => {
  const detached = toggleSource(withSource([], repo), repo.id);
  assert.equal(detached[0].attached, false);
  assert.equal(withSource(detached, repo)[0].attached, false, 'still detached');
});

test('a later registration can refresh the label without touching the flag', () => {
  const sources = toggleSource(withSource([], paper), paper.id);
  const renamed = withSource(sources, { ...paper, label: 'Attention Is All You Need' });
  assert.equal(renamed[0].label, 'Attention Is All You Need');
  assert.equal(renamed[0].attached, false);
});

test('toggle flips back and forth', () => {
  let sources = withSource([], repo);
  sources = toggleSource(sources, repo.id);
  assert.equal(sources[0].attached, false);
  sources = toggleSource(sources, repo.id);
  assert.equal(sources[0].attached, true);
});

test('toggling an id that is not there leaves the list alone', () => {
  const sources = withSource([], repo);
  assert.deepEqual(toggleSource(sources, 'nope'), sources);
});

// A source nobody has registered yet must not read as switched off, or context
// would vanish for every canvas that predates this list.
test('an unknown source counts as attached', () => {
  assert.equal(isAttached([], repo.id), true);
  assert.equal(isAttached([paper], repo.id), true);
});

test('a known source answers with its own flag', () => {
  const sources = withSource([], repo);
  assert.equal(isAttached(sources, repo.id), true);
  assert.equal(isAttached(toggleSource(sources, repo.id), repo.id), false);
});

test('attachedKinds reports what the agent will actually be given', () => {
  let sources = withSource(withSource([], repo), paper);
  assert.deepEqual(attachedKinds(sources).sort(), ['paper', 'repository']);
  sources = toggleSource(sources, repo.id);
  assert.deepEqual(attachedKinds(sources), ['paper']);
});

test('order is stable, so rows do not jump as things are switched', () => {
  const sources = withSource(withSource([], repo), paper);
  assert.deepEqual(toggleSource(sources, repo.id).map(s => s.id), sources.map(s => s.id));
});
