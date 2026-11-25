// Same-JSON task 1, wider than the guard: the whole author request body (both routes) and every moved export, main against the branch, over many shapes of request.
// usage: node matrix.mjs <mainRoot> <branchRoot> [out.json]   (no provider call)
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [mainRoot, branchRoot, out = 'matrix.json'] = process.argv.slice(2);
const log = console.log;
const load = async root => {
  const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
  const w = await import('file:///' + root + '/packages/web/src/tutor-diagrams/reference-library.js');
  const [art, pl, fc, prim, ag, dep, inter, refs] = await Promise.all(['src/learn-artifact.js', 'src/explanation-planner.js', 'src/explanation-fast-chain.js', 'src/learn-primitives.js', 'src/agents/learn-artifact.js', 'src/chat-depth.js', 'src/explanation-interactions.js', 'src/explanation-references.js'].map(imp));
  return { refs: w.diagramReferences, art, pl, fc, prim, ag, dep, inter, rf: refs };
};
const T = { main: await load(mainRoot), branch: await load(branchRoot) };
const h = x => createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 12);
const answers = (kind, extra = {}) => ({ visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 }, ...extra });
const planShapes = (pl, depth) => {
  const p = a => pl.planFromAnswers(a, depth);
  const fixed = p(answers('bar-chart')), two = p({ ...answers('flow'), kind: { choice: 'flow', confidence: 0.4, probabilities: { flow: 0.4, tree: 0.35, cycle: 0.1 } } });
  return {
    none: null, plannerFailed: null, fixed, two,
    picture: p({ ...answers('flow'), visualType: { choice: 'picture', confidence: 0.9 } }),
    both: p({ ...answers('flow'), isPhysical: { noul: 0.9 } }),
    pair: p({ ...answers('tree', { secondVisual: { noul: 0.9 } }), kind: { choice: 'tree', confidence: 0.9, probabilities: { tree: 0.5, flow: 0.3, layers: 0.1 } } }),
    pairPictures: p({ ...answers('flow', { secondVisual: { noul: 0.9 } }), visualType: { choice: 'picture', confidence: 0.9 } }),
    noTreatment: { ...fixed, depthTreatment: undefined },
    emptyVisuals: { ...fixed, visuals: [] },
    kindless: { ...fixed, visuals: [{ type: 'diagram' }] },
    token: p(answers('box-plot')), plot: p(answers('coordinate-plot')), tokenLinks: p(answers('token-links')),
  };
};
const prompts = [];
{ const refs = T.branch.refs; for (let i = 0; i < refs.length; i += 41) prompts.push(refs[i].prompts[0]); }
prompts.push('Does top-k filtering affect the reported probability of the chosen token?', 'Why is the sky blue?', 'How does a bill become law?', 'Explain the mean of 3, 5 and 10 as a worked example.', 'Compare a stack and a queue.', 'What does the heart look like and how does it work?');
const envs = {
  fast: { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' },
  fastNoInteractions: { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x' },
  fastFormula: { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true', EXPLANATION_FORMULA_SAMPLER: 'on' },
  tools: { SMALL_ENV: 'test', EXPLANATION_INTERACTIONS: 'true' },
  toolsPlain: { SMALL_ENV: 'test' },
  toolsFormula: { SMALL_ENV: 'test', EXPLANATION_FORMULA_SAMPLER: 'on', EXPLANATION_INTERACTIONS: 'true' },
};
const depths = ['brief', 'balanced', 'detailed', undefined];
let n = 0, differ = [], shapes = new Set();
const run = (arm, envName, input, opts) => {
  const { art, fc } = T[arm];
  try {
    const body = art.prepareArtifactAuthorRequest(envs[envName], input, opts).body;
    const r = { body: h(body), tools: h(body.tools), system: h(body.system) };
    if (envName.startsWith('fast')) { r.assembled = h(fc.assembledSystem(body)); r.gemini = h(fc.stepRequest({ provider: 'google', model: 'g' }, 'low', body)); r.fallback = h(fc.stepRequest({ provider: 'fireworks', model: 'f' }, 'low', body)); }
    return r;
  } catch (error) { return { refused: error.code ?? String(error.message).slice(0, 80) }; }
};
console.log = () => {};
try {
  for (const [envName] of Object.entries(envs)) for (const depth of depths) {
    const plansMain = planShapes(T.main.pl, depth), plansBranch = planShapes(T.branch.pl, depth);
    for (const planName of Object.keys(plansMain)) for (const seed of [null, 'seed-1']) for (const prompt of prompts) for (const extra of [{}, { imageSource: true }, { suffix: true }]) {
      if ((extra.imageSource || extra.suffix) && (seed || planName !== 'fixed' || prompts.indexOf(prompt) % 5)) continue; // the image and suffix variants on a thin slice
      const mk = (plan, arm) => {
        const input = { command: 'explanation', args: prompt, selection: null, context: null, ...(depth ? { depth } : {}), ...(seed ? { requestSeed: seed } : {}), ...(plan ? { plan } : {}), ...(plan || planName === 'plannerFailed' ? { planned: true } : {}), ...(extra.imageSource ? { imageSource: { name: 'x' } } : {}) };
        return extra.suffix ? [input, { systemSuffix: 'SUFFIX LINE' }] : [input, {}];
      };
      const [im, om] = mk(plansMain[planName], 'main'), [ib, ob] = mk(plansBranch[planName], 'branch');
      // planWithReferenceKind runs inside prepare; give both arms the same input shape
      const a = run('main', envName, T.main.art.planWithReferenceKind(im), om), b = run('branch', envName, T.branch.art.planWithReferenceKind(ib), ob);
      n++; shapes.add(`${envName}/${planName}/${depth}/${seed ? 'seed' : 'noseed'}/${Object.keys(extra)[0] ?? '-'}`);
      if (JSON.stringify(a) !== JSON.stringify(b)) differ.push({ envName, depth, planName, seed, prompt: prompt.slice(0, 50), extra, a, b });
    }
  }
} finally { console.log = log; }

// every moved export, by value
const pick = t => ({
  EXPLANATION_GUIDANCE: t.prim.EXPLANATION_GUIDANCE, EXPLANATION_VISUAL_RULES: t.prim.EXPLANATION_VISUAL_RULES, VISUAL_COMPLETE_BASE: t.prim.VISUAL_COMPLETE_BASE, TOKEN_RULE: t.prim.TOKEN_RULE, VISUAL_COMPLETE: t.prim.VISUAL_COMPLETE,
  about: t.prim.PRIMITIVES.explanation.about, NUMBER_RULE: t.ag.NUMBER_RULE, INPUTS_RULE: t.ag.INPUTS_RULE, ARTIFACT_SYSTEM: t.ag.ARTIFACT_SYSTEM, artifactTools: t.ag.artifactSystem('tools'), artifactJson: t.ag.artifactSystem('json_schema'),
  explanationTools: t.ag.explanationSystem('tools'), explanationJson: t.ag.explanationSystem('json_schema'), DEPTH_LINES: t.dep.EXPLANATION_DEPTH_LINES, targets: ['brief', 'balanced', 'detailed', undefined, 'overview', 'bogus'].map(d => t.dep.explanationTarget(d)),
  OBJECTIVES: t.dep.EXPLANATION_OBJECTIVES, CAPS: t.dep.EXPLANATION_CAPS, INTERACTION_GUIDANCE: t.inter.INTERACTION_GUIDANCE, REFERENCE_MARK: t.rf.REFERENCE_MARK, SEEDED: t.rf.SEEDED_EXAMPLES_HEADING, PHASE02: t.rf.PHASE02_DIAGRAM_GUIDANCE,
  refContext: [t.refs.slice(0, 40).map(r => t.rf.diagramReferenceContext([r])), t.rf.diagramReferenceContext(t.refs.filter(r => r.detailSpec).slice(0, 2)), t.rf.diagramReferenceContext(t.refs.slice(0, 3).map(r => ({ ...r, seededExample: true }))), t.rf.diagramReferenceContext([])],
});
const A = pick(T.main), B = pick(T.branch), exportsDiffer = Object.keys(A).filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
const detail = T.branch.refs.filter(r => r.detailSpec).length;
writeFileSync(out, JSON.stringify({ requestsCompared: n, distinctShapes: shapes.size, differ: differ.length, firstDiffer: differ.slice(0, 5), exportsCompared: Object.keys(A).length, exportsDiffer, referencesWithDetailSpec: detail, byteIdentical: !differ.length && !exportsDiffer.length }, null, 1));
console.log(`${n} request shapes compared (${shapes.size} distinct settings), differing ${differ.length}; ${Object.keys(A).length} exports compared, differing ${exportsDiffer.length} ${JSON.stringify(exportsDiffer)}; references with a detailSpec ${detail}`);
process.exit(differ.length || exportsDiffer.length ? 1 : 0);
