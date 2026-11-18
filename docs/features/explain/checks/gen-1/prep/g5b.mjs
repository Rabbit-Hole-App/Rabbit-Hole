// Read-only: today's Gemini bundles over every library reference prompt, with and without derive/op/t (the property counter is the repo's own).
import { writeFileSync } from 'node:fs';
const root = 'C:/s/var-1';
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const w = await import('file:///' + root + '/packages/web/src/tutor-diagrams/reference-library.js');
const { prepareArtifactAuthorRequest } = await cp('src/learn-artifact.js');
const { stepRequest, withoutBounds } = await cp('src/explanation-fast-chain.js');
const { listForm } = await cp('src/explanation-references.js');
const log = console.log; console.log = () => {};
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const kindOf = b => b.properties?.kind?.const;
const withDerive = s => { // Gemini reduction without the derive/op/t removal: take the non-Gemini bundle, drop bounds, list forms for comparison/transformation
  const c = withoutBounds(s); const v = c.properties.visuals.items, spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = spec.properties.diagram, key = u.oneOf ? 'oneOf' : 'anyOf';
  u[key] = u[key].filter(b => !['heatmap', 'sample-set', 'histogram', 'box-plot'].includes(kindOf(b))).map(b => (['transformation', 'comparison'].includes(kindOf(b)) ? listForm(b) : b)); return c; };
const result = {};
for (const interactions of [true, false]) {
  const env = p => ({ SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: p, GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', ...(interactions ? { EXPLANATION_INTERACTIONS: 'true' } : {}) });
  const rows = [];
  for (const r of w.diagramReferences) {
    for (const depth of ['brief', 'balanced', 'detailed']) {
      const input = { command: 'explanation', args: r.prompts[0], depth };
      const gBody = prepareArtifactAuthorRequest(env('google-low'), input).body;
      const g = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', gBody).response_format.json_schema.schema;
      const nonG = prepareArtifactAuthorRequest(env('fireworks-low'), input).body.tools.find(t => t.name === 'make_explanation').input_schema;
      rows.push({ id: r.id, depth, gemini: props(g), geminiWithDerive: props(withDerive(nonG)), nonGeminiBundle: props(nonG) });
    }
  }
  const top = key => [...rows].sort((a, b) => b[key] - a[key]).slice(0, 5).map(x => `${x.id}@${x.depth}=${x[key]}`);
  result[interactions ? 'interactions' : 'noInteractions'] = { n: rows.length, maxGemini: top('gemini'), maxGeminiWithDerive: top('geminiWithDerive'), maxNonGemini: top('nonGeminiBundle'),
    overLimitGemini: rows.filter(x => x.gemini > 362).length, overLimitWithDerive: rows.filter(x => x.geminiWithDerive > 362).length, overLimitWithDeriveIds: rows.filter(x => x.geminiWithDerive > 362).slice(0, 12).map(x => `${x.id}@${x.depth}=${x.geminiWithDerive}`) };
}
// the mixed reference bundle (plot + heatmap + block-stack required) both ways
const kinds = ['coordinate-plot', 'heatmap', 'block-stack'];
for (const interactions of [true, false]) {
  const env = p => ({ SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: p, GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', ...(interactions ? { EXPLANATION_INTERACTIONS: 'true' } : {}) });
  const input = { command: 'explanation', args: 'Show the numeric summaries and their assembly', visualRequirements: { items: kinds.map((diagramKind, i) => ({ id: `vr-${i + 1}`, kind: 'diagram', diagramKind, purpose: 'x' })) } };
  const nonG = prepareArtifactAuthorRequest(env('fireworks-low'), input).body.tools.find(t => t.name === 'make_explanation').input_schema;
  const g = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepareArtifactAuthorRequest(env('google-low'), input).body).response_format.json_schema.schema;
  result[`mixed_${interactions ? 'interactions' : 'noInteractions'}`] = { gemini: props(g), geminiWithDerive: props(withDerive(nonG)), nonGemini: props(nonG) };
}
console.log = log;
writeFileSync('C:/s/gen1-prep/g5b.json', JSON.stringify(result, null, 1));
log(JSON.stringify(result, null, 1));
