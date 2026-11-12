import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PARAPHRASE_DEPTHS = Object.freeze(['brief', 'balanced', 'detailed']);
const THRESHOLD = 0.8;
const rate = cases => ({ hits: cases.filter(row => row.firstPick).length, total: cases.length, firstPickRate: cases.filter(row => row.firstPick).length / cases.length });

/** Every replay uses the coverage path, including its planner and fixture mask. */
export async function runParaphraseReplay({ prompts, planner, selectAtDepth, select, fixture = false, topic = 'decision-trees', context = '' } = {}) {
  if (typeof planner !== 'function') throw new Error('Paraphrase replay requires an explicit planner function');
  if (!Array.isArray(prompts) || !prompts.length) throw new Error('Paraphrase replay requires a nonempty prompts array');
  for (const prompt of prompts) {
    if (!prompt || typeof prompt.prompt !== 'string' || !prompt.prompt.trim()) throw new Error('Each replay prompt needs its original prompt text');
    if (typeof prompt.referenceId !== 'string' || !prompt.referenceId.trim()) throw new Error(`Prompt ${prompt.id ?? '?'} requires an expected referenceId`);
    if (!Array.isArray(prompt.paraphrases) || prompt.paraphrases.length !== 5 ||
      prompt.paraphrases.some(text => typeof text !== 'string' || !text.trim()) || new Set(prompt.paraphrases.map(text => text.trim().toLowerCase())).size !== 5) {
      throw new Error(`Prompt ${prompt.id ?? '?'} requires exactly five distinct supplied paraphrases`);
    }
  }
  const selectCoverage = selectAtDepth ?? select ?? (await import('../coverage.mjs')).selectAtDepth;
  if (typeof selectCoverage !== 'function') throw new Error('Paraphrase replay requires a coverage selectAtDepth function');
  const results = [], allCases = [];
  for (const prompt of prompts) {
    const cases = [];
    for (const paraphrase of prompt.paraphrases) {
      for (const depth of PARAPHRASE_DEPTHS) {
        const selection = await selectCoverage({ prompt: paraphrase, depth, planner, fixture, topic, context });
        if (!Array.isArray(selection?.references) || !Array.isArray(selection.plannedKinds) || !Array.isArray(selection.requiredKinds)) {
          throw new Error('Coverage selection must return references, plannedKinds and requiredKinds arrays');
        }
        const firstReferenceId = selection.references[0]?.id ?? null;
        const firstReference = selection.references[0]?.sourceId ?? firstReferenceId;
        cases.push({
          paraphrase, depth, firstReference, firstReferenceId, firstPick: firstReference === prompt.referenceId,
          references: selection.references.map(reference => reference.id), plannedKinds: selection.plannedKinds,
          requiredKinds: selection.requiredKinds, steer: selection.steer ?? null,
        });
      }
    }
    allCases.push(...cases);
    results.push({ id: prompt.id, prompt: prompt.prompt, referenceId: prompt.referenceId, ...rate(cases),
      byDepth: PARAPHRASE_DEPTHS.map(depth => ({ depth, ...rate(cases.filter(row => row.depth === depth)) })), cases });
  }
  const totals = rate(allCases);
  return {
    version: 1, topic, fixture, threshold: THRESHOLD, ...totals, passed: totals.firstPickRate >= THRESHOLD,
    byDepth: PARAPHRASE_DEPTHS.map(depth => ({ depth, ...rate(allCases.filter(row => row.depth === depth)) })), prompts: results,
  };
}

async function main(args) {
  let input, configFile, outFile, topic, fixture = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--config') configFile = args[++index];
    else if (arg === '--out') outFile = args[++index];
    else if (arg === '--topic') topic = args[++index];
    else if (arg === '--fixture') fixture = true;
    else if (!arg.startsWith('-') && !input) input = arg;
    else throw new Error(`Unknown paraphrase-replay argument: ${arg}`);
  }
  if (!input || !configFile) throw new Error('Usage: node checks/paraphrase-replay.mjs <paraphrases.json> --config <config.local.json> [--out <report.json>] [--topic NN] [--fixture]');
  const data = JSON.parse(await readFile(resolve(input), 'utf8'));
  const [{ loadConfig }, { createPlanner }] = await Promise.all([import('../config.mjs'), import('../planner.mjs')]);
  const config = await loadConfig(configFile), planner = await createPlanner(config);
  const result = await runParaphraseReplay({ prompts: Array.isArray(data) ? data : data.prompts, planner,
    topic: topic ?? data.topic ?? 'decision-trees', fixture, context: data.context ?? '' });
  const output = resolve(outFile ?? join(dirname(resolve(input)), 'paraphrase-replay.json'));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(`${result.hits}/${result.total} first picks (${(result.firstPickRate * 100).toFixed(1)}%) ${result.passed ? 'PASS' : 'FAIL'}`);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(() => { console.error('Paraphrase replay failed. Check the configured inputs.'); process.exitCode = 1; });
}
