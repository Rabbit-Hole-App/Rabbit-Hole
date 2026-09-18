// Frozen vocabulary shared by every scene module. Zero imports on purpose:
// this is what lets the pure evaluator (animation-scene.js) depend on it
// without pulling renderer code into it. See docs/superpowers/specs/
// 2026-09-18-visual-language-and-motion-design.md for the design.

// What an object IS. Authored, stable for the life of the object.
export const ROLES = Object.freeze([
  'neutral', 'input', 'output', 'prediction', 'observed',
  'learner', 'tutor', 'code', 'warning', 'success',
]);

// What is HAPPENING to an object. Orthogonal to role: a state never changes
// which role's colour is shown, only weight, fill strength and ring.
export const STATES = Object.freeze([
  'active', 'selected', 'highlighted', 'chosen', 'blocked', 'disabled',
]);

// Named by purpose, not by size.
export const TYPE_ROLES = Object.freeze([
  'display', 'heading', 'body', 'caption', 'annotation', 'code', 'equation',
]);

// Gaps, padding, margins, offsets, corner radii, stroke weights.
export const SPACE = Object.freeze([4, 8, 12, 16, 24, 32, 48, 64, 96]);

// Component dimensions on a 4px baseline, chosen for how they look - not
// required to be members of SPACE, which governs gaps and offsets instead.
export const GEOMETRY = Object.freeze({
  nodeMinWidth: 176,
  nodeHeight: 56,
  barWidth: 28,
  barHeight: 120,
  chipHeight: 32,
  cellPitch: 24,
});

// Named timings, resolved to seconds at the validation gate.
export const TIMING = Object.freeze({
  instant: 0,
  fast: 0.18,
  normal: 0.35,
  slow: 0.7,
  explain: 1.1,
});

export const SOUNDS = Object.freeze([
  'soft_pop', 'soft_whoosh', 'connect', 'split', 'merge', 'tick',
  'select', 'toggle_on', 'toggle_off', 'reveal',
  'success', 'incorrect', 'compute', 'drop', 'snap',
]);
