import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await import('./interact-stepper-schema.js');
const fixtures = await Promise.all(Object.entries({ overview: 'brief', standard: 'balanced', deep: 'detailed' })
  .flatMap(([prefix, depth]) => ['merge-sort', 'tcp-handshake', 'mitosis'].map(async subject => {
    const stem = `../../../docs/features/interact/references/${prefix}-stepper-${subject}`;
    const [json, html] = await Promise.all([
      readFile(new URL(`${stem}.composition.json`, import.meta.url), 'utf8'),
      readFile(new URL(`${stem}.html`, import.meta.url), 'utf8'),
    ]);
    const match = /<script id="scene-model">const Scene = ([\s\S]*?);<\/script>/.exec(html);
    assert(match, `${prefix}/${subject} has an independently stored scene model`);
    const scene = JSON.parse(match[1]);
    return { subject, depth, composition: JSON.parse(json), cardWords: {
      title: scene.title, story: scene.concept, cardDescription: scene.concept, instructions: scene.instructions, heading: scene.heading,
    } };
  })));
const fixture = (subject = 'merge-sort', depth = 'brief') => structuredClone(fixtures.find(f => f.subject === subject && f.depth === depth).composition);

test('schema API admits a closed typed composition rather than an opaque data bag', () => {
  assert.equal(typeof schema.parseComposition, 'function');
  assert.equal(schema.parseComposition(fixture(), 'brief').ok, true);
});

for (const { subject, depth, composition } of fixtures) {
  test(`${subject} ${depth}: strict schema preserves every approved composition field`, () => {
    assert.deepEqual(schema.parseComposition(composition, depth), { ok: true, value: composition });
    assert.deepEqual(schema.compositionSchemaFor(depth).parse(composition), composition);
  });
}

test('unknown part binding fails at its exact data path', () => {
  const composition = fixture();
  composition.parts[1].bind.active = 'state.decorations';
  const result = schema.parseComposition(composition, 'brief');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].path, 'parts.1.bind.active');
});

test('unknown payload keys are refused rather than stripped', () => {
  const composition = fixture('mitosis');
  composition.data.variants[0].regions[0].payload.customDrawing = [[10, 20]];
  const result = schema.parseComposition(composition, 'brief');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].path, 'data.variants.0.regions.0.payload.customDrawing');
  assert.deepEqual(composition.data.variants[0].regions[0].payload.customDrawing, [[10, 20]]);
});

test('schemas distinguish canonical state tables and reject arbitrary executable fields', () => {
  const composition = fixture();
  composition.data.variants[0].states[0].endpoints = { client: { state: 'CLOSED', nextSeq: 0 } };
  const result = schema.parseComposition(composition, 'brief');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].path, 'data.variants.0.states.0.endpoints');
  const script = fixture(); script.script = 'return 1';
  assert.equal(schema.parseComposition(script, 'brief').failures[0].path, 'script');
});

test('all labels are nonblank and collection, state, variant and prose bounds are enforced', () => {
  const label = fixture(); label.data.variants[0].states[0].label = '   ';
  assert.equal(schema.parseComposition(label, 'brief').failures[0].path, 'data.variants.0.states.0.label');
  const words = fixture(); words.data.variants[0].states[0].sentence = 'x'.repeat(97);
  assert.equal(schema.parseComposition(words, 'brief').ok, false);
  const states = fixture(); states.data.variants[0].states.push(structuredClone(states.data.variants[0].states[0]));
  assert.equal(schema.parseComposition(states, 'brief').ok, false);
  const variants = fixture(); variants.data.variants.push(structuredClone(variants.data.variants[0]));
  assert.equal(schema.parseComposition(variants, 'brief').ok, false);
  const collection = fixture(); collection.data.variants[0].regions[0].values.push(5);
  assert.equal(schema.parseComposition(collection, 'brief').ok, false);
});

test('provider schema is closed and declares explicit array and string limits', () => {
  const json = schema.compositionJsonSchema('detailed');
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') assert.equal(node.additionalProperties, false);
    if (node.type === 'array') assert.equal(typeof node.maxItems, 'number');
    if (node.type === 'string' && !node.const && !node.enum) assert.equal(typeof node.maxLength, 'number');
    for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
  };
  visit(json);
  assert.equal(JSON.stringify(json).includes('customDrawing'), false);
});

test('the module declares a discrete still coordinate with a variant-resolved domain', async () => {
  const family = await import('./interact-family-stepper.js');
  assert.deepEqual(family.independent, { id: 'step', domain: [0, 7] });
  assert.equal(family.coordinate.kind, 'discrete');
  assert.equal(family.coordinate.onVariantChange, 'clamp-current-state');
  const composition = fixture('tcp-handshake', 'detailed');
  assert.deepEqual(family.resolveDomain(composition, { option: '0' }), [0, 5]);
  assert.deepEqual(family.resolveDomain(composition, { option: '1' }), [0, 7]);
  assert.throws(() => family.resolveDomain(composition, { option: '2' }), /variant/);
  assert.throws(() => family.resolveSelection(composition, { option: '0', step: 6 }), /step/);
  assert.throws(() => family.resolveSelection(composition, { option: '0', step: 1.5 }), /step/);
  assert.equal(family.resolveSelection(composition, { option: '1', step: 7 }).state.id, composition.data.variants[1].states[7].id);
  assert.equal(family.clampSelection(composition, { option: '0', step: 7 }).index, 5);
  assert.equal(family.clampSelection(composition, { option: '1', step: 5 }).index, 5);
  assert.throws(() => family.clampSelection(composition, { option: '0', step: -1 }), /step/);
});

for (const { subject, depth, composition, cardWords } of fixtures) {
  test(`${subject} ${depth}: family brief expands without formulas or a clock and round trips exactly`, async () => {
    const family = await import('./interact-family-stepper.js');
    const brief = family.referenceBrief(subject, depth), info = family.briefSchema(depth);
    assert.deepEqual(info.parse(brief), { ok: true, value: brief });
    assert.deepEqual(brief.composition, composition);
    assert.deepEqual({ title: brief.title, story: brief.story, cardDescription: brief.cardDescription, instructions: brief.instructions, heading: brief.words.heading }, cardWords);
    const plan = family.expandBrief(brief, depth, { catalogueHash: 'a'.repeat(64) });
    assert.deepEqual(plan.scene.data, composition);
    assert.deepEqual(plan.scene.quantities, []);
    assert.deepEqual(plan.scene.slots, {});
    assert.deepEqual(plan.scene.readoutIds, []);
    assert.equal(plan.mode.timeline, null);
    assert.deepEqual(plan.mode.fixedValues, {});
    assert.equal(plan.mode.kind, 'static');
    assert.equal(plan.controls.some(c => ['number', 'playback', 'scrubber', 'seek'].includes(c.type)), false);
    assert.equal(plan.controls.find(c => c.type === 'index').items.length, composition.data.variants[0].states.length);
    assert.equal(plan.controls.find(c => c.type === 'index').default, 0);
    assert(plan.scene.runtime.requiredCapabilities.includes('inputs_v2'));
    if (depth !== 'brief') assert.equal(plan.controls.find(c => c.type === 'select').default, '0');
    assert.deepEqual(family.extractBrief(plan), brief);
    assert.deepEqual(family.expandBrief(family.extractBrief(plan), depth, { catalogueHash: 'a'.repeat(64) }), plan);
    assert.deepEqual(family.context({ scene: plan.scene }), { range: { composition, words: brief.words }, units: {} });
  });
}

test('family checks reject unknown known-object references before generation', async () => {
  const family = await import('./interact-family-stepper.js');
  const bad = family.referenceBrief('merge-sort', 'brief');
  bad.composition.data.variants[0].states[0].active = ['missing'];
  const result = family.check(bad, 'brief');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unknown_region');
  assert.equal(result.failures[0].path, 'composition.data.variants.0.states.0.active.0');
  const step = family.referenceBrief('merge-sort', 'brief'); step.composition.controls[0].default = 4;
  const outside = family.check(step, 'brief');
  assert.equal(outside.ok, false);
  assert.equal(outside.failures[0].code, 'state_index');
  assert.equal(outside.failures[0].path, 'composition.controls.0.default');
});

test('renaming a region and all its references cannot invent a renderer preset anchor', async () => {
  const family = await import('./interact-family-stepper.js');
  const bad = family.referenceBrief('merge-sort', 'brief'), variant = bad.composition.data.variants[0];
  const rename = value => value === 'input' ? 'renamedInput' : value;
  variant.regions.forEach(region => { region.id = rename(region.id); });
  variant.links.forEach(link => { link.from = rename(link.from); link.to = rename(link.to); });
  variant.states.forEach(state => { state.active = state.active.map(rename); state.calloutRegion = rename(state.calloutRegion); });
  assert.equal(schema.parseComposition(bad.composition, 'brief').ok, true);
  const result = family.check(bad, 'brief');
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, 'unknown_anchor');
  assert.equal(result.failures[0].path, 'composition.data.variants.0.regions.0.id');
  assert.throws(() => family.expandBrief(bad, 'brief'), error => error instanceof family.StepperBriefError && error.code === 'unknown_anchor');
});

test('basic checks report partial coverage and the independent reference check fails closed', async () => {
  const family = await import('./interact-family-stepper.js');
  const brief = family.referenceBrief('mitosis', 'detailed');
  const basic = family.check(brief, 'detailed');
  assert.equal(basic.ok, true);
  assert.equal(basic.coverage.complete, false);
  assert.equal(basic.checked.schema, 1);
  assert(basic.checked.domains > 0 && basic.checked.bindings > 0);
  assert.equal(basic.checked.transitions, 0);
  assert.equal(basic.checked.reference, 0);
  const proof = family.referenceCheck(brief, 'detailed');
  assert.equal(proof.ok, false);
  assert.equal(proof.failures[0].code, 'reference_unproved');
  assert.equal(proof.failures[0].path, 'composition');
  brief.composition.data.variants[0].states[0].calloutRegion = 'missing';
  assert.equal(family.referenceCheck(brief, 'detailed').failures[0].code, 'unknown_region');
});

test('malformed briefs and unknown depths return structured check failures', async () => {
  const family = await import('./interact-family-stepper.js');
  assert.equal(family.check(null, 'brief').ok, false);
  assert.equal(family.check({}, 'future').failures[0].path, 'depth');
  assert.throws(() => family.expandBrief({}, 'brief'), error => error instanceof family.StepperBriefError && error.code === 'schema');
  assert.throws(() => family.extractBrief({ depth: 'brief', scene: { data: fixture(), words: {} } }), family.StepperBriefError);
});

test('family-owned provider brief never falls back to scalar-formula fields', async () => {
  const family = await import('./interact-family-stepper.js');
  const info = family.briefSchema('brief');
  assert.deepEqual(Object.keys(info.jsonSchema.properties), ['title', 'story', 'cardDescription', 'instructions', 'composition', 'words']);
  assert.deepEqual(info.keys.formulas, []);
  assert.deepEqual(family.FAMILY.depths.brief.roles, []);
  const wrong = family.referenceBrief('merge-sort', 'brief'); wrong.formulas = {};
  assert.equal(info.parse(wrong).failures[0].path, 'formulas');
  wrong.words = { ...wrong.words, data: JSON.stringify(wrong.composition) };
  assert.equal(info.parse(wrong).ok, false);
});

test('built-in registration admits typed scene.data at all nine composition depths', async () => {
  const { referenceBrief, expandBrief } = await import('./interact-family-stepper.js');
  const { ScenePlanSchema, planProblems } = await import('./interact-plan.js');
  for (const { subject, depth } of fixtures) {
    const plan = expandBrief(referenceBrief(subject, depth), depth, { catalogueHash: 'a'.repeat(64) });
    assert.deepEqual(planProblems(plan), []);
    const parsed = ScenePlanSchema.safeParse(plan);
    assert.equal(parsed.success, true, JSON.stringify(parsed.error));
    assert.deepEqual(parsed.data.scene.data, plan.scene.data);
    const { data, ...withoutData } = plan.scene;
    assert.ok(planProblems({ ...plan, scene: withoutData }).some(problem => problem.path.join('.') === 'scene.data'));
    assert.deepEqual(data, plan.scene.data);
  }
});
