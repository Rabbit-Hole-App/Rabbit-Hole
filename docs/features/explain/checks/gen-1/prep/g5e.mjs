const root = 'C:/s/var-1';
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await cp('src/learn-artifact.js');
const { stepRequest, withoutBounds } = await cp('src/explanation-fast-chain.js');
const { listForm } = await cp('src/explanation-references.js');
const log = console.log; console.log = () => {};
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const kindOf = b => b.properties?.kind?.const;
const out = {};
for (const interactions of [true, false]) for (const [name, kinds] of [['box-plot', ['box-plot']], ['plot', ['coordinate-plot']]]) {
  const env = p => ({ SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: p, GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', ...(interactions ? { EXPLANATION_INTERACTIONS: 'true' } : {}) });
  const input = { command: 'explanation', args: 'x', visualRequirements: { items: kinds.map((diagramKind, i) => ({ id: `vr-${i + 1}`, kind: 'diagram', diagramKind, purpose: 'x' })) } };
  const nonG = prepareArtifactAuthorRequest(env('fireworks-low'), input).body.tools.find(t => t.name === 'make_explanation').input_schema;
  const g = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepareArtifactAuthorRequest(env('google-low'), input).body).response_format.json_schema.schema;
  const c = withoutBounds(nonG); const v = c.properties.visuals.items, sp = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = sp.properties.diagram, key = u.oneOf ? 'oneOf' : 'anyOf';
  const NEWOTHER = ['heatmap', 'sample-set', 'histogram', 'box-plot'].filter(k => !kinds.includes(k));
  u[key] = u[key].filter(b => !NEWOTHER.includes(kindOf(b))).map(b => (['transformation', 'comparison'].includes(kindOf(b)) ? listForm(b) : b));
  out[`${name}_${interactions ? 'int' : 'noint'}`] = { geminiSent: props(g), geminiWithDerive: props(c), nonGemini: props(nonG) };
}
console.log = log; log(JSON.stringify(out));
