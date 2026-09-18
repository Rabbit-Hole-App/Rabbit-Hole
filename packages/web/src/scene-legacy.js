// TEMPORARY. Delete once no shipped scene, no persisted canvas block and no test
// fixture carries a `color` field. Plan B's first task checks this condition and
// removes this file if it holds.

// A closed table: each hex is translated to the role that carried its meaning
// in the scenes that used it, not guessed from its hue. Built by reading every
// authoring site in demo-scenes.js and the token-journey scene in
// LearningBlocks.jsx before either was migrated off `color`.
//   '#2383e2' input    - the residual's own `x`, the box handing off into the
//                        next layer, and the embedding table a token is
//                        looked up from: in every case, what a stage receives.
//   '#7c3aed' observed - the embedding row and the sigmoid curve, both driven
//                        by set_values so their numbers are watched changing;
//                        also the transformer block whose effect is observed.
//   '#1a7f37' output   - the residual sum x+block(x), the next-token scores,
//                        and the correctly pinned cost bars: what a stage
//                        produces.
//   '#b45309' warning  - the misleading floating-axis bars (the scene's own
//                        point). The residual "skip" arrow and its label share
//                        this hex too, imprecisely: a closed table is one role
//                        per hex, and this hex meant two different things.
//   '#787774' neutral  - the plain connector arrows between residual boxes,
//                        structure with no semantic weight of its own.
//   '#e8590c' input    - the raw characters before tokenisation: the first
//                        input the token-journey pipeline receives.
const LEGACY_COLOR_TO_ROLE = {
  '#2383e2': 'input',
  '#7c3aed': 'observed',
  '#1a7f37': 'output',
  '#b45309': 'warning',
  '#787774': 'neutral',
  '#e8590c': 'input',
};

export function adaptLegacyScene(raw) {
  if (!raw?.objects) return raw;
  return {
    ...raw,
    objects: raw.objects.map(object => {
      const state = object?.initialState;
      if (!state || !('color' in state)) return object;
      const role = LEGACY_COLOR_TO_ROLE[state.color];
      if (!role) throw new Error(`Object "${object.id}": "${state.color}" is not a known legacy colour`);
      const { color, ...rest } = state;
      return { ...object, initialState: { ...rest, role } };
    }),
  };
}
