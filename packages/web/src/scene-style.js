// Pure style resolver: role + state -> CSS values. Imports only the
// vocabulary, so it never needs to know about the renderer or the evaluator.
// Colour comes from role alone; state modulates weight and fill strength,
// never hue - see docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md.
import { FILL, HEAT_INK_FLIP, ROLES, ROLE_FILL } from './scene-vocab.js';

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
  // Exposed so a caller can prove its own fill landed in this band, rather
  // than trusting that it did - see the grid-path test in scene-style.test.mjs,
  // which is exactly the test that was missing.
  return { fill: tintOf(role, band[step]), stroke: roleVar(role), strokeWidth, onFill: inkOn(role), fillBand: band };
}

// Heat's own ramp, kept apart from FILL on purpose (see scene-vocab.js's
// ROLE_FILL comment): binding heat inside a role's band would cap a soft
// role at 28 and a solid one's floor at 60, and heat needs the whole span
// regardless of which role is carrying it. The two segments below are not a
// style choice - every token heat can resolve to (scene-vocab.js's
// HEAT_INK_FLIP keys) was measured against --viz-surface with page ink and
// its companion ink, and the percentages between 28 and 96 are exactly where
// neither ink clears 4.5:1 against that token's own colour: a real contrast
// dead zone a blended, mid-luminance fill leaves for any fixed pair of inks,
// not a defect in the ink choice. heatStyle jumps over it rather than
// pretending a value in it would be legible.
const HEAT_FLOOR = 6, HEAT_LOW_MAX = 28, HEAT_HIGH_MIN = 96, HEAT_CEILING = 100;
const heatPercent = share => {
  const clamped = Math.max(0, Math.min(1, share));
  return clamped < 0.5
    ? Math.round(HEAT_FLOOR + (clamped / 0.5) * (HEAT_LOW_MAX - HEAT_FLOOR))
    : Math.round(HEAT_HIGH_MIN + ((clamped - 0.5) / 0.5) * (HEAT_CEILING - HEAT_HIGH_MIN));
};
const heatInk = (token, percent) => {
  const threshold = HEAT_INK_FLIP[token];
  return threshold != null && percent >= threshold ? `var(--viz-on-${token})` : 'var(--color-ink)';
};

// value + domain + heatMode + semantic tokens -> { fillToken, mixPercent, inkToken }.
// Pure and dependency-free: fillToken and inkToken are bare names the
// renderer turns into var(--viz-<name>) itself (see AnimatedScene.jsx's
// color-mix composition), so nothing here ever holds a hex value, and a
// scene re-skins for free when the learner switches appearance.
export function heatStyle(value, domain, mode, role) {
  const extent = Math.max(Math.abs(domain.min), Math.abs(domain.max), 0.0001);
  if (mode === 'sequential') {
    // One ramp over the signed range, low to high - order is what this mode
    // promises, not magnitude, so the raw value is what's normalised.
    const span = domain.max - domain.min || 0.0001;
    const percent = heatPercent((value - domain.min) / span);
    return { fillToken: role, mixPercent: percent, inkToken: heatInk(role, percent) };
  }
  if (mode === 'signed') {
    // Sign picks the token - negative and positive never share one, even at
    // equal distance from zero - and that distance alone drives the mix.
    const token = value > 0 ? 'heat-positive' : value < 0 ? 'heat-negative' : 'heat-midpoint';
    const percent = heatPercent(Math.abs(value) / extent);
    return { fillToken: token, mixPercent: percent, inkToken: heatInk(token, percent) };
  }
  // magnitude (and the true/undefined shorthand the gate already normalised
  // away): sign carries no meaning, so every value shares the one ramp and
  // the role supplies the one hue.
  const percent = heatPercent(Math.abs(value) / extent);
  return { fillToken: role, mixPercent: percent, inkToken: heatInk(role, percent) };
}
