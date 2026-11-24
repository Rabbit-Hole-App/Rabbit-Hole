// BOX-1: per library reference (prompt 0, standard depth, no plan, no seed): sha1/10 of the Gemini schema, of the whole author body, of the whole Gemini and Fireworks request, and the Gemini property count.
// usage: node hashes.mjs <treeRoot> <out.json>   (models: C:/s/var-1-tools/hashes.mjs and C:/s/gen1-prep/r1/full-hashes.mjs)
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [root, out] = process.argv.slice(2);
const w = await import('file:///' + root + '/packages/web/src/tutor-diagrams/reference-library.js');
const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await imp('src/learn-artifact.js');
const { stepRequest, schemaProperties } = await imp('src/explanation-fast-chain.js');
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const h = x => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 10);
const log = console.log; console.log = () => {};
const res = {};
for (const r of w.diagramReferences) {
  const body = prepareArtifactAuthorRequest(env, { command: 'explanation', args: r.prompts[0], depth: 'standard' }).body;
  const g = stepRequest({ provider: 'google', model: 'g' }, 'low', body);
  res[r.id] = { schema: h(g.response_format.json_schema.schema), body: h(body), gemini: h(g), fireworks: h(stepRequest({ provider: 'fireworks', model: 'f' }, 'low', body)), props: schemaProperties(g.response_format.json_schema.schema) };
}
console.log = log;
writeFileSync(out, JSON.stringify(res));
console.log(out, Object.keys(res).length, 'max Gemini properties', Math.max(...Object.values(res).map(v => v.props)));
