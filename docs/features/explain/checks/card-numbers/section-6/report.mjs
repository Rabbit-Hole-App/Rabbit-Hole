// Builds results.json (per run, no keys) and REPORT.md tables from results.jsonl. node report.mjs
import fs from 'node:fs';
const D = 'C:/s/sprint2-evidence/card-numbers/section-6/';
const runs = fs.readFileSync(D + 'results.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const plan = JSON.parse(fs.readFileSync(D + 'plan.json', 'utf8')), flaggedPairs = JSON.parse(fs.readFileSync(D + 'plan-parts.json', 'utf8')).flaggedPairs;
fs.writeFileSync(D + 'results.json', JSON.stringify({ arms: { before: 'main d3857f7834f80e8ebe7e188a3555460ad1aff602', after: 'feat/card-numbers 5c9da762031ade75e462fea01d9184c59ca1bc44' }, profile: 'google-low', planner: 'jev', runs }, null, 1));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-'), med = xs => { if (!xs.length) return '-'; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };
const sum = xs => xs.reduce((s, x) => s + x, 0);
const arm = (rs, a) => rs.filter(r => r.arm === a);
const provOf = r => (r.authoredBy ? r.authoredBy.provider === 'google' ? 'gemini-flash-lite' : 'gpt-oss-120b' : 'none (failed)');
// a run's "error" = a delivered card with at least one flag from the card-errors checks
const errs = r => (r.delivered ? r.flags.length : 0), hasErr = r => r.delivered && r.flags.length > 0;
const out = [];
const T = (head, rows) => { out.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.join(' | ')} |`), ''); };

function summary(rs, label) {
  const B = arm(rs, 'before'), A = arm(rs, 'after'), row = (x, name) => {
    const del = x.filter(r => r.delivered), bad = x.filter(r => r.numbersFailure);
    return [name, x.length, del.length, x.length - del.length, bad.length, del.filter(hasErr).length, pct(del.filter(hasErr).length, del.length), pct(sum(del.map(errs)), del.length), (sum(x.map(r => r.costMicros)) / 1e6).toFixed(4), med(x.map(r => r.ms))];
  };
  out.push(`### ${label}`, '');
  T(['arm', 'runs', 'delivered', 'failed', 'failed on bad numbers', 'delivered with an error', 'cards with error per 100 delivered', 'flags per 100 delivered', 'cost US$ (settled)', 'median ms/run'], [row(B, 'BEFORE main'), row(A, 'AFTER card-numbers')]);
}
const audit = runs.filter(r => r.set === 'audit'), box = runs.filter(r => r.set === 'box'), rep = runs.filter(r => r.set === 'flag-repeat'), arep = runs.filter(r => r.set === 'audit-repeat'), nonbox = runs.filter(r => r.set !== 'box');
out.push('# Section 6: effect of feat/card-numbers on numeric errors', '', `BEFORE = main d3857f783, AFTER = feat/card-numbers 5c9da7620; profile google-low (Gemini 3.5 flash-lite, then Fireworks gpt-oss-120b), EXPLANATION_PLANNER=jev, formula sampler off, no pictures; same prompt and depth, run in pairs (order alternated), in process through generateArtifact. ${runs.length} runs (${arm(runs, 'before').length} before, ${arm(runs, 'after').length} after).`, '');
out.push('## 1. Headline', '');
summary(runs, 'All runs');
summary(audit, 'Audit cells (distinct prompt x depth pairs of the card-errors numeric cells, 1 run per arm)');
summary(box, 'Box-plot prompts (6 new prompts x 3 depths x 3 repeats)');
summary(arep, 'Audit-cell repeats (runs 2 and 3 of every other audit pair, added after the cap was raised)');
summary(nonbox, 'Every non-box-plot run (audit + all repeats)');
summary(rep, 'Flagged-pair repeats (the 8 prompt x depth pairs that held the 15 flagged cards, runs 2 and 3)');

out.push('## 2. Per authoring model (the model that wrote the delivered card; a failed run has none)', '');
{
  const rows = [];
  for (const m of ['gemini-flash-lite', 'gpt-oss-120b']) for (const a of ['before', 'after']) { const x = arm(runs, a).filter(r => r.delivered && provOf(r) === m); rows.push([m, a, x.length, x.filter(hasErr).length, pct(x.filter(hasErr).length, x.length), pct(sum(x.map(errs)), x.length), med(x.map(r => r.ms))]); }
  for (const a of ['before', 'after']) { const x = arm(runs, a).filter(r => !r.delivered); rows.push(['failed runs', a, x.length, '-', '-', '-', med(x.map(r => r.ms))]); }
  T(['model', 'arm', 'delivered', 'with an error', 'errors per 100 delivered', 'flags per 100 delivered', 'median ms'], rows);
}

out.push('## 3. Per diagram kind (delivered cards holding a numeric diagram of that kind; a card counts once per kind)', '');
{
  const kinds = [...new Set(runs.flatMap(r => r.numericKinds ?? []))].sort(), rows = [];
  for (const k of kinds) { const c = a => arm(runs, a).filter(r => r.delivered && r.numericKinds.includes(k)); const f = a => c(a).filter(r => r.flags.some(x => x.kind === k)).length; rows.push([k, c('before').length, f('before'), pct(f('before'), c('before').length), c('after').length, f('after'), pct(f('after'), c('after').length)]); }
  T(['kind', 'BEFORE cards', 'BEFORE flagged on this kind', 'BEFORE per 100', 'AFTER cards', 'AFTER flagged on this kind', 'AFTER per 100'], rows);
  out.push('Runs whose planner chose a box-plot are counted below under box plots.', '');
}

out.push('## 4. Repairs, fallbacks, honest failures', '');
{
  const stepsOf = r => r.attempts ?? [];
  const row = a => {
    const x = arm(runs, a), st = x.flatMap(r => stepsOf(r).map(s => ({ ...s, run: r })));
    const delivered = st.filter(s => s.outcome === 'artifact');
    const fb = x.filter(r => stepsOf(r).filter(s => s.outcome !== 'skipped').length > 1);
    const fbDelivered = fb.filter(r => r.delivered);
    const arith = st.filter(s => s.outcome === 'arithmetic');
    return [a, x.length, delivered.filter(s => s.repairedAt === 1).length, delivered.filter(s => s.repairedAt === 2).length, arith.length, arith.filter(s => s.repairs >= 2).length, fb.length, fbDelivered.length, x.filter(r => r.numbersFailure).length, x.filter(r => !r.delivered && !r.numbersFailure).length];
  };
  T(['arm', 'runs', 'delivered after 1 repair (repairedAt 1)', 'delivered after 2nd same-model repair (repairedAt 2)', 'steps ending in arithmetic (bad numbers)', 'of those, after 2 repairs', 'runs that moved to a next provider', 'of those, delivered', 'runs ending in explanation_bad_numbers', 'other failures'], [row('before'), row('after')]);
  out.push('BEFORE records no `repairs`/`repairedAt` on a step (the field exists only in AFTER), so BEFORE\'s single-repair deliveries are counted from the top-level `repaired` flag below. BEFORE has no `arithmetic` outcome: its bad-number steps are plain `validation_error`.', '');
  const rr = a => { const x = arm(runs, a).filter(r => r.delivered); return [a, x.length, x.filter(r => r.repairedTop).length]; };
  T(['arm', 'delivered', 'delivered after a repair (top-level repaired flag, both arms)'], [rr('before'), rr('after')]);
  // Second-repair success rate: a step that needed a second repair = steps with repairs 2 (success repairedAt 2, or arithmetic with repairs 2)
  const a2 = arm(runs, 'after').flatMap(r => stepsOf(r)), got = a2.filter(s => s.repairedAt === 2).length, lost = a2.filter(s => s.outcome === 'arithmetic' && s.repairs >= 2).length;
  out.push(`Second same-model repair (AFTER only): ${got + lost} steps reached it, ${got} delivered a card, ${lost} still failed on numbers; success rate ${pct(got, got + lost)}%.`, '');
  const fl = arm(runs, 'after').flatMap(r => stepsOf(r).filter(s => s.outcome === 'arithmetic' || s.outcome === 'validation_error' || (s.outcome === 'artifact' && s.repairedAt)).map(s => ({ s, r })));
  const first = a => arm(runs, a).flatMap(r => stepsOf(r)).filter(s => s.outcome === 'arithmetic' || (a === 'before' && s.outcome === 'validation_error')).length;
  out.push(`Steps that ended in a numbers/validation failure: BEFORE ${first('before')} (validation_error, any cause), AFTER ${first('after')} (arithmetic).`, '');
  void fl;
}

{
  const row = a => { const x = arm(runs, a).filter(r => r.delivered); return [a, x.length, x.filter(r => r.diagramsDropped).length, x.filter(r => r.diagramsSimplified || r.visualFallback).length]; };
  out.push('Cards delivered with a diagram dropped or replaced by a simplified one (the old way out of a bad number; AFTER never drops an arithmetic-tagged diagram):', '');
  T(['arm', 'delivered', 'with diagramsDropped', 'with diagramsSimplified / visualFallback'], [row('before'), row('after')]);
}
{
  // Repairs triggered by wrong numbers (explanation_bad_numbers in the validator's own log line learn_artifact_invalid, attempt 0 = the first answer, attempt 1 = the first repair's answer, attempt 2 = the second repair's).
  const isNum = e => /explanation_bad_numbers/.test(String(e.error)), row = a => {
    const x = arm(runs, a), trig = x.filter(r => r.events.some(e => e.event === 'learn_artifact_invalid' && e.attempt === 0 && isNum(e)));
    const again = trig.filter(r => r.events.some(e => e.attempt === 1 && isNum(e)));
    const second = trig.filter(r => r.events.some(e => e.attempt === 2 || (e.attempt === 1 && isNum(e)))); // reached a second repair or beyond
    const okFirst = trig.filter(r => !again.includes(r) && r.delivered && r.attempts.some(s => s.outcome === 'artifact' && s.repairedAt === 1 && s.provider === 'google') );
    return [a, trig.length, trig.filter(r => r.set === 'box').length, trig.length - again.length, trig.filter(r => !again.includes(r) && r.delivered).length, again.length, again.filter(r => r.attempts.some(s => s.repairedAt === 2)).length, again.filter(r => r.numbersFailure).length, trig.filter(r => r.attempts.filter(s => s.outcome !== 'skipped').length > 1).length, okFirst.length, second.length];
  };
  out.push('Runs whose first author answer carried wrong numbers (explanation_bad_numbers at attempt 0). Counted from the validator log line, so it works for both arms:', '');
  T(['arm', 'runs with a bad-numbers first answer', 'of those, box-plot prompts', 'first answer fixed by the first repair (no second bad answer)', 'of those delivered', 'still wrong after the first repair (second repair asked, AFTER only)', 'second repair delivered (repairedAt 2)', 'those ending in explanation_bad_numbers', 'runs that touched the next provider', 'delivered by the first Gemini repair', 'reached a second repair or beyond'], [row('before'), row('after')]);
  const checksBy = a => { const m = {}; for (const r of arm(runs, a).filter(r => r.delivered)) for (const f of r.flags) m[f.check] = (m[f.check] || 0) + 1; return m; };
  const cb = checksBy('before'), ca = checksBy('after');
  out.push('Flags in delivered cards by check (a card can carry several; counts are flags, not cards):', '');
  T(['check', 'BEFORE flags', 'AFTER flags'], [...new Set([...Object.keys(cb), ...Object.keys(ca)])].sort().map(k => [k, cb[k] || 0, ca[k] || 0]));
}
out.push('## 5. Box plots (separately)', '');
{
  const wr = a => arm(runs, a).filter(r => r.set === 'box'), rows = [];
  for (const a of ['before', 'after']) { const x = wr(a), del = x.filter(r => r.delivered), boxes = del.filter(r => r.kinds.includes('box-plot')); rows.push([a, x.length, del.length, x.length - del.length, x.filter(r => r.numbersFailure).length, boxes.length, boxes.filter(hasErr).length, pct(boxes.filter(hasErr).length, boxes.length), del.filter(r => provOf(r) === 'gpt-oss-120b').length, del.filter(r => r.attempts.some(s => s.repairedAt === 2)).length]); }
  T(['arm', 'runs', 'delivered', 'failed', 'failed on bad numbers', 'delivered cards holding a box-plot', 'of those with an error', 'per 100', 'delivered by gpt-oss', 'delivered after 2nd repair'], rows);
  const byP = [];
  for (let i = 1; i <= 6; i++) for (const a of ['before', 'after']) { const x = box.filter(r => r.boxId === i && r.arm === a); byP.push([i, a, x.length, x.filter(r => r.delivered).length, x.filter(r => r.delivered && r.kinds.includes('box-plot')).length, x.filter(hasErr).length, x.filter(r => r.numbersFailure).length]); }
  T(['box prompt', 'arm', 'runs', 'delivered', 'delivered with a box-plot', 'with error', 'failed on numbers'], byP);
}

out.push('## 6. The 15 flagged cards today vs AFTER', '');
{
  const rows = [];
  for (const fp of flaggedPairs) {
    const cell = a => runs.filter(r => r.arm === a && r.prompt === fp.prompt && r.depth === fp.depth);
    const f = a => { const c = cell(a); return `${c.filter(hasErr).length}/${c.filter(r => r.delivered).length} delivered with an error, ${c.filter(r => !r.delivered).length} failed`; };
    rows.push([JSON.stringify(fp.prompt).slice(0, 70), fp.depth, fp.flaggedCards, f('before'), f('after')]);
  }
  T(['prompt', 'depth', 'flagged cards in the audit', 'BEFORE today (same code as audit era, re-run)', 'AFTER'], rows);
  const bAny = flaggedPairs.filter(fp => runs.some(r => r.arm === 'before' && r.prompt === fp.prompt && r.depth === fp.depth && hasErr(r))).length, aAny = flaggedPairs.filter(fp => runs.some(r => r.arm === 'after' && r.prompt === fp.prompt && r.depth === fp.depth && hasErr(r))).length;
  out.push(`Of the ${flaggedPairs.length} prompt x depth pairs that held the 15 flagged cards: ${bAny} produced at least one error again in BEFORE (n up to 3 runs each), ${aAny} in AFTER.`, '');
}

out.push('## 7. Cost and latency', '');
{
  const rows = ['before', 'after'].map(a => { const x = arm(runs, a); return [a, x.length, (sum(x.map(r => r.costMicros)) / 1e6).toFixed(4), (sum(x.map(r => r.costMicrosUpper)) / 1e6).toFixed(4), med(x.map(r => r.ms)), med(x.filter(r => r.delivered).map(r => r.ms)), Math.round(sum(x.map(r => r.ms)) / x.length)]; });
  T(['arm', 'runs', 'settled cost US$', 'upper bound US$ (incl. planner estimate)', 'median ms (all runs)', 'median ms (delivered)', 'mean ms'], rows);
  const tot = sum(runs.map(r => r.costMicrosUpper)) / 1e6;
  out.push(`Total, both arms, upper bound: US$${tot.toFixed(4)} (plus US$0.0572 for the 18 discarded v0 runs, see cost.txt).`, '');
}
// paired latency delta: per item, after - before
{
  const by = new Map();
  for (const r of runs) { const k = r.idx; by.set(k, { ...(by.get(k) || {}), [r.arm]: r }); }
  const d = [...by.values()].filter(p => p.before && p.after).map(p => p.after.ms - p.before.ms);
  out.push(`Paired latency (AFTER minus BEFORE, per prompt x depth item, n=${d.length}): median ${med(d)} ms, mean ${Math.round(sum(d) / d.length)} ms.`, '');
  const pairs = [...by.values()].filter(p => p.before && p.after);
  const both = pairs.filter(p => p.before.delivered && p.after.delivered);
  out.push(`Paired items: both delivered ${both.length}; BEFORE delivered, AFTER failed ${pairs.filter(p => p.before.delivered && !p.after.delivered).length}; AFTER delivered, BEFORE failed ${pairs.filter(p => !p.before.delivered && p.after.delivered).length}; both failed ${pairs.filter(p => !p.before.delivered && !p.after.delivered).length}.`, '');
  const eb = pairs.filter(p => hasErr(p.before)).length, ea = pairs.filter(p => hasErr(p.after)).length, bothE = pairs.filter(p => hasErr(p.before) && hasErr(p.after)).length;
  out.push(`Paired items with an error in the delivered card: BEFORE ${eb}, AFTER ${ea}, both ${bothE}.`, '');
}

out.push('## 8. Every flagged delivered card, both arms', '');
{
  const rows = runs.filter(hasErr).map(r => [r.idx, r.arm, r.set, r.depth, JSON.stringify(r.prompt).slice(0, 50), provOf(r), r.flags.map(f => `${f.check}[${f.kind}]`).join('; ').slice(0, 120), r.flags[0]?.detail.replace(/\|/g, '/').slice(0, 110)]);
  T(['item', 'arm', 'set', 'depth', 'prompt', 'author', 'checks', 'first detail'], rows);
}
fs.writeFileSync(D + 'REPORT-tables.md', out.join('\n'));
const total = sum(runs.map(r => r.costMicrosUpper)) / 1e6;
fs.writeFileSync(D + 'cost.txt', `Section 6 total spend, upper bound: US$${(total + 0.0572).toFixed(4)} = US$${total.toFixed(4)} over ${runs.length} runs + US$0.0572 for 18 discarded v0 runs (results-aborted-v0.jsonl; stopped to add dropped-diagram fields) (settled ledger cost US$${(sum(runs.map(r => r.costMicros)) / 1e6).toFixed(4)} + reservations of calls with no settled cost + US$0.0002 per run for the TypeSafe planner, an estimate). Stop line US$3.60; hard cap US$4.00.\n`);
console.log(out.join('\n'));
