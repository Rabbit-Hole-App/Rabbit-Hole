// MVP4 dry run, NO provider call. For the five prompts: the AFTER4 request (feat/same-json-mvp4) against the MVP3 request (AFTER3). The three prompts whose reference has no calculation must be identical, byte for byte,
// in the whole request Gemini is sent (system text and answer schema). The top-k and softmax requests carry the example without its numbers but with its variables and limits, and the answer schema carries
// the variables list; the schema must stay within the 362 properties Gemini accepts.
// usage: node dryrun.mjs [plan.json] [trees]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const plan = JSON.parse(fs.readFileSync(process.argv[2] ?? 'plan.json', 'utf8')), TREES = process.argv[3] ?? 'C:/s/same-json-trees';
const imp = (arm, f) => import(pathToFileURL(`${TREES}/${arm}/packages/control-plane/src/${f}`).href);
const T = {};
for (const arm of ['after3', 'after4']) { const [art, pl, fc] = await Promise.all([imp(arm, 'learn-artifact.js'), imp(arm, 'explanation-planner.js'), imp(arm, 'explanation-fast-chain.js')]); T[arm] = { art, pl, fc }; }
const env = { SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x' };
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } };
const answers = kind => ({ visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 }, needsPlot: { noul: 0.1 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.05 } });
const request = (arm, p, seed) => {
  const { art, pl, fc } = T[arm];
  const input = quiet(() => art.planWithReferenceKind({ command: 'explanation', args: p.prompt, selection: null, context: null, depth: 'balanced', requestSeed: seed, plan: pl.planFromAnswers(answers(p.expectedKind), 'balanced') }));
  const prepared = quiet(() => art.prepareArtifactAuthorRequest(env, input));
  const sent = fc.stepRequest({ provider: 'google', model: 'gemini-dry' }, 'low', prepared.body);
  const schema = sent.response_format.json_schema.schema;
  return { prepared, sent, system: sent.messages[0].content, schema, properties: fc.schemaProperties(schema) };
};
const hasVariables = o => (o && typeof o === 'object') ? ('variables' in (o.properties ?? {})) || Object.values(o).some(hasVariables) : false;
const prompts = [...new Map(plan.items.map(i => [i.tag, i])).values()];
const out = []; let bad = 0; const blocks = {};
for (const p of prompts) {
  const first = plan.items.find(i => i.tag === p.tag && i.rep === 1), seed = `bench-${first.idx}-${first.rep}`;
  const a = request('after3', p, seed), b = request('after4', p, seed);
  const calc = b.prepared.diagramReferences.some(r => r.calculation);
  const identical = JSON.stringify(a.sent) === JSON.stringify(b.sent);
  const at = b.system.indexOf('\n# Examples\n'); const block = at >= 0 ? b.system.slice(at, b.system.indexOf('\n# Output format') > at ? b.system.indexOf('\n# Output format') : undefined) : '';
  if (calc) blocks[p.tag] = block;
  const refLine = block.split('\n').find(l => l.startsWith('{"id":"' + p.refId + '"')), parsed = refLine ? JSON.parse(refLine) : null;
  const vars = parsed?.spec?.diagram?.variables ?? null;
  const ok = calc
    ? Boolean(!identical && vars?.length === 4 && b.properties <= 362 && hasVariables(b.schema) && !hasVariables(a.schema) && b.system.includes('{{v:name}}') && b.system.includes('starting numbers, in this order') && vars.every(v => v.min !== undefined && v.max !== undefined) && !JSON.stringify(parsed.spec.diagram.series ?? '').match(/[0-9]/))
    : identical;
  if (!ok) bad++;
  out.push({ tag: p.tag, refId: p.refId, seed, hasCalculation: calc, requestIdenticalToMvp3: identical, ok, schemaPropertiesAfter3: a.properties, schemaPropertiesAfter4: b.properties, variablesInSchema: hasVariables(b.schema), systemChars: { after3: a.system.length, after4: b.system.length }, variablesShown: vars });
}
fs.writeFileSync('dryrun.json', JSON.stringify(out, null, 1));
for (const [tag, block] of Object.entries(blocks)) fs.writeFileSync(`examples-block-${tag}.txt`, block);
for (const o of out) console.log(`${o.ok ? 'OK ' : 'BAD'} ${o.tag}: calculation ${o.hasCalculation} | identical to MVP3 ${o.requestIdenticalToMvp3} | schema properties ${o.schemaPropertiesAfter3} -> ${o.schemaPropertiesAfter4} (limit 362) | variables in schema ${o.variablesInSchema} | system ${o.systemChars.after3} -> ${o.systemChars.after4}`);
console.log(bad ? `FAILED: ${bad} of ${out.length}` : `all ${out.length} prompts ok; no provider call made`);
process.exit(bad ? 1 : 0);
