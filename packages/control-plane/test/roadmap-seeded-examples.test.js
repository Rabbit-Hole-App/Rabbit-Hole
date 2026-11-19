// GEN-1 R2: a roadmap card (the step_accepted path through the roadmap workflow) is a seeded request with a plan (the planner runs, context null), so its author request carries the seeded examples and the inputs sentence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEEDED_EXAMPLES_HEADING } from '../src/explanation-references.js';
import { INPUTS_RULE } from '../src/agents/learn-artifact.js';
import { explanation, started, workflow } from './roadmap-workflow-fixture.js';

const start = (h, view, who = 'alice') => h.send(who, 'POST', `/api/learn/roadmap/${view.roadmap.id}/course/start`, { boardId: h.boards[who], revision: view.roadmap.revision });

test('a roadmap card made from a cold state carries the seeded examples in the author request, the inputs sentence', async t => {
  const h = await workflow(t);
  Object.assign(h.env, { ROADMAP_CARD_PROFILE: undefined, GEMINI_API_KEY: 'test-key', EXPLANATION_PLANNER: 'jev', TYPESAFE_API_KEY: 'test-key' });
  const sent = [], denied = globalThis.fetch;
  const card = (await (await explanation()('gemini-3.5-flash-lite', {})).json()).content[0].input;
  const answers = { visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95, picture: 0.03, both: 0.02 } }, kind: { choice: 'flow', confidence: 0.9, probabilities: { flow: 0.9, sequence: 0.1 } }, depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 } };
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url || input);
    if (url.includes('typesafe')) return Response.json({ answers, usage: { input_tokens: 120 } });
    if (!url.includes('generativelanguage')) return denied(input, init);
    sent.push(JSON.parse(init.body));
    return Response.json({ model: 'gemini-3.5-flash-lite', choices: [{ message: { role: 'assistant', content: JSON.stringify(card) }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 400, total_tokens: 1300 } });
  };
  try {
    const view = await started(h);
    assert.equal((await start(h, view)).status, 200);
    for (let i = 0; i < 4; i += 1) await h.run();
  } finally { globalThis.fetch = denied; }
  assert.ok(sent.length >= 1, 'an author request was sent');
  const text = JSON.stringify(sent[0]);
  assert.ok(text.includes('Diagram examples on other subjects.'), 'the seeded examples heading is in the roadmap card\'s author request');
  assert.ok(text.includes(INPUTS_RULE), 'and the inputs sentence');
  assert.ok(!text.includes('Approved diagram references'), 'not the old heading');
  assert.ok(SEEDED_EXAMPLES_HEADING.includes('Diagram examples on other subjects.'));
});
