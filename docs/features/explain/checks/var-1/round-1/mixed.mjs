const root = process.argv[2];
const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await imp('src/learn-artifact.js');
const { stepRequest } = await imp('src/explanation-fast-chain.js');
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x' };
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const log = console.log; console.log = () => {};
const request = (args, kinds = []) => stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepareArtifactAuthorRequest(env, { command: 'explanation', args, visualRequirements: { items: kinds.map((diagramKind, index) => ({ id: `vr-${index + 1}`, kind: 'diagram', diagramKind, purpose: `Show the ${diagramKind}` })) } }).body).response_format.json_schema.schema;
const mixed = props(request('Show the numeric summaries and their assembly', ['coordinate-plot', 'heatmap', 'block-stack']));
const demo = props(request('how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 5?'));
console.log = log; console.log(JSON.stringify({ mixed, demo }));
const s = JSON.stringify(request('Show the numeric summaries and their assembly', ['coordinate-plot', 'heatmap', 'block-stack']));
console.log(JSON.stringify({ derive: (s.match(/"derive":\{/g) || []).length, op: (s.match(/"op":\{/g) || []).length, t: (s.match(/"t":\{/g) || []).length }));
console.log(JSON.stringify({ maxItems: (s.match(/maxItems/g) || []).length, tProp: [...s.matchAll(/"t":\{[^}]*\}/g)].map(m => m[0]) }));
const propertyCount = o => (Array.isArray(o) ? o.reduce((n, s) => n + propertyCount(s), 0) : o && typeof o === 'object'
  ? Object.entries(o).reduce((n, [k, v]) => n + (k === 'properties' && v && typeof v === 'object' ? Object.keys(v).length + Object.values(v).reduce((m, s) => m + propertyCount(s), 0) : propertyCount(v)), 0) : 0);
console.log(JSON.stringify({ testCountMixed: propertyCount(JSON.parse(s)) }));
