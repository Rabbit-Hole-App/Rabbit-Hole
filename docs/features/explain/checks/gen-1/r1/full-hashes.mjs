// usage: node full-hashes.mjs <treeRoot> <out.json>
// No plan: for every reference prompt, hash the whole author body (system, tools, messages) and the whole request a Gemini step and a Fireworks step would send.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [root, out] = process.argv.slice(2);
const w = await import('file:///' + root + '/packages/web/src/tutor-diagrams/reference-library.js');
const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await imp('src/learn-artifact.js');
const { stepRequest } = await imp('src/explanation-fast-chain.js');
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const h = x => createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 10);
const log = console.log; console.log = () => {};
const res = {};
for (const r of w.diagramReferences) {
  const body = prepareArtifactAuthorRequest(env, { command: 'explanation', args: r.prompts[0], depth: 'standard' }).body;
  res[r.id] = [h(body), h(stepRequest({ provider: 'google', model: 'g' }, 'low', body)), h(stepRequest({ provider: 'fireworks', model: 'f' }, 'low', body))].join('|');
}
console.log = log;
writeFileSync(out, JSON.stringify(res));
console.log(out, Object.keys(res).length);
