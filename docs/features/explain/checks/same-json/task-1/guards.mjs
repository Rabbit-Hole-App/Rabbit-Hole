// Same-JSON full build, guard: for every prompt of every reference of the library, the Gemini request and the fallback (Fireworks) request of the branch against main's, in two forms: no plan and no seed
// (standard depth), and with a plan of the reference's own kind and a request seed (balanced depth). A prompt whose request differs must be one of a DECLARED reference. No provider call.
// usage: node guards.mjs <mainRoot> <branchRoot> [out.json]
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [mainRoot, branchRoot, out = 'guards.json'] = process.argv.slice(2);
const log = console.log;
const load = async root => {
  const w = await import('file:///' + root + '/packages/web/src/tutor-diagrams/reference-library.js');
  const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
  const [art, pl, fc] = await Promise.all([imp('src/learn-artifact.js'), imp('src/explanation-planner.js'), imp('src/explanation-fast-chain.js')]);
  return { refs: w.diagramReferences, art, pl, fc };
};
const T = { main: await load(mainRoot), branch: await load(branchRoot) };
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const h = x => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 12);
const safe = f => { try { return h(f()); } catch (error) { return 'refused:' + (error.code ?? String(error.message).slice(0, 60)); } }; // a request the chain refuses (schema_not_exclusive for some planned kinds) counts as the same when both trees refuse it the same way
const answers = kind => ({ visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 } });
const requests = (arm, ref, prompt) => {
  const { art, pl, fc } = T[arm]; const res = {};
  console.log = () => {};
  try {
    const plain = art.prepareArtifactAuthorRequest(env, { command: 'explanation', args: prompt, depth: 'standard' }).body;
    res.plain = { gemini: safe(() => fc.stepRequest({ provider: 'google', model: 'g' }, 'low', plain)), fallback: safe(() => fc.stepRequest({ provider: 'fireworks', model: 'f' }, 'low', plain)) };
    const kind = ref.spec.diagram.kind;
    const planned = art.planWithReferenceKind({ command: 'explanation', args: prompt, selection: null, context: null, depth: 'balanced', requestSeed: 'bench-1-1', plan: pl.planFromAnswers(answers(kind), 'balanced') });
    const body = art.prepareArtifactAuthorRequest(env, planned).body;
    res.planned = { gemini: safe(() => fc.stepRequest({ provider: 'google', model: 'g' }, 'low', body)), fallback: safe(() => fc.stepRequest({ provider: 'fireworks', model: 'f' }, 'low', body)) };
  } finally { console.log = log; }
  return res;
};
const declared = new Set(); // this branch declares no reference: every difference counts
const rows = []; let prompts = 0, identical = 0, differDeclared = 0, differUndeclared = [];
for (const ref of T.branch.refs) for (const prompt of ref.prompts) {
  prompts++;
  const a = requests('main', ref, prompt), b = requests('branch', ref, prompt);
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) identical++; else if (declared.has(ref.id)) differDeclared++; else differUndeclared.push({ id: ref.id, prompt: prompt.slice(0, 80) });
  rows.push({ id: ref.id, declared: declared.has(ref.id), same });
}
writeFileSync(out, JSON.stringify({ references: T.branch.refs.length, prompts, requestsPerPrompt: 4, identical, differInDeclared: differDeclared, differInUndeclared: differUndeclared, declared: [...declared], undeclaredPrompts: rows.filter(r => !r.declared).length, undeclaredIdentical: rows.filter(r => !r.declared && r.same).length }, null, 1));
console.log(`${T.branch.refs.length} references, ${prompts} prompts x 4 requests (Gemini and fallback, no plan and planned with a seed): identical ${identical}, differing in a declared reference ${differDeclared}, differing in an undeclared reference ${differUndeclared.length}`);
console.log(`undeclared prompts ${rows.filter(r => !r.declared).length}, of them identical ${rows.filter(r => !r.declared && r.same).length}`);
process.exit(differUndeclared.length ? 1 : 0);
