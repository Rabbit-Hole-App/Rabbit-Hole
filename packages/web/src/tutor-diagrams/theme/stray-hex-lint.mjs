// THEME-2: no hex colour literal outside theme/palette.js in tutor-diagrams/, explain-program/, interact-style.js, IllustrationFigure.jsx and learn-scene-author.js (comments and test files are skipped),
// and none in the [data-explain-table] rules of index.css (the table header's color-mix names the slate fill: it reads a generated custom property, not a hex). The rest of index.css is out of scope:
// only its --viz-* block is generated (generate-css.mjs).
// node stray-hex-lint.mjs [--json]   lists the violations by file; exit 1 when there is any.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedColors } from './palette.js';

const WEB_SRC = fileURLToPath(new URL('../../', import.meta.url));
const CONTROL_SRC = fileURLToPath(new URL('../../../../control-plane/src/', import.meta.url));
export const ROOTS = [join(WEB_SRC, 'tutor-diagrams'), join(WEB_SRC, 'explain-program'), join(WEB_SRC, 'interact-style.js'), join(WEB_SRC, 'IllustrationFigure.jsx'), join(CONTROL_SRC, 'agents', 'learn-scene-author.js')];
const CSS_FILE = join(WEB_SRC, 'index.css');
const PALETTE_FILE = join(WEB_SRC, 'tutor-diagrams', 'theme', 'palette.js');
const HEX = /#[0-9A-Fa-f]{8}\b|#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g;

function files(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap(name => (name === 'node_modules' ? [] : files(join(path, name))));
}
const scanned = path => /\.(js|jsx|mjs)$/.test(path) && !/\.test\.(js|jsx|mjs)$/.test(path) && path !== PALETTE_FILE;

// A line with its // comment and the lines of a /* */ comment removed (a hex inside a string that holds // is not handled: shortcut, none exists).
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' ')).split('\n').map(line => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'));
}
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const palette = [...allowedColors()];
export function group(hex) {
  const value = (hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex).toUpperCase();
  if (palette.includes(value)) return 'in-palette';
  if (value.length === 7 && palette.some(color => Math.hypot(...rgb(value).map((v, i) => v - rgb(color)[i])) <= 24)) return 'near-palette';
  return 'non-palette';
}
const entry = (path, index, hex, line) => ({ file: relative(join(WEB_SRC, '..', '..', '..'), path).split(sep).join('/'), line: index + 1, hex, group: group(hex), text: line.trim().slice(0, 110) });
// The [data-explain-table] lines of index.css (a one-line rule each).
const cssTableHex = () => readFileSync(CSS_FILE, 'utf8').split(/\r?\n/).flatMap((line, index) => (line.includes('[data-explain-table]') ? [...line.matchAll(HEX)].map(match => entry(CSS_FILE, index, match[0], line)) : []));
export function findStrayHex(roots = ROOTS) {
  const found = [];
  for (const path of roots.flatMap(files).filter(scanned)) {
    code(readFileSync(path, 'utf8')).forEach((line, index) => {
      for (const match of line.matchAll(HEX)) found.push(entry(path, index, match[0], line));
    });
  }
  return roots === ROOTS ? [...found, ...cssTableHex()] : found;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = findStrayHex();
  if (process.argv.includes('--json')) console.log(JSON.stringify(found, null, 1));
  else {
    const byFile = Map.groupBy(found, item => item.file);
    for (const [file, items] of byFile) { console.log(`${file}: ${items.length}`); for (const item of items) console.log(`  ${item.line} ${item.hex} [${item.group}] ${item.text}`); }
    console.log(`${found.length} stray hex literal${found.length === 1 ? '' : 's'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'}`);
  }
  process.exit(found.length ? 1 : 0);
}
