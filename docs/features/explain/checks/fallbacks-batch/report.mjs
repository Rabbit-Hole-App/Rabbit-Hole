// Builds REPORT.md + results.json from results.jsonl (fallbacks batch). node report.mjs [results.jsonl]
// BEFORE = main 9531b382f, AFTER = feat/fallbacks-batch. Reads recorded fields only; no provider call.
import fs from 'node:fs';
const D = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const runs = fs.readFileSync(process.argv[2] ?? D + 'results.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const plan = JSON.parse(fs.readFileSync(D + 'plan.json', 'utf8'));
fs.writeFileSync(D + 'results.json', JSON.stringify({ arms: plan.meta, profile: 'google-low', planner: 'jev', runs }, null, 1));
const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '-'), sum = xs => xs.reduce((s, x) => s + x, 0);
const med = xs => { if (!xs.length) return '-'; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };
const mean = xs => (xs.length ? (sum(xs) / xs.length).toFixed(2) : '-');
const ARMS = ['before', 'after'], arm = (rs, a) => rs.filter(r => r.arm === a);
const prov = r => (r.authoredBy ? (r.authoredBy.provider === 'google' ? 'gemini-flash-lite' : 'gpt-oss-120b') : 'none (failed)');
const short = (p, n = 46) => (p.length > n ? p.slice(0, n) + '..' : p);
const out = [];
const T = (head, rows) => { out.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.join(' | ')} |`), ''); };
const cost = x => (sum(x.map(r => r.costMicros)) / 1e6).toFixed(4);

out.push('# Fallbacks batch: BEFORE main 9531b382f vs AFTER feat/fallbacks-batch (SIMP-1 + GEM-S1)', '', `google-low (Gemini flash-lite, then gpt-oss-120b), planner jev, sampler off, no pictures, in process. ${runs.length} runs (${arm(runs, 'before').length} before, ${arm(runs, 'after').length} after).`,
  'Definitions: failure line = a run that ended with explanation_missing_visual (honest failure). Mismatched flow = planned token-links/heatmap/matrix/transformation/tree, delivered with a flow/chain diagram and none of the planned kind. First attempt valid = the first provider step\'s first answer raised no learn_artifact_invalid at attempt 0.', '');

out.push('## 1. Headline', '');
T(['arm', 'runs', 'delivered', 'failed', 'ended on failure line (explanation_missing_visual)', 'other failures', 'mismatched flows', 'delivered without the planned kind', 'first attempt valid', 'moved to next provider', 'model calls/run', 'cost US$ (settled)', 'median ms'],
  ARMS.map(a => { const x = arm(runs, a), del = x.filter(r => r.delivered), fv = x.filter(r => r.firstAttemptValid != null); return [a, x.length, del.length, x.length - del.length, x.filter(r => r.endedOnFailureLine).length, x.filter(r => !r.delivered && !r.endedOnFailureLine).length, x.filter(r => r.mismatchedFlow).length, x.filter(r => r.plannedKindMissing).length, `${fv.filter(r => r.firstAttemptValid).length}/${fv.length} (${pct(fv.filter(r => r.firstAttemptValid).length, fv.length)})`, x.filter(r => r.movedToNextProvider).length, mean(x.map(r => r.providerCalls)), cost(x), med(x.map(r => r.ms))]; }));

out.push('## 2. Per prompt x depth: AFTER failure-line runs vs BEFORE mismatched flows', '');
{
  const cells = [...new Set(runs.map(r => r.cell))].sort((a, b) => a - b), rows = [];
  for (const c of cells) {
    const x = runs.filter(r => r.cell === c), B = arm(x, 'before'), A = arm(x, 'after'), r0 = x[0], kinds = a => [...new Set(a.map(r => r.plannedKind ?? 'none'))].join(',');
    rows.push([c, short(r0.prompt), r0.depth, (r0.tags ?? []).join('+'), kinds(x), `${B.length}/${A.length}`, `${B.filter(r => r.mismatchedFlow).length}`, `${B.filter(r => r.endedOnFailureLine).length}`, `${A.filter(r => r.mismatchedFlow).length}`, `${A.filter(r => r.endedOnFailureLine).length}`, `${B.filter(r => r.delivered).length}/${A.filter(r => r.delivered).length}`, `${B.filter(r => r.plannedKindMissing).length}/${A.filter(r => r.plannedKindMissing).length}`]);
  }
  T(['cell', 'prompt', 'depth', 'tags', 'planned kinds seen', 'runs B/A', 'BEFORE mismatched flows', 'BEFORE failure line', 'AFTER mismatched flows', 'AFTER failure line', 'delivered B/A', 'planned kind missing B/A'], rows);
  out.push('Expected: AFTER mismatched flows 0 for matrix/token-links/heatmap/transformation plans (a card with no valid diagram of that family goes to the next provider, then fails honestly); BEFORE shows the baseline.', '');
}

out.push('## 3. GEM-S1: first attempt valid before/after (the 4 GEM-S1 cells)', '');
{
  const g = runs.filter(r => (r.tags ?? []).includes('gem-s1')), rows = [];
  const row = (label, x) => ARMS.map(a => { const y = arm(x, a), fv = y.filter(r => r.firstAttemptValid != null); return [label, a, y.length, `${fv.filter(r => r.firstAttemptValid).length}/${fv.length}`, y.filter(r => r.colsErrorAttempt0).length, y.filter(r => r.anyErrorAttempt0).length, y.filter(r => (r.coercedByQ0 ?? []).length).length, y.filter(r => r.delivered).length, y.filter(r => r.movedToNextProvider).length]; });
  rows.push(...row('all 4 GEM-S1 cells', g));
  for (const c of [...new Set(g.map(r => r.cell))].sort((a, b) => a - b)) { const x = g.filter(r => r.cell === c); rows.push(...row(`cell ${c}: ${short(x[0].prompt, 30)} (${x[0].depth})`, x)); }
  T(['scope', 'arm', 'runs', 'first attempt valid', 'attempt-0 "columns ... received object" error', 'any attempt-0 error', 'runs with a matrix_coerced event', 'delivered', 'moved to next provider'], rows);
  const ev = {}; for (const r of runs) for (const [action, why] of r.coercedByQ0 ?? []) { const k = `${r.arm}: ${action} ${typeof why === 'number' ? '(columns ' + why + ')' : why ?? ''}`; ev[k] = (ev[k] || 0) + 1; }
  out.push('Matrix-coercion events (coercedByQ0 = explanation_matrix_coerced: action, columns coerced or the reason it was left):', '');
  T(['arm: action reason', 'events'], Object.entries(ev).sort().map(([k, n]) => [k, n]));
}

out.push('## 4. Extra provider calls and latency', '');
{
  const rows = ARMS.map(a => { const x = arm(runs, a); return [a, x.length, sum(x.map(r => r.providerCalls)), mean(x.map(r => r.providerCalls)), x.filter(r => r.stepsRun > 1).length, x.filter(r => prov(r) === 'gpt-oss-120b').length, (sum(x.map(r => r.costMicrosUpper)) / 1e6).toFixed(4), med(x.map(r => r.ms)), med(x.filter(r => r.delivered).map(r => r.ms)), Math.round(sum(x.map(r => r.ms)) / (x.length || 1))]; });
  T(['arm', 'runs', 'model calls (ledger rows)', 'calls/run', 'runs with 2+ provider steps', 'cards written by gpt-oss', 'cost upper bound US$ (incl. planner est.)', 'median ms (all)', 'median ms (delivered)', 'mean ms'], rows);
  const by = new Map(); for (const r of runs) by.set(r.idx, { ...(by.get(r.idx) || {}), [r.arm]: r });
  const pairs = [...by.values()].filter(p => p.before && p.after), d = pairs.map(p => p.after.ms - p.before.ms), dc = pairs.map(p => p.after.providerCalls - p.before.providerCalls);
  out.push(`Paired (AFTER minus BEFORE, n=${pairs.length} items): latency median ${med(d)} ms, mean ${d.length ? Math.round(sum(d) / d.length) : '-'} ms; model calls median ${med(dc)}, mean ${mean(dc)}. Both delivered ${pairs.filter(p => p.before.delivered && p.after.delivered).length}; BEFORE delivered, AFTER failed ${pairs.filter(p => p.before.delivered && !p.after.delivered).length}; AFTER delivered, BEFORE failed ${pairs.filter(p => !p.before.delivered && p.after.delivered).length}; both failed ${pairs.filter(p => !p.before.delivered && !p.after.delivered).length}.`, '');
}

out.push('## 5. Per model (the model that wrote the delivered card; a failed run has none)', '');
{
  const rows = [];
  for (const m of ['gemini-flash-lite', 'gpt-oss-120b', 'none (failed)']) for (const a of ARMS) { const x = arm(runs, a).filter(r => prov(r) === m); rows.push([m, a, x.length, x.filter(r => r.mismatchedFlow).length, x.filter(r => r.plannedKindMissing).length, x.filter(r => (r.flags ?? []).length).length, med(x.map(r => r.ms)), cost(x)]); }
  T(['model', 'arm', 'runs', 'mismatched flows', 'planned kind missing', 'delivered with a card-errors flag', 'median ms', 'cost US$ (settled)'], rows);
  const led = {}; for (const r of runs) for (const l of r.ledger ?? []) { const k = `${r.arm} ${l.model}`; led[k] = (led[k] || 0) + 1; }
  out.push('Model calls by arm and model (ledger):', '');
  T(['arm model', 'calls'], Object.entries(led).sort().map(([k, n]) => [k, n]));
}

out.push('## 6. Every failure-line run and every mismatched flow', '');
T(['item', 'arm', 'cell', 'depth', 'prompt', 'planned', 'final kinds', 'outcome', 'attempts'], runs.filter(r => r.endedOnFailureLine || r.mismatchedFlow || (!r.delivered)).map(r => [r.idx, r.arm, r.cell, r.depth, short(r.prompt, 34), r.plannedKind ?? 'none', (r.finalKinds ?? []).join(',') || '-', r.mismatchedFlow ? 'MISMATCHED FLOW' : r.endedOnFailureLine ? 'FAILURE LINE' : 'FAILED ' + r.errorCode, (r.attempts ?? []).filter(x => x.outcome !== 'skipped').map(x => `${x.provider}:${x.outcome}`).join(' > ')]));

out.push('## 7. Cost', '');
{
  const tot = sum(runs.map(r => r.costMicrosUpper)) / 1e6;
  out.push(`Total, both arms, upper bound: US$${tot.toFixed(4)} over ${runs.length} runs (settled ledger US$${(sum(runs.map(r => r.costMicros)) / 1e6).toFixed(4)}); cap US$0.60.`, '');
}
fs.writeFileSync(D + 'REPORT.md', out.join('\n'));
console.log(out.join('\n'));
