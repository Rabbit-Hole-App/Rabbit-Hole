// The check-map rows of every REGISTERED scene family (brief 21): a family declares `checkMap` ({ repoPath: [the tests that cover it] }) in its own module and this script writes those rows into the
// `mapped` object of scripts/ci/check-map.json, so a new family never hand-edits the map.
//   node scripts/ci/gen-family-check-map.mjs            write the rows (an existing row is rewritten in place, a new one is appended to `mapped`)
//   node scripts/ci/gen-family-check-map.mjs --check    exit 1 and list what is missing or different, change nothing
// scripts/ci/gen-family-check-map.test.mjs fails when a registered family's file has no row, so a family cannot land without its rows.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { registeredFamilies } from '../../packages/web/src/interact-family-registry.js';
import { registerBuiltinFamilies } from '../../packages/web/src/interact-family-index.js';

registerBuiltinFamilies(); // the check-map rows are declared by the full family modules

const MAP = fileURLToPath(new URL('./check-map.json', import.meta.url));
const row = (path, tests) => `    ${JSON.stringify(path)}: [${tests.map(t => JSON.stringify(t)).join(',')}]`;

// -> { path: [tests] }: every row the registered families declare.
export const familyRows = (families = registeredFamilies()) => Object.assign({}, ...families.map(family => family.checkMap));

// -> [{ family, path, problem }]: the declared rows the map does not hold as declared (`map` is the parsed check-map.json).
export function missingRows(map, families = registeredFamilies()) {
  const out = [];
  for (const family of families) {
    if (!family.checkMap || !Object.keys(family.checkMap).length) { out.push({ family: family.id, path: null, problem: 'the family declares no checkMap rows' }); continue; }
    for (const [path, tests] of Object.entries(family.checkMap)) {
      const have = map.mapped?.[path];
      if (!have) out.push({ family: family.id, path, problem: 'no row in check-map.json' });
      else if (JSON.stringify(have) !== JSON.stringify(tests)) out.push({ family: family.id, path, problem: 'the row differs from the family declaration' });
    }
  }
  return out;
}

// -> the check-map.json text with the rows written: textual, so the file's hand layout is kept (an existing one-line row is rewritten in place, a new row is appended to `mapped`).
export function applyFamilyRows(source, rows) {
  const crlf = source.includes('\r\n'), text = source.replace(/\r\n/g, '\n'); // a Windows checkout may hold CRLF: edit as LF, write back as found
  const start = text.indexOf('\n  "mapped": {') + 1, end = text.indexOf('\n  },', start);
  if (start < 1 || end < 0) throw new Error('check-map.json has no "mapped" object');
  let block = text.slice(start, end);
  for (const [path, tests] of Object.entries(rows)) {
    const lines = block.split('\n'), at = lines.findIndex(line => line.startsWith(`    ${JSON.stringify(path)}:`));
    if (at < 0) { block += `,\n${row(path, tests)}`; continue; }
    if (!/\]\s*,?$/.test(lines[at]) || !/: \[/.test(lines[at])) throw new Error(`${path} has a row that is not on one line: edit it by hand`);
    lines[at] = row(path, tests) + (lines[at].endsWith(',') ? ',' : '');
    block = lines.join('\n');
  }
  const out = text.slice(0, start) + block + text.slice(end);
  return crlf ? out.replace(/\n/g, '\r\n') : out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = readFileSync(MAP, 'utf8'), check = process.argv.includes('--check');
  if (check) {
    const problems = missingRows(JSON.parse(text));
    for (const p of problems) console.log(`${p.family}: ${p.path ?? '(none)'}: ${p.problem}`);
    console.log(problems.length ? `RESULT FAILED: ${problems.length} family rows missing or different. Next: node scripts/ci/gen-family-check-map.mjs` : 'RESULT OK: every registered family row is in check-map.json');
    process.exit(problems.length ? 1 : 0);
  }
  const next = applyFamilyRows(text, familyRows());
  JSON.parse(next);
  if (next !== text) writeFileSync(MAP, next);
  console.log(next === text ? 'check-map.json already holds every registered family row' : 'check-map.json updated');
}
