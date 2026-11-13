import { z } from 'zod';
import { CONTRACT_LIMITS, INPUTS_V2_CAPABILITY } from './explain-program/contract.js';
import { contentHash, PLAN_LIMITS } from './interact-plan.js';

// The runtime-provided control catalogue the Design Author, Reviewer, Reviser and Scene Builder choose from (INT-01-C03).
// Availability means the ENABLED renderer can implement the control today, not that a React widget exists somewhere. Each entry
// below names the real widget it maps to; anything the audited code does not wire (a program multi-select, a program Boolean switch or
// index unless inputs_v2 is enabled, a spec continuous number slider, a spec action or object target) is deliberately absent.
//   spec    = AnimatedScene + SceneControls (declarative input types index, bool, choice, indices)
//   program = ProgramScene (manifest number/select inputs; schema 2 declared actions and targets)
export const RENDERERS = Object.freeze(['spec', 'program']);
export const CONTROL_TYPES = Object.freeze(['playback', 'scrubber', 'number', 'select', 'boolean', 'index', 'multi_select', 'action', 'target', 'seek', 'reset']);
// The declarative input types a component can declare (scene-inputs.js INPUT_TYPES, less vec2, which a plan has no control for).
const COMPONENT_TYPES = Object.freeze(['choice', 'bool', 'index', 'indices']);

const descriptor = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/), renderer: z.enum(RENDERERS), semanticType: z.enum(CONTROL_TYPES),
  nativeType: z.string().min(1).max(32), presentation: z.string().min(1).max(32),
  limits: z.record(z.string(), z.union([z.number(), z.boolean()])), requires: z.array(z.string().min(1).max(32)).max(8), purposeHint: z.string().min(1).max(200),
}).strict();

// componentControls: the declarative input types the enabled components actually declare, as ['choice', 'index'] or with
// their domain limits, { index: { maxItems: 12 }, choice: { maxOptions: 5 } }. A type not listed is not offered on `spec`.
function componentLimits(componentControls) {
  const map = Array.isArray(componentControls) ? Object.fromEntries(componentControls.map(type => [type, {}])) : { ...componentControls };
  for (const type of Object.keys(map)) if (!COMPONENT_TYPES.includes(type)) throw new Error(`componentControls: "${type}" is not a declarative input type a plan can use (${COMPONENT_TYPES.join(', ')})`);
  return map;
}

// interact-design.js designCapabilities passes inputsV2: INTERACT_INPUTS_V2 === 'on' (default off); agents/explain-author.js lists INPUT_TYPES_PROMPT_SENTENCE in the authoring docs when the panel's runtime lists inputs_v2.
export const INDEX_ITEMS = 12; // CONTRACT_LIMITS-sized: a program index input has 2 to 12 items (contract.js)
// The one build-prompt sentence for the new input types, shown only when inputsV2 is enabled.
export const INPUT_TYPES_PROMPT_SENTENCE = 'manifest.inputs types: number {min, max, step, default}, select {options, default}, boolean {default: true|false; reads inputs.<id> as a boolean} and index {items: 2 to 12 {id, label}, default: the position of an item, presentation: picker|slider; reads inputs.<id> as an integer 0 to items - 1}; a manifest with a boolean or index input lists "inputs_v2" in capabilities.';

export function getInteractControlCatalogue({ renderers, stateful = false, componentControls = [], inputsV2 = false, seek = false } = {}) {
  if (!Array.isArray(renderers) || !renderers.length) throw new Error('getInteractControlCatalogue needs the enabled renderers');
  for (const r of renderers) if (!RENDERERS.includes(r)) throw new Error(`unknown renderer "${r}"`);
  const components = componentLimits(componentControls);
  const cap = (type, key, fallback) => Math.min(Number.isFinite(components[type]?.[key]) ? components[type][key] : fallback, fallback);
  const entries = [];
  const add = (renderer, id, semanticType, nativeType, presentation, purposeHint, { limits = {}, requires = [] } = {}) => entries.push({ id, renderer, semanticType, nativeType, presentation, limits, requires, purposeHint });

  if (renderers.includes('spec')) {
    add('spec', 'spec.playback', 'playback', 'transport', 'play_pause_replay', 'Play, Pause and Replay one shared timeline (AnimatedScene transport).', { limits: { maxControls: 1 } });
    add('spec', 'spec.scrubber', 'scrubber', 'range', 'time_range', 'Seek the shared timeline; shows the current time.', { limits: { maxControls: 1 } });
    // Declarative components expose discrete domains only; their generic index slider is not an arbitrary continuous number slider.
    if (components.choice) add('spec', 'spec.select', 'select', 'choice', 'choice_buttons', 'Choose one of a few named alternatives (ChoiceButtons).', { limits: { maxOptions: cap('choice', 'maxOptions', CONTRACT_LIMITS.options) } });
    if (components.bool) add('spec', 'spec.boolean', 'boolean', 'bool', 'switch', 'Turn one property on or off (BoolToggle).');
    if (components.index) {
      const maxItems = cap('index', 'maxItems', PLAN_LIMITS.items);
      add('spec', 'spec.index_picker', 'index', 'index', 'picker', 'Pick one of a few ordered items as chips (IndexPicker).', { limits: { maxItems } });
      add('spec', 'spec.index_slider', 'index', 'index', 'slider', 'Step through many ordered items with a slider and Previous/Next (IndexSlider).', { limits: { maxItems } });
    }
    if (components.indices) add('spec', 'spec.multi_select', 'multi_select', 'indices', 'marks', 'Select a set of independent items as toggle chips (IndicesMarks).', { limits: { maxItems: cap('indices', 'maxItems', PLAN_LIMITS.items) } });
    add('spec', 'spec.reset', 'reset', 'reset', 'button', 'Restore default inputs and the initial state (Reset experiment).', { limits: { maxControls: 1 } });
  }
  if (renderers.includes('program')) {
    add('program', 'program.playback', 'playback', 'transport', 'play_pause_replay', 'Play, Pause and Replay one shared timeline (ProgramScene transport).', { limits: { maxControls: 1 }, requires: ['time_playback'] });
    add('program', 'program.scrubber', 'scrubber', 'range', 'time_range', 'Seek the shared timeline; shows the current time.', { limits: { maxControls: 1 }, requires: ['time_playback'] });
    add('program', 'program.number', 'number', 'number', 'slider', 'Vary a bounded numerical quantity with its unit and value (NumberInput).', { limits: { maxControls: CONTRACT_LIMITS.inputs }, requires: ['number_inputs'] });
    add('program', 'program.select', 'select', 'select', 'choice_buttons', 'Choose one of a few named alternatives, drawn as ChoiceButtons.', { limits: { maxControls: CONTRACT_LIMITS.inputs, maxOptions: CONTRACT_LIMITS.options, maxCombinations: CONTRACT_LIMITS.optionCombinations }, requires: ['select_inputs'] });
    // inputs_v2: native boolean and index inputs (BoolToggle, IndexPicker, IndexSlider through ProgramScene). Absent unless enabled, so the default catalogue and its hash are unchanged.
    if (inputsV2) {
      add('program', 'program.boolean', 'boolean', 'boolean', 'switch', 'Turn one property on or off (BoolToggle).', { limits: { maxControls: CONTRACT_LIMITS.inputs }, requires: [INPUTS_V2_CAPABILITY] });
      add('program', 'program.index_picker', 'index', 'index', 'picker', 'Pick one of a few ordered items as chips (IndexPicker).', { limits: { maxControls: CONTRACT_LIMITS.inputs, maxItems: INDEX_ITEMS }, requires: [INPUTS_V2_CAPABILITY] });
      add('program', 'program.index_slider', 'index', 'index', 'slider', 'Step through ordered items with a slider and Previous/Next (IndexSlider).', { limits: { maxControls: CONTRACT_LIMITS.inputs, maxItems: INDEX_ITEMS }, requires: [INPUTS_V2_CAPABILITY] });
    }
    if (stateful) {
      add('program', 'program.action', 'action', 'action', 'button', 'A button that applies one declared state transition.', { limits: { maxControls: CONTRACT_LIMITS.actions }, requires: ['stateful'] });
      add('program', 'program.target', 'target', 'target', 'select_buttons', 'Select, or with drag, move a declared object; keyboard buttons stay available.', { limits: { maxControls: CONTRACT_LIMITS.targets, drag: true }, requires: ['stateful'] });
    }
    // seek: a button that jumps the shared timeline to a named marker (the At top button). Absent unless enabled, so the default catalogue and its hash are unchanged.
    if (seek) add('program', 'program.seek', 'seek', 'seek', 'button', 'Jump the shared timeline to one named marker with a button (ProgramScene transport; the marker is declared in the timeline).', { limits: { maxControls: 2 }, requires: ['time_playback'] });
    add('program', 'program.reset', 'reset', 'reset', 'button', 'Restore default inputs and the initial state (Reset experiment).', { limits: { maxControls: 1 } });
  }
  return Object.freeze(entries.map(entry => Object.freeze(descriptor.parse(entry))));
}

// What validatePlanBindings() and the role inputs consume: the catalogue, its server-computed hash (a plan binds to it), the
// stateful switch and the evidence ids the job supplied.
export async function interactCapabilities({ renderers, stateful = false, componentControls = [], evidenceIds = [], inputsV2 = false, seek = false } = {}) {
  const catalogue = getInteractControlCatalogue({ renderers, stateful, componentControls, inputsV2, seek });
  return { catalogue, catalogueHash: await contentHash(catalogue), stateful: !!stateful, evidenceIds: [...evidenceIds] };
}
