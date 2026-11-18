// G6: how much larger can a roadmap DISPATCH body (seed + plan + examples) be than the QUOTE body (no seed, no plan)? Offline, no network.
// Measures bytes of JSON.stringify(body) for the quote body and for a dispatch-like body, split into the examples block and the rest.
import { pathToFileURL } from 'node:url';
const R = 'C:/s/gen1-g6/packages/';
const imp = f => import(pathToFileURL(R + f).href);
const { authorInput } = await imp('control-plane/src/roadmap/roadmap-generate.js');
const { prepareArtifactAuthorRequest } = await imp('control-plane/src/learn-artifact.js');
const { planFromAnswers } = await imp('control-plane/src/explanation-planner.js');
const { diagramReferenceContext } = await imp('control-plane/src/explanation-references.js');
const { diagramReferences } = await imp('web/src/tutor-diagrams/reference-library.js');
const bytes = s => new TextEncoder().encode(s).length;
const KINDS = ['flow', 'comparison', 'tree', 'sequence', 'cycle', 'relationship', 'transformation', 'layers', 'timeline', 'matrix', 'coordinate-plot', 'bar-chart', 'histogram', 'box-plot', 'heatmap', 'number-line', 'sample-set', 't-account', 'waterfall', 'argument', 'figure', 'tensor', 'token-links', 'block-stack'];
const answers = k => ({ visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95, picture: 0.03, both: 0.02 } }, kind: { choice: k, confidence: 0.9, probabilities: { [k]: 0.9, flow: 0.1 } }, depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 } });
const profiles = { 'roadmap-gemini': { GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x' }, 'plan-default': {} };
const recFor = (prompt) => ({ format: 'explanation', passageText: 'A short passage about the subject.', documentText: null, stepTitle: prompt.slice(0, 60), stepGoal: prompt, claimsToCover: [], learnerInstruction: { original: '', revisions: [] }, teachingScope: { kind: 'whole' }, depth: 'balanced', sourceRef: null, cardId: 'c', stepId: 's', proposalId: 'p', proposalVersion: 1, retry: 0 });
const prompts = [...new Set(diagramReferences.flatMap(r => (r.prompts || []).slice(0, 1)))].slice(0, 120);
const out = {};
for (const [name, extra] of Object.entries(profiles)) {
  const env = { EXPLANATION_INTERACTIONS: 'true', ...extra };
  let maxRest = -Infinity, maxTotal = -Infinity, maxExamplesDispatch = 0, n = 0, worst = null;
  for (const prompt of prompts) {
    const built = authorInput(recFor(prompt), undefined, env);
    if (built.failed) continue;
    const q = prepareArtifactAuthorRequest(env, built.input, built.options);
    if (q.result) continue;
    const qBytes = bytes(JSON.stringify(q.body)), qEx = bytes(diagramReferenceContext(q.diagramReferences));
    for (const kind of KINDS) {
      const plan = planFromAnswers(answers(kind), 'standard');
      const input = { ...built.input, planned: true, plan, requestSeed: 'seed-x' };
      const d = prepareArtifactAuthorRequest(env, input, built.options);
      if (d.result) continue;
      const dBytes = bytes(JSON.stringify(d.body)), dEx = bytes(diagramReferenceContext(d.diagramReferences));
      const rest = (dBytes - dEx) - (qBytes - qEx), total = dBytes - qBytes;
      n++;
      if (rest > maxRest) { maxRest = rest; worst = { prompt: prompt.slice(0, 50), kind, rest, dEx, qEx }; }
      if (total > maxTotal) maxTotal = total;
      if (dEx > maxExamplesDispatch) maxExamplesDispatch = dEx;
    }
  }
  out[name] = { pairs: n, maxRestBytes: maxRest, maxTotalDeltaBytes: maxTotal, maxExamplesBytesInDispatch: maxExamplesDispatch, worst };
}
console.log(JSON.stringify(out, null, 1));
