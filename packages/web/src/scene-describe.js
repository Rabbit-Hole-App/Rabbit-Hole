import { getSceneState, validateScene } from './animation-scene.js';

// What the tutor is told about an animation. The canvas renders a VALIDATED
// scene, so this must validate too: raw JSON leaves every default unapplied,
// and an object with no authored opacity then reads as invisible - which is
// how the tutor came to be told that a full canvas was empty.
//
// It never throws. Its one caller is a click handler with no error boundary,
// so a throw here is a dead Ask button with no message for the learner.

const NEWLINE = String.fromCharCode(10);

export function describeAnimation(block) {
  const title = block.title || 'Animation';
  let state = null;
  let problem = '';
  try { state = getSceneState(validateScene(block.scene), block.time ?? 0); }
  catch (failure) { problem = failure.message; }

  if (!state) {
    return { kind: 'Animation', title, text: [`Animation: ${title}`, `This animation cannot be read: ${problem}`].join(NEWLINE) };
  }

  const shown = state.objects.filter(object => object.visible);
  const concepts = [...new Set(state.objects.map(object => object.conceptId).filter(Boolean))];
  return {
    kind: 'Animation',
    title,
    text: [
      `Animation: ${title} (${block.scene.duration}s)`,
      `Paused at: ${state.time.toFixed(1)}s`,
      concepts.length ? `Concepts: ${concepts.join(', ')}` : '',
      block.selectedObject ? `Selected object: ${block.selectedObject}` : '',
      `State at that moment: ${JSON.stringify(shown.map(object => ({
        id: object.semanticId,
        highlighted: object.highlighted,
        ...(object.values ? { values: object.values } : {}),
        ...(object.tokens ? { tokens: object.tokens } : {}),
        ...(object.cellHighlight != null ? { cellHighlight: object.cellHighlight } : {}),
      })))}`,
    ].filter(Boolean).join(NEWLINE),
  };
}
