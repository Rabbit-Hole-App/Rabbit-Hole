// Read-only: the mixed bundle (plot + heatmap + block-stack required) with and without derive/op/t, Gemini view, keeping the required NEW kind.
const root = 'C:/s/var-1';
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await cp('src/learn-artifact.js');
const { stepRequest, withoutBounds } = await cp('src/explanation-fast-chain.js');
const { listForm } = await cp('src/explanation-references.js');
const log = console.log; console.log = () => {};
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const kindOf = b => b.properties?.kind?.const;
const withDerive = s => { const c = withoutBounds(s); const v = c.properties.visuals.items, spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = spec.properties.diagram, key = u.oneOf ? 'oneOf' : 'anyOf';
  u[key] = u[key].filter(b => !['sample-set','histogram','box-plot'].includes(kindOf(b))).map(b => (['transformation', 'comparison'].includes(kindOf(b)) ? listForm(b) : b)); return c; };
const out = {};
for (const interactions of [true, false]) {
  const env = p => ({ SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: p, GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', ...(interactions ? { EXPLANATION_INTERACTIONS: 'true' } : {}) });
  const input = { command: 'explanation', args: 'Show the numeric summaries and their assembly', visualRequirements: { items: ['coordinate-plot', 'heatmap', 'block-stack'].map((diagramKind, i) => ({ id: `vr-${i + 1}`, kind: 'diagram', diagramKind, purpose: 'x' })) } };
  const nonG = prepareArtifactAuthorRequest(env('fireworks-low'), input).body.tools.find(t => t.name === 'make_explanation').input_schema;
  const g = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepareArtifactAuthorRequest(env('google-low'), input).body).response_format.json_schema.schema;
  const wd = withDerive(nonG);
  const kinds = s => { const v = s.properties.visuals.items, spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = spec.properties.diagram; return (u.oneOf ?? u.anyOf).map(kindOf); };
  out[interactions ? 'interactions' : 'noInteractions'] = { geminiSent: props(g), geminiWithDerive: props(wd), nonGemini: props(nonG), kindsSent: kinds(g), kindsWithDerive: kinds(wd) };
}
console.log = log; log(JSON.stringify(out, null, 1));
