import { shapeStyle, textStyle } from './scene-style.js';
import { FILLED_INK, INK, PALETTE, PATH, SURFACE } from './tutor-diagrams/primitives.js';
import { LEGIBILITY_FLOORS } from './scene-layout.js';
import { TEACHING_FONT, TEACHING_TEXT } from './tutor-diagrams/teaching-theme.js';

// Every colour comes from the written card's own exports (tutor-diagrams/primitives.js): no literal colour lives here (the drift test pins that).
const COLORS = PALETTE;
const ROLES = {
  input: 'process', output: 'outcome', prediction: 'lavender', observed: 'olive',
  learner: 'decision', tutor: 'rose', code: 'slate', warning: 'coral', success: 'outcome',
};
// The second body of a scene is the decision hue, as the Codex reference cards draw it (the first is process blue); olive is the observed-data role and no body takes it.
const IDENTITIES = { 'identity-1': 'process', 'identity-2': 'decision', 'identity-3': 'coral' };
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

// The scene's text classes in a composed card ARE the written card's (TEACHING_TEXT: 17/700 title, 14/600 heading, 14/400 body, 13/400 captions, mono code), and
// its legibility floors are those sizes (owner 2026-11-12: the written card is the proven-legible reference). Legacy /animation scenes keep their own sizes and floors.
const INTERACT_TEXT = Object.freeze({ code: { fontFamily: 'var(--font-mono)' } });
export const interactTextStyle = typographyRole => {
  const text = TEACHING_TEXT[typographyRole];
  return { ...textStyle(typographyRole), ...(text ? { fontSize: text.size, fontWeight: text.weight } : {}), ...INTERACT_TEXT[typographyRole] };
};
export const INTERACT_FLOORS = Object.freeze({ ...Object.fromEntries(Object.entries(TEACHING_TEXT).map(([role, text]) => [role, text.size])), metadata: LEGIBILITY_FLOORS.metadata });
// Passed to legibleFrame / sceneLegibility so a composed card is sized by these sizes and floors.
export const INTERACT_LOOK = Object.freeze({ size: role => interactTextStyle(role).fontSize, floor: role => INTERACT_FLOORS[role] ?? INTERACT_FLOORS.body });

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
