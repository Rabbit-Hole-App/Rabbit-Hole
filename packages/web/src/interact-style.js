import { shapeStyle, textStyle } from './scene-style.js';
import { FILLED_INK, INK, PALETTE, PATH, SURFACE } from './tutor-diagrams/primitives.js';
import { TEACHING_FONT } from './tutor-diagrams/teaching-theme.js';

// Every colour comes from the written card's own exports (tutor-diagrams/primitives.js): no literal colour lives here (the drift test pins that).
const COLORS = PALETTE;
const ROLES = {
  input: 'process', output: 'outcome', prediction: 'lavender', observed: 'olive',
  learner: 'decision', tutor: 'rose', code: 'slate', warning: 'coral', success: 'outcome',
};
const IDENTITIES = { 'identity-1': 'process', 'identity-2': 'olive', 'identity-3': 'coral' };
// The teaching font, as TutorDiagram draws a teaching diagram (tutor-diagrams/TutorDiagram.js), so a composed /interactive card reads like the written /explain card.
export const INTERACT_FONT = TEACHING_FONT;
export const INTERACT_BOX_RADIUS = 7;

const hueFor = (role, identity) => COLORS[IDENTITIES[identity] ?? ROLES[role]];
const mix = (hue, percent, base) => `color-mix(in srgb, ${hue} ${percent}%, ${base})`;

// Bare labels and lines blend toward page ink instead of using a light fill
// as a foreground. The app's CSS handles both appearances.
export function interactMarkColor(role, identity = null) {
  const hue = hueFor(role, identity);
  return hue ? mix(hue, 33, INK) : INK;
}

// A line or arrow in a composed card is drawn as the written diagrams draw a connector: INK, the PATH blue when it is highlighted, active or chosen,
// and a role hue only for the roles a plan uses as "the thing to watch" (an output, a warning, the learner's own mark).
const WATCHED_ROLES = new Set(['output', 'warning', 'learner']);
export function interactStrokeColor(role, identity = null, state = {}) {
  if (state.highlighted || state.chosen || state.active) return PATH;
  return WATCHED_ROLES.has(role) ? interactMarkColor(role, identity) : INK;
}

// The scene's text classes in a composed card, taken toward the written diagrams' (tutor-diagrams/TutorDiagram.js: a 700 title, 600 headings, 400 body and
// captions, mono code). The SIZES are deliberately not changed: the written card's 17/14/14/13 px sit under this scene's legibility floors (20/17/15/14,
// scene-layout.js LEGIBILITY_FLOORS) and a floor is never relaxed; a caption's weight and the code family are the parts that do not conflict.
const INTERACT_TEXT = Object.freeze({ caption: { fontWeight: 400 }, code: { fontFamily: 'var(--font-mono)' } });
export const interactTextStyle = typographyRole => ({ ...textStyle(typographyRole), ...INTERACT_TEXT[typographyRole] });

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
