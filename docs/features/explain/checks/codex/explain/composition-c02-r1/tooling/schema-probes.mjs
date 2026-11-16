import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [repoArg, outArg] = process.argv.slice(2), repo = resolve(repoArg), out = resolve(outArg);
const at = path => import(pathToFileURL(resolve(repo, path)));
const { diagramReferences } = await at('packages/web/src/tutor-diagrams/reference-library.js');
const { prepareArtifactAuthorRequest } = await at('packages/control-plane/src/learn-artifact.js');
const { stepRequest } = await at('packages/control-plane/src/explanation-fast-chain.js');
const c01 = ['ml-linear-regression-linear-unit', 'ml-neural-networks-hidden-layer', 'ml-regularization-regularized-objective', 'ml-regularization-dropout-mask'];
const c02 = JSON.parse(await readFile(resolve(out, 'ids.json'), 'utf8'));
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_INTERACTIONS: 'true' };
const properties = node => !node || typeof node !== 'object' ? 0 : Object.keys(node.properties ?? {}).length + Object.values(node).reduce((s, n) => s + properties(n), 0);
const rows = [];
for (const id of [...c01, ...c02]) {
  const ref = diagramReferences.find(r => r.id === id);
  const prompts = [...new Set([...(ref.prompts ?? []), ...(ref.paraphrases ?? [])])];
  const paraphrases = new Set(ref.paraphrases ?? []);
  for (const mode of ['default', 'planned-source']) {
    const selected = mode === 'default' ? prompts : prompts.filter(p => !paraphrases.has(p));
    for (const prompt of selected) for (const depth of ['brief', 'balanced', 'detailed']) {
      const kind = ref.spec.diagram.kind;
      const input = { command: 'explain', args: prompt, depth, ...(mode === 'planned-source' ? {
        planned: true, plan: { planner: 'jev', kind, fixed: true, depthTreatment: 'mechanism', visuals: [{ type: 'diagram', kind }] }
      } : {}) };
      const prepared = prepareArtifactAuthorRequest(env, input);
      if (prepared.result) throw new Error('Unexpected short-circuit: ' + id);
      const request = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', prepared.body);
      const count = properties(request.response_format.json_schema.schema);
      if (count > 362) throw new Error(`${id}/${depth} exceeds Gemini property limit: ${count}`);
      rows.push({ referenceId: id, mode, prompt, depth, offeredReferences: prepared.diagramReferences.map(r => ({ id: r.id, kind: r.spec.diagram.kind })), geminiProperties: count });
    }
  }
}
const result = { method: 'Offline prepareArtifactAuthorRequest and actual stepRequest Google JSON-schema path. No provider/model calls or credentials.',
  probes: rows.length, passed: rows.length, maxGeminiProperties: Math.max(...rows.map(r => r.geminiProperties)), limit: 362, rows };
await writeFile(resolve(out, 'actual-author-schemas.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ probes: result.probes, maxGeminiProperties: result.maxGeminiProperties, limit: result.limit }));
