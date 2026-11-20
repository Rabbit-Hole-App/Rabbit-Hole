// Brief 38 spec section 6.1: the plan code writes from a checked blueprint, field for field the shape interact-pendulum-plan.js and interact-attention-plan.js use (the merge-sort plan's frozen skeleton, then the parts that
// differ). Every text in the plan comes from the blueprint: the pendulum plan is the pattern for which fields a plan needs, not a source of words. No subject appears here and nothing branches on an id, a label or a title of a blueprint.
// ponytail: pinned data only (interact-blueprint-cards.js, written by scripts/interact/bake-blueprint-cards.mjs); no live path from a model's blueprint to a card yet (spec section 14).
import { STEPPER_PLANS } from './interact-stepper-plans.js';
import { BLUEPRINT_CARDS } from './interact-blueprint-cards.js';
import { FIGURES_CAPABILITY } from './explain-program/stamps.js';
import { pickLayout } from './interact-layout.js';

const lit = value => ({ op: 'literal', value });
const entityRef = id => ({ scope: 'main', kind: 'entity', id });
const GRAPH = 'graph', VALUES = 'values';
const referenceOf = input => (input.type === 'number' ? `Set by the learner from ${input.min} to ${input.max}${input.unit ? ` ${input.unit}` : ''}.` : input.type === 'select' ? `Set by the learner to one of ${input.options.map(option => option.label).join(', ')}.` : 'Set by the learner, on or off.');

// Brief 46: the layout answers (pictureCount, runs, panelRole) that make pickLayout return the build-schema's layout id, and the figure parts the build-schema gives the kind picture (the host draws the picture with them).
const answersFor = layoutId => {
  for (const pictureCount of ['one', 'two']) for (const runs of ['left-to-right', 'compact', 'top-to-bottom']) for (const panelRole of ['none', 'records-main', 'equal', 'aligned']) {
    try { if (pickLayout({ pictureCount, runs, panelRole }, { hasPanel: pictureCount === 'two' }) === layoutId) return { pictureCount, runs, panelRole }; } catch { /* a combination the layout module refuses */ }
  }
  throw new Error(`no layout answers pick the layout "${layoutId}"`);
};
const figurePartsOf = buildSchema => { const picture = [buildSchema.pictures.panel, buildSchema.pictures.main].find(entry => entry?.type === 'kind'); return picture?.parts ? { ...picture.parts } : undefined; };

export function planFromBlueprint(blueprint, buildSchema, depth) {
  const things = blueprint.things, panel = blueprint.pictures.panel, entities = [...things.map(thing => ({ id: thing.id, label: thing.label, purpose: `${thing.label}: the parts, the graph line and the values drawn in its colour.` })), ...(panel ? [{ id: GRAPH, label: panel.title, purpose: `${panel.title}: ${panel.series.map(series => series.label).join(', ')} against ${panel.x.label}.` }] : []), { id: VALUES, label: 'Values', purpose: `${blueprint.values.map(value => value.label).join(', ')}.` }];
  const affects = entities.map(entity => entityRef(entity.id)), quantityOf = id => blueprint.quantities.find(quantity => quantity.id === id);
  const plan = structuredClone(STEPPER_PLANS['stepper-merge-sort-brief']);
  const controlText = input => ({ purpose: quantityOf(input.id)?.meaning ?? input.label, selectionReason: `${input.label} is one of the quantities the question turns on; the learner changes it and watches what depends on it.` });
  const inputControl = input => {
    const base = { id: input.id, label: input.label, ...controlText(input), binding: { kind: 'input', id: input.id }, affects };
    if (input.type === 'number') return { ...base, type: 'number', nativeControlId: 'program.number', unit: input.unit, default: input.default, min: input.min, max: input.max, step: input.step, onChange: 'recompute_still' };
    if (input.type === 'select') return { ...base, type: 'select', nativeControlId: 'program.select', default: input.default, options: input.options.map(option => ({ value: option.value, label: option.label })) };
    return { ...base, type: 'boolean', nativeControlId: 'program.boolean', default: input.default };
  };
  const time = blueprint.time, start = blueprint.inputs.map(input => `${input.label} ${input.type === 'boolean' ? (input.default ? 'on' : 'off') : input.type === 'select' ? input.options.find(option => option.value === input.default).label : input.default}`).join(', ');
  const capabilities = ['time_playback', ...(blueprint.inputs.some(input => input.type === 'number') ? ['number_inputs'] : []), ...(blueprint.inputs.some(input => input.type === 'select') ? ['select_inputs'] : []), ...(blueprint.inputs.some(input => input.type === 'boolean') ? ['inputs_v2'] : []), ...(blueprint.pictures.main.parts.some(part => part.type === 'trace') ? ['polyline'] : []), ...(panel ? [FIGURES_CAPABILITY] : [])];
  Object.assign(plan, {
    depth, title: blueprint.lesson.title, story: `${blueprint.relationship.statement} ${blueprint.lesson.goal}`, cardDescription: blueprint.lesson.description, instructions: blueprint.lesson.instructions, learningGoal: blueprint.lesson.goal,
    controls: [
      { id: 'play', label: 'Play', type: 'playback', purpose: `Run the scene and replay it over ${time.duration} ${time.unit}.`, selectionReason: `Time carries the change, and the one supported transport drives every linked view.`, nativeControlId: 'program.playback', binding: { kind: 'timeline' }, labels: { paused: 'Play', playing: 'Pause', ended: 'Replay' }, affects },
      { id: 'scrub', label: time.label, type: 'scrubber', purpose: `Stop on any moment of the run.`, selectionReason: `A scrubber lets the learner stop on the moment being compared.`, nativeControlId: 'program.scrubber', binding: { kind: 'timeline' }, unit: time.unit, step: 0.01, affects },
      ...blueprint.inputs.map(inputControl),
      { id: 'resetAll', label: 'Reset', type: 'reset', purpose: 'Return to the starting settings.', selectionReason: 'Replay keeps the settings; Reset restores them.', nativeControlId: 'program.reset', binding: { kind: 'reset' }, effect: `Restores ${start} and ${time.label} 0, paused.`, affects },
    ],
    mode: { kind: 'experiment', initialState: `${start}; ${time.label} 0 ${time.unit}, paused.`, fixedValues: {}, adjustableIds: blueprint.inputs.map(input => input.id),
      timeline: { label: time.label, unit: time.unit, start: 0, end: lit(time.duration), displayOffset: lit(0), markers: [], initialTime: 0, initialPlayback: 'paused', playbackRate: 1 }, onInputChange: 'reset_pause' },
    assumptions: blueprint.relationship.assumptions, limitations: [], claims: [],
  });
  Object.assign(plan.scene, {
    layout: { ...answersFor(buildSchema.layout), ...(figurePartsOf(buildSchema) ? { figureParts: figurePartsOf(buildSchema) } : {}) },
    description: `Family stepper-states. ${blueprint.pictures.main.parts.length} parts drawn from the math function${panel ? `, a graph of ${panel.series.length} ${panel.series.length === 1 ? 'line' : 'lines'} drawn by the plot renderer` : ''}, ${blueprint.values.length} values, ${blueprint.relationship.formula ? 'a formula and ' : ''}the explanation.\nA 640 x 400 px scene with a ${time.duration} ${time.unit} timeline and ${blueprint.inputs.length} ${blueprint.inputs.length === 1 ? 'control' : 'controls'}.`,
    template: 'stepper-blueprint', words: {}, slots: {}, readoutIds: [], data: { blueprint, buildSchema }, entities,
    quantities: blueprint.inputs.map(input => ({ id: input.id, label: quantityOf(input.id)?.label ?? input.label, unit: input.type === 'number' ? input.unit : '', meaning: quantityOf(input.id)?.meaning ?? input.label, reference: referenceOf(input), formula: input.id })),
    observations: [{ id: 'observation', text: blueprint.relationship.statement, quantityIds: [], readoutIds: [] }],
    checkpoints: [{ id: 'start', label: 'Starting settings', time: lit(0), inputOverrides: {}, actions: [], expected: `${start}; the values ${blueprint.values.map(value => value.label).join(', ')} are shown.` },
      ...blueprint.inputs.filter(input => input.type === 'number').map(input => ({ id: `${input.id}End`, label: `${input.label} at its largest`, time: lit(time.duration / 2), inputOverrides: { [input.id]: input.max }, actions: [], expected: `${input.label} is ${input.max}${input.unit ? ` ${input.unit}` : ''}; ${blueprint.lesson.goal}` }))],
  });
  plan.scene.runtime.requiredCapabilities = capabilities;
  return plan;
}

// The pinned cards (brief 46): every card of the data file (interact-blueprint-cards.js, { blueprint, buildSchema } by name) is one pin family `blueprint-<name>` (INTERACT_DESIGN_FIXTURE=blueprint-<name>) that answers a job at EVERY Depth with the
// same card: one plan per Depth (a plan answers its own Depth only, and its `depth` is the job's).
const DEPTHS = ['brief', 'balanced', 'detailed'];
const planId = (name, depth) => `stepper-blueprint-${name}-${depth}`;
export const BLUEPRINT_PLANS = Object.freeze(Object.fromEntries(Object.entries(BLUEPRINT_CARDS).flatMap(([name, { blueprint, buildSchema }]) => DEPTHS.map(depth => [planId(name, depth), planFromBlueprint(blueprint, buildSchema, depth)]))));
export const BLUEPRINT_PIN_FAMILIES = Object.freeze(Object.fromEntries(Object.keys(BLUEPRINT_CARDS).map(name => [`blueprint-${name}`, Object.freeze(Object.fromEntries(DEPTHS.map(depth => [depth, planId(name, depth)])))])));
