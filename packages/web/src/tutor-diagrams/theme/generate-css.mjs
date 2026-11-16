// THEME-2: writes the --viz-* declarations of index.css from theme/palette.js (VIZ_LIGHT, then VIZ_DARK), in place, so the comments between them stay.
// node generate-css.mjs           report drift (exit 1 when index.css differs from palette.js)
// node generate-css.mjs --write   rewrite the values
// The first declaration of a name in index.css is the light value, the second the dark one.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VIZ_DARK, VIZ_LIGHT } from './palette.js';

const CSS = fileURLToPath(new URL('../../index.css', import.meta.url));
const write = process.argv.includes('--write');
const source = readFileSync(CSS, 'utf8');
const eol = source.includes('\r\n') ? '\r\n' : '\n';
const seen = new Map();
const drift = [];
const next = source.replace(/^(\s*)(--viz-[\w-]+)(:\s*)([^;\n]+)(;)/gm, (whole, lead, name, colon, value, semi) => {
  const count = (seen.get(name) ?? 0) + 1;
  seen.set(name, count);
  const wanted = (count === 1 ? VIZ_LIGHT : VIZ_DARK)[name.slice(2)];
  if (wanted === undefined) { drift.push(`${name} (${count === 1 ? 'light' : 'dark'}): in index.css, not in palette.js`); return whole; }
  if (wanted === value.trim()) return whole;
  drift.push(`${name} (${count === 1 ? 'light' : 'dark'}): index.css ${value.trim()} != palette.js ${wanted}`);
  return lead + name + colon + wanted + semi;
});
for (const [scope, table] of [['light', VIZ_LIGHT], ['dark', VIZ_DARK]]) {
  for (const key of Object.keys(table)) if (!seen.has('--' + key)) drift.push(`--${key} (${scope}): in palette.js, not in index.css`);
}
if (write && next !== source) writeFileSync(CSS, next.replace(/\r?\n/g, eol));
for (const line of drift) console.log(line);
console.log(drift.length ? `${drift.length} drift${write ? ' (written)' : ''}` : 'index.css matches palette.js');
process.exit(drift.length && !write ? 1 : 0);
