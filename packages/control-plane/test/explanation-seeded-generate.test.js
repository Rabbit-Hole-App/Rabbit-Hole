// GEN-1 R2 x START-3: a SEEDED typed card with a planned kind and no stored reference, made through generateArtifact (which awaits the lazy reference library first), carries the seeded
// examples in the request it sends and in its archive trace. Also run from a cold simulated Worker (cold-worker-f-typed-seeded.test.js): no synchronous loader, no /api/ request first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact } from '../src/learn-artifact.js';
import { planFromAnswers } from '../src/explanation-planner.js';
import { SEEDED_EXAMPLES_HEADING } from '../src/explanation-references.js';
import { INPUTS_RULE } from '../src/agents/learn-artifact.js';
import { cycleSpec } from './explanation-layout-fixture.js';

const answers = kind => ({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95 } },
  kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} },
  needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 },
});
const NO_MATCH = 'how does a bakery decide how much dough to prepare for the next morning?';

test('typed seeded card, planned kind, no stored reference: the request the author gets carries the seeded examples, the card is delivered and the trace names the examples', async () => {
  const trace = {}; let sent = null;
  const answer = { title: 'Dough planning', visuals: [{ k: 'diagram', spec: cycleSpec('Plan') }], body: 'A bakery plans each morning from yesterday.\n\n[[visual:1]]\n\nThe plan repeats every day.' };
  const { log, warn } = console; console.log = () => {}; console.warn = () => {};
  let out;
  try { out = await generateArtifact({ SMALL_ENV: 'test' }, { command: 'explain', args: NO_MATCH, depth: 'balanced', planned: true, plan: planFromAnswers(answers('cycle')), requestSeed: 'seed-typed' }, { trace, callModel: async (_env, body) => { sent = body; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: answer }] }); } }); }
  finally { console.log = log; console.warn = warn; }
  assert.equal(out.result, 'artifact', 'the card is delivered');
  const system = [].concat(sent.system).join('\n');
  assert.ok(system.includes(SEEDED_EXAMPLES_HEADING), 'the author request carried the seeded examples heading');
  assert.ok(system.includes(INPUTS_RULE), 'and the inputs sentence');
  assert.ok(Array.isArray(trace.examples) && trace.examples.length >= 1, `trace.examples ${JSON.stringify(trace.examples)}`);
  assert.equal(trace.examplesKind, 'cycle');
  for (const id of trace.examples) assert.ok(system.includes(`"id":"${id}"`), `example ${id} is in the request`);
});
