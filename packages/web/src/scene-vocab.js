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

// How a grid or strip's heat maps a value to fill. heat: true predates modes
// and stays valid as shorthand for magnitude - the gate in animation-scene.js
// normalises both forms to { mode }.
export const HEAT_MODES = Object.freeze(['magnitude', 'signed', 'sequential']);

// The `signed` mode's diverging scale, named apart from ROLES because heat
// replaces a shape's fill outright rather than tinting a role. Blue/orange
// rather than red/green, so negative and positive stay distinguishable under
// protanopia, deuteranopia and tritanopia - see index.css for the values and
// their measured contrast against --viz-surface.
export const HEAT_DIVERGING = Object.freeze(['heat-negative', 'heat-midpoint', 'heat-positive']);

// Heat can't ask the browser what a mix actually rendered to - the fill is a
// custom property, resolved after this code has run - so each token that
// heatStyle can choose as a fill declares, beside its name, the mix percentage
// above which its companion ink (--viz-on-<token> in index.css) beats the page
// ink. A token missing here has no companion: heatStyle leaves it on the page
// ink at every mix, the same fallback shapeStyle's inkOn already gives a
// non-solid role. One number per token, not per theme - heatStyle only ever
// produces mixPercent values from two measured-safe bands (see scene-style.js),
// so any threshold between them classifies every value the same way in both
// themes at once.
export const HEAT_INK_FLIP = Object.freeze({
  observed: 60,
  success: 60,
  'heat-negative': 60,
  'heat-midpoint': 60,
  'heat-positive': 60,
});
