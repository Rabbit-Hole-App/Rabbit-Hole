import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { SECTION_ITEM_MS, briefAndCompose, compositionForMake, withinTime } from './learn-section-load.js';
import { frame } from './learn-section-perform.js';
import { SENTENCES } from './tutor-rehearsal-text.js';

// A server that answers in order and records the actions asked. answers: action -> list of answers, each used once.
const server = answers => { const asked = []; const post = async body => { asked.push(body.action); return answers[body.action].shift(); }; return { post, asked }; };
const composition = { items: [{ id: 'i1' }] };

test('Build after a reload, no brief stored (409 no_brief): brief, then compose, then the composition to make from', async () => {
  const { post, asked } = server({ learn_section_compose: [{ error: 'no_brief' }, { composition }], learn_section_brief: [{ brief: { beats: [] } }] });
  const seen = [];
  const out = await compositionForMake(post, '1.1', { onLoading: () => seen.push('loading'), onBrief: () => seen.push('brief') });
  assert.deepEqual(out, { composition });
  assert.deepEqual(asked, ['learn_section_compose', 'learn_section_brief', 'learn_section_compose']);
  assert.deepEqual(seen, ['loading', 'brief']);
});

test('a refused brief there is failed "brief" (Try again re-runs the brief, not make); another compose error is failed "compose"', async () => {
  const refused = { error: 'sectionBriefFailed', words: 'x' };
  const a = server({ learn_section_compose: [{ error: 'no_brief' }], learn_section_brief: [refused] });
  assert.deepEqual(await compositionForMake(a.post, '1.1'), { failed: 'brief', out: refused });
  const retry = server({ learn_section_brief: [{ brief: {} }], learn_section_compose: [{ composition }] });
  assert.deepEqual(await briefAndCompose(retry.post, '1.1'), { composition });
  assert.deepEqual(retry.asked, ['learn_section_brief', 'learn_section_compose'], 'Try again (retrySection, failed brief -> loadSection) posts the brief again');
  const b = server({ learn_section_compose: [{ error: 'sectionComposeFailed', words: 'y' }] });
  assert.equal((await compositionForMake(b.post, '1.1')).failed, 'compose');
});

test('a stored composition is used as it is: one compose call, no brief', async () => {
  const { post, asked } = server({ learn_section_compose: [{ composition }] });
  assert.deepEqual(await compositionForMake(post, '1.1'), { composition });
  assert.deepEqual(asked, ['learn_section_compose']);
});

// Reviewer 2026-11-17 20:30 §7: never a silent stop.

test('§7.2 an item whose card never arrives is timed out at 90 s (fake timers); the learner reads the plain sentence', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const late = withinTime(new Promise(() => {}));
    mock.timers.tick(SECTION_ITEM_MS - 1);
    await Promise.resolve();
    mock.timers.tick(1);
    assert.deepEqual(await late, { timedOut: true });
  } finally { mock.timers.reset(); }
  assert.deepEqual(await withinTime(Promise.resolve({ cardId: 'c1' })), { value: { cardId: 'c1' } }, 'a card that arrives is passed on');
  assert.equal(SENTENCES.sectionCardLate, 'The card for this step did not arrive. Try again or skip this section.');
});

test('§7.1 frame() resolves with requestAnimationFrame never firing (a hidden page)', async () => {
  const saved = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0; // paused: never calls back
  try {
    const started = Date.now();
    await frame();
    assert.ok(Date.now() - started < 1000, 'resolved on the 50 ms timer');
  } finally { globalThis.requestAnimationFrame = saved; }
});
