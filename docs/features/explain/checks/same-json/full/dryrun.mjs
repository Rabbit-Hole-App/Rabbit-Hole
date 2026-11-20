// Same-JSON full build dry run, NO provider call: for the five declared references, each by its own first prompt at Brief, Balanced and Detailed (a plan of the reference's kind, the request seed of the first ask):
// the Gemini answer schema property count (limit 362), whether it carries the variables list (only a reference with a function does), the examples block as sent (written to examples-block-<tag>-<depth>.txt).
// usage: node dryrun.mjs <branchRoot> [plan.json]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [root, planFile = 'plan.json'] = process.argv.slice(2);
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const imp = p => import(pathToFileURL(`${root}/packages/${p}`).href);
const [art, pl, fc] = await Promise.all([imp('control-plane/src/learn-artifact.js'), imp('control-plane/src/explanation-planner.js'), imp('control-plane/src/explanation-fast-chain.js')]);
const env = { SMALL_ENV: 'dev', EXPLANATION_MODEL_PROFILE: 'google-low', EXPLANATION_PLANNER: 'jev', EXPLANATION_INTERACTIONS: 'true', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', TYPESAFE_API_KEY: 'x' };
const kindOf = { 'top-k': 'bar-chart', 'softmax-probabilities': 'bar-chart', 'regression-mean-baseline': 'coordinate-plot', 'confusion-matrix-counts': 'heatmap', 'ml-self-attention-token-links': 'token-links' };
const answers = kind => ({ visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 }, needsPlot: { noul: 0.1 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.05 } });
const hasVariables = o => (o && typeof o === 'object') ? ('variables' in (o.properties ?? {})) || Object.values(o).some(hasVariables) : false;
const log = console.log; const rows = []; let bad = 0;
for (const tag of Object.keys(kindOf)) for (const depth of ['brief', 'balanced', 'detailed']) {
  const item = plan.items.find(i => i.tag === tag && i.depth === depth && i.rep === 1 && i.set === 'full');
  console.log = () => {};
  let prepared, sent;
  try {
    const input = art.planWithReferenceKind({ command: 'explanation', args: item.prompt, selection: null, context: null, depth, requestSeed: `bench-${item.idx}-1`, plan: pl.planFromAnswers(answers(kindOf[tag]), depth) });
    prepared = art.prepareArtifactAuthorRequest(env, input);
    sent = fc.stepRequest({ provider: 'google', model: 'gemini-dry' }, 'low', prepared.body);
  } finally { console.log = log; }
  const schema = sent.response_format.json_schema.schema, props = fc.schemaProperties(schema), sys = sent.messages[0].content;
  const at = sys.indexOf('\n# Examples\n'), end = sys.indexOf('\n# Output format', at), block = sys.slice(at, end > at ? end : undefined);
  fs.writeFileSync(`examples-block-${tag}-${depth}.txt`, block);
  const ref = prepared.diagramReferences.find(r => !r.shape && !r.seededExample), fn = typeof ref?.calculation?.run === 'function';
  const row = { tag, depth, reference: ref?.id, declared: Boolean(ref?.calculation), withFunction: fn, schemaProperties: props, variablesInSchema: hasVariables(schema), numberRuleNew: sys.includes('build a small worked example of your own'), startingNumbers: /starting numbers, in this order/.test(sys), noMention: sys.includes('Do not mention these starting numbers in the card.'), calcSentence: sys.includes('{{v:name}}') };
  row.ok = row.declared && props <= 362 && row.variablesInSchema === fn && row.numberRuleNew && row.startingNumbers && row.noMention && row.calcSentence === fn;
  if (!row.ok) bad++;
  rows.push(row);
}
fs.writeFileSync('dryrun.json', JSON.stringify(rows, null, 1));
for (const r of rows) console.log(`${r.ok ? 'OK ' : 'BAD'} ${r.tag} ${r.depth}: declared ${r.declared}, function ${r.withFunction}, answer schema ${r.schemaProperties} properties, variables in schema ${r.variablesInSchema}`);
console.log(bad ? `FAILED ${bad}` : `all ${rows.length} requests ok; max schema properties ${Math.max(...rows.map(r => r.schemaProperties))}; no provider call made`);
process.exit(bad ? 1 : 0);
