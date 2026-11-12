// The release gate, two tiers (owner 2026-11-09; rule in docs/features/explain/benchmarks/test-ledger.md).
//   node scripts/explain-bench/gate-check.mjs <report dir with results.json> <SHA> [--tier smoke|full] [--out <file>]
// Tier "full" (3x of today's six core sets): the thirteen lines of the 117/118 overnight gate, each with its per-run values (the spread column).
// Tier "smoke" (one run of the smoke set): the same limits; delivery and the two picture lines are full counts that fail hard, every other line is reported with its value and fails only when it is past its limit.
// The tier defaults to smoke when the run holds only the smoke set. Writes <dir>/gate-result.txt (or --out): first line `GATE: PASS|FAIL|INVALID <SHA> tier=<tier> ...`, then one line per gate.
// Exit 0 pass, 1 fail, 3 invalid (a provider outage: pictures the image provider refused), 2 bad arguments.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { KINDS } from './build-smoke-set.mjs';
import { quantile, summarize } from './score.mjs';

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

export function gateCheck(dir, sha = '<SHA>', tier = null) {
  const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')), sets = Object.keys(results.summary.sets);
  tier ||= sets.length === 1 && sets[0] === 'smoke' ? 'smoke' : 'full';
  const cards = results.cards.filter(c => (tier === 'smoke' ? c.set === 'smoke' : CORE.includes(c.set))), runs = [...new Set(cards.map(c => c.run))].sort((a, b) => a - b);
  const rows = lines(tier).map(([name, hard, f]) => {
    const all = f(summarize(cards), cards), per = tier === 'full' && runs.length > 1 ? runs.map(r => { const sub = cards.filter(c => c.run === r); return `r${r} ${f(summarize(sub), sub).value}`; }) : [];
    return { name, hard, ok: all.ok, detail: `${all.detail}${per.length ? ` | spread: ${per.join(', ')}` : ''}${tier === 'smoke' && !hard ? ' (reported)' : ''}` };
  });
  // A provider outage makes the run INVALID, not FAILED (owner 2026-11-09): pictures the provider refused (picturesDropped) are not code or prompt.
  const dropped = cards.filter(c => Array.isArray(c.picturesDropped) && c.picturesDropped.length).length, invalid = dropped >= 5 ? `${dropped} cards lost their picture to the image provider` : '';
  const failed = rows.filter(g => !g.ok), first = invalid ? `GATE: INVALID ${sha} tier=${tier} provider outage: ${invalid}; the gate table below is not a verdict` : failed.length ? `GATE: FAIL ${sha} tier=${tier} ${failed.map(g => g.name).join('; ')}` : `GATE: PASS ${sha} tier=${tier}`;
  const carried = results.carry?.rubrics ? `judged ${Object.entries(results.carry.rubrics).map(([k, v]) => `${k} ${v.judged}`).join(', ')}; carried ${Object.entries(results.carry.rubrics).map(([k, v]) => `${k} ${v.carried}`).join(', ')}` : null;
  const body = [first, `report: ${dir}`, `cards: ${cards.length} (${tier === 'smoke' ? 'smoke set, 1 run' : `${CORE.filter(s => sets.includes(s)).join(', ')}; ${runs.length} run${runs.length > 1 ? 's' : ''}`})`, ...(carried ? [carried] : []),
    ...rows.map(g => `${g.ok ? 'PASS' : 'FAIL'}  ${g.name}${g.hard && tier === 'smoke' ? ' [hard]' : ''}: ${g.detail}`), ...(tier === 'smoke' ? smokeReports(cards) : []), ''].join('\n');
  return { tier, first, body, rows, code: invalid ? 3 : failed.length ? 1 : 0 };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const { values: a, positionals: [dir, sha] } = parseArgs({ options: { tier: { type: 'string' }, out: { type: 'string' } }, allowPositionals: true });
  if (!dir || (a.tier && !['smoke', 'full'].includes(a.tier))) { console.error('usage: gate-check.mjs <report dir> <SHA> [--tier smoke|full] [--out <file>]'); process.exit(2); }
  const g = gateCheck(resolve(dir), sha, a.tier);
  writeFileSync(a.out || join(resolve(dir), 'gate-result.txt'), g.body);
  console.log(g.body);
  process.exit(g.code);
}
