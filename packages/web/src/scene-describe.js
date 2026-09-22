import { getSceneState, validateScene } from './animation-scene.js';
import { evaluateScene } from './scene-evaluate.js';
import { describeActivity, revealHiddenInputs } from './scene-activity.js';
import { describeInputValue } from './scene-inputs.js';

// What the tutor is told about an animation. The canvas renders a VALIDATED
// scene, so this must validate too: raw JSON leaves every default unapplied,
// and an object with no authored opacity then reads as invisible - which is
// how the tutor came to be told that a full canvas was empty.
//
// It never throws. Its one caller is a click handler with no error boundary,
// so a throw here is a dead Ask button with no message for the learner.

const NEWLINE = String.fromCharCode(10);

// A grid may hold 256 numbers and a scene 60 objects, and this text goes
// straight into a model prompt. Past a couple of rows the tutor needs the
// shape and the shown values, not every cell - and the remainder is counted
// out loud so a shortened list never reads as a complete one.
const SHOWN = 24;
const sample = values => (values.length <= SHOWN
  ? values
  : [...values.slice(0, SHOWN), `+${values.length - SHOWN} more`]);
const sampleDeep = value => {
  if (!Array.isArray(value)) return value;
  if (value.every(entry => !Array.isArray(entry))) return sample(value);
  return sample(value.map(row => (Array.isArray(row) ? sample(row) : row)));
};

// Input phrasing is shared with the practice-setup line - see
// describeInputValue in scene-inputs.js.

// The short value phrase alone, for the composer's context chip.
const inputPhrase = (declaration, value, data) => {
  if (declaration.type === 'index') {
    const list = data?.[declaration.of];
    return Array.isArray(list) && typeof list[value] === 'string' ? list[value] : String(value + 1);
  }
  if (declaration.type === 'bool') return `${declaration.label.toLowerCase()} ${value ? 'on' : 'off'}`;
  if (declaration.type === 'choice') return declaration.options.find(option => option.id === value)?.label ?? String(value);
  return null;
};

export function describeAnimation(block) {
  const title = block.title || 'Animation';
  const interactive = Array.isArray(block.scene?.inputs) && block.scene.inputs.length > 0;
  let scene = null;
  let state = null;
  let evaluated = null;
  let problem = '';
  try {
    if (interactive) {
      // The same merged inputs the card renders with: the learner's raw
      // values plus whatever commitment has revealed - so the payload can
      // never show more, or less, than the screen does.
      evaluated = evaluateScene(block.scene, block.time ?? 0, { ...(block.inputs || {}), ...revealHiddenInputs(block) });
      scene = evaluated.scene;
      state = evaluated.state;
    } else {
      scene = validateScene(block.scene);
      state = getSceneState(scene, block.time ?? 0);
    }
  } catch (failure) { problem = failure.message; }

  if (!state) {
    return { kind: 'Animation', title, text: [`Animation: ${title}`, `This animation cannot be read: ${problem}`].join(NEWLINE) };
  }

  const shown = state.objects.filter(object => object.visible);
  const concepts = [...new Set(state.objects.map(object => object.conceptId).filter(Boolean))];
  const data = block.scene.exampleData;
  // Only derived values a VISIBLE object actually references are described.
  // The payload is the learner's own information surface: an expected answer
  // computed behind a reveal gate is referenced by nothing on screen (the
  // gated display references the gate's output, which is blank until
  // commit), so it never rides along to the tutor either.
  const visibleIds = new Set(shown.map(object => object.id));
  const referencedDerived = new Set();
  if (interactive) {
    for (const object of block.scene.objects || []) {
      if (!visibleIds.has(object.id)) continue;
      for (const match of JSON.stringify(object.initialState || {}).matchAll(/"\$derive":\s*"([\w.]+)"|\{\{([\w.]+)\}\}/g)) {
        const root = (match[1] || match[2]).split('.')[0];
        if (block.scene.derived?.[root]) referencedDerived.add(root);
      }
    }
  }
  // The chip label carries enough to detect ambiguity at a glance: the card,
  // then the first couple of current input values.
  // Hidden (activity-owned) inputs are attempt machinery, not experiment
  // state - the activity section describes them when that is visible.
  const declared = interactive ? evaluated.declarations.filter(declaration => !declaration.hidden) : [];
  const phrases = declared.map(declaration => inputPhrase(declaration, evaluated.inputs[declaration.name], data)).filter(Boolean).slice(0, 2);
  return {
    kind: interactive ? 'Interactive scene' : 'Animation',
    title: [title, ...phrases].join(' · '),
    text: [
      `${interactive ? 'Interactive scene' : 'Animation'}: ${title} (${scene.duration}s)`,
      `Paused at: ${state.time.toFixed(1)}s`,
      // The experiment's own state rides with the question: which inputs are
      // set (by the labels the learner sees), which revision this is, and
      // every value the scene computed from them - bounded, and never any
      // hidden expected answer (those live behind the activity reveal gate
      // and are stripped before a block ever reaches this serializer).
      ...(interactive ? [
        `Experiment inputs (revision ${block.inputRevision || 0}): ${declared.map(declaration => describeInputValue(declaration, evaluated.inputs[declaration.name], data)).join('; ')}`,
        referencedDerived.size
          ? `Computed locally from the declared example data: ${JSON.stringify(Object.fromEntries([...referencedDerived].map(name => [name, sampleDeep(evaluated.derived[name])])))}`
          : '',
        'Execution: local calculation - the values above are derived mechanically from the scene’s declared example data, not from a model run.',
        describeActivity(block),
      ] : []),
      concepts.length ? `Concepts: ${concepts.join(', ')}` : '',
      block.selectedObject ? `Selected object: ${block.selectedObject}` : '',
      `State at that moment: ${JSON.stringify(shown.map(object => ({
        id: object.semanticId,
        highlighted: object.highlighted,
        ...(object.values ? { values: sample(object.values) } : {}),
        ...(object.tokens ? { tokens: object.tokens } : {}),
        ...(object.cellHighlight != null ? { cellHighlight: object.cellHighlight } : {}),
      })))}`,
    ].filter(Boolean).join(NEWLINE),
  };
}
