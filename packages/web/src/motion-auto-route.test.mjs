// Owner decision 2026-10-24 (ledger 69b00255): an explicit /motion command in Auto mode requests the Motion review and
// confirmation flow; ordinary prose that merely mentions motion stays a plain Chat turn; missing information is asked
// for inside the Motion flow; recognising the command never skips confirmation. Wiring only: no browser, no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewRequired } from './proposal-capabilities.js';
import { runLearnCommand, parseSlash } from './learn-slash.js';

const run = (text, calls = []) => runLearnCommand(text, { app: 'demo', motionDev: true, openSearch: () => {},
  canvas: { insertBlock: () => calls.push('insertBlock'), reserve: () => calls.push('reserve'), startCad: () => calls.push('startCad') },
  post: async (path) => { calls.push(path); return {}; } });

test('an explicit /motion is a command that needs its own review flow (every mode)', () => {
  assert.equal(reviewRequired('motion'), true);
});

test('prose that merely mentions motion, and other commands, keep their routing', () => {
  assert.equal(reviewRequired('practice'), false, 'a command that is not proposed first');
  assert.equal(reviewRequired('explain'), false);
  assert.equal(parseSlash('Show me the motion of a pendulum'), null, 'prose is not a command line');
  assert.equal(parseSlash('explain motion planning, /motion is a command'), null, 'a slash inside prose is not a command line');
});


test('/motion with words becomes a prompt for the chat route: no request, card, held place or generation here', async () => {
  const calls = [];
  assert.deepEqual(await run('/motion 15s explain me softmax func', calls), { prompt: '15s explain me softmax func' });
  assert.deepEqual(calls, [], 'nothing reaches /api/learn/video or the canvas before the proposal card is confirmed');
});

test('/motion with no words asks what to explain inside the Motion flow, keeps the line, and runs nothing', async () => {
  for (const line of ['/motion', '/motion   ']) {
    const calls = [];
    const out = await run(line, calls);
    assert.equal(out.notice.tone, 'question');
    assert.match(out.notice.text, /What should the video explain/);
    assert.equal(out.keep, '/motion ', 'the command stays in the composer for the answer');
    assert.equal(out.prompt, undefined, 'no chat turn, so no Tutor turn and no proposal yet');
    assert.deepEqual(calls, []);
  }
});

// MOT-22: a start the server refuses for its proposal ends after Generate returned, so the card's one-press guard (sent, sentKey)
// was never released and its Generate stayed disabled for good (found by motion-command-check step 8 once /motion reached the Chat).
// The slot bumps `released` on the refusal event and the card gives the press back. The browser check is the behavioral proof.
test('a refused Generate gives the press back: the slot releases the card on the refusal event', () => {
  const card = readFileSync(new URL('./GenerationProposalCard.jsx', import.meta.url), 'utf8');
  const slot = readFileSync(new URL('./ChatMessages.jsx', import.meta.url), 'utf8');
  assert.ok(card.includes('useEffect(() => { sent.current = null; setSentKey(null); }, [released]);'), 'the card clears its press guard when released changes');
  assert.ok(slot.includes('setPressed(false); setReleased(n => n + 1);'), 'the refusal event releases the card');
  assert.ok(slot.includes('<GenerationProposalCard proposal={p} active={active} made={cardKind ? false : made} released={released}'), 'the slot hands it down');
});
