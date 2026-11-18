import fs from 'node:fs';
const rows = fs.readFileSync('results.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const num = rows.filter(r => r.set !== 'vary'), vary = rows.filter(r => r.set === 'vary');
const GEM_DEAD_FROM = 155; // first item idx where google returned provider_error on every call (402 credits depleted)
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const out = [];
const P = s => out.push(s);
function stats(R) {
  const del = R.filter(r => r.delivered);
  return {
    runs: R.length, delivered: del.length, failed: R.length - del.length,
    flagsOld: R.filter(r => r.flags?.length).length, flags154: R.filter(r => r.flags154?.length).length,
    tokenFail: R.filter(r => r.tokenFailure).length, tokensFilled: R.filter(r => r.tokensFilled).length,
    firstValid: R.filter(r => r.firstAttemptValid === true).length, firstKnown: R.filter(r => r.firstAttemptValid !== null && r.firstAttemptValid !== undefined).length,
    moved: R.filter(r => r.movedToNextProvider).length, kindMissing: del.filter(r => r.plannedKindMissing).length,
    gpt: del.filter(r => r.authoredBy?.provider === 'fireworks').length, medMs: med(R.map(r => r.ms)),
    settled: R.reduce((s, r) => s + (r.costMicros || 0), 0) / 1e6, upper: R.reduce((s, r) => s + (r.costMicrosUpper || 0), 0) / 1e6,
  };
}
const row = (name, s) => `| ${name} | ${s.runs} | ${s.delivered} | ${s.flagsOld} | ${s.flags154} | ${s.tokenFail} | ${s.tokensFilled} | ${s.firstValid}/${s.firstKnown} | ${s.moved} | ${s.kindMissing} | ${s.gpt} | ${s.medMs} | ${s.settled.toFixed(3)} |`;
const head = '| slice | runs | delivered | old-classifier flags | 154-rule flags | token failures | cards with tokens | first attempt valid | moved to next provider | planned kind missing | authored by gpt-oss | median ms | settled US$ |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
P('# VAR-1 bench: report (partial, see "What ran")\n');
P('## First line\nGemini stopped working at item 155 of the numeric plan: every google call after that returned provider_error. A direct probe now returns HTTP 402 "Your prepayment credits are depleted" (RESOURCE_EXHAUSTED) on the key in small-deploy/.env. So 207 of the 515 numeric runs, and all 19 variation runs, ran on Fireworks gpt-oss only. Settled spend so far is below US$2.2 (the harness "upper bound" of US$5.8 counts a reservation for each failed Gemini call, which charged nothing). Top-up needed before any google-low measurement (SAME-1 included).\n');
P('## What ran');
P(`- Numeric plan: ${num.length} of 606 runs (before ${num.filter(r => r.arm === 'before').length}, after ${num.filter(r => r.arm === 'after').length}); items 0 to 257 of 302. Items 258 to 302 not run: the stop line (US$5.40 upper bound) was reached, an artifact of the reservations above.`);
P(`- Variation: ${vary.length} of 20 runs (item 1019 not run; the cap raised to US$5.80 to run them, still under the owner's US$6, upper-bound arithmetic only).`);
P('- Stop-line note: harness estimate was US$0.0034 a run; the reservation per failed Gemini call is about US$0.018.\n');
P('## Numeric arms\n');
const A = (arm, f) => stats(num.filter(r => r.arm === arm && f(r)));
const live = r => r.idx < GEM_DEAD_FROM;
P(head);
for (const arm of ['before', 'after']) { P(row(`${arm}, Gemini live (items 0-154)`, A(arm, live))); P(row(`${arm}, Gemini dead (items 155-257)`, A(arm, r => !live(r)))); P(row(`${arm}, all`, A(arm, () => true))); }
P('\nOnly the Gemini-live rows compare both providers. The Gemini-dead rows are Fireworks-only: first attempt valid is not measured there (null).\n');
P('## Derived-field arithmetic errors\n');
for (const arm of ['before', 'after']) {
  const R = num.filter(r => r.arm === arm);
  P(`- ${arm}: 154-rule flags ${R.filter(r => r.flags154?.length).length}; old-classifier flags ${R.filter(r => r.flags?.length).length}`);
  for (const r of R.filter(r => r.flags?.length)) P(`  - item ${r.idx} ${r.set} "${r.prompt.slice(0, 60)}" (${r.depth}, ${r.authoredBy?.provider}): ${r.flags.map(f => f.check + ': ' + f.detail).join('; ').slice(0, 200)}`);
}
P('\n## Variation (after arm only)\n');
P('See variation-diff.md. All 19 variation cards were written by gpt-oss because Gemini was down.\n');
P('## Token-fill\n');
const tf = num.filter(r => r.arm === 'after');
P(`- after arm: tokenFailure ${tf.filter(r => r.tokenFailure).length}; cards with tokens filled ${tf.filter(r => r.tokensFilled).length}. Tokens are used by the author only when a reference text carries them; very few cards did.`);
fs.writeFileSync('report.md', out.join('\n') + '\n');

// variation diff
const d = [];
const flat = (o, p = '', acc = {}) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) flat(o[k], p ? `${p}.${k}` : k, acc); else acc[p] = o; return acc; };
const isInput = p => /(\.|^)(points|values|boxes|q1|q3|median|min|max|y|x|value|weights|bars|series)(\.|$)/.test(p) && !/label|name|title|caption|id|heading|kind|version/.test(p.split('.').pop());
d.push('# VAR-1 variation diff (same prompt asked twice, different requestSeed)\n');
d.push('All cards authored by gpt-oss (Gemini 402). Pair counts only if the reference was selected in both runs.\n');
d.push('| reference | selected both | kinds same | requestSeeds | paths changed | of which numeric-looking | structure paths changed (labels/kinds/captions) |\n|---|---|---|---|---|---|---|');
const byRef = {}; for (const r of vary) (byRef[r.refId] ||= []).push(r);
const detail = [];
for (const [ref, rs] of Object.entries(byRef)) {
  if (rs.length < 2) { d.push(`| ${ref} | only one run (item 1019 not run) | | | | | |`); continue; }
  const [a, b] = rs; const both = a.references?.includes(ref) && b.references?.includes(ref);
  const fa = flat(a.diagrams), fb = flat(b.diagrams);
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])];
  const ch = keys.filter(k => fa[k] !== fb[k]);
  const num_ = ch.filter(isInput), str = ch.filter(k => !isInput(k));
  d.push(`| ${ref} | ${both ? 'yes' : 'NO'} | ${JSON.stringify(a.finalKinds) === JSON.stringify(b.finalKinds) ? 'yes' : 'NO'} | ${a.requestSeed} / ${b.requestSeed} | ${ch.length} | ${num_.length} | ${str.length} |`);
  detail.push(`### ${ref}\nnumeric-looking: ${num_.slice(0, 12).map(k => `${k}: ${fa[k]} -> ${fb[k]}`).join('; ') || 'none'}\nstructure: ${str.slice(0, 12).map(k => `${k}: ${String(fa[k]).slice(0, 40)} -> ${String(fb[k]).slice(0, 40)}`).join('; ') || 'none'}\n`);
}
d.push('\n' + detail.join('\n'));
fs.writeFileSync('variation-diff.md', d.join('\n') + '\n');
console.log(out.join('\n')); console.log('\n----\n'); console.log(d.slice(0, 16).join('\n'));
