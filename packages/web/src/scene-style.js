// Pure style resolver: role + state -> CSS values. Imports only the
// vocabulary, so it never needs to know about the renderer or the evaluator.
// Colour comes from role alone; state modulates weight and fill strength,
// never hue - see docs/superpowers/specs/2026-09-18-visual-language-and-motion-design.md.
import { FILL, HEAT_INK_ZONES, HEAT_SCALE, IDENTITY_SLOTS, ROLES, ROLE_FILL } from './scene-vocab.js';

export function roleVar(role) {
  return ROLES.includes(role) ? `var(--viz-${role})` : 'var(--viz-neutral)';
}

// IDENTITY's own resolver, mirroring roleVar - but with no fallback, because
// "no identity" and "an unrecognised identity" are the same fact: there is no
// hue to hand back, so the caller falls back to role's own (see shapeStyle).
export function identityVar(slot) {
  return IDENTITY_SLOTS.includes(slot) ? `var(--viz-${slot})` : null;
}

// Shared by tintOf and shapeStyle: a colour-mix against a resolved hue
// reference, not a role name - shapeStyle needs to tint whichever hue won
// (role's or identity's), and tintOf below is just this called with role's.
function tintHue(hue, percent) {
  if (percent === 0) return 'transparent';
  if (percent === 100) return hue;
  return `color-mix(in srgb, ${hue} ${percent}%, transparent)`;
}

export function tintOf(role, percent) {
  return tintHue(roleVar(role), percent);
}

// caption and annotation raised from 12/11 and annotation's ink raised from
// --color-ink-3 to --color-ink-2 - the app-review finding that annotation
// and caption text reads too small and too faint across every scene. Fixed
// once, here, rather than per scene (a scene-local font nudge would only
// have fixed the one scene someone happened to look at): every grid/strip
// caption, every axis label and every free-floating annotation a scene
// authors (scene-layout.js's collectLabels reads these same two sizes) gets
// the same increase. --color-ink-3 is the app's own "tertiary: placeholders,
// disabled" tone (index.css) - correct for a hint nobody needs to act on,
// wrong for a label naming what a shape IS. Re-run scene-style.test.mjs
// and the gallery/layout-lint suites after touching this: a bigger estimated
// label box can newly collide with an arrow that used to clear it by only a
// few px.
const TEXT_STYLE = {
  display: { fontSize: 28, fontWeight: 700, fill: 'var(--color-ink)' },
  heading: { fontSize: 20, fontWeight: 600, fill: 'var(--color-ink)' },
  body: { fontSize: 15, fontWeight: 400, fill: 'var(--color-ink)' },
  caption: { fontSize: 14, fontWeight: 500, fill: 'var(--color-ink-2)' },
  annotation: { fontSize: 13, fontWeight: 400, fill: 'var(--color-ink-2)' },
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
// identitySlot defaults to null so every existing 2- and 3-arg call site is
// unchanged: no identity in, no identity out, hue still comes from role
// alone. When a slot IS resolved (see animation-scene.js's validateScene) it
// takes over the hue everywhere role's hue would otherwise have gone - fill,
// frame, stroke - but never the fill TIER (still ROLE_FILL[role] above),
// never strokeWidth (state's job) and never ink (inkOn(role) below): IDENTITY
// is "which peer", not "how loud" or "what's readable on top", so it must
// not be able to touch either.
export function shapeStyle(role, state = {}, defaultTier = 'soft', identitySlot = null) {
  const matched = STATE_PRIORITY.find(name => state[name]);
  const { step, strokeWidth } = matched ? STATE_STYLE[matched] : RESTING;
  const band = FILL[ROLE_FILL[role] ?? defaultTier] ?? FILL.soft;
  const hue = identityVar(identitySlot) ?? roleVar(role);
  // Exposed so a caller can prove its own fill landed in this band, rather
  // than trusting that it did - see the grid-path test in scene-style.test.mjs,
  // which is exactly the test that was missing.
  return { fill: tintHue(hue, band[step]), stroke: hue, strokeWidth, onFill: inkOn(role), fillBand: band };
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
// be picked from where THIS fill actually sits, never from a role. It is NOT
// picked from the theme: heatStyle has no idea whether the page is light or
// dark, on purpose (see this function's own comment below), so each zone in
// scene-vocab.js's HEAT_INK_ZONES names a CSS custom property whose value
// flips in index.css's .dark block instead of a threshold JS would have to
// pick between. The zone boundaries themselves are still theme-blind numbers
// - the union of both themes' own safe edges - and are the same regardless
// of which theme is actually showing.
export const heatInk = (token, percent) => {
  const zones = HEAT_INK_ZONES[token];
  if (!zones) return 'var(--color-ink)';
  return (zones.find(([upto]) => percent <= upto) ?? zones[zones.length - 1])[1];
};

// value + domain + heatMode -> { fillToken, mixPercent, inkToken }. Pure and
// theme-blind: fillToken and inkToken are ready-to-use CSS values (a var()
// reference), so nothing here ever holds a hex value, and - critically -
// nothing here ever reads which theme is active either. An SVG driven
// entirely by CSS variables re-skins itself on an appearance change with no
// listener at all; a `dark` parameter threaded in here (an earlier version
// of this fix had one) would have thrown that property away for a problem
// CSS alone already solves, since every value this function returns is a
// var() reference whose own resolution already flips with .dark. See
// scene-style.test.mjs's regression test, which asserts neither this file
// nor AnimatedScene.jsx ever reads theme state.
//
// role no longer reaches the fill. It used to: magnitude and sequential
// painted with the object's own role, which meant a heat cell's colour could
// be read as ROLE - exactly what this system forbids VALUE from doing (see
// the module comment). Every mode below paints from HEAT_DIVERGING or
// HEAT_SCALE instead, so a heat cell's hue only ever says sign or "how much",
// never what the object is; role still owns the grid's frame and stroke (see
// AnimatedScene.jsx's grid path), just not the cell interior.
export function heatStyle(value, domain, mode) {
  const extent = Math.max(Math.abs(domain.min), Math.abs(domain.max), 0.0001);
  if (mode === 'sequential') {
    // One ramp over the signed range, low to high - order is what this mode
    // promises, not magnitude, so the raw value is what's normalised.
    const span = domain.max - domain.min || 0.0001;
    const percent = heatPercent((value - domain.min) / span);
    return { fillToken: HEAT_SCALE, mixPercent: percent, inkToken: heatInk(HEAT_SCALE, percent) };
  }
  if (mode === 'signed') {
    // Sign picks the token - negative and positive never share one, even at
    // equal distance from zero - and that distance alone drives the mix.
    const token = value > 0 ? 'heat-positive' : value < 0 ? 'heat-negative' : 'heat-midpoint';
    const percent = heatPercent(Math.abs(value) / extent);
    return { fillToken: token, mixPercent: percent, inkToken: heatInk(token, percent) };
  }
  // magnitude (and the true/undefined shorthand the gate already normalised
  // away): sign carries no meaning, so every value shares HEAT_SCALE's one
  // ramp - never the role, see this function's own comment above.
  const percent = heatPercent(Math.abs(value) / extent);
  return { fillToken: HEAT_SCALE, mixPercent: percent, inkToken: heatInk(HEAT_SCALE, percent) };
}

// D.1 borrowed heat's own ink for the selection ring - safe against the fill
// it sat on, but that ink IS page ink at the pale end, and page ink IS the
// grid's own frame colour for a role that aliases it (--viz-observed equals
// --color-ink in light). Selection vanished into the gridlines on a pale
// cell. That was never going to generalise: a STATE overlay has to stay
// perceptible regardless of ROLE, IDENTITY *or* VALUE (see the module
// comment), so it cannot take its colour from any of them.
//
// Two concentric strokes in fixed, universal-enough colours instead - and,
// per the app-review request, one of them magenta: a hue no role, heat
// token or identity slot ever uses, so a selection ring can never be
// misread as one of them. This app's own reachable heat fills (index.css's
// heat ramp composited over --viz-surface, both themes) never get darker
// than about L=0.02 - well above true black - so black alone already clears
// 3:1 against every one of them (contrast against black only grows with a
// background's luminance, so the WORST case is the palette's own dimmest
// reachable fill, not L=0). --viz-selection-inner keeps that black, and
// --viz-selection-outer spends the freedom on magenta instead of white -
// scene-style.test.mjs's two-tone guarantee test proves the pair against
// every real composited heat fill in both themes (measured worst case
// ~3.35:1), the same test the old black/white pair was proved against,
// unchanged in intent. This is a property of THIS palette's reachable
// range, not (like pure black/white) of the two colours against any
// background whatsoever - a genuinely vivid magenta cannot also be one of
// the luminance extremes, which is exactly why a single magenta ring, with
// no black to fall back on, could not have made this guarantee at all.
//
// Geometry-free on purpose: rect, circle and path all need the same two
// widths and colours, just drawn along a different outline, which is a
// rendering concern - see AnimatedScene.jsx's SelectionMark, the one place
// that turns this into an actual shape.
const SELECTION_OUTER_WIDTH = 5;
const SELECTION_INNER_WIDTH = 2;
export function selectionStyle() {
  return {
    outer: { stroke: 'var(--viz-selection-outer)', strokeWidth: SELECTION_OUTER_WIDTH },
    inner: { stroke: 'var(--viz-selection-inner)', strokeWidth: SELECTION_INNER_WIDTH },
  };
}
