// ILL-B Phase 1 scored table (Reviewer's order 11-19): per arm x group x form, text, latency, cost, per subject, judges against the Reviewer.
// Every block twice: all 220 and without the four P01 tiles the Reviewer had seen in Phase 0.
// usage: node score-table.mjs --reviewer <csv> [--out C:/s/ill-b/run] [--demo]   (--demo writes a random csv to a temp folder: layout check only, never a result)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { OUT as OUT0, readJsonl } from './lib.mjs';

const { values: a } = parseArgs({ options: { reviewer: { type: 'string' }, out: { type: 'string' }, demo: { type: 'boolean' } } });
const OUT = a.out ?? OUT0;
const key = JSON.parse(fs.readFileSync(`${OUT}/key.json`, 'utf8'));
let csv = a.reviewer;
if (a.demo) { // random scores over the real key, to see the layout; the output is not a result
  csv = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'illb-demo-')), 'demo.csv'); const rows = ['code,subject,must1,must2,must3,must4,text,notes'];
  for (const k of Object.values(key)) { const p = Math.random() < 0.5; rows.push(`${k.code},${k.subject},${p ? 'yes' : 'no'},yes,yes,,${k.form === 'N' ? (Math.random() < 0.8 ? 'none' : 'wrong') : (Math.random() < 0.5 ? 'correct' : 'wrong')},demo`); }
  fs.writeFileSync(csv, rows.join('\n') + '\n');
}
if (!csv) { console.error('STOP: --reviewer <claude/ill-b-reviewer-scores.csv>'); process.exit(2); }

const parseCsv = text => { const rows = []; let row = [], cell = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i];
  if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
  else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); } return rows.filter(r => r.some(x => x.trim() !== '')); };
const table = parseCsv(fs.readFileSync(csv, 'utf8')); const head = table[0].map(h => h.trim());
const yes = v => /^(y|yes|1|true)$/i.test(String(v ?? '').trim()), no = v => /^(n|no|0|false)$/i.test(String(v ?? '').trim());
const results = new Map(readJsonl(`${OUT}/results.jsonl`).filter(r => r.phase === 1 || r.type).map(r => [r.id, r]));
const judges = Object.fromEntries(['gemini', 'sonnet'].map(j => [j, new Map(readJsonl(`${OUT}/scores/judge-${j}.jsonl`).map(r => [r.id, r]))]));

// the Reviewer's reading of text (11-19): 'correct' = every word shown is an asked label on or beside its part (pointer or colour ties count); a row of words under the picture, a word on the wrong part, a duplicate on a wrong part, any word not asked = 'wrong'; 'none' = no text.
const recs = []; const seen = new Set(); const problems = [];
for (const c of table.slice(1)) { const r = Object.fromEntries(head.map((h, i) => [h, (c[i] ?? '').trim()])); const k = key[r.code]; if (!k) { problems.push(`unknown code ${r.code}`); continue; } if (seen.has(r.code)) problems.push(`duplicate code ${r.code}`); seen.add(r.code);
  const musts = ['must1', 'must2', 'must3', 'must4'].map(h => r[h]).filter(v => v !== ''); const text = r.text.toLowerCase();
  if (!['none', 'correct', 'wrong'].includes(text)) problems.push(`${r.code}: text '${r.text}' not none/correct/wrong`);
  const mustsOk = musts.length > 0 && musts.every(yes) && !musts.some(no);
  const hasText = text !== 'none', textOk = k.form === 'N' ? text === 'none' : text === 'correct';
  recs.push({ ...k, musts: musts.length, mustsOk, text, hasText, textOk, pass: mustsOk && textOk }); }
for (const code of Object.keys(key)) if (!seen.has(code)) problems.push(`missing code ${code}`);
const SEEN = new Set(['WZP2W', '6WZTN', '9G8BC', 'ND9Y6']);
const ARMS = [['F', 'recraftv4_1_flash'], ['F2', 'recraftv4_1_flash_v2'], ['S', 'recraftv4_1'], ['V', 'recraftv4_1_vector']].map(x => x[0]); const GROUPS = ['physical', 'spatial', 'abstract'];
const pct = (x, n) => (n ? `${Math.round((100 * x) / n)} % (${x}/${n})` : 'n/a');
const sorted = v => [...v].sort((x, y) => x - y);
const med = v => { const s = sorted(v); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }; // mean of the two middle values for an even count (Reviewer rule E)
const p90 = v => { const s = sorted(v); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)] : null; };
const f1 = v => (v === null ? '-' : v.toFixed(1)), bar = (x, n, b) => (n && x / n >= b ? 'meets' : 'below');
const L = [];
function block(title, R) {
  L.push(`## ${title}`, '', `${R.length} pictures.`, '');
  // 1. must items (picture parts only, text ignored) and the full pass, by group and overall, against the 70 % bar
  L.push('### Share meeting every must item AND the text rule (the pass), by group and overall (bar 70 %)', '', '| arm | physical | spatial | abstract | overall | vs 70 % |', '|---|---|---|---|---|---|');
  for (const arm of ARMS) { const A = R.filter(r => r.arm === arm); const cells = GROUPS.map(g => { const x = A.filter(r => r.group === g); return pct(x.filter(r => r.pass).length, x.length); });
    L.push(`| ${arm} | ${cells.join(' | ')} | ${pct(A.filter(r => r.pass).length, A.length)} | ${bar(A.filter(r => r.pass).length, A.length, 0.7)} |`); }
  L.push('', '### Share meeting every must item on the picture parts alone (text ignored), by group and overall (bar 70 %)', '', '| arm | physical | spatial | abstract | overall | vs 70 % |', '|---|---|---|---|---|---|');
  for (const arm of ARMS) { const A = R.filter(r => r.arm === arm); const cells = GROUPS.map(g => { const x = A.filter(r => r.group === g); return pct(x.filter(r => r.mustsOk).length, x.length); });
    L.push(`| ${arm} | ${cells.join(' | ')} | ${pct(A.filter(r => r.mustsOk).length, A.length)} | ${bar(A.filter(r => r.mustsOk).length, A.length, 0.7)} |`); }
  // 2. by form
  L.push('', '### The pass by form (N = no text asked, L = labels asked)', '', '| arm | N | L | N physical / spatial / abstract | L physical / spatial / abstract |', '|---|---|---|---|---|');
  for (const arm of ARMS) { const A = R.filter(r => r.arm === arm), g = (form, grp) => { const x = A.filter(r => r.form === form && (!grp || r.group === grp)); return pct(x.filter(r => r.pass).length, x.length); };
    L.push(`| ${arm} | ${g('N')} | ${g('L')} | ${GROUPS.map(x => g('N', x)).join(' / ')} | ${GROUPS.map(x => g('L', x)).join(' / ')} |`); }
  // 3. text
  L.push('', '### Text: L pictures with the text correct (bar 80 %); N pictures with any text at all', '', '| arm | L: text correct | vs 80 % | N: any text | pictures with text that have it wrong |', '|---|---|---|---|---|');
  for (const arm of ARMS) { const A = R.filter(r => r.arm === arm), l = A.filter(r => r.form === 'L'), n = A.filter(r => r.form === 'N'), withText = A.filter(r => r.hasText);
    L.push(`| ${arm} | ${pct(l.filter(r => r.text === 'correct').length, l.length)} | ${bar(l.filter(r => r.text === 'correct').length, l.length, 0.8)} | ${pct(n.filter(r => r.hasText).length, n.length)} | ${pct(withText.filter(r => r.text === 'wrong').length, withText.length)} |`); }
  const all = R.filter(r => r.hasText); L.push('', `All arms: ${pct(all.filter(r => r.text === 'wrong').length, all.length)} of the pictures with text have it wrong.`);
  // 4. latency and cost
  L.push('', '### Speed and cost (total seconds = request + download; median = mean of the two middle values for an even count)', '', '| arm | n | median s | p90 s | request-only median s | cost / picture US$ |', '|---|---|---|---|---|---|');
  for (const arm of ARMS) { const rs = R.filter(r => r.arm === arm).map(r => results.get(r.id)).filter(r => r && !r.first), tot = rs.map(r => r.totalSeconds).filter(Number.isFinite), req = rs.map(r => r.requestSeconds).filter(Number.isFinite);
    L.push(`| ${arm} | ${tot.length} | ${f1(med(tot))} | ${f1(p90(tot))} | ${f1(med(req))} | ${rs.length ? (rs.reduce((s, r) => s + (r.credits ?? 0), 0) / rs.length / 1000).toFixed(3) : '-'} |`); }
  // 5. per subject
  L.push('', '### Per subject: passes per arm (a subject has an N and an L picture per arm, so 0 to 2)', '', '| subject | group | F | F2 | S | V | total of 8 (musts + text) | musts only, total of 8 |', '|---|---|---|---|---|---|---|---|');
  const subs = [...new Set(R.map(r => r.subject))].sort(); for (const s of subs) { const cells = ARMS.map(arm => R.filter(r => r.subject === s && r.arm === arm)), grp = R.find(r => r.subject === s)?.group;
    L.push(`| ${s} | ${grp} | ${cells.map(c => `${c.filter(r => r.pass).length}/${c.length}`).join(' | ')} | ${cells.flat().filter(r => r.pass).length} | ${cells.flat().filter(r => r.mustsOk).length} |`); }
  L.push('', `Subjects with zero passes (musts + text): ${subs.filter(s => !R.some(r => r.subject === s && r.pass)).join(', ') || 'none'}. Zero passes on the must items alone: ${subs.filter(s => !R.some(r => r.subject === s && r.mustsOk)).join(', ') || 'none'}.`);
  // 6. judges against the Reviewer
  L.push('', '### Judges against the Reviewer (pass / fail per picture; bars: agreement >= 90 %, false accepts <= 5 % of the Reviewer-failed pictures)', '', '| judge | scope | agree | false accepts (judge pass, Reviewer fail) | share of the Reviewer-failed | false rejects (judge fail, Reviewer pass) | share of the Reviewer-passed | bars |', '|---|---|---|---|---|---|---|---|');
  for (const basis of ['full', 'musts']) for (const [j, map] of Object.entries(judges)) for (const scope of ['all', ...GROUPS]) { const X0 = R.filter(r => (scope === 'all' || r.group === scope) && map.has(r.id)); if (!X0.length) continue;
    const X = X0.map(r => ({ ...r, pass: basis === 'full' ? r.pass : r.mustsOk })), jp = r => (basis === 'full' ? Boolean(map.get(r.id).pass) : (map.get(r.id).must ?? []).length > 0 && map.get(r.id).must.every(Boolean)), agree = X.filter(r => jp(r) === r.pass).length, fa = X.filter(r => jp(r) && !r.pass).length, fr = X.filter(r => !jp(r) && r.pass).length, failed = X.filter(r => !r.pass).length, passed = X.filter(r => r.pass).length;
    L.push(`| ${j} (${basis === 'full' ? 'musts + text' : 'musts only'}) | ${scope} | ${pct(agree, X.length)} | ${fa} | ${pct(fa, failed)} | ${fr} | ${pct(fr, passed)} | ${scope === 'all' ? `${agree / X.length >= 0.9 ? 'agree YES' : 'agree no'}, ${failed && fa / failed <= 0.05 ? 'false accepts YES' : 'false accepts no'}` : ''} |`); }
  L.push('');
}
L.push('# ILL-B Phase 1: scored table (the Reviewer\'s blind scores joined with the key)', '', a.demo ? 'DEMO DATA (random scores): layout check only, not a result.' : `Source: ${path.basename(csv)}; ${recs.length} rows.`, '', ...(problems.length ? ['PROBLEMS: ' + problems.join('; '), ''] : []));
{ // owner direction 11-19 10:05: decisions are taken on spatial and abstract only; physical is one line for the record
  const SA = recs.filter(r => r.group !== 'physical'), phys = recs.filter(r => r.group === 'physical');
  L.push('## Lead: spatial and abstract only (the four P01 tiles are physical, so leaving them out changes nothing here)', '', '| arm | spatial: musts only | abstract: musts only | combined: musts only | vs 70 % | spatial: musts + text | abstract: musts + text | combined: musts + text | vs 70 % |', '|---|---|---|---|---|---|---|---|---|');
  const cell = (A, g, k) => { const x = g ? A.filter(r => r.group === g) : A; return pct(x.filter(r => r[k]).length, x.length); };
  for (const arm of ARMS) { const A = SA.filter(r => r.arm === arm), nm = A.filter(r => r.mustsOk).length, np = A.filter(r => r.pass).length;
    L.push(`| ${arm} | ${cell(A, 'spatial', 'mustsOk')} | ${cell(A, 'abstract', 'mustsOk')} | ${cell(A, null, 'mustsOk')} | ${bar(nm, A.length, 0.7)} | ${cell(A, 'spatial', 'pass')} | ${cell(A, 'abstract', 'pass')} | ${cell(A, null, 'pass')} | ${bar(np, A.length, 0.7)} |`); }
  L.push('', `Pooled over the four arms: spatial ${pct(SA.filter(r => r.group === 'spatial' && r.mustsOk).length, SA.filter(r => r.group === 'spatial').length)}, abstract ${pct(SA.filter(r => r.group === 'abstract' && r.mustsOk).length, SA.filter(r => r.group === 'abstract').length)} on the must items alone (the Reviewer's pooled count).`, '');
  L.push('### Per subject, the 20 S and A subjects only (passes per arm out of 2: one N and one L picture)', '', '| subject | F | F2 | S | V | musts only, of 8 | musts + text, of 8 |', '|---|---|---|---|---|---|---|');
  for (const s of [...new Set(SA.map(r => r.subject))].sort()) { const cells = ARMS.map(arm => SA.filter(r => r.subject === s && r.arm === arm)); const all = cells.flat();
    L.push(`| ${s} | ${cells.map(c => `${c.filter(r => r.mustsOk).length}/${c.length} (${c.filter(r => r.pass).length})`).join(' | ')} | ${all.filter(r => r.mustsOk).length} | ${all.filter(r => r.pass).length} |`); }
  L.push('', 'Cells show the must-item passes, with the pass that also meets the text rule in brackets.', `Zero passes on the must items alone: ${[...new Set(SA.map(r => r.subject))].sort().filter(s => !SA.some(r => r.subject === s && r.mustsOk)).join(', ') || 'none'}. Zero passes with the text rule: ${[...new Set(SA.map(r => r.subject))].sort().filter(s => !SA.some(r => r.subject === s && r.pass)).join(', ') || 'none'}.`, '');
  const pm = phys.filter(r => r.mustsOk).length, pp = phys.filter(r => r.pass).length;
  L.push(`Physical group, for the record only (stopped by the owner 11-19 10:05): ${pm} of ${phys.length} meet every must item (${ARMS.map(arm => `${arm} ${phys.filter(r => r.arm === arm && r.mustsOk).length}/${phys.filter(r => r.arm === arm).length}`).join(', ')}); ${pp} of ${phys.length} also meet the text rule.`, '', '---', '', 'The full tables ordered earlier follow (all groups, every block twice).', '');
}
block('A. All pictures', recs);
block('B. Without the four P01 tiles seen in Phase 0 (WZP2W, 6WZTN, 9G8BC, ND9Y6)', recs.filter(r => !SEEN.has(r.code)));
const outFile = a.demo ? path.join(os.tmpdir(), 'illb-demo-table.md') : `${OUT}/scores/scored-table.md`; fs.writeFileSync(outFile, L.join('\n') + '\n'); console.log(`written ${outFile}; ${recs.length} rows; problems: ${problems.length}`);
