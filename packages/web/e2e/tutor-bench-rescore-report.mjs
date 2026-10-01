// Free rescore report (owner GO FREE RESCORE, 2026-10-01): old vs semantic scores, the changed turns with
// the rubric rule behind each change, the paired Opus-vs-candidate table, golden traces, hard and
// reliability gates (unchanged, from the paid run's gates.json) and the locked-gate verdicts.
// Reads files only. Usage: node e2e/tutor-bench-rescore-report.mjs <rescore dir> <benchmark dir>
import { readFileSync, writeFileSync } from 'node:fs';
import { CORPUS } from './tutor-corpus.mjs';

const [DIR, BENCH] = process.argv.slice(2);
const scored = JSON.parse(readFileSync(`${DIR}/rescored.json`, 'utf8'));
const paid = JSON.parse(readFileSync(`${BENCH}/gates.json`, 'utf8')).results;
const cache = {};
const rowsOf = arm => (cache[arm] ||= Object.fromEntries(['r1', 'r2', 'r3', 'routine-r4', 'routine-r5']
  .flatMap(rep => readFileSync(`${BENCH}/corpus-live-${arm}-${rep}.jsonl`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)))
  .map(row => [`${row.stage}|${row.trace}|${row.turn}`, row])));
const TURN = Object.fromEntries(CORPUS.flatMap(trace => trace.turns.map((step, i) => [`${trace.id}|${i}`, step])));
const ARMS = Object.keys(scored), REF = 'A', GATE_PP = 2;
const pct = (n, d) => (d ? (100 * n / d).toFixed(1) : 'n/a');
const ratio = (list, dim, key) => { const s = list.filter(r => dim in r[key]); return { num: s.filter(r => r[key][dim]).length, den: s.length }; };
const lines = [];

// ---------- 3. old vs new ----------
lines.push('## Old (exact-script) vs semantic-equivalence accuracy\n', '| arm | actions old | actions new | evidence old | evidence new | route old | route new | evaluation old | evaluation new | turns passing old | turns passing new |', '|---|---|---|---|---|---|---|---|---|---|---|');
const acc = {};
for (const arm of ARMS) {
  const list = scored[arm];
  const d = Object.fromEntries(['actions', 'evidence', 'route', 'evaluation'].flatMap(dim => [[`${dim}_old`, ratio(list, dim, 'old')], [`${dim}_new`, ratio(list, dim, 'new')]]));
  acc[arm] = d;
  lines.push(`| ${arm} | ${['actions', 'evidence', 'route', 'evaluation'].map(dim => `${d[`${dim}_old`].num}/${d[`${dim}_old`].den} (${pct(d[`${dim}_old`].num, d[`${dim}_old`].den)}%) | ${d[`${dim}_new`].num}/${d[`${dim}_new`].den} (${pct(d[`${dim}_new`].num, d[`${dim}_new`].den)}%)`).join(' | ')} | ${list.filter(r => r.old_pass).length}/${list.length} | ${list.filter(r => r.pass).length}/${list.length} |`);
}
lines.push('', `Not applicable under rule F (scripted evaluator fault did not happen): ${ARMS.map(arm => `${arm} ${scored[arm].filter(r => r.na_fault).length}`).join(', ')} turn instances (B-jev-error and B-larger-error, 3 repetitions each).`,
  `Evidence states not reconstructable (E3 falls back to E1/E2): ${ARMS.map(arm => `${arm} ${scored[arm].filter(r => r.why.unreconstructable).length}`).join(', ')}.`);

// ---------- 4. changed turns ----------
function reason(arm, r) {
  const row = rowsOf(arm)[`${r.stage}|${r.trace}|${r.turn}`], step = TURN[`${r.trace}|${r.turn}`], out = [];
  for (const dim of ['evaluation', 'evidence', 'route', 'actions']) {
    if (r.old[dim] === false && r.new[dim] === true) {
      if (dim === 'route') out.push(`route R2: ${row.row} ~ ${step.expect.row}`);
      if (dim === 'evaluation') out.push(`evaluation §3: larger ${row.larger_calls ? 'ran' : 'skipped'} as the escalation policy decided (${row.escalation})`);
      if (dim === 'evidence') {
        const exp = step.expect.events;
        const unsettled = (row.events || []).some(key => key.endsWith('?'));
        const multi = exp && JSON.stringify([...new Set(exp)].sort()) === JSON.stringify([...new Set((row.events || []).map(k => k.replace(/\?$/, '')))].sort()) && exp.length !== row.events.length;
        out.push(`evidence ${[unsettled && 'E2 unsettled = settled', multi && 'E1 multiplicity'].filter(Boolean).join(', ') || 'E1/E2'}: [${(row.events || []).join(', ')}] vs [${(exp || []).join(', ')}]`);
      }
      if (dim === 'actions') {
        const got = row.actions.map(a => a.type), want = step.expect.actions;
        const extra = got.filter(t => !want.includes(t)), missing = want.filter(t => !got.includes(t));
        const tag = step.expect.row && step.expect.row !== row.row ? 'A2 move of the equivalent route' : missing.length ? 'A1 policy alternative' : 'A5 allowed extra';
        out.push(`actions ${tag}: [${got.join(', ')}] vs [${want.join(', ')}]${extra.length ? ` (extra ${extra.join(', ')})` : ''}${missing.length ? ` (replaced ${missing.join(', ')})` : ''}`);
      }
    }
  }
  return out.join('; ');
}
lines.push('\n## Turns that changed (per arm)\n');
const changes = {};
for (const arm of ARMS) {
  const list = scored[arm];
  const up = list.filter(r => !r.old_pass && r.pass && !r.na_fault), down = list.filter(r => r.old_pass && !r.pass), na = list.filter(r => r.na_fault);
  changes[arm] = { fail_to_pass: up.map(r => ({ turn: `${r.stage} ${r.trace}#${r.turn}`, why: reason(arm, r) })), pass_to_fail: down.map(r => `${r.stage} ${r.trace}#${r.turn}`), not_applicable: na.map(r => `${r.stage} ${r.trace}#${r.turn}`) };
  lines.push(`### ${arm}: ${up.length} fail -> pass, ${down.length} pass -> fail, ${na.length} not applicable\n`);
  for (const c of changes[arm].fail_to_pass) lines.push(`- ${c.turn}: ${c.why}`);
  for (const t of changes[arm].pass_to_fail) lines.push(`- PASS -> FAIL ${t}`);
  lines.push('');
}

// ---------- 5. paired table ----------
const key = r => `${r.stage.replace(/^[A-F]-/, '')}|${r.trace}|${r.turn}`;
const refBy = Object.fromEntries(scored[REF].map(r => [key(r), r]));
lines.push('## Paired turn-level analysis vs Opus (arm A), same turn and repetition\n', '| candidate | group | both pass | Opus only | candidate only | both fail | not applicable |', '|---|---|---|---|---|---|---|');
const paired = {};
for (const arm of ARMS.filter(a => a !== REF)) for (const group of ['routine', 'evidence', 'structural']) {
  const c = { both: 0, opus: 0, cand: 0, none: 0, na: 0 };
  for (const r of scored[arm].filter(x => x.group === group)) {
    const o = refBy[key(r)];
    if (!o || r.na_fault || o.na_fault) { c.na++; continue; }
    c[o.pass && r.pass ? 'both' : o.pass ? 'opus' : r.pass ? 'cand' : 'none']++;
  }
  (paired[arm] ||= {})[group] = c;
  lines.push(`| ${arm}${arm === 'B' ? ' (Opus vs Opus)' : ''} | ${group} | ${c.both} | ${c.opus} | ${c.cand} | ${c.none} | ${c.na} |`);
}
lines.push('\n### Per corpus turn: passing repetitions (semantic), A / B / D / E / F\n', '| turn | group | A | B | D | E | F |', '|---|---|---|---|---|---|---|');
for (const trace of CORPUS) trace.turns.forEach((step, i) => {
  const cells = ARMS.map(arm => { const s = scored[arm].filter(r => r.trace === trace.id && r.turn === i); return s.some(r => r.na_fault) ? 'n/a' : `${s.filter(r => r.pass).length}/${s.length}`; });
  lines.push(`| ${trace.id}#${i} | ${scored.A.find(r => r.trace === trace.id && r.turn === i)?.group ?? ''} | ${cells.join(' | ')} |`);
});

// ---------- golden + 6. gates + 7. verdicts ----------
const golden = arm => { const ids = [...new Set(scored[arm].filter(r => r.golden).map(r => r.trace))]; const ok = ids.filter(id => scored[arm].filter(r => r.trace === id).every(r => r.pass || r.na_fault)); return { passed: ok.length, total: ids.length, failed: ids.filter(id => !ok.includes(id)) }; };
lines.push('\n## Hard, reliability and cost gates (unchanged; paid-run values)\n', '| | A | B | D | E | F |', '|---|---|---|---|---|---|');
const g = arm => paid[arm];
const gateRows = [
  ['consent violations', a => g(a).hard.consent_violations], ['critical policy violations', a => g(a).hard.policy_violations], ['nonexistent-resource actions', a => g(a).hard.nonexistent_resource_actions],
  ['fast-tier sentences spoken then replaced', a => g(a).hard.spoken_then_replaced], ['evidence corruption', a => g(a).hard.evidence_corruption],
  ['invalid structured plans (< 2%)', a => `${g(a).reliability.invalid_plans.num}/${g(a).reliability.invalid_plans.den} (${pct(g(a).reliability.invalid_plans.num, g(a).reliability.invalid_plans.den)}%)`],
  ['routine fast-tier escalation (< 20%)', a => (g(a).reliability.routine_fast_escalation.den && a !== 'A' && a !== 'B' ? `${g(a).reliability.routine_fast_escalation.num}/${g(a).reliability.routine_fast_escalation.den} (${pct(g(a).reliability.routine_fast_escalation.num, g(a).reliability.routine_fast_escalation.den)}%)` : 'n/a')],
  ['cost / turn (<= A)', a => `$${g(a).cost_per_turn_usd}`], ['corpus golden traces, semantic, every repetition', a => `${golden(a).passed}/${golden(a).total}`],
];
for (const [label, get] of gateRows) lines.push(`| ${label} | ${ARMS.map(get).join(' | ')} |`);
const verdicts = {};
for (const arm of ARMS) {
  const failed = [], h = g(arm).hard;
  for (const k of ['consent_violations', 'policy_violations', 'nonexistent_resource_actions', 'spoken_then_replaced', 'evidence_corruption']) if (h[k]) failed.push(`${k} ${h[k]}`);
  for (const dim of ['actions', 'evidence', 'route']) {
    const a = acc[arm][`${dim}_new`], r = acc[REF][`${dim}_new`];
    const gap = +((r.num / r.den - a.num / a.den) * 100).toFixed(6);
    if (gap > GATE_PP) failed.push(`${dim} ${a.num}/${a.den} is ${gap.toFixed(1)} pp below A (${r.num}/${r.den})`);
  }
  const inv = g(arm).reliability.invalid_plans, esc = g(arm).reliability.routine_fast_escalation;
  if (inv.den && inv.num / inv.den >= 0.02) failed.push(`invalid plans ${inv.num}/${inv.den}`);
  if (arm !== 'A' && arm !== 'B' && esc.den && esc.num / esc.den >= 0.2) failed.push(`routine escalation ${esc.num}/${esc.den}`);
  if (g(arm).cost_per_turn_usd > g(REF).cost_per_turn_usd) failed.push('cost/turn above A');
  const gold = golden(arm);
  verdicts[arm] = { eligible_unit_golden: !failed.length, eligible_live_golden: !failed.length && gold.passed === gold.total, failed, live_golden: gold };
}
lines.push('\n## Locked-gate verdicts (semantic quality, hard/reliability/cost unchanged)\n', '```', JSON.stringify(verdicts, null, 1), '```');
writeFileSync(`${DIR}/rescore-report.md`, lines.join('\n') + '\n');
writeFileSync(`${DIR}/rescore-summary.json`, JSON.stringify({ accuracy: acc, paired, changes, verdicts }, null, 1) + '\n');
console.log(JSON.stringify({ acc: Object.fromEntries(ARMS.map(a => [a, Object.fromEntries(Object.entries(acc[a]).filter(([k]) => k.endsWith('_new')).map(([k, v]) => [k, `${v.num}/${v.den}`]))])), paired, verdicts, changed: Object.fromEntries(ARMS.map(a => [a, [changes[a].fail_to_pass.length, changes[a].pass_to_fail.length, changes[a].not_applicable.length]])) }, null, 1));
