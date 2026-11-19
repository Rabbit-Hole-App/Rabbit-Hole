// GEN-1 R1 bench report (offline). usage: node report.mjs [results.jsonl] > report.md
import fs from 'node:fs';
const f = process.argv[2] ?? 'results.jsonl';
const rows = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const out = []; const P = s => out.push(s);
const pct = (a, n) => (n ? `${a} (${Math.round((100 * a) / n)}%)` : `${a}`);
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const repairs = r => (r.attempts ?? []).reduce((s, x) => s + (x.repairs || 0), 0);
const planned = r => r.plannerKind ?? null;
const hit = r => r.delivered && planned(r) && (r.finalKinds ?? []).includes(planned(r));
const stat = R => {
  const del = R.filter(r => r.delivered), known = R.filter(r => r.firstAttemptValid !== null && r.firstAttemptValid !== undefined);
  return { runs: R.length, delivered: del.length, honestFail: R.length - del.length, firstValid: known.filter(r => r.firstAttemptValid).length, firstKnown: known.length, missing: del.filter(r => r.plannedKindMissing).length, withPlan: del.filter(r => planned(r)).length,
    repairs: R.reduce((s, r) => s + repairs(r), 0), moved: R.filter(r => r.movedToNextProvider).length, flagsOld: R.filter(r => r.flags?.length).length, flags154: R.filter(r => r.flags154?.length).length,
    cost: R.reduce((s, r) => s + (r.costMicros || 0), 0) / 1e6, p50: q(R.map(r => r.ms), 0.5), p90: q(R.map(r => r.ms), 0.9), calls: R.length ? (R.reduce((s, r) => s + (r.providerCalls || 0), 0) / R.length).toFixed(2) : '-' };
};
const arms = ['before', 'after'];
const by = (arm, pred) => rows.filter(r => r.arm === arm && pred(r));

P('# GEN-1 R1 (G5) bench report\n');
P(`Results: ${f}, ${rows.length} runs (before ${rows.filter(r => r.arm === 'before').length}, after ${rows.filter(r => r.arm === 'after').length}). BEFORE = main, AFTER = feat/gen-1-r1.\n`);

// 1. the question the Reviewer asked first
P('## First: prompts where BEFORE delivered another kind than planned: what AFTER delivered (set A, google-low, 3 repetitions)\n');
const A = rows.filter(r => r.setTag === 'A' || r.set === 'A');
const cells = new Map();
for (const r of A) { const k = `${r.prompt}|${r.depth}`; (cells.get(k) ?? cells.set(k, []).get(k)).push(r); }
P('| prompt (cut) | depth | planned kind | BEFORE planned delivered | BEFORE delivered kinds | AFTER planned delivered | AFTER delivered kinds | honest failures B/A | repairs B/A | moved B/A |');
P('|---|---|---|---|---|---|---|---|---|---|');
const kindsOf = R => { const c = {}; for (const r of R) for (const k of (r.delivered ? (r.finalKinds?.length ? [r.finalKinds.join('+')] : ['(none)']) : ['(failed)'])) c[k] = (c[k] || 0) + 1; return Object.entries(c).map(([k, n]) => `${k} x${n}`).join(', '); };
const tot = { b: { runs: 0, hit: 0 }, a: { runs: 0, hit: 0 } };
for (const [k, R] of cells) {
  const [prompt, depth] = k.split('|'), B = R.filter(r => r.arm === 'before'), Af = R.filter(r => r.arm === 'after');
  const pk = R.find(r => planned(r))?.plannerKind ?? '?';
  tot.b.runs += B.length; tot.b.hit += B.filter(hit).length; tot.a.runs += Af.length; tot.a.hit += Af.filter(hit).length;
  P(`| ${prompt.slice(0, 48).replace(/\|/g, '/')} | ${depth} | ${pk} | ${B.filter(hit).length}/${B.length} | ${kindsOf(B)} | ${Af.filter(hit).length}/${Af.length} | ${kindsOf(Af)} | ${B.filter(r => !r.delivered).length}/${Af.filter(r => !r.delivered).length} | ${B.reduce((s, r) => s + repairs(r), 0)}/${Af.reduce((s, r) => s + repairs(r), 0)} | ${B.filter(r => r.movedToNextProvider).length}/${Af.filter(r => r.movedToNextProvider).length} |`);
}
P(`\nSet A total: planned kind delivered BEFORE ${pct(tot.b.hit, tot.b.runs)} of ${tot.b.runs} runs, AFTER ${pct(tot.a.hit, tot.a.runs)} of ${tot.a.runs}.`);
const sa = arms.map(a => stat(by(a, r => (r.setTag ?? r.set) === 'A')));
P(`On exactly these cells: honest failures BEFORE ${sa[0].honestFail}, AFTER ${sa[1].honestFail}; repairs BEFORE ${sa[0].repairs}, AFTER ${sa[1].repairs}; moved to the next provider BEFORE ${sa[0].moved}, AFTER ${sa[1].moved}; first attempt valid BEFORE ${sa[0].firstValid}/${sa[0].firstKnown}, AFTER ${sa[1].firstValid}/${sa[1].firstKnown}.\n`);

// 2. per arm and per set
P('## Per arm and per set\n');
P('| set / profile | arm | runs | delivered | honest failures | first attempt valid | planned kind missing (of delivered with a plan) | repairs | moved to next provider | old-classifier flags | 154-rule flags | settled US$ | p50 ms | p90 ms | calls per run |');
P('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [tag, label] of [['A', 'A google-low'], ['B', 'B google-low'], ['D', 'D fireworks-low']]) for (const a of arms) {
  const s = stat(by(a, r => (r.setTag ?? r.set) === tag));
  P(`| ${label} | ${a} | ${s.runs} | ${s.delivered} | ${s.honestFail} | ${s.firstValid}/${s.firstKnown} | ${s.missing}/${s.withPlan} | ${s.repairs} | ${s.moved} | ${s.flagsOld} | ${s.flags154} | ${s.cost.toFixed(3)} | ${s.p50} | ${s.p90} | ${s.calls} |`);
}
for (const a of arms) { const s = stat(by(a, () => true)); P(`| all | ${a} | ${s.runs} | ${s.delivered} | ${s.honestFail} | ${s.firstValid}/${s.firstKnown} | ${s.missing}/${s.withPlan} | ${s.repairs} | ${s.moved} | ${s.flagsOld} | ${s.flags154} | ${s.cost.toFixed(3)} | ${s.p50} | ${s.p90} | ${s.calls} |`); }

// 3. the four Gemini-dropped kinds
P('\n## The four kinds Gemini did not get before (planned kind delivered)\n');
P('| planned kind | arm | runs planned | delivered | planned kind delivered | authored by Gemini |');
P('|---|---|---|---|---|---|');
for (const k of ['heatmap', 'sample-set', 'histogram', 'box-plot']) for (const a of arms) {
  const R = by(a, r => planned(r) === k);
  P(`| ${k} | ${a} | ${R.length} | ${R.filter(r => r.delivered).length} | ${R.filter(hit).length} | ${R.filter(r => r.delivered && r.authoredBy?.provider === 'google').length} |`);
}

// 4. over-limit events
P('\n## explanation_gemini_schema_over_limit events\n');
for (const a of arms) P(`- ${a}: ${by(a, () => true).reduce((s, r) => s + (r.overLimit || 0), 0)} events in ${by(a, r => r.overLimit > 0).length} runs`);
P('\nNot claimed: whether Gemini accepts a one-kind schema with derive/op/t beyond what these runs show; the corpus is the VAR-1 bench prompt set, not production traffic.');
console.log(out.join('\n'));
