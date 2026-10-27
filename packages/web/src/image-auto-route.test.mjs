// Ledger c030d623: a typed /image (id generate-image) on a canvas with an active Tutor was answered by the Tutor's plan route in Auto
// and Tutor modes, so the learner got Tutor prose and no plan card (ask.jsx skips imagePlan when viaTutor). /image has its own flow
// (the server-made plan card, image-jobs.md; review policy "always", generation-review-contract.md section 10), as /motion does, so its
// words never go to the Tutor in any mode. Wiring only: no browser, no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tutorTurn } from './chat-route.js';
import { promptsChat, runLearnCommand } from './learn-slash.js';
import { setImageGeneration } from './agent/slash.js';

const tutor = { ask: () => {} }, chat = {};
// What ask.jsx send() decides for a /line that came back as its prompt (the slash pill and a typed line take the same path).
const viaTutor = (commandName, mode) => tutorTurn({ tutor, chat, mode, explicit: !!commandName && promptsChat(commandName) });

test('/image with an active Tutor is never a Tutor turn, in Auto, Tutor or Ask mode, while image generation is offered', async () => {
  setImageGeneration(true);
  try {
    assert.deepEqual(await runLearnCommand('/image a watercolor mountain landscape', { app: 'demo' }), { prompt: 'a watercolor mountain landscape' });
    for (const mode of ['auto', 'tutor', 'ask']) assert.equal(viaTutor('generate-image', mode), false, `${mode}: the plan card, not the Tutor`);
    assert.equal(viaTutor('motion', 'auto'), false, '/motion as before');
    assert.equal(viaTutor(null, 'auto'), true, 'prose still goes to the Tutor');
    assert.equal(viaTutor('practice', 'auto'), true, 'a command without its own flow still goes to the Tutor');
  } finally { setImageGeneration(false); }
});

test('ask.jsx routes with the same test the command uses to prompt the chat', () => {
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.ok(ask.includes('explicit: !!commandName && promptsChat(commandName)'));
});
