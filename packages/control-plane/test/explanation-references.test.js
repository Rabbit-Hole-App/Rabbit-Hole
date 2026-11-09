import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareArtifactAuthorRequest, generateArtifact } from '../src/learn-artifact.js';
import { selectDiagramReferences, diagramReferenceContext, CORE_KINDS, NEW_KINDS, QUANT_KINDS } from '../src/explanation-references.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';

const ready = args => prepareArtifactAuthorRequest({}, { command: 'explanation', args });

test('explicit requests for newly supported plots reach authoring instead of unsupported refusal', () => {
  for (const [prompt, kind] of [
    ['Show a correlation heatmap', 'heatmap'], ['Show a histogram', 'histogram'],
    ['Show a box plot', 'box-plot'], ['Draw a sample-set diagram', 'sample-set'],
    ['Draw a decision tree diagram', 'flow'], ['Draw a binary search tree diagram', 'tree'], ['Show a dendrogram', 'tree'],
  ]) {
    const requirements = deriveVisualRequirements(prompt);
    assert.equal(requirements.unsupported, undefined, prompt);
    assert.equal(requirements.items.find(item => item.kind === 'diagram')?.diagramKind, kind, prompt);
  }
});

test('a binary-tree operation puts real tree JSON references in the actual author request', () => {
  for (const args of ['How is a binary tree traversed in order?', 'Show me inserting 7 into a BST.']) {
    const prepared = ready(args);
    assert.ok(!prepared.result);
    const examples = prepared.diagramReferences;
    assert.ok(examples.length > 0 && examples.length <= 2);
    assert.ok(examples.some(e => e.spec.diagram.kind === 'tree' && e.spec.diagram.layout === 'binary'));
    for (const example of examples) {
      assert.deepEqual(parseTutorDiagram(example.spec), example.spec);
      assert.ok(prepared.body.system.includes(JSON.stringify(example.spec)));
    }
    assert.match([prepared.body.system, ...prepared.body.tools.map(t => t.description)].join('\n'), /illustrative/i); // the number rule sits under "# Numbers and maths" in the tool description
    assert.match(prepared.body.system, /source facts/i);
  }
});

test('folder and family-tree requests do not receive binary-tree examples', () => {
  for (const prompt of ['Explain a family tree', 'How do folders contain other folders?']) {
    const refs = selectDiagramReferences({ prompt });
    assert.ok(refs.length > 0);
    assert.ok(refs.every(r => r.spec.diagram.layout !== 'binary'));
  }
});

test('required kinds and actual learner words take precedence over broad source context', () => {
  const refs = selectDiagramReferences({ prompt: 'Compare numerical feature correlations', requiredKinds: ['heatmap'], context: 'Binary trees '.repeat(1000) });
  assert.ok(refs.length > 0 && refs.every(r => r.spec.diagram.kind === 'heatmap'));
  assert.ok(selectDiagramReferences({ prompt: 'How do folders work?', context: 'Binary tree traversal '.repeat(1000) }).every(r => r.spec.diagram.layout !== 'binary'));
});

test('reference context is bounded and does not change unrelated commands', () => {
  assert.ok(diagramReferenceContext(diagramReferences).length <= 14_000);
  const prepared = prepareArtifactAuthorRequest({}, { command: 'quiz', args: 'Ask me about binary trees' });
  assert.ok(!prepared.body?.system.includes('Approved diagram references'));
  assert.deepEqual(selectDiagramReferences({ prompt: 'Explain an unfamiliar general concept' }), []);
});

test('a repair retains the same reference context and saves the validated diagram JSON', async () => {
  const prepared = ready('How does a binary tree work?');
  const spec = prepared.diagramReferences.find(r => r.spec.diagram.kind === 'tree').spec;
  const title = spec.diagram.title;
  const valid = { title, visuals: [{ k: 'diagram', spec }], body: `A binary tree has at most two children per node. This example shows ${title}.\n\n[[visual:1]]\n\nEach child belongs to one parent, and the branches show their relationships.` };
  const seen = [];
  const result = await generateArtifact({}, { command: 'explanation', args: 'How does a binary tree work?' }, {
    callModel: async (_env, body) => {
      seen.push(body);
      return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name: 'make_explanation', input: seen.length === 1 ? { title: 'Incomplete', body: '' } : valid }] });
    },
  });
  assert.equal(result.result, 'artifact');
  assert.equal(seen.length, 2);
  assert.equal(seen[0].system, seen[1].system);
  assert.ok(result.block.body.includes(JSON.stringify(spec)));
});


test('required tree kind alone cannot select unrelated binary operations', () => {
  for (const args of ['Draw a hierarchy diagram of the animal kingdom.', 'Draw a tree diagram of our organizational structure.']) {
    const prepared = prepareArtifactAuthorRequest({}, { command: 'explanation', args,
      visualRequirements: deriveVisualRequirements(args) });
    assert.ok(prepared.diagramReferences.every(ref => ref.spec.diagram.layout !== 'binary'), args);
  }
  const references = selectDiagramReferences({ prompt: 'Draw a tree diagram of an unfamiliar ontology.', requiredKinds: ['tree'] });
  assert.deepEqual(references.map(ref => ref.id), ['shape-tree']);
  assert.equal(references[0].spec.diagram.layout, undefined);
});

// Owner A1 (2026-11-08): a fast-chain author gets a fixed schema bundle chosen by its references and required kinds; the plan path keeps the whole schema.
test('schema bundles: core by default, extras only when steered, the same bytes for the same bundle, the whole schema off the fast chain', () => {
  const FAST = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' };
  const author = (env, args) => { const v = deriveVisualRequirements(args); return prepareArtifactAuthorRequest(env, { command: 'explanation', args, ...(v.items?.length ? { visualRequirements: v } : {}) }).body.tools.find(t => t.name === 'make_explanation').input_schema; };
  const kinds = schema => { const spec = (schema.properties.visuals.items.oneOf ?? schema.properties.visuals.items.anyOf).find(v => v.properties.spec).properties.spec.properties.diagram; return (spec.oneOf ?? spec.anyOf).map(b => b.properties.kind.const); };
  const panels = schema => JSON.stringify(schema).includes('"panels"');
  const core = author(FAST, 'Why does the sky look blue?'); // attention now selects ml-transformer-attention (a matrix reference), which steers the quantitative group
  assert.deepEqual(kinds(core).sort(), [...CORE_KINDS].sort());
  assert.equal(panels(core), false);
  assert.equal(JSON.stringify(author(FAST, 'How do parakeets sleep?')), JSON.stringify(core), 'another unsteered question sends the same bytes');
  const box = author(FAST, 'What does a box plot call an outlier?');
  assert.deepEqual(kinds(box).sort(), [...CORE_KINDS, ...NEW_KINDS].sort(), 'a required new kind adds the new-kind group, not the quantitative one');
  const fit = author(FAST, 'Show a comparison diagram of underfitting and overfitting');
  assert.ok(panels(fit) && !JSON.stringify(fit).includes('"identity"'), 'a panel reference adds comparison panels only (the learner asked for the comparison: without that, or a comparison plan, the reference goes out as its one-plot single variant, owner 2026-11-08 overfitting card)');
  const bars = author(FAST, 'Show a bar chart of the votes');
  assert.ok(QUANT_KINDS.every(k => kinds(bars).includes(k)), 'a required quantitative kind adds the quantitative group');
  assert.equal(kinds(author({ SMALL_ENV: 'test' }, 'How does attention work in a transformer?')).length, 24, 'the plan path keeps every kind');
});

// Owner N1, M2, M4 (2026-11-08): one number rule in the whole request on both routes; the references last in the fast-chain system message, before the
// answer format; at most two panels in a bundle.
test('N1: the assembled request holds exactly one number rule on the plan route and on the fast chain', async () => {
  const { assembledSystem } = await import('../src/explanation-fast-chain.js');
  const N1 = "Never invent measurements, statistics or data about the real world. Use the learner's own numbers when the request or source gives any. Otherwise a diagram may use only the checked values of a selected reference, and its title or caption must say 'illustrative', or values you compute exactly from a formula the prose states, labelled 'worked example'.";
  const OTHER = /never invent numbers|label invented|example numbers|illustrative example|exact values from the request/i;
  const args = 'Show me inserting 7 into a BST.';
  const plan = prepareArtifactAuthorRequest({}, { command: 'explanation', args });
  const fast = prepareArtifactAuthorRequest({ SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' }, { command: 'explanation', args });
  assert.ok(plan.diagramReferences.length && fast.diagramReferences.length, 'a reference is selected, so its block is in the request');
  const planText = [plan.body.system, ...plan.body.tools.map(t => t.description)].join('\n');
  for (const [route, text] of [['plan', planText], ['fast chain', assembledSystem(fast.body)]]) {
    assert.equal(text.split(N1).length - 1, 1, `${route}: the rule once`);
    assert.equal(OTHER.test(text), false, `${route}: no second wording`);
  }
});

test('M2: the fast-chain system message is the system prompt, the tool guidance, the references, then the answer format', async () => {
  const { assembledSystem, stepRequest } = await import('../src/explanation-fast-chain.js');
  const { CHAIN_STEPS } = await import('../src/explanation-models.js');
  const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' };
  const bst = prepareArtifactAuthorRequest(env, { command: 'explanation', args: 'Show me inserting 7 into a BST.' }).body;
  const text = assembledSystem(bst), at = s => { const i = text.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('You make exactly one learning artifact') < at('For make_explanation') && at('For make_explanation') < at('Approved diagram references') && at('Approved diagram references') < at('Answer format for this request'));
  assert.equal(stepRequest(CHAIN_STEPS.fireworks, 'low', bst).messages[0].content, text, 'the step sends this text');
  // Two questions with different references share everything before the reference block.
  const other = assembledSystem(prepareArtifactAuthorRequest(env, { command: 'explanation', args: 'Show a correlation heatmap of features.' }).body);
  assert.equal(other.slice(0, at('Approved diagram references')), text.slice(0, at('Approved diagram references')));
});

test('M4: a panel bundle allows at most two panels', () => {
  const fit = prepareArtifactAuthorRequest({ SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' }, { command: 'explanation', args: 'Show a comparison diagram of underfitting and overfitting', visualRequirements: deriveVisualRequirements('Show a comparison diagram of underfitting and overfitting') }).body.tools.find(t => t.name === 'make_explanation').input_schema;
  const spec = (fit.properties.visuals.items.oneOf ?? fit.properties.visuals.items.anyOf).find(v => v.properties.spec).properties.spec.properties.diagram;
  assert.equal((spec.oneOf ?? spec.anyOf).find(b => b.properties.kind.const === 'comparison').properties.panels.maxItems, 2);
});
