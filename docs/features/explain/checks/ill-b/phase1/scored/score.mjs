// ILL-B scorer: joins the Reviewer's csv (claude/ill-b-reviewer-scores.csv) with the key and the two judges, and applies the fixed reading rules of spec section 8.
// Also the by-code checks: style (ground colour, share of theme colours, pure-white area) and the vector (V) file findings (spec sections 5 and 6).
// usage: node score.mjs --reviewer <csv> [--out C:/s/ill-b/run]      node score.mjs --selftest (synthetic data, no files of the run are read)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { MODELS, OUT as OUT0, buildPlan, readJsonl, sharp, subjects } from './lib.mjs';

const { values: a } = parseArgs({ options: { reviewer: { type: 'string' }, out: { type: 'string' }, selftest: { type: 'boolean' } } });
let OUT = a.out ?? OUT0, reviewerCsv = a.reviewer;
if (a.selftest) { // synthetic fixtures: 120 pictures over the three groups, both forms, four arms; a Reviewer who fails some, judges that mostly agree
  OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'illb-score-')); fs.mkdirSync(`${OUT}/scores`, { recursive: true });
  const key = {}, rows = [], rev = ['code,subject,must1,must2,must3,must4,text,notes']; let n = 0;
  for (const s of subjects) for (const form of ['N', 'L']) for (const m of MODELS) { if (n >= 120) break; n++; const code = 'T' + String(n).padStart(4, '0'); const id = `${m.arm}-${s.id}-${form}-d1`; key[code] = { code, id, arm: m.arm, model: m.id, form, subject: s.id, group: s.group };
    rows.push({ id, model: m.id, form, subject: s.id, httpStatus: 200, credits: m.units, totalSeconds: 1 + (n % 7) * (m.arm === 'V' ? 2 : 0.6), first: n < 4 });
    const pass = n % 3 !== 0; rev.push(`${code},${s.id},${pass ? 'yes,yes,yes,' : 'yes,no,yes,'},${pass ? (form === 'N' ? 'none' : 'correct') : 'wrong'},`); }
  fs.writeFileSync(`${OUT}/key.json`, JSON.stringify(key)); fs.writeFileSync(`${OUT}/results.jsonl`, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  for (const j of ['gemini', 'sonnet']) fs.writeFileSync(`${OUT}/scores/judge-${j}.jsonl`, rows.map((r, i) => JSON.stringify({ id: r.id, judge: j, pass: j === 'sonnet' ? (i + 1) % 3 !== 0 : (i + 1) % 3 !== 0 || i % 10 === 0 })).join('\n') + '\n');
  reviewerCsv = `${OUT}/reviewer.csv`; fs.writeFileSync(reviewerCsv, rev.join('\n') + '\n');
}
if (!reviewerCsv) { console.error('STOP: --reviewer <claude/ill-b-reviewer-scores.csv> (the Reviewer pushes it before the key is opened)'); process.exit(2); }
const key = JSON.parse(fs.readFileSync(`${OUT}/key.json`, 'utf8'));
const results = new Map(readJsonl(`${OUT}/results.jsonl`).map(r => [r.id, r]));
const judges = Object.fromEntries(['gemini', 'sonnet'].map(j => [j, new Map(readJsonl(`${OUT}/scores/judge-${j}.jsonl`).map(r => [r.id, r]))]));
const yes = v => /^(y|yes|1|true)$/i.test(String(v ?? '').trim()), no = v => /^(n|no|0|false)$/i.test(String(v ?? '').trim());
const lines = fs.readFileSync(reviewerCsv, 'utf8').trim().split(/\r?\n/); const head = lines[0].split(',');
const rev = new Map(); for (const l of lines.slice(1)) { const c = l.split(','); const r = Object.fromEntries(head.map((h, i) => [h, c[i]])); const k = key[r.code]; if (!k) continue;
  const musts = ['must1', 'must2', 'must3', 'must4'].map(h => r[h]).filter(v => v !== undefined && v !== ''); const textOk = k.form === 'N' ? r.text === 'none' : r.text === 'correct';
  rev.set(k.id, { ...k, pass: musts.length > 0 && musts.every(yes) && !musts.some(no) && textOk, textFail: !textOk, scored: musts.length > 0 }); }
const med = v => v.length ? [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)] : null, p90 = v => v.length ? [...v].sort((x, y) => x - y)[Math.min(v.length - 1, Math.floor(v.length * 0.9))] : null;
const pct = (x, n) => (n ? `${((100 * x) / n).toFixed(0)} % (n = ${n})` : 'n/a');
const L = ['# ILL-B scores (scorer output)', ''];
// 1. per model x group x form
const arms = [...new Set(MODELS.map(m => m.arm))];
L.push('## Reviewer: model x group x form', '', '| model | group | form | pictures (n) | passes | text-rule failures | median s | p90 s | cost / picture US$ |', '|---|---|---|---|---|---|---|---|---|');
for (const arm of arms) for (const g of ['physical', 'spatial', 'abstract']) for (const form of ['N', 'L']) {
  const ks = [...rev.values()].filter(k => k.arm === arm && k.group === g && k.form === form && k.scored); if (!ks.length) continue;
  const res = ks.map(k => results.get(k.id)).filter(Boolean), secs = res.filter(r => !r.first).map(r => r.totalSeconds).filter(Number.isFinite);
  L.push(`| ${arm} | ${g} | ${form} | ${ks.length} | ${pct(ks.filter(k => k.pass).length, ks.length)} | ${ks.filter(k => k.textFail).length} | ${med(secs)?.toFixed(1) ?? '-'} | ${p90(secs)?.toFixed(1) ?? '-'} | ${(res.reduce((s, r) => s + (r.credits ?? 0), 0) / 1000 / Math.max(1, res.length)).toFixed(4)} |`);
}
// 2. the fixed reading rules (spec section 8)
L.push('', '## Reading rules (spec section 8, fixed)', '');
for (const arm of arms) {
  const concept = form => [...rev.values()].filter(k => k.arm === arm && k.group !== 'physical' && k.form === form && k.scored), better = ['N', 'L'].map(f => concept(f)).sort((x, y) => y.filter(k => k.pass).length / (y.length || 1) - x.filter(k => k.pass).length / (x.length || 1))[0];
  const lpics = [...rev.values()].filter(k => k.arm === arm && k.form === 'L' && k.scored);
  L.push(`- ${arm}: can draw concepts (>= 70 % of its concept pictures in its better form pass): ${pct(better.filter(k => k.pass).length, better.length)} ${better.length && better.filter(k => k.pass).length / better.length >= 0.7 ? 'YES' : 'no'}; labels usable (>= 80 % of L pictures have every label right and no other words): ${pct(lpics.filter(k => !k.textFail).length, lpics.length)} ${lpics.length && lpics.filter(k => !k.textFail).length / lpics.length >= 0.8 ? 'YES' : 'no'}`);
}
// 3. judge agreement
L.push('', '## Judges against the Reviewer', '', '| judge | agrees on pass/fail | passes of the Reviewer-failed pictures | feasible (>= 90 % agree and <= 5 % of failed passed) |', '|---|---|---|---|');
for (const [j, map] of Object.entries(judges)) {
  const both = [...rev.values()].filter(k => k.scored && map.has(k.id)); const agree = both.filter(k => Boolean(map.get(k.id).pass) === k.pass).length, failed = both.filter(k => !k.pass), passedOfFailed = failed.filter(k => map.get(k.id).pass).length;
  L.push(`| ${j} | ${pct(agree, both.length)} | ${pct(passedOfFailed, failed.length)} | ${both.length && agree / both.length >= 0.9 && failed.length && passedOfFailed / failed.length <= 0.05 ? 'YES' : 'no'} |`);
}
// 4. by-code style checks and the vector findings, over the images that exist
const { RECRAFT_CONTROLS } = await buildPlan(); const theme = [RECRAFT_CONTROLS.background_color.rgb, ...RECRAFT_CONTROLS.colors.map(c => c.rgb)], bg = RECRAFT_CONTROLS.background_color.rgb;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const files = [...results.values()].filter(r => r.type && r.type !== 'bin' && !r.mode && !a.selftest);
if (files.length) {
  L.push('', '## Style by code (ground colour at the four corners vs #FFFCF0, share of pixels within 30 of the nine theme colours, pure-white area over 2 %)', '', '| image | corner colours vs ground (max distance) | theme-colour pixel share | pure-white share | flag |', '|---|---|---|---|---|');
  for (const r of files) { const f = `${OUT}/${r.file ?? `originals/${r.id}.${r.type}`}`; const { data, info } = await sharp()(f, f.endsWith('.svg') ? { density: 96 } : {}).resize(256, 256, { fit: 'fill' }).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
    const px = i => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]], W = info.width, H = info.height, corners = [px(0), px(W - 1), px((H - 1) * W), px(H * W - 1)];
    let near = 0, white = 0; for (let i = 0; i < W * H; i++) { const p = px(i); if (theme.some(t => dist(p, t) <= 30)) near++; if (p[0] >= 250 && p[1] >= 250 && p[2] >= 250) white++; }
    const cd = Math.max(...corners.map(c => dist(c, bg))); L.push(`| ${r.id} | ${cd.toFixed(0)} | ${(100 * near / (W * H)).toFixed(0)} % | ${(100 * white / (W * H)).toFixed(1)} % | ${cd > 30 ? 'ground off' : ''}${white / (W * H) > 0.02 ? ' white>2%' : ''} |`); }
  const vs = files.filter(r => r.type === 'svg');
  if (vs.length) { L.push('', '## Vector (V) files', '', '| image | bytes | path | text | image elements | viewBox | distinct fills | theme-colour fills | ground colour fill present |', '|---|---|---|---|---|---|---|---|---|');
    for (const r of vs) { const s = fs.readFileSync(`${OUT}/${r.file ?? `originals/${r.id}.svg`}`, 'utf8'), hex = v => '#' + v.map(x => Number(x).toString(16).padStart(2, '0')).join(''), fills = [...new Set([...s.matchAll(/fill="(?:(#[0-9a-fA-F]{6})|rgb\((\d+),\s*(\d+),\s*(\d+)\))"/g)].map(m => (m[1] ?? hex([m[2], m[3], m[4]])).toLowerCase()))], themeHex = theme.map(c => hex(c));
      L.push(`| ${r.id} | ${s.length} | ${(s.match(/<path/g) || []).length} | ${(s.match(/<text/g) || []).length} | ${(s.match(/<image/g) || []).length} | ${/viewBox="([^"]+)"/.exec(s)?.[1] ?? '-'} | ${fills.length} | ${fills.filter(f => themeHex.includes(f)).length} | ${fills.includes(hex(bg)) ? 'yes' : 'no'} |`); } }
}
L.push('', 'n = the count beside each percentage; 30 subjects and one draw give a direction, not a precise rate.');
fs.writeFileSync(`${OUT}/scores/report.md`, L.join('\n') + '\n'); console.log(L.join('\n'));
