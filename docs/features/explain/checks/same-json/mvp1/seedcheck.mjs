import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const plan = JSON.parse(fs.readFileSync('plan.json', 'utf8')), TREES = 'C:/s/same-json-trees';
const imp = (arm, f) => import(pathToFileURL(`${TREES}/${arm}/packages/control-plane/src/${f}`).href);
const env = { SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x' };
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
for (const arm of ['before', 'after']) {
  const [art, pl, fc] = await Promise.all([imp(arm, 'learn-artifact.js'), imp(arm, 'explanation-planner.js'), imp(arm, 'explanation-fast-chain.js')]);
  for (const p of [...new Map(plan.items.map(i => [i.tag, i])).values()]) {
    const mk = seed => { const a = { visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: p.expectedKind, confidence: 0.9, probabilities: { [p.expectedKind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 } }; const i0 = { command: 'explanation', args: p.prompt, selection: null, context: null, depth: 'balanced', requestSeed: seed, plan: pl.planFromAnswers(a, 'balanced') }; return fc.assembledSystem(quiet(() => art.prepareArtifactAuthorRequest(env, quiet(() => art.planWithReferenceKind(i0)))).body); };
    const s = [1, 2, 3, 4, 5].map(n => mk(`bench-${n}-${n}`));
    console.log(arm, p.tag, 'five seeds give', new Set(s).size, 'distinct request text(s)');
  }
}
