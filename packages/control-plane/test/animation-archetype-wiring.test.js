// AN-20 (plan section 8; owner decision 13): the planner may name a scene archetype and carry assertions, and the author is given that archetype's rules and its one
// exemplar in the user content, never in the cached system block, and only when the plan names one. Offline: fake calls, no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM, authorTool } from '../src/agents/animation-author.js';
import { ARCHETYPES, ARCHETYPE_NAMES, archetypeRules } from '../src/agents/animation-archetypes.js';
import { PLAN_TOOL } from '../src/agents/animation-brief.js';
import { EXEMPLARS, archetypeContent, authorStage, exemplarDraft } from '../src/animation-author.js';
import { prepareStage } from '../src/animation-brief.js';
import { animationRequest } from '../src/animation-policy.js';
import { ANIMATION_CLIENT_FEATURES } from '../../web/src/animation3d/capabilities.js';
import { ASSERTION_KINDS, MAX_ASSERTIONS, PLAN_ARCHETYPES, validateAnimationPlan } from '../../web/src/animation3d/contract.js';
import { canonicalJson, sha256Hex } from '../../web/src/explain-program/contract.js';

const golden = JSON.parse(readFileSync(new URL('../../web/src/animation3d/testdata/sgd-golden.json', import.meta.url), 'utf8'));
const request = 'Show me how stochastic gradient descent works. Let me change the learning rate and batch size to see what happens.';
const named = { ...golden.plan, archetype: 'loss_surface', assertions: [{ kind: 'compare', parameter: 'learningRate', values: [0.1, 1.5] }, { kind: 'pathLength', min: 20 }] };
const jobOf = plan => ({ prompt: request, plan, features: [...ANIMATION_CLIENT_FEATURES], evidence: [], context: null });
const sentContent = async plan => { let spec; await authorStage(jobOf(plan), { call: async (_role, s) => { spec = s; return { input: { kind: 'capability_gap', gap: { reason: 'offline' } } }; } }); return spec; };

test('the archetype names are one list: the planner tool enum, the contract, and the data', () => {
  assert.deepEqual([...PLAN_ARCHETYPES], [...ARCHETYPE_NAMES], 'contract.js PLAN_ARCHETYPES equals ARCHETYPE_NAMES');
  assert.deepEqual(PLAN_TOOL.input_schema.properties.archetype.enum, ARCHETYPE_NAMES);
  for (const [name, a] of Object.entries(ARCHETYPES)) assert.ok(PLAN_TOOL.input_schema.properties.archetype.description.includes(`${name}: ${a.when}`), 'the tool describes each archetype by its own when');
  assert.equal(PLAN_TOOL.input_schema.required.includes('archetype') || PLAN_TOOL.input_schema.required.includes('assertions'), false, 'both are optional');
  const a = PLAN_TOOL.input_schema.properties.assertions;
  assert.deepEqual([a.maxItems, a.items.properties.kind.enum], [MAX_ASSERTIONS, ASSERTION_KINDS]);
});

test('the plan tool, less the two optional properties, is 51b6560cf\'s schema byte for byte', () => {
  const { archetype: _a, assertions: _s, ...kept } = PLAN_TOOL.input_schema.properties;
  const old = { ...PLAN_TOOL, input_schema: { ...PLAN_TOOL.input_schema, properties: kept } };
  assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'), 'a98018efadf0eb09f738be9a593d94fc4e909729f471ea5fb057cdaddb827a56');
});

test('the planner: a reply naming an archetype and assertions becomes a checked plan carrying both; a reply without them is unchanged', async () => {
  const reply = extra => ({ call: async () => ({ input: { title: golden.plan.title, description: golden.plan.description, experience: golden.plan.experience, reason: golden.plan.reason, behavior: golden.plan.behavior, controlProfile: golden.plan.controlProfile,
    parameters: golden.plan.parameters, interactions: golden.plan.interactions, assumptions: golden.plan.assumptions, limitations: golden.plan.limitations, requiredCapabilities: golden.plan.requiredCapabilities, requested: { features: [] }, ...extra } }) });
  const job = { prompt: request, refinement: null, plan: null, context: null, evidence: [], features: [...ANIMATION_CLIENT_FEATURES] };
  const withBoth = await prepareStage(job, reply({ archetype: 'loss_surface', assertions: named.assertions }));
  assert.deepEqual([withBoth.plan.archetype, withBoth.plan.assertions], ['loss_surface', named.assertions]);
  assert.equal(validateAnimationPlan(withBoth.plan).ok, true);
  // A clamp assertion may name no node (any sphere with clampTo): it is copied intact, with no node key added.
  const clampOnly = await prepareStage(job, reply({ archetype: 'loss_surface', assertions: [{ kind: 'clamp' }, ...named.assertions] }));
  assert.deepEqual(clampOnly.plan.assertions[0], { kind: 'clamp' });
  assert.equal('node' in clampOnly.plan.assertions[0], false);
  assert.equal(validateAnimationPlan(clampOnly.plan).ok, true);
  const plain = await prepareStage(job, reply({}));
  assert.equal('archetype' in plain.plan || 'assertions' in plain.plan, false, 'a plan that names none carries none');
  await assert.rejects(prepareStage(job, reply({ archetype: 'not_one' })), /not buildable after one correction: archetype/, 'an unknown archetype is refused by the contract, never passed on');
});

test('the author is given the archetype rules and the exemplar in the user content, never in the system prompt, and only when the plan names one', async () => {
  const spec = await sentContent(named), content = JSON.parse(spec.content);
  assert.equal(spec.system, ANIMATION_AUTHOR_SYSTEM, 'the system block is the same text for every plan');
  assert.deepEqual(Object.keys(content.archetype), ['name', 'rules', 'exemplar', 'note']);
  assert.equal(content.archetype.name, 'loss_surface');
  assert.equal(content.archetype.rules, archetypeRules('loss_surface'));
  assert.deepEqual(content.archetype.exemplar, exemplarDraft(golden.artifact), 'the exemplar is the golden artifact as a draft');
  for (const system of [ANIMATION_AUTHOR_SYSTEM, ANIMATION_REPAIR_SYSTEM]) { assert.equal(system.includes('Archetype loss_surface'), false); assert.equal(system.includes(golden.artifact.program.source.slice(0, 60)), false); }
  // A plan without an archetype gets exactly the content it always got.
  const plainContent = JSON.parse((await sentContent(golden.plan)).content);
  assert.deepEqual(Object.keys(plainContent), ['request', 'plan', 'context', 'evidence', 'capabilities']);
  assert.deepEqual(Object.keys(content), [...Object.keys(plainContent), 'archetype']);
  // An archetype the data does not know adds nothing (the contract refuses such a plan before this point).
  assert.equal('archetype' in JSON.parse((await sentContent({ ...golden.plan, archetype: 'zzz' })).content), false);
});

test('the exemplar is frozen at its hash and is not a fixture to copy: no title, no description, not one word of "offline fixture"', async () => {
  const draft = exemplarDraft(golden.artifact);
  assert.equal(await sha256Hex(canonicalJson(draft)), EXEMPLARS.loss_surface.sha256, 're-pin EXEMPLARS.loss_surface.sha256 in animation-author.js when the golden is frozen again');
  assert.equal('title' in draft || 'description' in draft || 'provenance' in draft || 'artifactId' in draft || 'planHash' in draft, false);
  assert.equal(/offline fixture/i.test(JSON.stringify(draft)), false);
  assert.equal(await archetypeContent('nope'), null);
  await assert.rejects(archetypeContent('loss_surface', { loss_surface: { ...EXEMPLARS.loss_surface, sha256: '0'.repeat(64) } }), { code: 'exemplar_changed' }, 'a changed golden fails the job loudly');
});

test('the request with the exemplar fits the author role at its input bound', async () => {
  const spec = await sentContent(named);
  assert.doesNotThrow(() => animationRequest({}, 'author', { system: spec.system, tool: authorTool(named), content: spec.content }));
  const bytes = Buffer.byteLength(spec.content);
  assert.ok(bytes > 9000 && bytes < 30000, `the user content is ${bytes} B`);
});
