// usage: node g5-after.mjs <treeRoot> <out.json>
// GEN-1 R1: the Gemini (and Fireworks) request schema for a card whose plan names one kind, or offers two, through the real path
// prepareArtifactAuthorRequest -> stepRequest. Counts with the repo's own counter (schemaProperties). No network.
import { writeFileSync } from 'node:fs';
const [root, out] = process.argv.slice(2);
const imp = p => import('file:///' + root + '/packages/control-plane/' + p);
const { prepareArtifactAuthorRequest } = await imp('src/learn-artifact.js');
const { stepRequest, schemaProperties, GEMINI_PROPERTY_LIMIT } = await imp('src/explanation-fast-chain.js');
const { CORE_KINDS, QUANT_KINDS, NEW_KINDS } = await imp('src/explanation-references.js');
const KINDS = [...CORE_KINDS, ...QUANT_KINDS, ...NEW_KINDS, 'tensor', 'token-links', 'block-stack'];
const log = console.log; console.log = () => {};
const envFor = interactions => ({ SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', ...(interactions ? { EXPLANATION_INTERACTIONS: 'true' } : {}) });
const planFor = kinds => ({ planner: 'jev', visuals: [{ type: 'diagram', ...(kinds.length === 1 ? { kind: kinds[0] } : { choose: kinds }) }], kind: kinds[0], fixed: kinds.length === 1, depthTreatment: 'mechanism', flags: {}, confidence: { kind: 0.9 }, probabilities: { kind: null } });
const unionKinds = schema => { const v = schema.properties.visuals.items; const spec = (v.oneOf ?? v.anyOf).find(x => x.properties.spec).properties.spec, u = spec.properties.diagram; return (u.oneOf ?? u.anyOf).map(b => b.properties.kind.const); };
const has = (o, key) => JSON.stringify(o).includes(`"${key}":{`);
const run = (interactions, kinds) => {
  const prepared = prepareArtifactAuthorRequest(envFor(interactions), { command: 'explanation', args: 'zzz', depth: 'standard', planned: true, plan: planFor(kinds) });
  const gem = stepRequest({ provider: 'google', model: 'g' }, 'low', prepared.body).response_format.json_schema.schema;
  const fw = stepRequest({ provider: 'fireworks', model: 'f' }, 'low', prepared.body).response_format.json_schema.schema;
  return { kinds, gemini: schemaProperties(gem), nonGemini: schemaProperties(fw), geminiKinds: unionKinds(gem), derive: has(gem, 'derive'), op: has(gem, 'op'), t: has(gem, 't') };
};
const result = { limit: GEMINI_PROPERTY_LIMIT, withInteractions: { single: [], pairs: [] }, noInteractions: { single: [] } };
for (const k of KINDS) { result.withInteractions.single.push(run(true, [k])); result.noInteractions.single.push(run(false, [k])); }
for (let i = 0; i < KINDS.length; i++) for (let j = i + 1; j < KINDS.length; j++) result.withInteractions.pairs.push(run(true, [KINDS[i], KINDS[j]]));
console.log = log;
writeFileSync(out, JSON.stringify(result, null, 1));
const s = result.withInteractions.single, p = result.withInteractions.pairs;
console.log('single kinds', s.length, 'max Gemini', Math.max(...s.map(r => r.gemini)), 'over limit', s.filter(r => r.gemini > result.limit).length);
console.log('pairs', p.length, 'max Gemini', Math.max(...p.map(r => r.gemini)), 'over limit', p.filter(r => r.gemini > result.limit).length);
console.log('kind set equals the plan:', s.every(r => r.geminiKinds.length === 1 && r.geminiKinds[0] === r.kinds[0]) && p.every(r => r.geminiKinds.join() === r.kinds.join()));
for (const r of s.filter(x => ['coordinate-plot', 'transformation', 'box-plot', 'heatmap', 'sample-set', 'histogram', 'bar-chart', 'block-stack'].includes(x.kinds[0]))) console.log(r.kinds[0], 'gemini', r.gemini, 'non-gemini', r.nonGemini, 'derive', r.derive, 'op', r.op, 't', r.t);
