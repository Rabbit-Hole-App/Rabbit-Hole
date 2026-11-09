// Arm D report (owner 2026-11-09): the same prompts at Detailed on two models, side by side, and the decision rule as code.
// usage: node scripts/explain-bench/arm-report.mjs <arm C judged run dir> <arm D judged run dir> [out.md]
//   a run dir holds results.json (report.mjs --judge output) and raw/<set>-r<N>-<depth>/results.jsonl (the bench's own records: per-card model-call durations).
// Rule: D >= 10 points better than C on fully-matches-sketch OR on claims beyond the prose, AND D's whole-card p90 <= 7000 ms
//   => PROPOSE routing Detailed and the new kinds to D (one condition in chainSteps); otherwise C stays for everything. It proposes; it never switches.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const P90_LIMIT_MS = 7000, POINTS = 10;
const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const pct = (a, b) => (b ? +(100 * a / b).toFixed(1) : null), sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
const key = c => `${c.set}|${c.id}|${c.run}|${c.depth || ''}`;

// Per-card author model time: the sum of the learn_model calls (the bench's raw records), keyed like the scored cards.
function modelMsByCard(dir) {
  const out = new Map(), raw = join(dir, 'raw');
  if (!existsSync(raw)) return out;
  for (const d of readdirSync(raw)) {
    const f = join(raw, d, 'results.jsonl');
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(line); out.set(`${r.set}|${r.id}|${r.run}|${r.depth || ''}`, sum(r.modelCalls || [], m => m.ms)); }
  }
  return out;
}

export function armStats(dir) {
  const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')), cards = results.cards || results.results, ms = modelMsByCard(dir);
  const D = cards.filter(c => c.delivered), dg = D.flatMap(c => c.diagrams || []);
  const faith = dg.filter(d => d.faithful), beyond = dg.filter(d => d.beyond), fact = D.filter(c => c.judge?.factual), plan = D.filter(c => c.planCheck);
  const labelled = sum(dg, d => d.labelledEdges), edges = sum(dg, d => d.edges), numeric = sum(dg, d => d.numericLabels), labels = sum(dg, d => d.labels);
  const optional = {}; dg.forEach(d => (d.optional || []).forEach(k => (optional[k] = (optional[k] || 0) + 1)));
  const modelMs = D.map(c => ms.get(key(c))).filter(Number.isFinite), totalMs = D.map(c => c.totalMs);
  return {
    sent: cards.length, delivered: D.length,
    rightKind: D.filter(c => c.score === 'right').length, rightOrAcceptable: D.filter(c => c.score === 'right' || c.score === 'acceptable').length,
    faithJudged: faith.length, fully: faith.filter(d => d.faithful.verdict === 'fully').length, partly: faith.filter(d => d.faithful.verdict === 'partly').length, notFaith: faith.filter(d => d.faithful.verdict === 'not').length,
    beyondJudged: beyond.length, beyondYes: beyond.filter(d => d.beyond.verdict === 'yes').length,
    factJudged: fact.length, factErrors: fact.filter(c => (c.judge.factual.errors || []).length > 0).length,
    repaired: D.filter(c => c.repaired).length,
    planChecked: plan.length, planFollowed: plan.filter(c => c.planCheck.agree).length,
    labelledEdges: labelled, edges, numericLabels: numeric, labels, optional, diagrams: dg.length,
    modelP50: q(modelMs, 0.5), modelP90: q(modelMs, 0.9), cardP50: q(totalMs, 0.5), cardP90: q(totalMs, 0.9),
    costPerCard: D.length ? +(sum(D, c => c.costUsd) / D.length).toFixed(5) : null,
  };
}

// The decision rule: points are percentage points on the judged diagrams (fully-matches-sketch higher is better; claims beyond the prose lower is better).
export function decide(c, d) {
  const fullyC = pct(c.fully, c.faithJudged), fullyD = pct(d.fully, d.faithJudged), claimsC = pct(c.beyondYes, c.beyondJudged), claimsD = pct(d.beyondYes, d.beyondJudged);
  const fullyGain = fullyC != null && fullyD != null ? +(fullyD - fullyC).toFixed(1) : null, claimsGain = claimsC != null && claimsD != null ? +(claimsC - claimsD).toFixed(1) : null;
  const better = (fullyGain != null && fullyGain >= POINTS) || (claimsGain != null && claimsGain >= POINTS), fast = d.cardP90 != null && d.cardP90 <= P90_LIMIT_MS;
  return { fullyC, fullyD, fullyGain, claimsC, claimsD, claimsGain, better, fast, propose: better && fast,
    text: better && fast ? 'PROPOSE: route Detailed + the new kinds to arm D (Gemini 3.5 Flash): one condition in chainSteps. Not switched.' : 'C stays for everything (Gemini 3.5 Flash Lite): arm D does not meet the rule.' };
}

export function render(c, d, labels = ['C: Gemini 3.5 Flash Lite (production)', 'D: Gemini 3.5 Flash']) {
  const r = decide(c, d), n = x => (x == null ? '-' : x), p = (a, b) => `${a}/${b} = ${n(pct(a, b))}%`;
  const rows = [
    ['cards delivered / sent', `${c.delivered}/${c.sent}`, `${d.delivered}/${d.sent}`],
    ['right kind', p(c.rightKind, c.delivered), p(d.rightKind, d.delivered)],
    ['right or acceptable', p(c.rightOrAcceptable, c.delivered), p(d.rightOrAcceptable, d.delivered)],
    ['fully matches the sketch (diagrams)', p(c.fully, c.faithJudged), p(d.fully, d.faithJudged)],
    ['partly / not', `${c.partly} / ${c.notFaith}`, `${d.partly} / ${d.notFaith}`],
    ['claims beyond the prose (diagrams)', p(c.beyondYes, c.beyondJudged), p(d.beyondYes, d.beyondJudged)],
    ['factual error (cards)', p(c.factErrors, c.factJudged), p(d.factErrors, d.factJudged)],
    ['repairs', p(c.repaired, c.delivered), p(d.repaired, d.delivered)],
    ['planner kind followed by the author', p(c.planFollowed, c.planChecked), p(d.planFollowed, d.planChecked)],
    ['edges labelled', p(c.labelledEdges, c.edges), p(d.labelledEdges, d.edges)],
    ['numbers in labels', p(c.numericLabels, c.labels), p(d.numericLabels, d.labels)],
    ['optional fields used (count by field)', JSON.stringify(c.optional), JSON.stringify(d.optional)],
    ['model call p50 / p90 ms', `${n(c.modelP50)} / ${n(c.modelP90)}`, `${n(d.modelP50)} / ${n(d.modelP90)}`],
    ['whole card p50 / p90 ms', `${n(c.cardP50)} / ${n(c.cardP90)}`, `${n(d.cardP50)} / ${n(d.cardP90)}`],
    ['cost per card US$', n(c.costPerCard), n(d.costPerCard)],
  ];
  return ['# Arm D at Detailed', '', '| metric | ' + labels.join(' | ') + ' |', '|---|---|---|', ...rows.map(x => `| ${x.join(' | ')} |`), '',
    `Rule: D at least ${POINTS} points better on fully-matches-sketch or claims, and whole-card p90 <= ${P90_LIMIT_MS} ms.`,
    `Fully matches the sketch: C ${n(r.fullyC)}%, D ${n(r.fullyD)}% (gain ${n(r.fullyGain)} points). Claims beyond the prose: C ${n(r.claimsC)}%, D ${n(r.claimsD)}% (gain ${n(r.claimsGain)} points). D whole-card p90 ${n(d.cardP90)} ms (${r.fast ? 'within' : 'over'} ${P90_LIMIT_MS}).`,
    '', `**${r.text}**`, ''].join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const [cDir, dDir, out = 'C:/s/spec/resume/arm-d-result.md'] = process.argv.slice(2);
  if (!cDir || !dDir) { console.error('usage: arm-report.mjs <arm C run dir> <arm D run dir> [out.md]'); process.exit(2); }
  const md = render(armStats(cDir), armStats(dDir));
  writeFileSync(out, md); console.log(md);
}
