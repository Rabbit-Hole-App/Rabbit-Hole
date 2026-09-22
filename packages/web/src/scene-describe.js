import { getSceneState, validateScene } from './animation-scene.js';
import { evaluateScene } from './scene-evaluate.js';

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

// One human-readable statement per effective input: the label the learner
// sees on the control, and the value in the same words the control shows.
// Built from the declarations alone - never from what the input is about.
const describeInput = (declaration, value, data) => {
  if (declaration.type === 'index') {
    const list = data?.[declaration.of];
    const word = Array.isArray(list) && typeof list[value] === 'string' ? `${list[value]} (index ${value})` : `${value + 1} of ${list?.length ?? '?'} (index ${value})`;
    return `${declaration.label} = ${word}`;
  }
  if (declaration.type === 'bool') return `${declaration.label} = ${value ? 'On' : 'Off'}`;
  if (declaration.type === 'choice') return `${declaration.label} = ${declaration.options.find(option => option.id === value)?.label ?? value}`;
  if (declaration.type === 'indices') return `${declaration.label} = [${value.join(', ')}]`;
  if (declaration.type === 'vec2') return `${declaration.label} = (${value[0]}, ${value[1]})`;
  return `${declaration.label} = ${JSON.stringify(value)}`;
};

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
      evaluated = evaluateScene(block.scene, block.time ?? 0, block.inputs);
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
  // The chip label carries enough to detect ambiguity at a glance: the card,
  // then the first couple of current input values.
  const phrases = interactive
    ? evaluated.declarations.map(declaration => inputPhrase(declaration, evaluated.inputs[declaration.name], data)).filter(Boolean).slice(0, 2)
    : [];
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
        `Experiment inputs (revision ${block.inputRevision || 0}): ${evaluated.declarations.map(declaration => describeInput(declaration, evaluated.inputs[declaration.name], data)).join('; ')}`,
        Object.keys(block.scene.derived || {}).length
          ? `Computed locally from the declared example data: ${JSON.stringify(Object.fromEntries(Object.keys(block.scene.derived).map(name => [name, sampleDeep(evaluated.derived[name])])))}`
          : '',
        'Execution: local calculation - the values above are derived mechanically from the scene’s declared example data, not from a model run.',
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
