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

// How many clickable items an object offers a pickInput binding: chips for
// tokens, cells for a grid, entries for a strip. Anything else cannot bind.
const itemCount = state => {
  if (Array.isArray(state?.tokens)) return state.tokens.length;
  if (state?.rows || state?.cols) return (state.rows || 1) * (state.cols || 1);
  if (Array.isArray(state?.values)) return state.values.length;
  return null;
};

export function evaluateScene(raw, time, rawInputs) {
  const declarations = validateInputDeclarations(raw?.inputs || [], raw?.exampleData, Object.keys(raw?.derived || {}));
  const inputs = coerceInputs(declarations, rawInputs, raw?.exampleData);
  // A pickInput binding is validated against the DECLARED contract, not
  // trusted: it must name an index input, and this object must offer exactly
  // that input's domain of clickable items - a mismatch would let a click
  // write a position the data does not have.
  for (const object of raw?.objects || []) {
    const name = object?.initialState?.pickInput;
    if (!name) continue;
    const declaration = declarations.find(entry => entry.name === name && entry.type === 'index');
    if (!declaration) throw new Error(`Object "${object.id}": pickInput "${name}" names no declared index input`);
    const domain = (raw?.exampleData?.[declaration.of] || []).length;
    const items = itemCount(object.initialState);
    if (items !== domain) {
      throw new Error(`Object "${object.id}": pickInput "${name}" spans ${domain} positions but the object draws ${items ?? 'no'} items`);
    }
  }
  // Inputs join the pool by name (collisions were refused above), and the
  // root `inputs` key is dropped before validation - the validated scene is a
  // plain animation scene whose numbers happen to come from this evaluation.
  const { inputs: _declarationsKey, ...rest } = raw || {};
  const augmented = { ...rest, exampleData: { ...(raw?.exampleData || {}), ...inputs } };
  const derived = buildPool(augmented);
  const scene = validateScene(augmented);
  return { inputs, derived, state: getSceneState(scene, time), scene, declarations };
}

// The one write path for a learning input on a canvas block. Returns the same
// block object when the EFFECTIVE snapshot would not change - no revision is
// spent on a no-op - and otherwise stores the canonical coerced value with a
// monotonically bumped inputRevision, the number every later reader (views,
// checks, the composer context) uses to say which snapshot it saw.
export function applyInputToBlock(block, name, value) {
  let declarations;
  try {
    declarations = validateInputDeclarations(block.scene?.inputs || [], block.scene?.exampleData, Object.keys(block.scene?.derived || {}));
  } catch { return block; } // a scene broken enough to fail here renders the error box, not controls
  // A hidden input is the activity's latch, never the learner's control: the
  // generic command path refuses it outright, so no widget, shortcut, or
  // replayed gesture can flip a reveal that only a committed attempt grants.
  const declared = declarations.find(declaration => declaration.name === name);
  if (!declared || declared.hidden) return block;
  const data = block.scene?.exampleData;
  const before = coerceInputs(declarations, block.inputs, data);
  const after = coerceInputs(declarations, { ...before, [name]: value }, data);
  if (JSON.stringify(after[name]) === JSON.stringify(before[name])) return block;
  return { ...block, inputs: { ...(block.inputs || {}), [name]: after[name] }, inputRevision: (block.inputRevision || 0) + 1 };
}
