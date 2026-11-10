// The release gate, two tiers (owner 2026-11-09; rule in docs/features/explain/benchmarks/test-ledger.md).
//   node scripts/explain-bench/gate-check.mjs <report dir with results.json> <SHA> [--tier smoke|full] [--baseline <judged run dir>] [--out <file>]
// Tier "full" (3x of today's six core sets): the thirteen lines of the 117/118 overnight gate, each with its per-run values (the spread column).
// Tier "smoke" (one pass of the smoke set): without --baseline the same limits, delivery and the two picture lines hard, the rest reported. With --baseline <judged run dir> (owner 2026-11-10): delivery, the two picture lines and
// right kind on verified prompts are absolute; every other line is compared with the baseline's mean on the same prompts and fails only past SMOKE_TOLERANCE.
// The tier defaults to smoke when the run holds only the smoke set. Writes <dir>/gate-result.txt (or --out): first line `GATE: PASS|FAIL|INVALID <SHA> tier=<tier> ...`, then one line per gate.
// Exit 0 pass, 1 fail, 3 invalid (a provider outage: pictures the image provider refused), 2 bad arguments.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { KINDS } from './build-smoke-set.mjs';
import { loadSet, quantile, summarize } from './score.mjs';

export const CORE = ['regression', 'baseline', 'aiml', 'sequence', 'content', 'correct-svg']; // the sets of the 116 baseline and the clean-up run (423 cards); `illustrations` is reported elsewhere
// The clean-up run (2026-11-08T222201, fully judged 2026-11-08T233456): the reference for "not worse".
export const CLEANUP = { beyondYes: 73, beyondOf: 385, fully: 86, not: 5, faithOf: 185 };
export const TOLERANCE = 3;
const pct = (a, b) => (b ? (100 * a) / b : 0), fmt = x => `${x.toFixed(1)}%`, frac = (a, b) => `${a}/${b} = ${fmt(pct(a, b))}`;

// [name, hard (smoke tier: fails the gate whatever the sample), f(summary S, cards) -> { ok, value (short, for the spread column), detail }]
export function lines(tier) {
  const smoke = tier === 'smoke', src = (cards, set) => cards.filter(c => (smoke ? c.smoke?.source?.set === set : c.set === set));
  const factualLine = pick => (S, cards) => { const x = summarize(pick(cards)).factual; return { ok: !!x?.judged && pct(x.withErrors, x.judged) <= 10, value: x ? `${x.withErrors}/${x.judged}` : '-', detail: x ? frac(x.withErrors, x.judged) : 'set missing or not judged' }; };
  const L = [
    ['delivery: at least 99% of cards delivered', true, S => ({ ok: pct(S.cards.delivered, S.cards.sent) >= 99, value: `${S.cards.delivered}/${S.cards.sent}`, detail: `${S.cards.delivered}/${S.cards.sent}` })],
    ['factual error <= 10% (overall)', false, S => { const f = S.factual; return { ok: !!f?.judged && pct(f.withErrors, f.judged) <= 10, value: f ? `${f.withErrors}/${f.judged}` : '-', detail: f ? frac(f.withErrors, f.judged) : 'not judged' }; }],
    ['factual error <= 10% (baseline)', false, factualLine(c => src(c, 'baseline'))],
    ...(smoke ? [] : [['factual error <= 10% (correct-svg)', false, factualLine(c => src(c, 'correct-svg'))]]),
    [smoke ? 'right kind >= 80% of delivered (prompts whose kind is verified; the kind-reference prompts are reported below)' : 'right kind >= 80% of delivered', false, (S, cards) => { const x = smoke ? summarize(cards.filter(c => !c.smoke?.unverified)).choice : S.choice; return { ok: pct(x.right, x.of) >= 80, value: `${x.right}/${x.of}`, detail: frac(x.right, x.of) }; }],
    ['pictures where needed: 100%', true, S => ({ ok: S.pictures.needed > 0 && S.pictures.given === S.pictures.needed, value: `${S.pictures.given}/${S.pictures.needed}`, detail: `${S.pictures.given}/${S.pictures.needed}` })],
    ['pictures where none belongs: 0', true, S => ({ ok: S.pictures.violations.length === 0, value: `${S.pictures.violations.length}/${S.pictures.noPictureSubjects}`, detail: `${S.pictures.violations.length}/${S.pictures.noPictureSubjects}` })],
    ['repairs < 15%', false, S => ({ ok: pct(S.repairs.repaired, S.repairs.of) < 15, value: `${S.repairs.repaired}/${S.repairs.of}`, detail: frac(S.repairs.repaired, S.repairs.of) })],
    ['whole-card p90 <= 7000 ms', false, (S, cards) => { const ms = cards.map(c => c.totalMs), p90 = quantile(ms, 0.9), p50 = quantile(ms, 0.5); return { ok: p90 !== null && p90 <= 7000, value: `${p90}`, detail: `p90 ${p90} ms (p50 ${p50} ms)` }; }],
    ['noun-box or placeholder labels < 5% of diagrams', false, S => ({ ok: pct(S.content.flagged ?? 0, S.content.diagrams) < 5, value: `${S.content.flagged ?? 0}/${S.content.diagrams}`, detail: frac(S.content.flagged ?? 0, S.content.diagrams) })],
    // faithfulness and claims-beyond-prose not worse than the clean-up run: compared as rates, with a +3-card tolerance on the new run's denominator
    ['faithfulness: "not" not worse than the clean-up (+3)', false, S => { const f = S.content.faithful; if (!f?.judged) return { ok: false, value: '-', detail: 'no faithfulness judgements' }; const max = Math.round((CLEANUP.not / CLEANUP.faithOf) * f.judged) + TOLERANCE; return { ok: f.not <= max, value: `${f.not}/${f.judged}`, detail: `not ${f.not}/${f.judged} (limit ${max}; clean-up ${CLEANUP.not}/${CLEANUP.faithOf})` }; }],
    ['faithfulness: "fully" not worse than the clean-up (-3)', false, S => { const f = S.content.faithful; if (!f?.judged) return { ok: false, value: '-', detail: 'no faithfulness judgements' }; const min = Math.round((CLEANUP.fully / CLEANUP.faithOf) * f.judged) - TOLERANCE; return { ok: f.fully >= min, value: `${f.fully}/${f.judged}`, detail: `fully ${f.fully}/${f.judged} (floor ${min}; clean-up ${CLEANUP.fully}/${CLEANUP.faithOf})` }; }],
    ['claims beyond the prose not worse than the clean-up (+3)', false, S => { const b = S.content.beyond; if (!b?.judged) return { ok: false, value: '-', detail: 'no claims judgements' }; const max = Math.round((CLEANUP.beyondYes / CLEANUP.beyondOf) * b.judged) + TOLERANCE; return { ok: b.yes <= max, value: `${b.yes}/${b.judged}`, detail: `${b.yes}/${b.judged} (limit ${max}; clean-up ${CLEANUP.beyondYes}/${CLEANUP.beyondOf})` }; }],
  ];
  return L;
}

// Smoke-only reported lines (no limit on record): which of the planner's kinds the run drew, and the kind-reference prompts.
export function smokeReports(cards) {
  const drawn = new Set(cards.flatMap(c => c.diagrams.map(d => d.kind))), missing = KINDS.filter(k => !drawn.has(k)), ref = cards.filter(c => c.smoke?.unverified && c.delivered);
  return [`REPORTED  diagram kinds drawn: ${KINDS.length - missing.length}/${KINDS.length}${missing.length ? ` (not drawn: ${missing.join(', ')})` : ''}`,
    `REPORTED  prompts whose kind is not verified (kind-reference prompts): right ${ref.filter(c => c.score === 'right').length}/${ref.length}${ref.some(c => c.score !== 'right') ? ` (${ref.filter(c => c.score !== 'right').map(c => c.id).join(', ')})` : ''}`];
}

// Smoke tier calibration (owner 2026-11-10): ~66 cards are too few for the full tier's absolute rates. With --baseline <judged run dir> (the last passing release's judged 3x run), delivery, the two picture
// lines and the right-kind line (verified prompts, >= 80%) stay absolute; every other line is compared with the baseline's value on the SAME prompts (the mean of its runs) and fails only when it is worse by more than the tolerance.
// Prompts the baseline does not cover are left out of those lines ("no baseline"). The tolerance values live here and nowhere else.
// Calibrated 2026-11-10 on the judged 118 run's own smoke subset (40 prompts, 3 passes), each pass against the mean of the 3: worst move in the bad direction p90 +1100 ms, factual +5.2 pp,
// noun-box +3.3 pp, claims beyond the prose +1.2 pp, faithfulness not +2.2 pp / fully -6.7 pp, repairs 0.0 pp; against the 117 rerun on the same prompts the same passes moved p90 +1631 ms and factual +7.8 pp
// (118 passes the full gate 13/13). Only p90 and factual needed widening; the other lines' spread is inside +3 items / 5 pp (7.5 pp at n = 40).
export const SMOKE_TOLERANCE = {
  items: 3,         // a rate may be worse than the baseline mean by this many items of the smoke run's denominator ...
  points: 5,        // ... or by this many percentage points, whichever is larger
  factualItems: 4,  // factual error is the noisiest rate line: 4 items instead of 3
  p90Ms: 2000,      // whole-card p90 may be slower than the baseline mean by this much
};
const norm = t => String(t).toLowerCase().trim(), mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
// The baseline's cards for the smoke prompts, one array per run: matched by prompt text, depth none or standard, the smoke entry's source set preferred.
export function baselineRuns(baseCards, smokePrompts) {
  const byText = new Map(smokePrompts.map(p => [norm(p.prompt), p])), best = new Map(), runs = new Map();
  for (const c of baseCards) {
    const p = byText.get(norm(c.prompt)); if (!p || (c.depth && c.depth !== 'standard')) continue;
    const k = `${c.run}|${p.id}`, pref = p.smoke.source.set === c.set;
    if (!best.has(k) || (pref && !best.get(k).pref)) best.set(k, { c, p, pref });
  }
  for (const { c, p } of best.values()) (runs.get(c.run) || runs.set(c.run, []).get(c.run)).push({ ...c, id: p.id });
  return [...runs.values()];
}
const relMetrics = cards => { const S = summarize(cards), f = S.factual, fa = S.content.faithful, b = S.content.beyond;
  return { factual: [f?.withErrors ?? 0, f?.judged ?? 0], repairs: [S.repairs.repaired, S.repairs.of], noun: [S.content.flagged ?? 0, S.content.diagrams], not: [fa?.not ?? 0, fa?.judged ?? 0], fully: [fa?.fully ?? 0, fa?.judged ?? 0], beyond: [b?.yes ?? 0, b?.judged ?? 0], p90: quantile(cards.map(c => c.totalMs), 0.9) }; };
const REL = [['factual error rate', 'factual', 'down'], ['repairs', 'repairs', 'down'], ['noun-box or placeholder labels', 'noun', 'down'], ['faithfulness: "not"', 'not', 'down'], ['faithfulness: "fully"', 'fully', 'up'], ['claims beyond the prose', 'beyond', 'down']];
// One smoke pass against the baseline runs -> rows { name, ok, detail, noBaseline }. Both sides are restricted to the prompts the baseline covers.
export function relativeRows(smokeCards, baseRuns, tol = SMOKE_TOLERANCE) {
  const have = new Set(baseRuns.flat().map(c => norm(c.prompt))), mine = smokeCards.filter(c => have.has(norm(c.prompt))), m = relMetrics(mine), bm = baseRuns.map(relMetrics), sp = (x, d = 1) => { const v = Math.abs(x).toFixed(d); return `${x < 0 && Number(v) !== 0 ? '-' : '+'}${v}`; };
  const rows = REL.map(([name, key, dir]) => {
    if (!mine.length) return { name, ok: true, noBaseline: true, detail: 'no baseline (none of the smoke prompts is in the baseline run); not failed' };
    const rates = bm.filter(b => b[key][1]).map(b => b[key][0] / b[key][1]), [x, n] = m[key];
    if (!rates.length) return { name, ok: true, noBaseline: true, detail: 'no baseline (the baseline has no judged items on these prompts); not failed' };
    if (!n) return { name, ok: false, detail: 'not judged in the smoke run' };
    const base = mean(rates), rate = x / n, items = key === 'factual' ? tol.factualItems : tol.items, t = Math.max(tol.points / 100, items / n), d = rate - base, ok = (dir === 'down' ? d : -d) <= t + 1e-9;
    return { name: `${name} vs baseline`, ok, detail: `smoke ${x}/${n} = ${fmt(100 * rate)} | baseline mean ${fmt(100 * base)} | delta ${sp(100 * d)} pp | tolerance ${dir === 'down' ? '+' : '-'}${(100 * t).toFixed(1)} pp (${items} items or ${tol.points} pp, larger)` };
  });
  const bp = bm.map(b => b.p90).filter(Number.isFinite);
  rows.push(!bp.length || !mine.length ? { name: 'whole-card p90', ok: true, noBaseline: true, detail: 'no baseline; not failed' } : { name: 'whole-card p90 vs baseline', ok: m.p90 !== null && m.p90 - mean(bp) <= tol.p90Ms,
    detail: `smoke ${m.p90} ms | baseline mean ${Math.round(mean(bp))} ms | delta ${sp(m.p90 - mean(bp), 0)} ms | tolerance +${tol.p90Ms} ms` });
  return { rows, compared: new Set(mine.map(c => norm(c.prompt))).size };
}

export function gateCheck(dir, sha = '<SHA>', tier = null, baselineDir = null) {
  const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')), sets = Object.keys(results.summary.sets);
  tier ||= sets.length === 1 && sets[0] === 'smoke' ? 'smoke' : 'full';
  const cards = results.cards.filter(c => (tier === 'smoke' ? c.set === 'smoke' : CORE.includes(c.set))), runs = [...new Set(cards.map(c => c.run))].sort((a, b) => a - b);
  if (tier === 'smoke' && baselineDir) return smokeAgainstBaseline(dir, sha, cards, runs, baselineDir);
  const rows = lines(tier).map(([name, hard, f]) => {
    const all = f(summarize(cards), cards), per = tier === 'full' && runs.length > 1 ? runs.map(r => { const sub = cards.filter(c => c.run === r); return `r${r} ${f(summarize(sub), sub).value}`; }) : [];
    return { name, hard, ok: all.ok, detail: `${all.detail}${per.length ? ` | spread: ${per.join(', ')}` : ''}${tier === 'smoke' && !hard ? ' (reported)' : ''}` };
  });
  // A provider outage makes the run INVALID, not FAILED (owner 2026-11-09): pictures the provider refused (picturesDropped) are not code or prompt.
  const dropped = cards.filter(c => Array.isArray(c.picturesDropped) && c.picturesDropped.length).length, invalid = dropped >= 5 ? `${dropped} cards lost their picture to the image provider` : '';
  const failed = rows.filter(g => !g.ok), first = invalid ? `GATE: INVALID ${sha} tier=${tier} provider outage: ${invalid}; the gate table below is not a verdict` : failed.length ? `GATE: FAIL ${sha} tier=${tier} ${failed.map(g => g.name).join('; ')}` : `GATE: PASS ${sha} tier=${tier}`;
  const carried = results.carry?.rubrics ? `judged ${Object.entries(results.carry.rubrics).map(([k, v]) => `${k} ${v.judged}`).join(', ')}; carried ${Object.entries(results.carry.rubrics).map(([k, v]) => `${k} ${v.carried}`).join(', ')}` : null;
  const body = [first, `report: ${dir}`, `cards: ${cards.length} (${tier === 'smoke' ? `smoke set, ${runs.length} run${runs.length > 1 ? 's' : ''}` : `${CORE.filter(s => sets.includes(s)).join(', ')}; ${runs.length} run${runs.length > 1 ? 's' : ''}`})`, ...(carried ? [carried] : []),
    ...rows.map(g => `${g.ok ? 'PASS' : 'FAIL'}  ${g.name}${g.hard && tier === 'smoke' ? ' [hard]' : ''}: ${g.detail}`), ...(tier === 'smoke' ? smokeReports(cards) : []), ''].join('\n');
  return { tier, first, body, rows, code: invalid ? 3 : failed.length ? 1 : 0 };
}

// Smoke against a baseline: each pass of the smoke set in results.json (normally one) is judged on its own; the verdict fails if any pass fails.
function smokeAgainstBaseline(dir, sha, cards, runs, baselineDir) {
  const prompts = loadSet('smoke').prompts, base = JSON.parse(readFileSync(join(resolve(baselineDir), 'results.json'), 'utf8')), baseRuns = baselineRuns(base.cards, prompts);
  const covered = new Set(baseRuns.flat().map(c => norm(c.prompt))), hard = lines('smoke').filter(([name, h]) => h || name.startsWith('right kind')), out = [];
  for (const r of runs) {
    const sub = cards.filter(c => c.run === r), tag = runs.length > 1 ? `r${r} ` : '', S = summarize(sub);
    for (const [name, , f] of hard) { const x = f(S, sub); out.push({ name: `${tag}${name}`, ok: x.ok, hard: true, detail: x.detail }); }
    const { rows, compared } = relativeRows(sub, baseRuns);
    out.push(...rows.map(x => ({ ...x, name: `${tag}${x.name}`, detail: `${x.detail}${x.noBaseline ? '' : ` [${compared} prompts]`}` })));
  }
  const dropped = cards.filter(c => Array.isArray(c.picturesDropped) && c.picturesDropped.length).length, invalid = dropped >= 5 ? `${dropped} cards lost their picture to the image provider` : '';
  const failed = out.filter(g => !g.ok), first = invalid ? `GATE: INVALID ${sha} tier=smoke provider outage: ${invalid}; the gate table below is not a verdict` : failed.length ? `GATE: FAIL ${sha} tier=smoke vs baseline ${failed.map(g => g.name).join('; ')}` : `GATE: PASS ${sha} tier=smoke vs baseline`;
  const mine = new Set(cards.map(c => norm(c.prompt))), n = [...mine].filter(p => covered.has(p)).length;
  const body = [first, `report: ${dir}`, `baseline: ${resolve(baselineDir)} (${baseRuns.length} runs, mean of its runs on the same prompts)`, `cards: ${cards.length} (smoke set, ${runs.length} pass${runs.length > 1 ? 'es' : ''}); the baseline covers ${n} of ${mine.size} smoke prompts, the other ${mine.size - n} have no baseline and are left out of the relative lines`,
    ...out.map(g => `${g.noBaseline ? 'NO BASELINE' : g.ok ? 'PASS' : 'FAIL'}  ${g.name}${g.hard ? ' [hard]' : ''}: ${g.detail}`), ...smokeReports(cards), ''].join('\n');
  return { tier: 'smoke', first, body, rows: out, code: invalid ? 3 : failed.length ? 1 : 0 };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const { values: a, positionals: [dir, sha] } = parseArgs({ options: { tier: { type: 'string' }, out: { type: 'string' }, baseline: { type: 'string' } }, allowPositionals: true });
  if (!dir || (a.tier && !['smoke', 'full'].includes(a.tier)) || (a.baseline && a.tier !== 'smoke')) { console.error('usage: gate-check.mjs <report dir> <SHA> [--tier smoke|full] [--baseline <judged run dir> (smoke only)] [--out <file>]'); process.exit(2); }
  const g = gateCheck(resolve(dir), sha, a.tier, a.baseline);
  writeFileSync(a.out || join(resolve(dir), 'gate-result.txt'), g.body);
  console.log(g.body);
  process.exit(g.code);
}
