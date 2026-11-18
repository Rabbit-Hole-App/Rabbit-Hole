// offline 2a/2b for the VAR-1 bench (no spend): classify the old-classifier flags on the Gemini-live slice, count first-attempt-invalid answers by error code
import fs from 'node:fs';
const rows = fs.readFileSync('results.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const live = rows.filter(r => r.set !== 'vary' && r.idx < 155);
const out = [];
const P = s => out.push(s);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bodyText = r => String(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).replace(/```rh-diagram[\s\S]*?```/g, ' ');
const sentenceWith = (txt, needle) => txt.split(/(?<=[.!?])\s+|\\n/).find(s => s.includes(needle)) || '';
const boxes = r => (Array.isArray(r.diagrams) ? r.diagrams : []).filter(d => d.kind === 'box-plot').flatMap(d => d.boxes || []);
function classify(r, f) {
  if (f.check === 'heatmap-weights-should-sum-to-1') return ['FP-checker (heatmap mask)', 'causal-mask grid (allowed 0, blocked null), not weights; the card has its own content error (HEAT-1: diagonal blocked, no contrast)'];
  if (f.check === 'label-value-vs-prose') {
    const m = f.detail.match(/^(.*?): diagram ([\d.\-]+), prose "([^"]+)"/);
    if (!m) return ['REAL?', f.detail];
    const [, what, dv, pr] = m;
    const num = (pr.match(/-?\d+(\.\d+)?/) || [])[0];
    const s = sentenceWith(bodyText(r), pr.slice(0, 18));
    // the checker cuts the prose number short at the character class it knows ("$105 - 91" is read as "$10"), so a prefix match counts
    const opens = new RegExp(esc(num) + '\\d*(\\.\\d+)?\\s*[+\\-\\u2212]').test(s) || new RegExp(esc(num) + '\\d*(\\.\\d+)?\\s*\\\\times').test(s);
    if (opens) return ['FP-formula-opening', `prose number ${num} opens "${s.slice(0, 110)}", result matches the figure`];
    const others = boxes(r).flatMap(b => [b.median, b.q1, b.q3, b.min, b.max]).filter(x => x !== undefined).map(String);
    if (what === 'median' && others.includes(num)) return ['FP-cross-class', `prose ${num} is another box's value (the checker compared a class with the other class's label)`];
    return ['REAL?', `prose "${pr}" vs diagram ${dv}: ${s.slice(0, 110)}`];
  }
  if (f.check === 'box-whisker-beyond-correct-fence') {
    const hasFences = boxes(r).some(b => b.fences), hasOut = boxes(r).some(b => b.outliers?.length);
    const claims = /outlier/i.test(bodyText(r));
    if (!hasFences && !hasOut && !claims) return ['FP-minmax-whiskers', 'no fences, no outliers drawn, prose never calls the points outliers: min-max whiskers by convention'];
    if (!hasFences && !hasOut && claims) return ['REAL', 'no fences or outliers drawn but the prose calls the extreme points outliers'];
    return ['REAL', 'fences or outliers drawn and a whisker beyond the fence'];
  }
  return ['REAL?', f.detail];
}
const table = {}, real = [], detail = [];
for (const r of live.filter(r => r.flags?.length)) for (const f of r.flags) {
  const [cls, why] = classify(r, f);
  const key = `${r.arm}|${cls}`; table[key] = (table[key] || 0) + 1;
  if (cls.startsWith('REAL')) real.push(`${r.arm} item ${r.idx} (${r.depth}, ${r.authoredBy?.provider}): ${f.check}: ${f.detail}`);
  detail.push(`- ${r.arm} item ${r.idx} ${r.depth} [${cls}] ${f.check}: ${f.detail} :: ${why}`);
}
const classes = [...new Set(Object.keys(table).map(k => k.split('|')[1]))];
P('# VAR-1 bench, offline 2a/2b (no spend): old-classifier flags and first-attempt-invalid answers on the Gemini-live slice (items 0 to 154)\n');
P('## 2a. Old-classifier flags: real mismatch or checker false positive\n');
P('One flag = one classifier line on one delivered card (a card can carry several). Counts per arm:\n');
P('| class | before | after |\n|---|---|---|');
for (const c of classes) P(`| ${c} | ${table['before|' + c] || 0} | ${table['after|' + c] || 0} |`);
const cards = arm => live.filter(r => r.arm === arm && r.flags?.length).length;
P(`| cards with at least one flag | ${cards('before')} | ${cards('after')} |`);
const realCards = arm => new Set(live.filter(r => r.arm === arm && r.flags?.length && r.flags.some(f => classify(r, f)[0].startsWith('REAL'))).map(r => r.idx));
P(`| cards with at least one REAL flag | ${realCards('before').size} | ${realCards('after').size} |`);
P('\nClasses: FP-formula-opening = the prose number is the first operand of a formula whose result equals the figure ("$11.5 + 1.5(6) = 20.5$"); FP-cross-class = a class median compared with the other class\'s label; FP-minmax-whiskers = whiskers at the data min/max, no fences or outliers drawn, prose never says outlier; FP-checker (heatmap mask) = the causal-mask grid is not weights.\n');
P('REAL (item ids):');
if (real.length) real.forEach(x => P('- ' + x)); else P('- none');
P('\nFences drawn on the whisker-flagged cards: ' + live.filter(r => r.flags?.some(f => f.check === 'box-whisker-beyond-correct-fence')).map(r => `${r.arm} ${r.idx}: ${boxes(r).some(b => b.fences) ? 'fences drawn' : 'no fences'}${boxes(r).some(b => b.outliers?.length) ? ', outliers drawn' : ', no outliers drawn'}`).join('; '));
P('\n### Every flag\n'); detail.forEach(x => P(x));

P('\n## 2b. First-attempt-invalid answers (Gemini, attempt 0) on the Gemini-live slice\n');
const evs = r => (Array.isArray(r.events) ? r.events : (() => { try { return JSON.parse(r.events); } catch { return []; } })());
const e0 = r => evs(r).find(x => x.event === 'learn_artifact_invalid' && x.attempt === 0);
const code = r => { const e = e0(r); return e ? String(e.error).split(/[:(]/)[0].trim() : (r.attempts?.[0]?.outcome ?? 'unknown'); };
const msg = r => { const e = e0(r); return e ? String(e.error).replace(/\s+/g, ' ').slice(0, 150) : ''; };
const inv = arm => live.filter(r => r.arm === arm && r.firstAttemptValid === false);
const codes = {};
for (const arm of ['before', 'after']) for (const r of inv(arm)) { const k = code(r); (codes[k] ||= { before: 0, after: 0, ex: msg(r) })[arm]++; }
P(`First attempt invalid: before ${inv('before').length}, after ${inv('after').length} (known first attempt: ${live.filter(r => r.arm === 'before' && r.firstAttemptValid !== null && r.firstAttemptValid !== undefined).length} before, ${live.filter(r => r.arm === 'after' && r.firstAttemptValid !== null && r.firstAttemptValid !== undefined).length} after)\n`);
P('| error code at attempt 0 | before | after | example |\n|---|---|---|---|');
for (const [k, v] of Object.entries(codes).sort((a, b) => b[1].before + b[1].after - a[1].before - a[1].after)) P(`| ${k} | ${v.before} | ${v.after} | ${v.ex.replace(/\|/g, '/')} |`);
const kinds = {};
for (const arm of ['before', 'after']) for (const r of inv(arm)) { const k = `${code(r)} / ${r.plannerKind ?? 'no plan'}`; (kinds[k] ||= { before: 0, after: 0 })[arm]++; }
P('\nBy planned kind:\n\n| code / planned kind | before | after |\n|---|---|---|');
for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1].before + b[1].after - a[1].before - a[1].after)) P(`| ${k} | ${v.before} | ${v.after} |`);
fs.writeFileSync('offline-2ab.md', out.join('\n') + '\n');
console.log(out.join('\n').split('\n### Every flag')[0]);
console.log(out.join('\n').split('## 2b.')[1]);
