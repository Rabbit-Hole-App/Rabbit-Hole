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
// Fill says how loudly a role speaks; hue says what kind of thing it is. The
// four numbers are muted, rest, lit and peak - the fill a role takes when it is
// unavailable, idle, being attended to, and picked. The BANDS NEVER OVERLAP, so
// a state can move a role within its own tier without ever making it read as a
// role from another one: a chosen soft role stops at 28 before strong begins.
export const FILL = Object.freeze({
  soft: Object.freeze([6, 12, 20, 28]),
  strong: Object.freeze([32, 38, 44, 48]),
  solid: Object.freeze([60, 88, 94, 100]),
});
// Only four roles earn more than soft, because loud has to stay rare to mean
// anything. Observed and success are solid: measured data drawn solid against a
// tinted prediction is the convention a reader already knows, and a success is
// the one moment a scene is allowed to shout.
export const ROLE_FILL = Object.freeze({ observed: 'solid', success: 'solid', learner: 'strong', warning: 'strong' });

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
