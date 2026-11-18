import test from 'node:test';
import assert from 'node:assert/strict';
import { briefAndCompose, compositionForMake } from './learn-section-load.js';

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
