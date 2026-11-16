const fs = require('fs');
function edit(file, pairs) {
  let s = fs.readFileSync(file, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(file + ' miss: ' + a.slice(0, 60)); s = s.replace(a, () => b); }
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s);
}
edit('tutor-diagrams/primitives.js', [
  ["import { tokenizeMath } from '../math-tokens.js';\n", "import { tokenizeMath } from '../math-tokens.js';\nimport { FILLS, GROUND, INK as PALETTE_INK, LINES, MUTED as PALETTE_MUTED, ROLE_NAMES } from './theme/palette.js';\n"],
  ["export const PALETTE = Object.freeze({\n  process: '#8DBFEF',\n  decision: '#E5AA46',\n  outcome: '#67B9A0',\n  olive: '#95A448',\n  coral: '#F58371',\n  lavender: '#B9A4E8',\n  rose: '#E8A3B7',\n  slate: '#A8BBD0',\n});\n", "// Palette A: the role names a flow node may take, each the fill theme/palette.js names (ROLE_NAMES).\nexport const PALETTE = Object.freeze(Object.fromEntries(Object.entries(ROLE_NAMES).map(([role, name]) => [role, FILLS[name]])));\n"],
  ["export const PATH = '#2F80D8';\nexport const SURFACE = 'var(--viz-surface, #FFFCF0)';\nexport const INK = 'var(--color-ink, #32211c)';\nexport const MUTED = 'var(--color-ink-2, #665951)';\nexport const FILLED_INK = '#32211c';\n", "export const PATH = LINES.path;\nexport const SURFACE = `var(--viz-surface, ${GROUND})`;\nexport const INK = `var(--color-ink, ${PALETTE_INK.toLowerCase()})`;\nexport const MUTED = `var(--color-ink-2, ${PALETTE_MUTED})`;\nexport const FILLED_INK = PALETTE_INK.toLowerCase();\n"],
]);
edit('tutor-diagrams/teaching-theme.js', [
  ["import { box, connector, PALETTE, FILLED_INK } from './primitives.js';\n", "import { box, connector, PALETTE, FILLED_INK } from './primitives.js';\nimport { DEPTH_FILLS, FILLS, GROUND, INK, LEGACY, LINES, MUTED, ROLE_FILL, SERIES, SERIES_INK } from './theme/palette.js';\n"],
  ["surface: '#FFFCF0', inset: '#f6f8f4', line: '#e3e7e0', wire: '#b9c3b9',", "surface: GROUND, inset: LEGACY.inset, line: LINES.line, wire: LINES.wire,"],
  ["ink: '#32211C', muted: '#665951', blue: '#426db2', blueSoft: '#eaf1fb',", "ink: INK, muted: MUTED, blue: LEGACY.blue, blueSoft: LEGACY.blueSoft,"],
  ["warm: '#b86232', warmSoft: '#f8ece3', green: '#267657', greenSoft: '#e7f3ed',", "warm: LEGACY.warm, warmSoft: LEGACY.warmSoft, green: LEGACY.green, greenSoft: LEGACY.greenSoft,"],
  ["ground: '#FFFCF0', outline: FILLED_INK.toUpperCase(),", "ground: GROUND, outline: FILLED_INK.toUpperCase(),"],
  ["orange: '#F89830', // measured", "orange: FILLS.orange, // measured"],
  ["export const TEACHING_DEPTH_FILLS = Object.freeze(['blue', 'teal', 'mustard', 'orange', 'lavender', 'rose', 'slate']);", "export const TEACHING_DEPTH_FILLS = DEPTH_FILLS;"],
  ["Object.freeze({ blueInk: '#375d92', blueBorder: '#adc4e5' });", "Object.freeze({ blueInk: LEGACY.blueInk, blueBorder: LEGACY.blueBorder });"],
  ["export const TEACHING_SERIES = Object.freeze([\n  TEACHING.blueFill, TEACHING.coral, TEACHING.tealFill, TEACHING.olive, TEACHING.lavender, TEACHING.mustardFill, TEACHING.rose, TEACHING.slate]);", "export const TEACHING_SERIES = Object.freeze(SERIES.map(name => FILLS[name]));"],
  ["export const TEACHING_SERIES_INK = Object.freeze(['#375D92', '#BB503E', '#3A7E69', '#6D7835', '#7F5EC9', '#936A25', '#B82E56', '#507195']);", "export const TEACHING_SERIES_INK = SERIES_INK;"],
  ["export const TEACHING_ROLE_FILL = Object.freeze({\n  input: TEACHING.blueFill, output: TEACHING.tealFill, observed: TEACHING.olive, prediction: TEACHING.lavender, operator: TEACHING.lavender,\n  learner: TEACHING.mustardFill, tutor: TEACHING.rose, code: TEACHING.slate, warning: TEACHING.coral, success: TEACHING_SERIES_INK[2],\n});", "export const TEACHING_ROLE_FILL = Object.freeze(Object.fromEntries(Object.entries(ROLE_FILL).map(([role, [name, index]]) => [role, name === 'seriesInk' ? SERIES_INK[index] : FILLS[name]])));"],
  ["export const TEACHING_GRID = '#D9D3C3';", "export const TEACHING_GRID = LINES.grid;"],
  ["export const TEACHING_ZERO = '#786860';", "export const TEACHING_ZERO = LINES.zero;"],
]);
edit('tutor-diagrams/TutorDiagram.js', [
  ["import { TEACHING, TEACHING_FONT, TEACHING_STYLE } from './teaching-theme.js';\n", "import { TEACHING, TEACHING_FONT, TEACHING_STYLE } from './teaching-theme.js';\nimport { LINES } from './theme/palette.js';\n"],
  ["stroke: 'var(--color-line, #dedad4)' }),", "stroke: `var(--color-line, ${LINES.frame})` }),"],
]);
edit('explain-program/raster-fixtures.js', [
  ["import { RASTER_CAPABILITY } from './stamps.js';\n", "import { RASTER_CAPABILITY } from './stamps.js';\nimport { FILLS } from '../tutor-diagrams/theme/palette.js';\n"],
  ["color:'#E5AA46',opacity:0.7", "color:'${FILLS.mustard}',opacity:0.7"],
]);
edit('explain-program/sdk-raster.js', [
  ["// Bounded raw pixels and segmentation overlays.", "import { FILLS } from '../tutor-diagrams/theme/palette.js';\n\n// Bounded raw pixels and segmentation overlays."],
  ["color='#E5AA46'", "color='${FILLS.mustard}'"],
]);
edit('IllustrationFigure.jsx', [
  ["import { PICTURE_DISPLAY_WIDTH } from './explanation-card-width.js';\n", "import { PICTURE_DISPLAY_WIDTH } from './explanation-card-width.js';\nimport { INK } from './tutor-diagrams/theme/palette.js';\n"],
  ["bg-[var(--viz-surface,#FFFCF0)]", "bg-[var(--viz-surface)]"],
  ['stroke="#1f2937"', 'stroke={INK}'],
]);
console.log('rewired');
