// Blocking check (owner 2026-11-08): every steered schema bundle that carries tensor / token-links / block-stack stays under Gemini's recorded 362-property limit
// after the Gemini reductions (stepRequest), and the unsteered bundle carries none of the three kinds. Offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { stepRequest } from '../src/explanation-fast-chain.js';
import { planFromAnswers } from '../src/explanation-planner.js';

const LIMIT = 362; // explanation-fast-chain.js GEMINI_PROPERTY_LIMIT (accepted at 362, refused at 368)
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const plan = kind => ({ ...planFromAnswers({ visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95 } }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 } }), ms: 100 });
const geminiSchema = (args, kind = null) => {
  const prepared = prepareArtifactAuthorRequest(env, { command: 'explanation', args, depth: 'standard', ...(kind ? { planned: true, plan: plan(kind) } : {}) });
  return stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepared.body).response_format.json_schema.schema;
};

const STEERED = [
  ['planner picks tensor', 'what is a vector embedding?', 'tensor'],
  ['planner picks token-links', 'which words does a model focus on?', 'token-links'],
  ['planner picks block-stack', 'how is a neural network layer arranged?', 'block-stack'],
  ['QKV projections reference', 'How does a transformer get query, key and value vectors from one token?'],
  ['self-attention token links reference', 'When the word sat attends to the sentence the cat sat on the mat, which words matter most?'],
  ['encoder stack reference', 'What is inside one transformer encoder layer and why is it repeated?'],
  ['Llama decoder block reference', 'What happens inside one Llama-style decoder block?'],
  ['dense vs MoE reference', 'How does a dense decoder block differ from one with mixture-of-experts feed-forward layers?'],
  ['MoE top-two reference', 'How does a mixture-of-experts router choose the top two experts for one token?'],
  ['Gemma decoder stack reference', 'How is the Gemma 3 27B decoder arranged and what is inside its feed-forward block?'],
];
for (const [name, args, kind] of STEERED) {
  test(`Gemini bundle under the property limit: ${name}`, () => {
    const count = props(geminiSchema(args, kind));
    assert.ok(count <= LIMIT, `${name}: ${count} properties, limit ${LIMIT}`);
  });
}

test('no bundle offers `smooth` to the author (Codex smooth curves are renderer-side): the extended plot series carries no `smooth` property', () => {
  for (const [args, kind] of [['what is a vector embedding?', 'tensor'], ['how does the sigmoid function work?', 'coordinate-plot'], ['what is overfitting?'], ['how does the water cycle work?']]) assert.ok(!JSON.stringify(geminiSchema(args, kind)).includes('"smooth"'), args);
});

test('the planner-steered bundle carries its kind, and the unsteered bundle carries none of the three illustration kinds', () => {
  for (const kind of ['tensor', 'token-links', 'block-stack']) assert.ok(JSON.stringify(geminiSchema('what is a vector embedding?', kind)).includes(`"const":"${kind}"`), kind);
  const plain = JSON.stringify(geminiSchema('how does the water cycle work?'));
  for (const kind of ['tensor', 'token-links', 'block-stack']) assert.ok(!plain.includes(`"const":"${kind}"`), `unsteered bundle must not carry ${kind}`);
});

test('the unsteered bundle is unchanged by the three illustration kinds: 134 properties, 9,833 characters (measured before the kinds were added)', () => {
  for (const args of ['how does the water cycle work?', 'how does the TCP handshake work?', 'stack vs queue']) { const s = geminiSchema(args); assert.equal(props(s), 134, args); assert.equal(JSON.stringify(s).length, 9833, args); }
});
