// What the author is shown for a declared reference (diagramReferenceContext), the answer schema of such a request (diagramBundle / bundledAuthorSchema, the Gemini limit) and the request of every other reference,
// which stays main's, byte for byte. Offline: nothing is sent.
import assert from 'node:assert/strict';
import test from 'node:test';
import { diagramBundle, bundledAuthorSchema, diagramReferenceContext } from '../src/explanation-references.js';
import { assembledSystem, GEMINI_PROPERTY_LIMIT, schemaProperties, stepRequest } from '../src/explanation-fast-chain.js';
import { EXPLANATION_NUMBER_RULE, INPUTS_RULE, NUMBER_RULE } from '../src/agents/learn-artifact.js';
import { planFromAnswers } from '../src/explanation-planner.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { hasFunction, isDeclared } from '../../web/src/tutor-diagrams/calculation.js';
import { authorJsonSchema, tutorDiagramJsonSchema } from '../../web/src/tutor-diagrams/spec.js';

const reference = id => diagramReferences.find(ref => ref.id === id);
const atStandard = ref => ({ ...ref, ...ref.depths?.standard }); // what selection hands the author at the default depth
const topK = atStandard(reference('ml-sampling-top-k')), softmax = reference('softmax-probabilities'), meanBaseline = reference('regression-mean-baseline');
const confusion = reference('confusion-matrix-counts'), tokenLinks = reference('ml-self-attention-token-links');
const plain = diagramReferences.find(ref => !ref.calculation && !ref.detailSpec && ref.spec.diagram.kind === 'flow');
// The literal wording of main (aee3dba82) for a request that shows no declared reference.
const MAIN_HEADING = '\n# Examples\nApproved diagram references (examples, not source facts). Use their supported structure and layout when appropriate. Adapt labels and relationships to the learner\'s question. Do not copy example prose, force a reference, or exceed this card\'s visual count.\n';
const lines = context => context.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
const startingNumbers = context => context.match(/these starting numbers, in this order, [^:]+: ([0-9, ]+)\. Do not mention/)?.[1].split(', ').map(Number);

test('a declared reference is masked: every number is "?", the names stay, a number inside a useWhen too', () => {
  const [line] = lines(diagramReferenceContext([{ ...softmax, useWhen: 'Compare 3 rows, 0.5 share, 12%' }]));
  assert.equal(line.id, 'softmax-probabilities');
  assert.equal(line.useWhen, 'Compare ? rows, ? share, ?%');
  const { diagram } = line.spec;
  assert.equal(diagram.kind, 'bar-chart');
  assert.equal(diagram.variant, 'grouped');
  assert.deepEqual(diagram.categories, ['Cat', 'Dog', 'Bird']);
  assert.deepEqual(diagram.series.map(series => series.values), [['?', '?', '?'], ['?', '?', '?']]);
  assert.deepEqual(diagram.series.map(series => series.label), ['Input A', 'Input B']);
  const [meanLine] = lines(diagramReferenceContext([meanBaseline]));
  assert.deepEqual(meanLine.spec.diagram.series[0].points.map(point => [point.x, point.y]), Array.from({ length: 5 }, () => ['?', '?']));
  assert.equal(meanLine.spec.diagram.x.label, 'Sample');
  assert.deepEqual([meanLine.spec.diagram.x.min, meanLine.spec.diagram.x.max], ['?', '?'], 'the axis limits are numbers too; the axis label stays');
});

test('a placeholder stays, the variables limits stay, a stored value is masked', () => {
  const [mean] = lines(diagramReferenceContext([meanBaseline]));
  assert.equal(mean.spec.diagram.annotations[0].label, 'Mean prediction of {{v:mean}}');
  assert.equal(mean.spec.diagram.annotations[0].value, '?');
  const [line] = lines(diagramReferenceContext([topK]));
  const { diagram } = line.spec;
  assert.equal(diagram.title, 'Full softmax and top-{{v:k}} sampling');
  assert.match(diagram.caption, /^The kept tokens originally hold \{\{v:keptShare\}\}% of the probability/);
  assert.equal(diagram.series[1].label, 'Top-{{v:k}} renormalized');
  assert.deepEqual(diagram.categories, ['on', 'near', 'under', 'by', 'in'], 'names keep their text');
  const variable = name => diagram.variables.find(entry => entry.name === name);
  assert.deepEqual(variable('k'), { name: 'k', role: 'input', type: 'int', min: 1, max: 7, value: '?' }, 'the limits stay, the stored value is masked');
  assert.deepEqual(variable('weights').value, ['?', '?', '?', '?', '?']);
  assert.deepEqual([variable('weights').min, variable('weights').max], [1, 1000]);
  assert.deepEqual(variable('full'), { name: 'full', role: 'result', type: 'float', min: 0, max: 100, at: 'series.0.values' }, 'a drawn result has no stored value: it is shown as it is');
  const numbers = [];
  const walk = (node, inVariables, key) => {
    if (typeof node === 'number') { if (!(inVariables && (key === 'min' || key === 'max'))) numbers.push(node); } else if (Array.isArray(node)) node.forEach(item => walk(item, inVariables, key));
    else if (node && typeof node === 'object') for (const [name, item] of Object.entries(node)) walk(item, inVariables || name === 'variables', name);
  };
  walk(diagram, false, '');
  assert.deepEqual(numbers, [], 'no number is left except the limits of the variables');
});

test('masking writes a line only: the reference object itself is not changed', () => {
  const before = JSON.stringify(topK);
  diagramReferenceContext([topK, softmax], 'seed-a');
  assert.equal(JSON.stringify(topK), before);
});

test('the shape example and the seeded examples are not masked, nor is a reference that does not declare', () => {
  const [line] = lines(diagramReferenceContext([plain]));
  assert.deepEqual(line.spec, plain.spec);
  assert.equal(line.useWhen, plain.useWhen);
  const [shape] = lines(diagramReferenceContext([{ ...softmax, shape: true }]));
  assert.deepEqual(shape.spec, softmax.spec);
});

test('an undeclared reference: its line and its heading are exactly main\'s, with or without a seed', () => {
  const expected = MAIN_HEADING + JSON.stringify({ id: plain.id, useWhen: plain.useWhen, spec: plain.spec }) + '\n';
  assert.equal(diagramReferenceContext([plain]), expected);
  assert.equal(diagramReferenceContext([plain], 'seed-a'), expected, 'a seed adds nothing for a reference that does not declare');
  assert.equal(diagramReferenceContext([{ ...softmax, shape: true }]).startsWith(MAIN_HEADING), true, 'a shape example is not a declared reference');
  assert.equal(diagramReferenceContext([]), '');
  assert.equal(diagramReferenceContext([plain]).includes('"?"'), false);
});

test('the heading: main\'s for no declared reference, the declared wording when one is shown', () => {
  const declared = diagramReferenceContext([softmax]);
  assert.equal(declared.startsWith(MAIN_HEADING), false);
  assert.ok(declared.startsWith('\n# Examples\nApproved diagram references (examples, not source facts). An example on this card\'s subject shows a correct structure: keep its structure and its facts.'));
  assert.match(declared, /Write your own version of what is illustrative in it: the example items, their names, the input values and the title\./);
  assert.match(declared, /A "\?" in an example stands for a number that was removed: choose your own\./);
  assert.equal(declared.includes('Use their supported structure'), false);
  const mixed = diagramReferenceContext([plain, softmax]);
  assert.ok(mixed.includes('Write your own version of what is illustrative'), 'a request that shows a declared reference gets the declared wording');
  assert.deepEqual(lines(mixed)[0].spec, plain.spec, 'the undeclared example in it is still shown as stored');
  assert.deepEqual(lines(mixed)[1].spec.diagram.series[0].values, ['?', '?', '?']);
  assert.ok(declared.startsWith('\n# Examples\n'), 'the mark of the examples block is the same first line');
});

test('the starting-numbers sentence: only for a declared reference and a seed, ending "Do not mention these starting numbers in the card."', () => {
  for (const ref of [softmax, confusion, tokenLinks, topK]) {
    const seeded = diagramReferenceContext([ref], 'seed-a');
    assert.match(seeded, / For this card, build your input values from these starting numbers, in this order, scaling or rounding them where the diagram needs shares or weights: [0-9, ]+\. Do not mention these starting numbers in the card\./, ref.id);
    assert.equal(diagramReferenceContext([ref]).includes('starting numbers'), false, `${ref.id}: no seed, no sentence`);
    assert.equal(diagramReferenceContext([ref], null).includes('starting numbers'), false);
    assert.equal(diagramReferenceContext([ref], '').includes('starting numbers'), false);
  }
  assert.equal(diagramReferenceContext([plain], 'seed-a').includes('starting numbers'), false, 'an undeclared reference never gets one');
  const text = diagramReferenceContext([softmax], 'seed-a');
  assert.ok(text.includes('Do not mention these starting numbers in the card. You choose the inputs'), 'the sentence ends there');
});

test('the starting numbers: eight distinct whole numbers from 5 to 60; the same seed gives the same, another seed others', () => {
  const numbers = seed => startingNumbers(diagramReferenceContext([softmax], seed));
  const a = numbers('seed-a');
  assert.equal(a.length, 8);
  assert.equal(new Set(a).size, 8, 'distinct');
  assert.ok(a.every(number => Number.isInteger(number) && number >= 5 && number <= 60), a.join(','));
  assert.deepEqual(numbers('seed-a'), a, 'the same seed, the same numbers');
  assert.notDeepEqual(numbers('seed-b'), a, 'another seed, others');
  const drawn = new Set(Array.from({ length: 20 }, (_, i) => numbers(`seed-${i}`).join(',')));
  assert.ok(drawn.size >= 19, `20 seeds draw ${drawn.size} different sets`);
  for (let i = 0; i < 20; i++) { const n = numbers(`seed-${i}`); assert.equal(new Set(n).size, 8); assert.ok(n.every(x => x >= 5 && x <= 60 && Number.isInteger(x))); }
  assert.deepEqual(startingNumbers(diagramReferenceContext([confusion], 'seed-a')), a, 'the numbers follow the seed, not the reference');
});

test('the "You choose the inputs of the variables list..." sentence: only for a reference with a function', () => {
  const sentence = 'You choose the inputs of the variables list; the results are computed for you from them, and a number from the variables written in a title, a caption, a label or a sentence is written as {{v:name}}, never typed.';
  for (const ref of [softmax, meanBaseline, topK]) {
    assert.ok(diagramReferenceContext([ref]).includes(sentence), `${ref.id}`);
    assert.ok(diagramReferenceContext([ref], 'seed-a').includes(sentence), `${ref.id} seeded`);
  }
  for (const ref of [confusion, tokenLinks]) {
    assert.equal(diagramReferenceContext([ref]).includes('You choose the inputs'), false, `${ref.id}: declared none`);
    assert.equal(diagramReferenceContext([ref], 'seed-a').includes('You choose the inputs'), false);
  }
  assert.equal(diagramReferenceContext([plain], 'seed-a').includes('You choose the inputs'), false);
  assert.ok(diagramReferenceContext([plain, softmax]).includes(sentence));
});

// ---- the request: number rule, bundle, Gemini limit ----
const GOOGLE = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const FIREWORKS = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' };
const plan = kind => ({ ...planFromAnswers({ visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95 } }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 } }), ms: 100 });
const prepare = (env, ref, { planned = true, seed = 'seed-a' } = {}) => {
  const { log } = console; console.log = () => {};
  try { return prepareArtifactAuthorRequest(env, { command: 'explanation', args: ref.prompts[0], depth: 'standard', requestSeed: seed, ...(planned ? { planned: true, plan: plan(ref.spec.diagram.kind) } : {}) }); } finally { console.log = log; }
};
const explanationTool = prepared => prepared.body.tools.find(tool => tool.name === 'make_explanation');
const diagramBranches = schema => {
  const visual = (schema.properties.visuals.items.oneOf ?? schema.properties.visuals.items.anyOf).find(item => item.properties.spec);
  const diagram = visual.properties.spec.properties.diagram;
  return diagram.oneOf ?? diagram.anyOf;
};
const FUNCTION_REFERENCES = diagramReferences.filter(hasFunction);

test('the references with a function are the three of the change set (the tests below are written for each)', () => {
  assert.deepEqual(FUNCTION_REFERENCES.map(ref => ref.id).sort(), ['ml-sampling-top-k', 'regression-mean-baseline', 'softmax-probabilities']);
});

for (const ref of FUNCTION_REFERENCES) {
  for (const planned of [false, true]) {
    test(`${ref.id}${planned ? ' (planned)' : ''}: the Gemini answer schema holds at most ${GEMINI_PROPERTY_LIMIT} properties and carries variables`, () => {
      const prepared = prepare(GOOGLE, ref, { planned });
      assert.ok(prepared.diagramReferences.some(shown => shown.id === ref.id), 'the reference is the one shown');
      const schema = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepared.body).response_format.json_schema.schema;
      assert.ok(schemaProperties(schema) <= GEMINI_PROPERTY_LIMIT, `${schemaProperties(schema)} properties`);
      assert.ok(JSON.stringify(schema).includes('"variables"'), 'variables is in the schema');
    });
  }

  test(`${ref.id}: the fast-chain bundle adds variables, required, to the branch of its kind only; value is a number or a list of numbers`, () => {
    const kind = ref.spec.diagram.kind, prepared = prepare(FIREWORKS, ref);
    const branches = diagramBranches(explanationTool(prepared).input_schema);
    const withVariables = branches.filter(branch => branch.properties.variables);
    assert.deepEqual(withVariables.map(branch => branch.properties.kind.const), [kind]);
    assert.ok(withVariables[0].required.includes('variables'));
    const value = withVariables[0].properties.variables.items.properties.value;
    assert.equal(value.anyOf.length, 2);
    assert.equal(value.anyOf[0].type, 'number');
    assert.equal(value.anyOf[1].type, 'array');
    assert.equal(value.anyOf[1].items.type, 'number');
    assert.deepEqual(diagramBundle({ references: [ref] }).variablesKinds, [kind]);
  });

  test(`${ref.id}: its request carries the explanation number rule in place of main's and the inputs and starting-numbers sentences`, () => {
    const prepared = prepare(FIREWORKS, ref), description = explanationTool(prepared).description, system = [].concat(prepared.body.system).join('\n');
    assert.ok(description.includes(EXPLANATION_NUMBER_RULE));
    assert.equal(description.includes(NUMBER_RULE), false);
    assert.equal([system, description].join('\n').split(EXPLANATION_NUMBER_RULE).length - 1, 1, 'the rule once');
    assert.ok(system.includes('Do not mention these starting numbers in the card.'));
    assert.ok(system.includes('You choose the inputs of the variables list'));
    assert.equal(system.includes(INPUTS_RULE), false, 'the seeded-examples inputs rule is for the seeded examples only');
    assert.ok(assembledSystem(prepared.body).includes('Write your own version of what is illustrative'));
  });
}

test('a reference that needs no calculation, and every other reference, carry no variables in the answer schema', () => {
  for (const ref of [confusion, tokenLinks]) {
    const prepared = prepare(GOOGLE, ref);
    const schema = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepared.body).response_format.json_schema.schema;
    assert.equal(JSON.stringify(schema).includes('"variables"'), false, ref.id);
    assert.ok(schemaProperties(schema) <= GEMINI_PROPERTY_LIMIT);
    assert.equal(diagramBundle({ references: [ref] }).variablesKinds, undefined);
    assert.equal(JSON.stringify(explanationTool(prepare(FIREWORKS, ref)).input_schema).includes('"variables"'), false, `${ref.id} on the fast chain`);
  }
  const others = prepare(FIREWORKS, plain);
  assert.equal(JSON.stringify(explanationTool(others).input_schema).includes('"variables"'), false);
});

test('the author and the full JSON schemas carry no variables, and the whole schema off the fast chain does not either', () => {
  assert.equal(JSON.stringify(authorJsonSchema()).includes('"variables"'), false);
  assert.equal(JSON.stringify(tutorDiagramJsonSchema).includes('"variables"'), false);
  const off = prepare({}, softmax, { planned: false });
  assert.equal(JSON.stringify(explanationTool(off).input_schema).includes('"variables"'), false, 'no bundle off the fast chain: the whole schema is main\'s');
  // bundledAuthorSchema without variablesKinds changes nothing about variables
  const schema = explanationTool(prepare(FIREWORKS, plain)).input_schema;
  assert.equal(JSON.stringify(bundledAuthorSchema(schema, {})).includes('"variables"'), false);
});

test('an undeclared reference: the request is main\'s (its number rule, its heading, no masking, no starting numbers even with a seed)', () => {
  for (const [args, env] of [['Show me inserting 7 into a BST.', FIREWORKS], ['How is a binary tree traversed in order?', {}], ['How does a random forest combine the predictions of its trees into one answer?', FIREWORKS]]) {
    for (const requestSeed of [null, 'seed-a']) {
      const { log } = console; console.log = () => {};
      let prepared; try { prepared = prepareArtifactAuthorRequest(env, { command: 'explanation', args, ...(requestSeed ? { requestSeed } : {}) }); } finally { console.log = log; }
      assert.ok(prepared.diagramReferences.length > 0 && prepared.diagramReferences.every(ref => !isDeclared(ref)), `${args}: only undeclared references`);
      const description = explanationTool(prepared).description, system = [].concat(prepared.body.system).join('\n');
      assert.ok(description.includes(NUMBER_RULE), 'main\'s number rule, exactly');
      assert.equal(description.includes('worked example of your own'), false);
      assert.equal(description.includes(EXPLANATION_NUMBER_RULE), false);
      assert.ok(system.includes(MAIN_HEADING), 'main\'s heading, exactly');
      assert.equal(system.includes('"?"'), false, 'no masking');
      assert.equal(system.includes('starting numbers'), false);
      assert.equal(system.includes('You choose the inputs of the variables list'), false);
      assert.equal(system.includes(INPUTS_RULE), false);
      assert.equal(system.includes('{{v:'), false);
      for (const ref of prepared.diagramReferences) assert.ok(system.includes(JSON.stringify(ref.spec)), 'every example is shown as stored');
    }
  }
});
