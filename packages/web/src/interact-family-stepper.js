import { z } from 'zod';
import { SUPPORTED_PROGRAM_TUPLES } from './explain-program/stamps.js';
import { referenceCardWords, referenceComposition } from './interact-stepper-data.js';
import { id, pickCriterion, templates, independent, templateData } from './interact-family-stepper-data.js';
import { STEPPER_PLANS } from './interact-stepper-plans.js';
import { TREE_TRACE_PLAN } from './interact-tree-trace-plan.js';
import * as stepperScene from './interact-templates/stepper-scene.js';
import * as treeTrace from './interact-templates/tree-trace.js';
import * as treeMotion from './interact-templates/tree-motion.js';
import * as voteMotion from './interact-templates/vote-motion.js';
import * as pendulum from './interact-templates/pendulum.js';
import { PENDULUM_PLANS } from './interact-pendulum-plan.js';
import { MOTION_PLANS } from './interact-motion-plans.js';
import {
  canonicalIds, DEPTH_LIMITS, WORDS, compositionSchemaFor, fillCompositionSchemaFor, parseComposition, plainText, schemaFailures, wordsSchema,
} from './interact-stepper-schema.js';

export { id, pickCriterion, templates, independent, templateData };
export const coordinate = Object.freeze({
  kind: 'discrete', id: 'step', integer: true, stateCollection: 'composition.data.variants[option].states',
  domainRule: '0..states.length-1', nativeItemIdRule: 'state followed by the zero-based position', onVariantChange: 'clamp-current-state', resolveDomain,
});
export const scalarRoles = Object.freeze([]);
export const scalars = Object.freeze([]);
export const parameters = Object.freeze({
  'algorithm-over-collection': Object.freeze({ id: 'option', label: 'Starting array', meaning: 'Choose the admitted starting collection.', options: Object.freeze(['Mixed', 'Already sorted']) }),
  'protocol-between-parties': Object.freeze({ id: 'option', label: 'Lose SYN-ACK', meaning: 'Choose whether the first reply is lost.', options: Object.freeze(['No', 'Yes']) }),
  'cycle-of-phases': Object.freeze({ id: 'option', label: 'Focus', meaning: 'Emphasize chromosomes or the spindle in the same phase sequence.', options: Object.freeze(['Chromosomes', 'Spindle']) }),
});
export const INPUTS = Object.freeze({
  step: Object.freeze({ label: 'State', unit: '', meaning: 'Select one admitted integer position in the current variant state table.', reference: '0 through states.length - 1, inclusive.', kind: 'index', integer: true, domain: Object.freeze([0, 7]) }),
  option: Object.freeze({ label: 'Variant', unit: '', meaning: 'Select a declared data variant; its state domain resolves from the same table.', reference: 'A declared variant index, encoded by the native select as a string.', kind: 'select', parameters }),
});
// Data roles describe binding types; none is a scalar formula quantity.
export const ROLES = Object.freeze({
  states: Object.freeze({ label: 'Ordered states', type: 'State[]', meaning: 'The admitted discrete state table.' }),
  regions: Object.freeze({ label: 'Picture regions', type: 'Region[]', meaning: 'Stable semantic regions in the fixed picture.' }),
  links: Object.freeze({ label: 'Picture links', type: 'Link[]', meaning: 'Declared structural relationships between picture regions.' }),
  counters: Object.freeze({ label: 'State readouts', type: 'Readout[]', meaning: 'Bounded typed values belonging to the selected state.' }),
});
export const LIMITS = Object.freeze({ title: 120, story: 3000, cardDescription: 500, instructions: 300 });
const depthNames = Object.freeze(['brief', 'balanced', 'detailed']);
export const FAMILY = Object.freeze({ id, depths: Object.freeze(Object.fromEntries(depthNames.map((depth, i) => [depth, Object.freeze({
  template: templates[i], roles: scalarRoles,
  inputs: Object.freeze([Object.freeze(['step', 'index']), ...(depth === 'brief' ? [] : [Object.freeze(['option', 'select'])])]),
  compositions: canonicalIds, limits: DEPTH_LIMITS[depth],
})]))) });

export const formulaGrammar = Object.freeze([
  'This family has no formula fields or scalar quantity roles. Fill only the closed typed composition and the declared word slots.',
  'step is a discrete state index, not elapsed time. Use no t, formula, fixed-value surrogate, timer or timeline.',
]);
export const formulaRules = depth => {
  infoOf(depth);
  return Object.freeze([
    'Every highlight, callout, previous-state ghost and readout binds to declared state data through an admitted part binding.',
    'The selector, rail and completed trace share one integer cursor. Reset selects the first state and default variant.',
    'A parameter change keeps the current index and clamps it to the last state if the new variant is shorter; the atomic shared native-domain hook is pending admission.',
  ]);
};
export function familyDescription(depth) {
  const info = infoOf(depth), additions = depth === 'brief' ? 'A rail, fixed picture and selected-state callout.'
    : depth === 'balanced' ? 'The same structure adds a previous-state ghost, typed readouts and a variant selector.'
      : 'The same structure adds the callout reason and a completed-state trace.';
  return [`Family ${id}. ${additions}`, `A 640 px adjustable still scene with two to ${info.limits.states} ordered states per variant. No elapsed time or playback.`,
    'Choose algorithm-over-collection, protocol-between-parties or cycle-of-phases and fill its closed typed data.'].join('\n');
}
function infoOf(depth) {
  const info = FAMILY.depths[depth];
  if (!info) throw new RangeError(`the family ${id} has no depth "${depth}"`);
  return info;
}
const TEXT_KEYS = Object.freeze([
  ['title', 'the card title'], ['story', 'the short teaching story'],
  ['cardDescription', 'the idea to notice under the title'], ['instructions', 'how to select a state and reset'],
]);
const briefSchemas = new Map();
// A family-owned nested schema: using the old flat brief helper would lose the
// composition or invent range/formula fields for a discrete data binding.
export function briefSchema(depth) {
  infoOf(depth);
  if (briefSchemas.has(depth)) return briefSchemas.get(depth);
  const shape = composition => z.object({ ...Object.fromEntries(TEXT_KEYS.map(([key]) => [key, plainText(LIMITS[key])])), composition, words: wordsSchema }).strict();
  const schema = shape(compositionSchemaFor(depth));
  const result = Object.freeze({
    // The model is shown one composition alternative per depth (the merge picture, the only one assembled live); parse admits all three approved ones.
    jsonSchema: z.toJSONSchema(shape(fillCompositionSchemaFor(depth))),
    parse(raw) {
      const parsed = schema.safeParse(raw);
      if (parsed.success) return { ok: true, value: parsed.data };
      const failures = schemaFailures(parsed.error);
      return { ok: false, failures, problems: failures.map(f => `${f.path}: ${f.message}`) };
    },
    keys: Object.freeze({
      text: TEXT_KEYS.map(([key, what]) => ({ key, what, max: LIMITS[key] })), scalars: [], inputs: [], formulas: [],
      composition: { key: 'composition', canonicalIds: [canonicalIds[0]], limits: DEPTH_LIMITS[depth], what: 'Closed canonical state-table data and approved part bindings.' },
      words: WORDS.map(([key, max, what]) => ({ key, max, what })),
    }),
  });
  briefSchemas.set(depth, result);
  return result;
}

export function fillKeyLines(keys) {
  return [
    ...keys.text.map(({ key, what, max }) => `- ${key}: ${what} (at most ${max} characters)`),
    `- composition: ${keys.composition.what} Choose one canonical: ${keys.composition.canonicalIds.join(', ')}.`,
    `  Limits for this depth: ${Object.entries(keys.composition.limits).map(([name, max]) => `${name} at most ${max}`).join('; ')}.`,
    '  Bind the ordered state table, fixed-picture regions and links, named active regions, aha state, parts and native controls through the closed schema. Use no executable drawing code.',
    ...keys.words.map(({ key, what, max }) => `- words.${key}: ${what} (at most ${max} characters)`),
  ];
}

// The composition's closed structure for a depth: the constants every stepper card at that depth carries (status, layout, the bound parts,
// the native controls). The model copies it, so its writing is limited to the id, canonical, story, aha and data. Taken from the approved
// reference composition of the same depth; the first live Brief fill (2026-11-15) lost every attempt to constants it had to guess
// (status, layout.preset, parts[].kind, controls).
export const closedStructure = depth => {
  const reference = referenceComposition('merge-sort', depth);
  return { schemaVersion: reference.schemaVersion, status: reference.status, family: reference.family, depth: reference.depth, layout: reference.layout, parts: reference.parts, controls: reference.controls };
};
export function fillTeachingRules(depth) {
  infoOf(depth);
  return [
    `The composition's closed structure is fixed for this depth: copy these keys and values into composition exactly, with no change, then add only id, canonical, story, aha and data: ${JSON.stringify(closedStructure(depth))}`,
    `Region ids are the picture's fixed anchors: use only ${[...mergeAnchors()].join(', ')}, each at most once, with 2 or more regions; a region's values are its numbers (1 to 8, no text). Each link joins two declared regions. A state's optional status.source is the id of a state (leave status out when unsure).`,
    'Teach one aha that answers the opening question. Name its state and hold it until the learner changes the discrete step index; there is no timeline or elapsed time.',
    'Use tested parts plus canonical composition data plus these rules. Bind every visible region, link, highlight, word and readout to the declared state data.',
    'Name every changing part in the story and use the same names in the picture and selected-state sentence. A control must change the aha evidence, beyond changing a label.',
    depth === 'brief' ? 'Overview: one changing region and its observation. Use the rail, fixed picture and anchored callout.'
      : depth === 'balanced' ? 'Standard: add the comparison with the previous state and computed readouts.'
        : 'Deep: add an inspectable computed count or governing rule and completed-state trace. Never exceed the approved Deep mitosis density.',
    'Compose inside the 640 px picture. Callouts identify where; readouts report values. Keep each number in one place and compute it from the same state and inputs.',
    'Reset restores the first state and default variant. Every selected state persists until the learner acts. A step is an integer state position, never a fabricated clock.',
    'The step control lists exactly "variant.states", the whole ordered table, as a constant. Every part bind is one of the schema\'s fixed strings: state.*, variant.*, previous.* (and inputs.step for the rail and trace). Never write an input inside a path: "variant.states[inputs.stepIndex].why" is refused; write "state.why".',
    ...formulaGrammar, ...formulaRules(depth),
  ];
}

const mergeAnchors = () => referenceComposition('merge-sort', 'brief').data.variants[0].regions.map(region => region.id);
export class StepperBriefError extends Error {
  constructor(failure) { super(`${failure.path}: ${failure.message}`); this.name = 'StepperBriefError'; this.code = failure.code; this.path = failure.path; }
}
const requireComposition = composition => {
  const parsed = parseComposition(composition);
  if (!parsed.ok) throw new StepperBriefError(parsed.failures[0]);
  return parsed.value;
};
function variantAt(composition, inputs) {
  const option = inputs.option ?? '0';
  if (!(typeof option === 'string' && /^[01]$/.test(option))) throw new RangeError('variant is an admitted native select value');
  const variant = composition.data.variants[Number(option)];
  if (!variant) throw new RangeError('variant is outside the admitted variant table');
  return { option, variant };
}
export function resolveDomain(composition, inputs = {}) {
  const { variant } = variantAt(requireComposition(composition), inputs);
  return [0, variant.states.length - 1];
}
export function resolveSelection(composition, inputs = {}) {
  const { option, variant } = variantAt(requireComposition(composition), inputs), step = inputs.step ?? 0;
  if (!Number.isInteger(step) || step < 0 || step >= variant.states.length) throw new RangeError(`step is an integer in 0..${variant.states.length - 1}`);
  return { option, variant, index: step, state: variant.states[step], previous: step === 0 ? null : variant.states[step - 1] };
}
// The approved selector keeps its position when the variant changes. This pure
// policy helper does not claim the host's static native-index declaration can
// yet apply an atomic variant/domain change; that remains a shared hook request.
export function clampSelection(composition, inputs = {}) {
  const admitted = requireComposition(composition), { variant } = variantAt(admitted, inputs), step = inputs.step ?? 0;
  if (!Number.isInteger(step) || step < 0 || step > independent.domain[1]) throw new RangeError('step is an admitted nonnegative integer position');
  return resolveSelection(admitted, { ...inputs, step: Math.min(step, variant.states.length - 1) });
}

// This first module checks admission structure, not scientific correctness. The
// independent transition/readout proofs and six semantic failures are a separate
// required deliverable; check's coverage report names what stays unproved.
export function check(brief, depth) {
  const checked = { schema: 0, domains: 0, bindings: 0, transitions: 0, reference: 0 };
  const coverage = { scope: 'structure-and-bindings', complete: false, missing: ['state-invariants', 'independent-reference', 'six-semantic-negative-cases'] };
  let parsed;
  try { parsed = briefSchema(depth).parse(brief); }
  catch (error) { return { ok: false, checked, coverage, failures: [{ code: 'schema', path: 'depth', message: error.message }] }; }
  if (!parsed.ok) return { ok: false, checked, coverage, failures: parsed.failures };
  checked.schema = 1;
  const composition = parsed.value.composition, failures = [];
  // Region ids are semantic anchors in an approved fixed-picture preset. A
  // self-consistent rename cannot create coordinates the renderer does not own.
  const anchors = new Set(referenceComposition(composition.canonical, depth).data.variants.flatMap(variant => variant.regions.map(region => region.id)));
  const bad = (code, path, message) => { if (failures.length < 12) failures.push({ code, path: `composition.${path}`, message }); };
  const unique = (list, path, key = item => item.id) => {
    const seen = new Set();
    list.forEach((item, i) => { const value = key(item); if (seen.has(value)) bad('duplicate_id', `${path}.${i}.id`, `Duplicate id "${value}".`); seen.add(value); });
    return seen;
  };
  const known = (set, value, path, kind = 'region') => {
    checked.bindings += 1;
    if (!set.has(value)) bad(`unknown_${kind}`, path, `Unknown ${kind} "${value}".`);
  };
  unique(composition.parts, 'parts'); unique(composition.controls, 'controls');
  const expectedParts = ['rail', 'picture', 'callout', ...(depth === 'brief' ? [] : ['ghost', 'values']), ...(depth === 'detailed' ? ['trace'] : [])];
  if (composition.parts.map(p => p.id).join(',') !== expectedParts.join(',')) bad('part_set', 'parts', `This depth uses ${expectedParts.join(', ')} in that order.`);
  const expectedControls = depth === 'brief' ? ['step', 'reset'] : ['step', 'option', 'reset'];
  if (composition.controls.map(c => c.id).join(',') !== expectedControls.join(',')) bad('control_set', 'controls', `This depth uses ${expectedControls.join(', ')} in that order.`);
  const stepIndex = composition.controls.findIndex(c => c.kind === 'index'), step = composition.controls[stepIndex];
  const optionIndex = composition.controls.findIndex(c => c.kind === 'select'), option = composition.controls[optionIndex];
  if (option) {
    checked.domains += 1;
    if (option.options.length !== composition.data.variants.length) bad('variant_domain', `controls.${optionIndex}.options`, 'Each select option names one declared variant.');
    if (option.default >= composition.data.variants.length) bad('variant_domain', `controls.${optionIndex}.default`, 'The default variant must exist.');
    else if (option.default !== 0) bad('initial_variant', `controls.${optionIndex}.default`, 'The admitted initial variant is zero.');
  }
  composition.data.variants.forEach((variant, vi) => {
    const path = `data.variants.${vi}`, regions = unique(variant.regions, `${path}.regions`), states = unique(variant.states, `${path}.states`);
    variant.regions.forEach((region, ri) => known(anchors, region.id, `${path}.regions.${ri}.id`, 'anchor'));
    checked.domains += 1;
    if (step && step.default >= variant.states.length) bad('state_index', `controls.${stepIndex}.default`, `The initial step must be inside variant ${vi}'s 0..${variant.states.length - 1} domain.`);
    else if (step && step.default !== 0) bad('initial_state', `controls.${stepIndex}.default`, 'The admitted initial step is zero.');
    if (variant.states.length > independent.domain[1] + 1) bad('state_domain', `${path}.states`, `The step input admits at most ${independent.domain[1] + 1} states.`);
    known(states, composition.aha.stateId, 'aha.stateId', 'state');
    variant.links.forEach((item, li) => {
      known(regions, item.from, `${path}.links.${li}.from`); known(regions, item.to, `${path}.links.${li}.to`);
    });
    variant.states.forEach((state, si) => {
      const at = `${path}.states.${si}`;
      unique(state.readouts, `${at}.readouts`);
      state.active.forEach((region, ri) => known(regions, region, `${at}.active.${ri}`));
      known(regions, state.calloutRegion, `${at}.calloutRegion`);
      if (state.status) known(states, state.status.source, `${at}.status.source`, 'state');
      if (composition.canonical === 'protocol-between-parties') {
        const messages = new Set(variant.regions.filter(r => r.kind === 'message').map(r => r.id));
        if (state.segment !== null) known(messages, state.segment, `${at}.segment`, 'message');
        state.sent.forEach((message, mi) => known(messages, message, `${at}.sent.${mi}`, 'message'));
      }
    });
    variant.regions.forEach((region, ri) => {
      const at = `${path}.regions.${ri}`;
      if (region.kind === 'message') {
        const parties = new Set(variant.regions.filter(r => r.kind === 'party').map(r => r.id));
        known(parties, region.from, `${at}.from`, 'party'); known(parties, region.to, `${at}.to`, 'party');
      }
      if (region.kind === 'cell-structure') region.payload.within.forEach((phase, pi) => known(regions, phase, `${at}.payload.within.${pi}`));
      if (region.kind === 'mitosis-cell') {
        const payload = region.payload, chromosomes = unique(payload.chromosomes, `${at}.payload.chromosomes`), nuclei = unique(payload.nuclei, `${at}.payload.nuclei`);
        unique(payload.cellBodies, `${at}.payload.cellBodies`); unique(payload.spindle.centrosomes, `${at}.payload.spindle.centrosomes`);
        const chromatids = new Set();
        payload.chromosomes.forEach((chromosome, ci) => {
          unique(chromosome.chromatids, `${at}.payload.chromosomes.${ci}.chromatids`);
          chromosome.chromatids.forEach(chromatid => chromatids.add(chromatid.id));
        });
        payload.cellBodies.forEach((cell, ci) => {
          cell.chromosomeIds.forEach((value, k) => known(chromosomes, value, `${at}.payload.cellBodies.${ci}.chromosomeIds.${k}`, 'chromosome'));
          cell.nucleusIds.forEach((value, k) => known(nuclei, value, `${at}.payload.cellBodies.${ci}.nucleusIds.${k}`, 'nucleus'));
        });
        payload.nuclei.forEach((nucleus, ni) => nucleus.chromosomeIds.forEach((value, k) => known(chromosomes, value, `${at}.payload.nuclei.${ni}.chromosomeIds.${k}`, 'chromosome')));
        payload.spindle.attachments.forEach((attachment, ai) => known(chromatids, attachment.chromatidId, `${at}.payload.spindle.attachments.${ai}.chromatidId`, 'chromatid'));
      }
    });
  });
  return { ok: failures.length === 0, failures, checked, coverage };
}
// The family's admission is its check (brief 27): the design path asks referenceCheck, and a valid brief must pass it. Its coverage report still says what is not proved.
export const referenceCheck = check;

const affected = id => ({ scope: 'main', kind: 'entity', id });
const partLabels = Object.freeze({ rail: 'State rail', picture: 'Teaching picture', callout: 'Selected-state explanation', ghost: 'Previous state', values: 'State readouts', trace: 'Completed states' });
export function expandBrief(raw, depth, { catalogueHash = '' } = {}) {
  const parsed = briefSchema(depth).parse(raw);
  if (!parsed.ok) throw new StepperBriefError(parsed.failures[0]);
  const brief = parsed.value, result = check(brief, depth);
  if (!result.ok) throw new StepperBriefError(result.failures[0]);
  const info = infoOf(depth), composition = brief.composition, variant = composition.data.variants[0];
  const tuple = SUPPORTED_PROGRAM_TUPLES.find(t => t.schemaVersion === 1 && t.sdkVersion === 'sdk-8');
  const selector = composition.controls.find(c => c.kind === 'select'), affects = composition.parts.map(p => affected(p.id));
  const controls = [{
    id: 'step', label: INPUTS.step.label, type: 'index', nativeControlId: 'program.index_slider', binding: { kind: 'input', id: 'step' },
    purpose: INPUTS.step.meaning, selectionReason: 'An ordered index keeps the native selector and state rail on the same discrete position.',
    // Native item ids have ScenePlan's identifier grammar. The typed state ids
    // stay unchanged in data; the native control selects their ordered position.
    default: 0, dataRef: 'states', items: variant.states.map(({ label }, index) => ({ id: `state${index}`, label })), presentation: 'slider', affects,
  }];
  if (selector) controls.push({
    id: 'option', label: selector.label, type: 'select', nativeControlId: 'program.select', binding: { kind: 'input', id: 'option' },
    purpose: parameters[composition.canonical].meaning, selectionReason: 'Each named option selects one admitted data variant of the same teaching picture.',
    default: '0', options: selector.options.map((label, index) => ({ value: String(index), label })), affects,
  });
  controls.push({
    id: 'reset', label: 'Reset', type: 'reset', nativeControlId: 'program.reset', binding: { kind: 'reset' },
    purpose: 'Return to the first state and default variant.', selectionReason: 'One reset restores the linked state selection and parameter together.',
    effect: 'Selects state zero and the default variant.', affects,
  });
  const points = [...new Set([0, variant.states.findIndex(s => s.id === composition.aha.stateId), variant.states.length - 1])];
  return {
    schemaVersion: 1, depth, title: brief.title, story: brief.story, cardDescription: brief.cardDescription, instructions: brief.instructions,
    learningGoal: composition.aha.observation, supportingVisuals: [],
    scene: {
      description: familyDescription(depth),
      runtime: { renderer: 'program', schemaVersion: tuple.schemaVersion, sdkVersion: tuple.sdkVersion, programTuple: tuple, requiredHelpers: [], requiredCapabilities: ['figures', 'inputs_v2', ...(selector ? ['select_inputs'] : [])], catalogueHash },
      entities: composition.parts.map(p => ({ id: p.id, label: partLabels[p.id], purpose: `Show the ${partLabels[p.id].toLowerCase()} from the declared state data.` })),
      quantities: [], template: info.template, slots: {}, words: { ...brief.words }, readoutIds: [],
      // The registered template admits this typed payload through sceneDataSchema.
      data: composition,
      observations: [{ id: 'aha', text: composition.aha.observation, quantityIds: [], readoutIds: [] }],
      checkpoints: points.map((step, i) => ({ id: `state${i}`, label: variant.states[step].label, time: null, inputOverrides: { step, ...(selector ? { option: '0' } : {}) }, actions: [], expected: variant.states[step].sentence })),
    },
    mode: { kind: 'static', initialState: `The first selected state is ${variant.states[0].label}.`, fixedValues: {}, adjustableIds: ['step', ...(selector ? ['option'] : [])], timeline: null, onInputChange: 'recompute_still' },
    controls,
    assumptions: ['The selector chooses an ordered discrete state; steps are not elapsed seconds.'],
    limitations: ['The scene shows the admitted states and omits activity between them.'], claims: [],
  };
}
export function extractBrief(plan) {
  const value = { title: plan.title, story: plan.story, cardDescription: plan.cardDescription, instructions: plan.instructions, composition: plan.scene.data, words: plan.scene.words };
  const parsed = briefSchema(plan.depth).parse(value);
  if (!parsed.ok) throw new StepperBriefError(parsed.failures[0]);
  return parsed.value;
}
export function context({ scene }) {
  if (scene.template === 'stepper-pendulum') return { range: { pendulum: pendulum.pendulumSchema.parse(scene.data) }, units: {} };
  if (scene.template === 'stepper-tree-motion') return { range: { tree: treeMotion.treeMotionSchema.parse(scene.data) }, units: {} };
  if (scene.template === 'stepper-vote-motion') return { range: { vote: voteMotion.voteMotionSchema.parse(scene.data) }, units: {} };
  if (scene.template === 'stepper-tree-trace') return { range: { tree: treeTrace.treeTraceSchema.parse(scene.data) }, units: {} };
  return { range: { composition: requireComposition(scene.data), words: wordsSchema.parse(scene.words) }, units: {} };
}

export function referenceBrief(subject, depth = 'balanced') {
  const composition = referenceComposition(subject, depth), { heading, ...card } = referenceCardWords(subject, depth);
  return {
    ...card, composition, words: { heading, current: 'Current', previous: 'Previous', completed: 'Completed' },
  };
}

export const parts = stepperScene.parts;
// These are data instances of the three approved canonical arrangements, not
// another dispatch table. The caller fills the same closed schemas.
const freezeData = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeData); Object.freeze(value); }
  return value;
};
export const compositions = freezeData(Object.fromEntries(canonicalIds.map(canonical => [canonical,
  Object.fromEntries(depthNames.map(depth => [depth, referenceComposition(canonical, depth)])),
])));
export const templateModules = Object.freeze(Object.fromEntries(templates.map(name => [name, ({ 'stepper-tree-trace': treeTrace, 'stepper-tree-motion': treeMotion, 'stepper-vote-motion': voteMotion, 'stepper-pendulum': pendulum })[name] ?? stepperScene])));
export const fixtureGroups = catalogueHash => ({ stepperPlans: Object.fromEntries(Object.entries({ ...STEPPER_PLANS, 'stepper-tree-trace-brief': TREE_TRACE_PLAN, ...MOTION_PLANS, ...PENDULUM_PLANS }).map(([name, stored]) => {
  const plan = structuredClone(stored);
  plan.scene.runtime.catalogueHash = catalogueHash;
  return [name, plan];
})) });
export const pins = Object.freeze({
  families: Object.freeze({ stepper: Object.freeze({ brief: 'stepper-merge-sort-brief' }), 'tree-trace': Object.freeze({ brief: 'stepper-tree-trace-brief' }), motion: Object.freeze({ brief: 'stepper-tree-motion-brief', balanced: 'stepper-vote-motion-balanced' }), pendulum: Object.freeze({ brief: 'stepper-pendulum-brief' }) }),
  plans: Object.freeze({ 'stepper-merge-sort-brief': Object.freeze(['stepper-merge-sort-brief', 'brief', 'stepperPlans']), 'stepper-tree-trace-brief': Object.freeze(['stepper-tree-trace-brief', 'brief', 'stepperPlans']), 'stepper-tree-motion-brief': Object.freeze(['stepper-tree-motion-brief', 'brief', 'stepperPlans']), 'stepper-vote-motion-balanced': Object.freeze(['stepper-vote-motion-balanced', 'balanced', 'stepperPlans']), 'stepper-pendulum-brief': Object.freeze(['stepper-pendulum-brief', 'brief', 'stepperPlans']) }),
});
export const checkMap = Object.freeze({
  'packages/web/src/interact-family-stepper.js': ['packages/web/src/interact-family-stepper.test.mjs', 'packages/control-plane/test/interact-stepper-templates.test.js'],
  'packages/web/src/interact-family-stepper-data.js': ['packages/web/src/interact-family-stepper.test.mjs', 'packages/control-plane/test/interact-stepper-pins.test.js'],
  'packages/web/src/interact-stepper-plans.js': ['packages/control-plane/test/interact-stepper-pins.test.js', 'packages/control-plane/test/interact-stepper-templates.test.js'],
  'packages/web/src/interact-stepper-schema.js': ['packages/web/src/interact-family-stepper.test.mjs', 'packages/control-plane/test/interact-stepper-templates.test.js'],
  'packages/web/src/interact-stepper-data.js': ['packages/web/src/interact-stepper-data.test.mjs', 'packages/web/src/interact-family-stepper.test.mjs', 'packages/control-plane/test/interact-stepper-templates.test.js'],
  'packages/web/src/interact-stepper-programs.js': ['packages/control-plane/test/interact-stepper-templates.test.js'],
  'scripts/interact/stepper-reference-frames.mjs': ['packages/control-plane/test/interact-stepper-reference.test.js', 'packages/control-plane/test/interact-stepper-templates.test.js'],
  ...Object.fromEntries(['step-rail', 'fixed-picture', 'active-callout', 'readouts', 'ghost-previous', 'status-line', 'stepper-scene'].map(name => [
    `packages/web/src/interact-templates/${name}.js`,
    ['packages/web/src/interact-templates/stepper-parts.test.mjs', 'packages/control-plane/test/interact-stepper-templates.test.js'],
  ])),
});
export const stepperStates = Object.freeze({
  id, contractVersion: 1, pickCriterion, FAMILY, INPUTS, ROLES, LIMITS, scalars, scalarRoles,
  independent, coordinate, parameters, templates, templateData, templateModules, parts, compositions, fixtureGroups, pins, checkMap,
  briefSchema, check, referenceCheck, expandBrief, extractBrief, familyDescription, formulaGrammar, formulaRules,
  fillKeyLines, fillTeachingRules,
  context, resolveDomain, resolveSelection, clampSelection,
});
export const stepperFamily = stepperStates;
