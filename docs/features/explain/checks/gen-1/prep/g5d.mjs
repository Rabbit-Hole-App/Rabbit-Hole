// Read-only: the fixed envelope of the author schema (everything except the diagram kind branches), with and without the interactions fields.
const root = 'C:/s/var-1';
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await cp('src/learn-artifact.js');
const { bundledAuthorSchema } = await cp('src/explanation-references.js');
const log = console.log; console.log = () => {};
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const out = {};
for (const interactions of [true, false]) {
  const env = { SMALL_ENV: 'test', GEMINI_API_KEY: 'x', ...(interactions ? { EXPLANATION_INTERACTIONS: 'true' } : {}) };
  const F = prepareArtifactAuthorRequest(env, { command: 'explanation', args: 'zzz' }).body.tools.find(t => t.name === 'make_explanation').input_schema;
  const b = bundledAuthorSchema(F, {});
  const v = b.properties.visuals.items, spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = spec.properties.diagram, key = u.oneOf ? 'oneOf' : 'anyOf';
  u[key] = [];
  out[interactions ? 'interactions' : 'noInteractions'] = { envelope: props(b), topLevelKeys: Object.keys(F.properties) };
}
console.log = log; log(JSON.stringify(out));
