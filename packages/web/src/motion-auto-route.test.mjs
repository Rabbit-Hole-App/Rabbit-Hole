// Owner decision 2026-10-24 (ledger 69b00255): an explicit /motion command in Auto mode requests the Motion review and
// confirmation flow; ordinary prose that merely mentions motion stays under normal Tutor routing; missing information is asked
// for inside the Motion flow; recognising the command never skips confirmation. Wiring only: no browser, no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tutorTurn } from './chat-route.js';
import { reviewRequired } from './proposal-capabilities.js';
import { runLearnCommand, parseSlash } from './learn-slash.js';

const tutor = { ask: () => {} }, chat = {};
// What ask.jsx send() knows about a turn: the command name only when a /command line came back as its prompt.
const viaTutor = (commandName, mode = 'auto') => tutorTurn({ tutor, chat, mode, explicit: !!commandName && reviewRequired(commandName) });
const run = (text, calls = []) => runLearnCommand(text, { app: 'demo', motionDev: true, openSearch: () => {},
  canvas: { insertBlock: () => calls.push('insertBlock'), reserve: () => calls.push('reserve'), startCad: () => calls.push('startCad') },
  post: async (path) => { calls.push(path); return {}; } });

test('an explicit /motion in Auto is not a Tutor turn: it posts to the chat route that proposes it (every mode with a Tutor)', () => {
  assert.equal(reviewRequired('motion'), true);
  assert.equal(viaTutor('motion', 'auto'), false, 'Auto: the Motion review flow');
  assert.equal(viaTutor('motion', 'tutor'), false, 'Tutor mode too: the command asks for its own flow');
  assert.equal(viaTutor('motion', 'ask'), false, 'Ask always posted to /api/learn/ask');
  assert.equal(tutorTurn({ tutor, explicit: true }), false, 'a surface with no Chat pane: the same');
});

test('prose that merely mentions motion, and other commands, keep their routing', () => {
  assert.equal(viaTutor(null, 'auto'), true, '"how does motion blur work" has no command: the Tutor, as before');
  assert.equal(viaTutor('practice', 'auto'), true, 'a command that is not proposed first still goes to the Tutor as before');
  assert.equal(viaTutor('explain', 'auto'), true);
  assert.equal(parseSlash('Show me the motion of a pendulum'), null, 'prose is not a command line');
  assert.equal(parseSlash('explain motion planning, /motion is a command'), null, 'a slash inside prose is not a command line');
});

test('ask.jsx hands the typed command to the routing decision', () => {
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.ok(ask.includes('explicit: !!commandName && promptsChat(commandName)'), 'tutorTurn is told the turn is an explicit proposed command');
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
