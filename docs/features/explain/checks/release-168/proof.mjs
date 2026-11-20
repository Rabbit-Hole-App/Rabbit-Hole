// proof: every key changed vs main is explained by its pieces. usage: node proof.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const P = 'packages/web/src/tutor-diagrams/svg-snapshots.json';
const R = 'C:/s/explain-8878';
const load = ref => JSON.parse(execSync(`git -C ${R} show ${ref}:${P}`, { maxBuffer: 1 << 28 }).toString()).entries;
const asm = JSON.parse(execSync(`git -C C:/s/r168-int show HEAD:${P}`, { maxBuffer: 1 << 28 }).toString()).entries;
const main = load('aee3dba82');
const pieces = [
  ['REL-1 chain', '1b36e600c', 'ab40f5dc9'], ['LBL-2', '60b9aa5c7', 'ab40f5dc9'], ['SAMP-3', '265ce26e1', 'e850e57ef'],
  ['MAT-F', 'cf89d1da6', 'ab40f5dc9'], ['STK-1', '3a3050ea3', 'aee3dba82'], ['UNIT-2', 'b9ab321a4', 'aee3dba82'], ['STACK-T', 'd0bbbc3a1', 'aee3dba82'],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changed = {}; // key -> {piece: value}
const perPiece = {};
for (const [name, tip, base] of pieces) {
  const t = load(tip), b = load(base);
  const keys = new Set([...Object.keys(t), ...Object.keys(b)]);
  perPiece[name] = [];
  for (const k of keys) if (!same(t[k], b[k])) { perPiece[name].push(k); (changed[k] ??= {})[name] = t[k]; }
}
const keysAll = new Set([...Object.keys(asm), ...Object.keys(main)]);
const diff = [...keysAll].filter(k => !same(asm[k], main[k])).sort();
const ids = new Set(diff.map(k => k.split('/')[0]));
const single = [], multi = [], bad = [], unexplained = [];
for (const k of diff) {
  const ps = Object.keys(changed[k] ?? {});
  if (!ps.length) unexplained.push(k);
  else if (ps.length === 1) { if (!same(asm[k], changed[k][ps[0]])) bad.push([k, ps[0]]); single.push(k); }
  else multi.push([k, ps, ps.map(p => same(changed[k][p], asm[k]))]);
}
// pieces' keys that ended up equal to main (no net change) or that assembled differs from all
const piecesKeysNotInDiff = Object.entries(perPiece).flatMap(([p, ks]) => ks.filter(k => same(asm[k], main[k])).map(k => p + ':' + k));
const out = { perPieceKeys: Object.fromEntries(Object.entries(perPiece).map(([p, k]) => [p, { keys: k.length, ids: new Set(k.map(x => x.split('/')[0])).size }])), totalKeysChanged: diff.length, ids: ids.size, single: single.length, multi, bad, unexplained, piecesKeysNotInDiff };
fs.writeFileSync('C:/s/r168-out/proof.json', JSON.stringify({ ...out, diff, perPiece }, null, 1));
console.log(JSON.stringify(out, null, 1));
