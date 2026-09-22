import { validateScene, getSceneState } from './animation-scene.js';
import { buildPool } from './scene-derive.js';
import { coerceInputs, validateInputDeclarations } from './scene-inputs.js';

// The one evaluation path for a scene that declares learning inputs (spec
// §7.1). Raw learner values are coerced exactly once; the coerced values join
// the derive pool under their declared names; the scene then resolves and
// evaluates exactly as a passive scene does. Every consumer - derived math,
// rendered values, captions, input-bound highlights, checks, the composer
// context - reads this same effective snapshot, so no view can disagree with
// another about which input the learner set.
//
// A scene with no inputs passes through unchanged: coercion of an empty
// declaration list is {} and the pool is untouched, so the passive path and
// this one are the same function then. An unresolvable reference still throws
// (the caller shows the existing scene error box) - a diagnostic, never a
// stale result labelled current.

export function evaluateScene(raw, time, rawInputs) {
  const declarations = validateInputDeclarations(raw?.inputs || [], raw?.exampleData, Object.keys(raw?.derived || {}));
  const inputs = coerceInputs(declarations, rawInputs, raw?.exampleData);
  // Inputs join the pool by name (collisions were refused above), and the
  // root `inputs` key is dropped before validation - the validated scene is a
  // plain animation scene whose numbers happen to come from this evaluation.
  const { inputs: _declarationsKey, ...rest } = raw || {};
  const augmented = { ...rest, exampleData: { ...(raw?.exampleData || {}), ...inputs } };
  const derived = buildPool(augmented);
  const scene = validateScene(augmented);
  return { inputs, derived, state: getSceneState(scene, time), scene, declarations };
}
