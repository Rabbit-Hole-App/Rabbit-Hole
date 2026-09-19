// Pure style resolver: role + state -> CSS values. Imports only the
// vocabulary, so it never needs to know about the renderer or the evaluator.
// Colour comes from role alone; state modulates weight and fill strength,
// never hue - see docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md.
import { FILL, ROLES, ROLE_FILL } from './scene-vocab.js';

export function roleVar(role) {
  return ROLES.includes(role) ? `var(--viz-${role})` : 'var(--viz-neutral)';
}

export function tintOf(role, percent) {
  if (percent === 0) return 'transparent';
  if (percent === 100) return roleVar(role);
  return `color-mix(in srgb, ${roleVar(role)} ${percent}%, transparent)`;
}

const TEXT_STYLE = {
  display: { fontSize: 28, fontWeight: 700, fill: 'var(--color-ink)' },
  heading: { fontSize: 20, fontWeight: 600, fill: 'var(--color-ink)' },
  body: { fontSize: 15, fontWeight: 400, fill: 'var(--color-ink)' },
  caption: { fontSize: 12, fontWeight: 500, fill: 'var(--color-ink-2)' },
  annotation: { fontSize: 11, fontWeight: 400, fill: 'var(--color-ink-3)' },
  code: { fontSize: 13, fontWeight: 400, fill: 'var(--color-ink-2)', fontFamily: 'var(--font-mono)' },
  equation: { fontSize: 16, fontWeight: 400, fill: 'var(--color-ink)' },
};
// Returned by reference below, so a caller mutating one would silently retune
// the default for everyone after it.
for (const style of Object.values(TEXT_STYLE)) Object.freeze(style);

export function textStyle(typographyRole) {
  return TEXT_STYLE[typographyRole] ?? TEXT_STYLE.body;
}

// A state picks a step along its role's own fill band, and a stroke weight.
// Colour never appears here - that is the orthogonality the whole model rests
// on. `step` indexes FILL's [muted, rest, lit, peak].
const STATE_STYLE = {
  chosen: { step: 3, strokeWidth: 2.5 },
  selected: { step: 3, strokeWidth: 2.5 },
  highlighted: { step: 2, strokeWidth: 2 },
  active: { step: 2, strokeWidth: 2 },
  blocked: { step: 0, strokeWidth: 1.5 },
  disabled: { step: 0, strokeWidth: 1 },
};
const RESTING = { step: 1, strokeWidth: 1.5 };
// A multi-state object resolves to one considered look instead of an arbitrary
// key-order pick. Availability outranks attention: something the learner cannot
// act on must keep reading that way even while it is selected or highlighted,
// or the frame promises an interaction that will not answer.
const STATE_PRIORITY = ['disabled', 'blocked', 'chosen', 'selected', 'highlighted', 'active'];

// What ink reads on top of this role's own fill. Only a solid role is its own
// background; everything else is a tint over the surface, so the page's ink
// still wins. The token flips with the theme, which a fixed white could not.
export function inkOn(role) {
  return ROLE_FILL[role] === 'solid' ? `var(--viz-on-${role})` : 'var(--color-ink)';
}

export function shapeStyle(role, state = {}) {
  const matched = STATE_PRIORITY.find(name => state[name]);
  const { step, strokeWidth } = matched ? STATE_STYLE[matched] : RESTING;
  const band = FILL[ROLE_FILL[role]] ?? FILL.soft;
  return { fill: tintOf(role, band[step]), stroke: roleVar(role), strokeWidth, onFill: inkOn(role) };
}
