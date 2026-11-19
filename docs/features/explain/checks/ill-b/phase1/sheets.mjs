// ILL-B blind contact sheets for the Reviewer (spec section 5). Model names are OFF the tiles: each tile has an opaque code and its subject id only.
// The key (code -> model, arm, form) is written to <out>/key.json and is NEVER pushed until the Reviewer has pushed claude/ill-b-reviewer-scores.csv. salt.json (the local random salt) is never pushed either.
// Sheets are grouped (physical, spatial, abstract): a group's sheets are made as soon as ALL its planned images exist (or with --partial for what exists).
// usage: node sheets.mjs [--out C:/s/ill-b/run] [--partial] [--group physical|spatial|abstract] [--selftest]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { MODELS, OUT as OUT0, codeOf, localSalt, readJsonl, rngFrom, sharp, shuffle, subjects } from './lib.mjs';

const { values: a } = parseArgs({ options: { out: { type: 'string' }, partial: { type: 'boolean' }, group: { type: 'string' }, selftest: { type: 'boolean' } } });
const OUT = a.selftest ? fs.mkdtempSync(path.join(os.tmpdir(), 'illb-sheets-')) : (a.out ?? OUT0);
const SH = sharp();
const TILE = 640, BAR = 40, COLS = 3, PER = 6;
const GROUPS = ['physical', 'spatial', 'abstract'];
const salt = localSalt();
// planned images per group: 4 arms x the group's prompt forms (physical: 10 N + P01-P05 L; the two concept groups: 10 N + 10 L)
const forms = subjects.flatMap(s => [{ s, form: 'N' }, ...(s.group !== 'physical' || ['P01', 'P02', 'P03', 'P04', 'P05'].includes(s.id) ? [{ s, form: 'L' }] : [])]);
const plannedIds = g => forms.filter(f => f.s.group === g).flatMap(f => MODELS.map(m => `${m.arm}-${f.s.id}-${f.form}-d1`));

if (a.selftest) { // synthetic placeholders: the whole physical group (60 images) + 3 spatial ones: physical must be sheeted, spatial skipped as incomplete
  fs.mkdirSync(`${OUT}/originals`, { recursive: true });
  const rows = [...plannedIds('physical'), ...plannedIds('spatial').slice(0, 3)].map((id, i) => ({ id, subject: id.split('-')[1], model: MODELS.find(m => m.arm === id.split('-')[0]).id, form: id.split('-')[2], type: 'png', file: `originals/${id}.png` }));
  for (const r of rows) await SH({ create: { width: 800, height: 800, channels: 3, background: { r: 200 + (r.id.length % 50), g: 220, b: 240 } } }).png().toFile(`${OUT}/${r.file}`);
  fs.writeFileSync(`${OUT}/results.jsonl`, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}
const results = readJsonl(`${OUT}/results.jsonl`).filter(r => r.type && r.type !== 'bin' && !r.mode).map(r => ({ ...r, file: r.file ?? `originals/${r.id}.${r.type}` }));
const byId = new Map(results.map(r => [r.id, r]));
const keyFile = `${OUT}/key.json`; const key = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, 'utf8')) : {};
const taken = new Set(Object.values(key).map(k => k.code));
for (const k of Object.keys(key)) { /* codes are stable across runs */ }
const codeFor = id => { const old = Object.values(key).find(k => k.id === id); if (old) return old.code; let c = codeOf(salt, id), n = 0; while (taken.has(c)) c = codeOf(salt, id + '#' + ++n); taken.add(c); return c; };

fs.mkdirSync(`${OUT}/sheets`, { recursive: true }); fs.mkdirSync(`${OUT}/thumbs`, { recursive: true }); fs.mkdirSync(`${OUT}/svg`, { recursive: true });
const tile = async (r, code) => {
  const f = `${OUT}/${r.file}`; const input = SH(f, f.endsWith('.svg') ? { density: 96 } : {});
  const img = await input.resize(TILE, TILE, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png().toBuffer();
  const cap = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${BAR}"><rect width="${TILE}" height="${BAR}" fill="#1f2328"/><text x="14" y="27" font-family="Arial" font-size="22" fill="#ffffff">${code}  ·  ${r.subject}</text></svg>`);
  await SH(f, f.endsWith('.svg') ? { density: 96 } : {}).resize(512, 512, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toFile(`${OUT}/thumbs/${code}.jpg`);
  if (f.endsWith('.svg')) fs.copyFileSync(f, `${OUT}/svg/${code}.svg`);
  return SH({ create: { width: TILE, height: TILE + BAR, channels: 3, background: '#ffffff' } }).composite([{ input: cap, top: 0, left: 0 }, { input: img, top: BAR, left: 0 }]).png().toBuffer();
};
const made = [], skipped = [];
for (const g of GROUPS.filter(x => !a.group || x === a.group)) {
  const planned = plannedIds(g), have = planned.filter(id => byId.has(id));
  if (have.length < planned.length && !a.partial) { skipped.push(`${g}: ${have.length} of ${planned.length} images exist: not sheeted yet`); continue; }
  const order = shuffle(have, rngFrom(salt + '|' + g)); // one shuffled order per group: models and forms are mixed over the sheets
  for (let s = 0; s * PER < order.length; s++) {
    const ids = order.slice(s * PER, s * PER + PER), tiles = [];
    for (const id of ids) { const r = byId.get(id), code = codeFor(id); key[code] = { code, id, arm: MODELS.find(m => m.id === r.model)?.arm, model: r.model, form: r.form, subject: r.subject, group: g, sheet: `${g}-${String(s + 1).padStart(2, '0')}` }; tiles.push(await tile(r, code)); }
    const rows = Math.ceil(ids.length / COLS);
    const sheet = await SH({ create: { width: TILE * COLS, height: (TILE + BAR) * rows, channels: 3, background: '#ffffff' } }).composite(tiles.map((b, i) => ({ input: b, left: (i % COLS) * TILE, top: Math.floor(i / COLS) * (TILE + BAR) }))).jpeg({ quality: 82 }).toBuffer();
    const name = `sheets/${g}-${String(s + 1).padStart(2, '0')}.jpg`; fs.writeFileSync(`${OUT}/${name}`, sheet); made.push(`${name} (${ids.length} tiles)`);
  }
}
fs.writeFileSync(keyFile, JSON.stringify(key, null, 1)); // LOCAL ONLY
// the Reviewer's empty scores file and the checklist per subject (no model names, no form-to-model mapping)
const codes = Object.values(key).sort((x, y) => x.sheet.localeCompare(y.sheet));
fs.mkdirSync(`${OUT}/scores`, { recursive: true });
fs.writeFileSync(`${OUT}/scores/reviewer-empty.csv`, ['code,subject,must1,must2,must3,must4,text,notes', ...codes.map(k => `${k.code},${k.subject},,,,,,`)].join('\n') + '\n');
const items = s => s.must.split(';').map(x => x.trim()).filter(Boolean);
fs.writeFileSync(`${OUT}/sheets/checklist.md`, ['# ILL-B checklists (the Reviewer marks yes/no per must item; text = none / correct / wrong / unasked)', 'N pictures: no text at all. L pictures: every asked label present, spelled exactly, on the right part, and no other words.', '', ...subjects.map(s => `- ${s.id} (${s.group}): ${items(s).map((x, i) => `${i + 1}) ${x}`).join('; ')}${s.group !== 'physical' || ['P01', 'P02', 'P03', 'P04', 'P05'].includes(s.id) ? `; L labels: ${s.labels.map(l => `"${l}"`).join(', ')}` : ''}`)].join('\n') + '\n');
console.log(`sheets made: ${made.length ? made.join(', ') : 'none'}`);
if (skipped.length) console.log('skipped: ' + skipped.join('; '));
console.log(`key: ${keyFile} (${Object.keys(key).length} codes; LOCAL ONLY, never pushed before claude/ill-b-reviewer-scores.csv); reviewer-empty.csv rows ${codes.length}; thumbs ${fs.readdirSync(`${OUT}/thumbs`).length}`);
if (a.selftest) {
  const names = new Set(fs.readdirSync(`${OUT}/sheets`)); const phys = [...names].filter(n => n.startsWith('physical-')).length, other = [...names].filter(n => /^(spatial|abstract)-/.test(n)).length;
  const leak = fs.readFileSync(`${OUT}/scores/reviewer-empty.csv`, 'utf8').match(/recraft|flash|vector|\bF2?\b|\bV\b/i);
  console.log(`selftest: physical sheets ${phys} (expected 10), spatial/abstract sheets ${other} (expected 0), model names in the Reviewer's csv: ${leak ? 'LEAK ' + leak[0] : 'none'}`);
  if (phys !== 10 || other !== 0 || leak) process.exitCode = 1;
}
