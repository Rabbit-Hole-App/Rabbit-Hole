// Pure style resolver: role + state -> CSS values. Imports only the
// vocabulary, so it never needs to know about the renderer or the evaluator.
// Colour comes from role alone; state modulates weight and fill strength,
// never hue - see docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md.
import { FILL, HEAT_INK_FLIP, HEAT_SCALE, ROLES, ROLE_FILL } from './scene-vocab.js';

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

// defaultTier only ever weakens the fallback FILL uses for a role ROLE_FILL
// doesn't name - an explicit ROLE_FILL entry (the loud four) always wins. A
// comparison mark like a bar chart needs its resting bars to still read as
// bars; the soft tier's 6-28 band was tuned for a passive shape like a box,
// not a value a learner is meant to compare at a glance. See its one caller
// in AnimatedScene.jsx's bars, which is the mark this is for.
export function shapeStyle(role, state = {}, defaultTier = 'soft') {
  const matched = STATE_PRIORITY.find(name => state[name]);
  const { step, strokeWidth } = matched ? STATE_STYLE[matched] : RESTING;
  const band = FILL[ROLE_FILL[role] ?? defaultTier] ?? FILL.soft;
  // Exposed so a caller can prove its own fill landed in this band, rather
  // than trusting that it did - see the grid-path test in scene-style.test.mjs,
  // which is exactly the test that was missing.
  return { fill: tintOf(role, band[step]), stroke: roleVar(role), strokeWidth, onFill: inkOn(role), fillBand: band };
}

// Heat's own ramp, kept apart from FILL on purpose (see scene-vocab.js's
// ROLE_FILL comment): binding heat inside a role's band would cap a soft
// role at 28 and a solid one's floor at 60, and heat needs the whole span
// regardless of which role is carrying it.
//
// The ramp is one affine map, floor to ceiling, no split:
// percent = round(HEAT_FLOOR + share * (HEAT_CEILING - HEAT_FLOOR)).
// Its slope over a share step of 0.01 is (100-6)*0.01 = 0.94, which is under
// 1, so rounding can only ever move a sample by 0 or 1 from its neighbour -
// never a jump - see scene-style.test.mjs's monotonicity test, which samples
// 101 shares and asserts exactly that bound. HEAT_FLOOR stays above 0 so the
// smallest real value still shows a fill a reader can tell apart from a
// blocked/null cell, which never reaches heatStyle at all (see
// AnimatedScene.jsx's grid path, where a null value reads as the role's own
// muted band instead).
const HEAT_FLOOR = 6, HEAT_CEILING = 100;
const heatPercent = share => Math.round(HEAT_FLOOR + Math.max(0, Math.min(1, share)) * (HEAT_CEILING - HEAT_FLOOR));

// Contrast is ink's job, never the fill's (see the module comment) - a heat
// cell's own colour can land anywhere along the ramp above, so the ink has to
// be picked from where THIS fill actually sits, never from a role or a
// single theme-blind threshold. Measuring the four heat tokens (compositing
// each over --viz-surface, WCAG 4.5:1) found that one flip percent cannot
// serve both themes even for these well-behaved tokens - see
// scene-vocab.js's HEAT_INK_FLIP comment for the measured gap - so the
// threshold is per token AND per theme; `dark` only selects which already-
// measured pair applies, it never resolves a colour itself.
export const heatInk = (token, percent, dark) => {
  const flip = HEAT_INK_FLIP[token]?.[dark ? 'dark' : 'light'];
  if (!flip) return 'var(--color-ink)';
  const [mid, high] = flip;
  if (percent >= high) return 'var(--viz-ink-high)';
  if (percent >= mid) return 'var(--viz-ink-mid)';
  return 'var(--color-ink)';
};

// value + domain + heatMode + dark -> { fillToken, mixPercent, inkToken }.
// Pure and dependency-free: fillToken and inkToken are ready-to-use CSS
// values (a var() reference), so nothing here ever holds a hex value, and a
// scene re-skins for free when the learner switches appearance - `dark` only
// picks which of two already-themed inks is correct, exactly like the
// `.dark` block in index.css does for every other token.
//
// role no longer reaches the fill. It used to: magnitude and sequential
// painted with the object's own role, which meant a heat cell's colour could
// be read as ROLE - exactly what this system forbids VALUE from doing (see
// the module comment). Every mode below paints from HEAT_DIVERGING or
// HEAT_SCALE instead, so a heat cell's hue only ever says sign or "how much",
// never what the object is; role still owns the grid's frame and stroke (see
// AnimatedScene.jsx's grid path), just not the cell interior.
export function heatStyle(value, domain, mode, dark = false) {
  const extent = Math.max(Math.abs(domain.min), Math.abs(domain.max), 0.0001);
  if (mode === 'sequential') {
    // One ramp over the signed range, low to high - order is what this mode
    // promises, not magnitude, so the raw value is what's normalised.
    const span = domain.max - domain.min || 0.0001;
    const percent = heatPercent((value - domain.min) / span);
    return { fillToken: HEAT_SCALE, mixPercent: percent, inkToken: heatInk(HEAT_SCALE, percent, dark) };
  }
  if (mode === 'signed') {
    // Sign picks the token - negative and positive never share one, even at
    // equal distance from zero - and that distance alone drives the mix.
    const token = value > 0 ? 'heat-positive' : value < 0 ? 'heat-negative' : 'heat-midpoint';
    const percent = heatPercent(Math.abs(value) / extent);
    return { fillToken: token, mixPercent: percent, inkToken: heatInk(token, percent, dark) };
  }
  // magnitude (and the true/undefined shorthand the gate already normalised
  // away): sign carries no meaning, so every value shares HEAT_SCALE's one
  // ramp - never the role, see this function's own comment above.
  const percent = heatPercent(Math.abs(value) / extent);
  return { fillToken: HEAT_SCALE, mixPercent: percent, inkToken: heatInk(HEAT_SCALE, percent, dark) };
}

// A selected cell must stay findable whether its own fill is barely tinted or
// fully saturated - a ring drawn in the role's own colour can vanish into a
// cell of that same hue at high mix, which was the "0.5px stroke nobody could
// find" defect this replaces (see AnimatedScene.jsx's grid path for the old
// `highlighted` ring). Reusing the exact ink heatStyle already proved clears
// 4.5:1 against THIS fill guarantees the ring reads at any intensity, in
// either theme, without moving the fill's own hue or mix - state overlays
// VALUE, it never touches it. A non-heat cell has no such ink to borrow, so
// it keeps the role's own stroke colour, just at this same stronger weight.
const SELECTED_RING_WIDTH = 3;
export function selectionRing(role, heat) {
  return { stroke: heat ? heat.inkToken : roleVar(role), strokeWidth: SELECTED_RING_WIDTH };
}
