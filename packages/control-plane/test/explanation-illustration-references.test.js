import assert from 'node:assert/strict';
import test from 'node:test';
import { illustrationReferences, transformerWalkthroughReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { bundledAuthorSchema, diagramBundle, selectDiagramReferences } from '../src/explanation-references.js';
import { stepRequest } from '../src/explanation-fast-chain.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { illustrateExplanation } from '../src/explanation-figures.js';
import { composeVisuals, dropInvalidDiagrams, explanationLayoutProblem, PRIMITIVES, settleExplanationBody } from '../src/learn-primitives.js';

const fastEnv = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'offline-fixture' };
const paraphrases = {
  'ml-transformer-qkv-projections': 'Where do the QKV projections come from?',
  'ml-self-attention-token-links': 'Can you explain the attention weights between tokens?',
  'ml-transformer-encoder-stack': 'Why repeat the transformer encoder layer?',
  'ml-llama-decoder-block': 'Walk me through a Llama decoder layer.',
  'ml-dense-vs-moe-architecture': 'How do dense vs MoE decoder blocks differ?',
  'ml-gemma-decoder-stack': 'What is inside the Gemma 3 text decoder?',
  'ml-moe-top-two-experts': 'What happens after an expert router picks the top 2 experts?',
};

for (const { id, prompts, spec } of illustrationReferences) {
  test(`${id}: original and paraphrase select the intended example for the author`, () => {
    for (const args of [prompts[0], paraphrases[id]]) {
      assert.ok(args, id);
      const [first] = selectDiagramReferences({ prompt: args });
      assert.equal(first?.id, id, args);
      assert.deepEqual(first.spec, spec);
      const request = prepareArtifactAuthorRequest(fastEnv, {
        command: 'explanation', args, visualRequirements: deriveVisualRequirements(args),
      });
      assert.ok(!request.result, args);
      assert.equal(request.diagramReferences[0]?.id, id);
      assert.ok(request.body.system.includes(JSON.stringify(first.spec)));
    }
  });
}

test('walkthrough learner prompts select the intended example at every depth', () => {
  for (const ref of transformerWalkthroughReferences) {
    assert.ok(ref.paraphrases.length >= 2, ref.id);
    assert.ok(ref.depths.overview && ref.depths.deep, ref.id);
    for (const prompt of [ref.prompts[0], ...ref.paraphrases]) {
      for (const depth of ['overview', 'standard', 'deep']) {
        const [picked] = selectDiagramReferences({ prompt, depth });
        const expected = ref.depths[depth] ?? ref;
        assert.equal(picked?.id, ref.id, `${depth}: ${prompt}`);
        assert.deepEqual(picked.spec, expected.spec);
        assert.deepEqual(picked.detailSpec, expected.detailSpec ?? undefined);
      }
    }
  }
});

const branches = schema => {
  const visual = (schema.properties.visuals.items.oneOf ?? schema.properties.visuals.items.anyOf).find(item => item.properties.spec);
  const d = visual.properties.spec.properties.diagram;
  return d.oneOf ?? d.anyOf;
};
const named = (schema, kind) => branches(schema).find(branch => branch.properties.kind.const === kind);
const bundle = options => bundledAuthorSchema(PRIMITIVES.explanation.schema, diagramBundle(options));
const ref = id => illustrationReferences.find(entry => entry.id === id);

test('new author schema branches and payloads are included only where steered', () => {
  const core = bundle({});
  for (const kind of ['tensor', 'token-links', 'block-stack']) {
    assert.equal(named(core, kind), undefined);
    const { items: [asked] } = deriveVisualRequirements(`Draw a ${kind} diagram`);
    assert.equal(asked.diagramKind, kind);
    assert.ok(named(bundle({ requiredKinds: [kind] }), kind));
  }
  const flow = named(core, 'flow').properties;
  assert.equal(flow.highlightPath.type, 'array');
  assert.ok(flow.nodes.items.required.includes('label'));
  assert.ok(!flow.nodes.items.properties.tensor);
  const projections = bundle({ references: [ref('ml-transformer-qkv-projections')] });
  assert.ok(named(projections, 'transformation').properties.before.properties.items.items.anyOf);
  assert.ok(!named(projections, 'relationship').properties.nodes.items.properties.tensor);
  const diff = bundle({ references: [ref('ml-dense-vs-moe-architecture')] });
  const panels = named(diff, 'comparison').properties.panels.items.properties.diagram;
  assert.ok((panels.oneOf ?? panels.anyOf).some(item => item.properties.kind.const === 'block-stack'));
  assert.equal(named(diff, 'block-stack'), undefined);
});

test('the Gemini fallback keeps a scoped weighted-token diagram', () => {
  const args = ref('ml-self-attention-token-links').prompts[0];
  const { body } = prepareArtifactAuthorRequest(fastEnv, { command: 'explanation', args });
  const request = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', body);
  const diagram = named(request.response_format.json_schema.schema, 'token-links');
  assert.ok(diagram.properties.queries.items.properties.weights);
});

test('Detailed Gemma supplies two separate specs and the final card checks detail indices', () => {
  const prompt = ref('ml-gemma-decoder-stack').prompts[0];
  const brief = selectDiagramReferences({ prompt, depth: 'overview' })[0];
  assert.ok(!brief.detailSpec);
  assert.ok(!brief.spec.diagram.callouts);
  assert.ok(brief.spec.diagram.blocks.every(block => !block.variant && !block.detail));
  const request = prepareArtifactAuthorRequest({}, { command: 'explanation', args: prompt, depth: 'deep' });
  const [detailed] = request.diagramReferences;
  const { spec, detailSpec } = detailed;
  assert.equal(detailed.id, brief.id);
  assert.equal(spec.diagram.blocks.find(block => block.detail).detail, 2);
  assert.ok(request.body.system.includes(JSON.stringify(detailSpec)));
  const diagrams = [spec, detailSpec].map(spec => ({ k: 'diagram', spec }));
  const body = composeVisuals('Gemma decoder.\n\n[[visual:1]]\n\nThe gated FFN uses two linear projections.\n\n[[visual:2]]\n\nThe gate combines the projections.', diagrams);
  assert.equal(explanationLayoutProblem({ body }, prompt), null);
  const missing = composeVisuals('Gemma decoder.\n\n[[visual:1]]\n\nThe feed-forward follows attention.', diagrams.slice(0, 1));
  assert.match(explanationLayoutProblem({ body: missing }, prompt), /explanation_bad_detail/);
});

test('a dropped visual preserves the remaining detail target in reading order', async () => {
  const { spec, detailSpec } = structuredClone(ref('ml-gemma-decoder-stack').depths.deep);
  const detailBlock = spec.diagram.blocks.find(block => block.detail);
  const main = { k: 'diagram', spec }, detail = { k: 'diagram', spec: detailSpec };
  const picture = { k: 'picture', p: 'Draw an abstract decoder', a: 'A Gemma decoder', c: 'Gemma overview' };
  const body = visuals => composeVisuals('Gemma decoder.\n\n[[visual:1]]\n\nThe decoder uses attention.\n\n[[visual:2]]\n\nThe gated feed-forward uses two projections.\n\n[[visual:3]]\n\nA gate combines both projections.', visuals);
  const early = { start: async () => null, settled: async () => {} };

  detailBlock.detail = 3;
  const authored = { body: body([picture, main, detail]) };
  assert.equal(explanationLayoutProblem(authored), null);
  const saved = await illustrateExplanation({}, authored, { early });
  assert.equal(explanationLayoutProblem(saved), null);
  assert.match(saved.body, /"detail":2/);
  const trimmed = settleExplanationBody(authored.body, { diagram: 2, illustration: 0 });
  assert.match(trimmed, /"detail":2/);
  const invalid = { k: 'diagram', spec: { version: 2, diagram: {} } };
  const dropped = dropInvalidDiagrams({ body: body([invalid, main, detail]) });
  assert.equal(dropped.dropped, 1);
  assert.match(dropped.block.body, /"detail":2/);

  const missing = await illustrateExplanation({}, { body: body([main, detail, picture]) }, { early });
  assert.doesNotMatch(missing.body, /"detail":/);
  assert.equal(explanationLayoutProblem(missing), null);
});

test('an invalid detail marker is stripped and the card delivers (transformer-block, content run 3)', () => {
  const prompt = 'what are the parts of a transformer block?';
  const block = (id, label, role, extra = {}) => ({ id, label, role, detail: 1, ...extra });
  const spec = { version: 1, diagram: { title: 'Transformer block stack', caption: 'Shows each sub\u2011layer in order from input to output', kind: 'block-stack', orientation: 'vertical', blocks: [
    block('emb', 'Embedding', 'embedding'), block('norm1', 'LayerNorm 1', 'norm'), block('attn', 'Self\u2011Attention', 'attention', { inputs: [{ label: 'Q' }, { label: 'K,V' }] }),
    block('norm2', 'LayerNorm 2', 'norm'), block('ff', 'Feed\u2011Forward', 'feedforward'), block('out', 'Residual Output', 'output')] } };
  const body = composeVisuals('A transformer block has attention and a feed-forward network.\n\n[[visual:1]]\n\nEach sub-layer is normalised, then its output is added back to its input.', [{ k: 'diagram', spec }]);
  assert.match(explanationLayoutProblem({ body }, prompt), /explanation_bad_detail/); // the validator is unchanged
  const logs = []; const log = console.log; console.log = line => logs.push(line);
  let settled; try { settled = settleExplanationBody(body); } finally { console.log = log; }
  assert.doesNotMatch(settled, /"detail"/);
  assert.equal(logs.filter(line => line.includes('explanation_diagram_dropped_element')).length, 6);
  assert.equal(explanationLayoutProblem({ body: settled }, prompt), null);
  assert.match(settled, /Transformer block stack/);
  assert.equal(settleExplanationBody(settled), settled);
});
