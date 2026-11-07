import { shapeStyle } from './scene-style.js';
import { INK, PALETTE, SURFACE } from './tutor-diagrams/primitives.js';

// These three swatches were approved with the extended Tutor diagram palette.
// Prefer the written library's exports when they are available on the base.
const COLORS = { lavender: '#B9A4E8', rose: '#E8A3B7', slate: '#A8BBD0', ...PALETTE };
const ROLES = {
  input: 'process', output: 'outcome', prediction: 'lavender', observed: 'olive',
  learner: 'decision', tutor: 'rose', code: 'slate', warning: 'coral', success: 'outcome',
};
const IDENTITIES = { 'identity-1': 'process', 'identity-2': 'olive', 'identity-3': 'coral' };
const FILLED_INK = '#32211c';

export const INTERACT_FONT = 'Arial, Liberation Sans, sans-serif';
export const INTERACT_BOX_RADIUS = 7;

const hueFor = (role, identity) => COLORS[IDENTITIES[identity] ?? ROLES[role]];
const mix = (hue, percent, base) => `color-mix(in srgb, ${hue} ${percent}%, ${base})`;

// Bare labels and lines blend toward page ink instead of using a light fill
// as a foreground. The app's CSS handles both appearances.
export function interactMarkColor(role, identity = null) {
  const hue = hueFor(role, identity);
  return hue ? mix(hue, 33, INK) : INK;
}

export function interactShapeStyle(role, state = {}, tier, identity = null) {
  const { strokeWidth } = shapeStyle(role, state, tier, identity);
  const hue = hueFor(role, identity);
  if (!hue) return { fill: SURFACE, stroke: INK, onFill: INK, strokeWidth };
  if (state.blocked || state.disabled) {
    return { fill: mix(hue, 10, SURFACE), stroke: interactMarkColor(role, identity), onFill: INK, strokeWidth };
  }
  return { fill: hue, stroke: FILLED_INK, onFill: FILLED_INK, strokeWidth };
}

// A grid cell, chip or bar still signals its own state. Heat values keep their
// independent numerical scale. Selection rings still come from SelectionMark.
export function interactDataStyle(role, state = {}, tier, identity = null) {
  const { strokeWidth } = shapeStyle(role, state, tier, identity);
  const hue = hueFor(role, identity) ?? COLORS.slate;
  const quiet = state.blocked || state.disabled;
  const lit = !quiet && (state.chosen || state.selected || state.highlighted || state.active);
  return {
    fill: lit ? hue : mix(hue, quiet ? 10 : tier === 'strong' ? 58 : 22, SURFACE),
    stroke: interactMarkColor(role, identity),
    onFill: lit ? FILLED_INK : INK,
    strokeWidth,
  };
}
