// Ledger c030d623: a typed /image (id generate-image) was answered by the Tutor's plan route in Auto and Tutor modes, so the learner got
// Tutor prose and no plan card. /image has its own flow (the server-made plan card, image-jobs.md; review policy "always",
// generation-review-contract.md section 10), as /motion does. Since Tutor cleanup P2 no Learn turn goes to a Tutor plan route; this
// holds the command's side: while image generation is offered, /image comes back as a prompt for the chat route (promptsChat).
// Wiring only: no browser, no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promptsChat, runLearnCommand } from './learn-slash.js';
import { setImageGeneration } from './agent/slash.js';

test('/image is a prompt for the chat route (the plan card) while image generation is offered; /practice and /goal are not', async () => {
  setImageGeneration(true);
  try {
    assert.deepEqual(await runLearnCommand('/image a watercolor mountain landscape', { app: 'demo' }), { prompt: 'a watercolor mountain landscape' });
    assert.equal(promptsChat('generate-image'), true, 'the plan card, not a plain answer');
    assert.equal(promptsChat('motion'), true, '/motion as before');
    // /practice prepares its own brief (owner spec 2026-10-29, material-brief.js), so it prompts the chat route too.
    assert.equal(promptsChat('practice'), true, 'a brief command has its own flow');
    assert.equal(promptsChat('goal'), false, 'a command without its own flow');
  } finally { setImageGeneration(false); }
});
