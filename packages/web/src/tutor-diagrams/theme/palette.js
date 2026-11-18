// THEME-2: the one palette. A leaf module (it imports nothing); every colour of the written diagrams, the composed and static scenes and the --viz-* CSS block
// is read from here. teaching-theme.js, primitives.js PALETTE, interact-style.js and index.css take their values from this file (index.css through
// generate-css.mjs); the stray-hex lint (stray-hex-lint.mjs) fails the build when a hex literal appears anywhere else in tutor-diagrams/, explain-program/,
// interact-style.js or learn-scene-author.js. Hex case is the case the values had where they came from, so the rendered markup stays byte for byte.

// The cream ground and the ink every outline, wire and label is drawn in. FILLED_INK (primitives.js) is the lower-case form of INK.
export const GROUND = '#FFFCF0';
export const INK = '#32211C';
// The text grey (captions, muted labels).
export const MUTED = '#665951';

// The fills, 100% saturated, no tint. Text on any fill is INK. ORANGE is measured from Wondering's illustrations (approximate) and is the ninth, not part of SERIES.
export const FILLS = Object.freeze({
  blue: '#8DBFEF', mustard: '#E5AA46', teal: '#67B9A0', coral: '#F58371', olive: '#95A448', lavender: '#B9A4E8', rose: '#E8A3B7', slate: '#A8BBD0',
  orange: '#F89830',
});
// Series order of a multi-series plot, a legend and a tree: the eight fills (no orange).
export const SERIES = Object.freeze(['blue', 'coral', 'teal', 'olive', 'lavender', 'mustard', 'rose', 'slate']);
// The darker weight of each series colour (about 4.6:1 or more on the ground): a line is drawn in its ink, its markers in the fill. Same order as SERIES.
export const SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936A25', '#B82E56', '#507195']);
// Palette A's names (primitives.js PALETTE): a flow node's role is one of these.
export const ROLE_NAMES = Object.freeze({ process: 'blue', decision: 'mustard', outcome: 'teal', olive: 'olive', coral: 'coral', lavender: 'lavender', rose: 'rose', slate: 'slate' });
// The tree depth order of fills (ml-topology): root, level 1, level 2, level 3, then on.
export const DEPTH_FILLS = Object.freeze(['blue', 'teal', 'mustard', 'orange', 'lavender', 'rose', 'slate']);
// The role -> fill table of the composed and static scene theme (interact-style.js): the fills at 100%. A neutral role has no entry (transparent, outlined).
// A role entry is [fill name] or ['seriesInk', index] for the one role that takes a darker weight.
export const ROLE_FILL = Object.freeze({
  input: ['blue'], output: ['teal'], observed: ['olive'], prediction: ['lavender'], operator: ['lavender'],
  learner: ['mustard'], tutor: ['rose'], code: ['slate'], warning: ['coral'], success: ['seriesInk', 2],
});
// Tints exist only for the legend pills and the plot bands: a colour at this fraction over the ground (mixHex).
export const TINT = 0.18;

// Lines, wires and the other strokes that are not fills.
export const LINES = Object.freeze({
  grid: '#D9D3C3', // a plot's dotted guide and a gridline
  zero: '#786860', // the one solid line a chart keeps
  frame: '#dedad4', // the figure frame, as the --color-line fallback
  wire: '#b9c3b9', // a guide wire
  line: '#e3e7e0', // a hairline
  path: '#2F80D8', // the highlighted path, active edge
});
// The pale tokens and blues the first written layouts took; layouts still read them (teaching-theme.js TEACHING), so they live here under their names.
export const LEGACY = Object.freeze({
  inset: '#f6f8f4', blue: '#426db2', blueSoft: '#eaf1fb', warm: '#b86232', warmSoft: '#f8ece3', green: '#267657', greenSoft: '#e7f3ed',
  blueInk: '#375d92', blueBorder: '#adc4e5',
});
// A colour mixed over another: mixHex(fill, ground, TINT) is the fill at 18% over the ground. Upper-case result.
export const mixHex = (top, under, amount) => '#' + [1, 3, 5].map(i => Math.round(parseInt(under.slice(i, i + 2), 16) * (1 - amount) + parseInt(top.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('').toUpperCase();

// Every colour a render may contain: the palette and the tints of the fills and series inks over the ground.
export function allowedColors() {
  const base = [GROUND, INK, MUTED, ...Object.values(FILLS), ...SERIES_INK, ...Object.values(LINES), ...Object.values(LEGACY)];
  const tints = [...Object.values(FILLS), ...SERIES_INK].map(color => mixHex(color, GROUND, TINT));
  return new Set([...base, ...tints].map(color => color.toUpperCase()));
}

// The --viz-* custom properties of index.css: the product's role colours for the legacy scenes, light then dark. generate-css.mjs writes them into index.css (and --check fails on drift).
// They are app-theme tokens, not the sprint palette: the sprint palette is above. Each value is the string index.css had.
export const VIZ_LIGHT = Object.freeze({
  "viz-neutral": "#787774",
  "viz-input": "#2383e2",
  "viz-output": "#2f855a",
  "viz-prediction": "#9065b0",
  "viz-operator": "var(--viz-prediction)",
  "viz-observed": "#37352f",
  "viz-learner": "#d9730d",
  "viz-tutor": "#0e7490",
  "viz-code": "#787774",
  "viz-warning": "#c0392b",
  "viz-success": "#157f43",
  "viz-input-text": "#1b6fc2",
  "viz-output-text": "#2e8157",
  "viz-prediction-text": "#8c60ad",
  "viz-operator-text": "var(--viz-prediction-text)",
  "viz-learner-text": "#af5d0a",
  "viz-code-text": "var(--color-ink-2)",
  "viz-identity-2-text": "#867033",
  "viz-surface": GROUND,
  "viz-fill-slate": FILLS.slate, // the slate fill, for the table header of [data-explain-table] (a CSS rule cannot import it)
  "viz-on-observed": "#ffffff",
  "viz-on-success": "#ffffff",
  "viz-heat-negative": "#1a56c4",
  "viz-heat-midpoint": "#655e73",
  "viz-heat-positive": "#a85400",
  "viz-heat-scale": "#655e73",
  "viz-ink-mid": "#000000",
  "viz-ink-high": "#ffffff",
  "viz-ink-solid": "#000000",
  "viz-heat-positive-ink-mid": "#37352f",
  "viz-selection-outer": "#ff9bf0",
  "viz-selection-inner": "#000000",
  "viz-identity-1": "#970c44",
  "viz-identity-2": "#9b823b",
  "viz-identity-3": "#0e0b8e",
  "viz-identity-3-text": "#9c6aff",
});
export const VIZ_DARK = Object.freeze({
  "viz-neutral": "#979797",
  "viz-input": "#5ba3f5",
  "viz-output": "#5fc08a",
  "viz-prediction": "#b79ae3",
  "viz-operator": "var(--viz-prediction)",
  "viz-observed": "#e4e4e4",
  "viz-learner": "#f2b06a",
  "viz-tutor": "#2fc4b8",
  "viz-code": "#979797",
  "viz-warning": "#ef6351",
  "viz-success": "#49d67f",
  "viz-input-text": "var(--viz-input)",
  "viz-output-text": "var(--viz-output)",
  "viz-prediction-text": "var(--viz-prediction)",
  "viz-operator-text": "var(--viz-prediction-text)",
  "viz-learner-text": "var(--viz-learner)",
  "viz-identity-2-text": "var(--viz-identity-2)",
  "viz-surface": "#1f1f1f",
  "viz-fill-slate": FILLS.slate,
  "viz-on-observed": "#1f1f1f",
  "viz-on-success": "#1f1f1f",
  "viz-heat-negative": "#6fb1ff",
  "viz-heat-midpoint": "#b0a8c0",
  "viz-heat-positive": "#f0a94e",
  "viz-heat-scale": "#b0a8c0",
  "viz-ink-mid": "#ffffff",
  "viz-ink-high": "#000000",
  "viz-ink-solid": "#000000",
  "viz-heat-positive-ink-mid": "#ffffff",
  "viz-selection-outer": "#ff9bf0",
  "viz-selection-inner": "#000000",
  "viz-identity-1": "#f471a5",
  "viz-identity-2": "#f7eb9c",
  "viz-identity-3": "#9966ff",
});
