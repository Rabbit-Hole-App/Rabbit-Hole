// MVP3 dry run, NO provider call. For each of the five prompts: the AFTER3 request (feat/same-json-mvp3) carries one sentence with eight starting numbers; two different seeds give different numbers and the same seed the same numbers;
// with the sentence taken out, the request equals the MVP2 request (AFTER2); with no seed there is no sentence and the request equals the MVP2 request.
// usage: node dryrun.mjs [plan.json] [trees]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const plan = JSON.parse(fs.readFileSync(process.argv[2] ?? 'plan.json', 'utf8')), TREES = process.argv[3] ?? 'C:/s/same-json-trees';
const imp = (arm, f) => import(pathToFileURL(`${TREES}/${arm}/packages/control-plane/src/${f}`).href);
const T = {};
for (const arm of ['after2', 'after3']) { const [art, pl, fc] = await Promise.all([imp(arm, 'learn-artifact.js'), imp(arm, 'explanation-planner.js'), imp(arm, 'explanation-fast-chain.js')]); T[arm] = { art, pl, assembled: fc.assembledSystem }; }
const env = { SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x' };
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
const answers = kind => ({ visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 }, needsPlot: { noul: 0.1 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.05 } });
const system = (arm, p, seed) => {
  const { art, pl, assembled } = T[arm];
  const input = quiet(() => art.planWithReferenceKind({ command: 'explanation', args: p.prompt, selection: null, context: null, depth: 'balanced', ...(seed ? { requestSeed: seed } : {}), plan: pl.planFromAnswers(answers(p.expectedKind), 'balanced') }));
  return assembled(quiet(() => art.prepareArtifactAuthorRequest(env, input)).body);
};
const SENT = / For this card, build your input values from these starting numbers, in this order, scaling or rounding them where the diagram needs shares or weights: ([0-9, ]+)\./;
const prompts = [...new Map(plan.items.map(i => [i.tag, i])).values()];
const out = []; let bad = 0, topk = '', topkSeed = '';
for (const p of prompts) {
  const first = plan.items.find(i => i.tag === p.tag && i.rep === 1), seedRun = `bench-${first.idx}-${first.rep}`;
  const a1 = system('after3', p, 'dry-A'), a2 = system('after3', p, 'dry-B'), a1again = system('after3', p, 'dry-A'), none = system('after3', p, null), run = system('after3', p, seedRun);
  const base = system('after2', p, 'dry-A'), baseB = system('after2', p, 'dry-B'), baseNone = system('after2', p, null);
  const grab = s => { const m = s.match(SENT); return m ? m[1].split(', ').map(Number) : null; };
  const nA = grab(a1), nB = grab(a2), nA2 = grab(a1again);
  const distinctWhole = n => n && n.length === 8 && new Set(n).size === 8 && n.every(x => Number.isInteger(x) && x >= 5 && x <= 60);
  const stripped = s => s.replace(SENT, '');
  const ok = Boolean(distinctWhole(nA) && distinctWhole(nB) && JSON.stringify(nA) !== JSON.stringify(nB) && JSON.stringify(nA) === JSON.stringify(nA2) && stripped(a1) === base && stripped(a2) === baseB && grab(none) === null && none === baseNone && a1 === a1again);
  if (!ok) bad++;
  if (p.tag === 'top-k') { topk = run.slice(run.indexOf('\n# Examples\n')); topkSeed = seedRun; }
  out.push({ tag: p.tag, ok, refId: p.refId, seedA: nA, seedB: nB, sameSeedSame: JSON.stringify(nA) === JSON.stringify(nA2), onlySentenceDiffers: stripped(a1) === base && stripped(a2) === baseB, noSeedEqualsMvp2: none === baseNone && grab(none) === null, systemChars: { after2: base.length, after3: a1.length } });
}
const stats = (() => { const sets = new Set(); for (const it of plan.items) { /* the 25 real seeds */ } return null; })();
fs.writeFileSync('dryrun.json', JSON.stringify(out, null, 1));
fs.writeFileSync('topk-examples-block.txt', `(seed ${topkSeed}, the first top-k ask)\n` + topk);
for (const o of out) console.log(`${o.ok ? 'OK ' : 'BAD'} ${o.tag}: seed dry-A ${JSON.stringify(o.seedA)} | seed dry-B ${JSON.stringify(o.seedB)} | same seed same numbers ${o.sameSeedSame} | only the sentence differs from MVP2 ${o.onlySentenceDiffers} | no seed equals MVP2 ${o.noSeedEqualsMvp2} | system ${o.systemChars.after2} -> ${o.systemChars.after3}`);
console.log(bad ? `FAILED: ${bad} of ${out.length}` : `all ${out.length} prompts ok; no provider call made`);
process.exit(bad ? 1 : 0);
