// Pure style resolver: role + state -> CSS values. Imports only the
// vocabulary, so it never needs to know about the renderer or the evaluator.
// Colour comes from role alone; state modulates weight and fill strength,
// never hue - see docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md.
import { ROLES } from './scene-vocab.js';

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

// One considered default per state: fill strength and stroke weight only.
// Colour (`stroke`, below) never appears here - that is the orthogonality
// the whole model rests on.
const DEFAULT_STYLE = { fillPercent: 12, strokeWidth: 1.5 };
const STATE_STYLE = {
  chosen: { fillPercent: 28, strokeWidth: 2.5 },
  selected: { fillPercent: 24, strokeWidth: 2.5 },
  highlighted: { fillPercent: 20, strokeWidth: 2 },
  active: { fillPercent: 18, strokeWidth: 2 },
  blocked: { fillPercent: 8, strokeWidth: 1.5 },
  disabled: { fillPercent: 6, strokeWidth: 1 },
};
// A multi-state object resolves to one considered look instead of an arbitrary
// key-order pick. Availability outranks attention: something the learner cannot
// act on must keep reading that way even while it is selected or highlighted,
// or the frame promises an interaction that will not answer.
const STATE_PRIORITY = ['disabled', 'blocked', 'chosen', 'selected', 'highlighted', 'active'];

export function shapeStyle(role, state = {}) {
  const matched = STATE_PRIORITY.find(name => state[name]);
  const { fillPercent, strokeWidth } = matched ? STATE_STYLE[matched] : DEFAULT_STYLE;
  return { fill: tintOf(role, fillPercent), stroke: roleVar(role), strokeWidth };
}
