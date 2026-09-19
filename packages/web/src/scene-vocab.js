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

// magnitude and sequential don't diverge - one ramp, one hue - so they share
// this single token rather than borrowing a role. A role's hue in a heat cell
// is exactly the ROLE/VALUE entanglement this system forbids: a reader must
// not be able to guess what a cell MEANS from its heat colour, only how much
// and (for `signed`) which sign - see scene-style.js's heatStyle comment.
export const HEAT_SCALE = 'heat-scale';

// Every token heatStyle can put under a heat fill - exactly what
// HEAT_INK_FLIP below has to cover.
export const HEAT_TOKENS = Object.freeze([...HEAT_DIVERGING, HEAT_SCALE]);

// heatStyle can't ask the browser what a mix actually rendered to - the fill
// is a custom property, resolved after this code has run - so each heat
// token declares the two mix percentages where its ink has to flip: below
// `mid`, the page ink (--color-ink) clears 4.5:1 against the composited fill;
// from `mid` up to `high`, the pure extreme in --color-ink's own direction
// (--viz-ink-mid: black on light, white on dark) does; from `high` on, the
// opposite extreme (--viz-ink-high) does.
//
// This is keyed by theme, not one number for both - measuring these four
// tokens (compositing each over --viz-surface, WCAG 4.5:1) found that a
// single flip percent cannot serve both themes even for well-behaved tokens:
// heat-negative's black-to-white crossover lands at 82 in light but 61 in
// dark, a real 21-point gap, because its light and dark hex are each tuned
// against their own surface, not against each other. The trap is trying to
// force one number to cover both - see scene-style.js's heatStyle comment.
export const HEAT_INK_FLIP = Object.freeze({
  'heat-negative': Object.freeze({ light: [57, 82], dark: [44, 61] }),
  'heat-midpoint': Object.freeze({ light: [62, 87], dark: [44, 61] }),
  'heat-positive': Object.freeze({ light: [63, 91], dark: [41, 57] }),
  'heat-scale': Object.freeze({ light: [62, 87], dark: [44, 61] }),
});
