import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { subscriptionEvaluate, EVALUATOR_PROMPT } from './curriculum-api.mjs';
import { validateEvaluation } from '../packages/control-plane/src/curriculum-evaluator.js';
import { validateOutline, validateOutlineRequest } from '../packages/control-plane/src/curriculum-outline.js';
import { CASES, evaluatorInput } from '../tests/evals/curriculum/cases.mjs';

const [selection, outputFile] = process.argv.slice(2);
const selected = CASES.filter(c => selection === 'all' || c.split === selection || c.id === selection);
if (!selected.length || !outputFile) throw new Error('Usage: node scripts/calibrate-curriculum-evaluator.mjs development|holdout|all|case-id output.json');
const report = { evaluatorPrompt: EVALUATOR_PROMPT,
  corpusSha256: createHash('sha256').update(readFileSync(new URL('../tests/evals/curriculum/cases.mjs', import.meta.url))).digest('hex'),
  selection, startedAt: new Date().toISOString(), results: [] };
writeFileSync(outputFile, JSON.stringify(report, null, 2) + '\n');
// Two independent reviews at a time keep this small subscription experiment bounded.
for (let i = 0; i < selected.length; i += 2) {
  const batch = await Promise.allSettled(selected.slice(i, i + 2).map(async c => {
    const { input, candidate, reviewContext } = evaluatorInput(c);
    validateOutline(candidate); validateOutlineRequest(input);
    try {
      const raw = await subscriptionEvaluate(input, candidate, reviewContext);
      const evaluation = validateEvaluation(raw.evaluation);
      console.log(`${c.id}: ${evaluation.verdict}; ${evaluation.findings.filter(f => f.severity === 'blocking').length} blockers`);
      return { ...c, ...raw, evaluation };
    } catch (error) {
      console.log(`${c.id}: ERROR ${error.message}`);
      return { ...c, error: error.message, providerError: error.providerError };
    }
  }));
  batch.forEach((result, index) => {
    report.results.push(result.status === 'fulfilled' ? result.value : { id: selected[i + index].id, error: String(result.reason) });
  });
  writeFileSync(outputFile, JSON.stringify(report, null, 2) + '\n');
}
report.finishedAt = new Date().toISOString();
writeFileSync(outputFile, JSON.stringify(report, null, 2) + '\n');
if (report.results.some(r => r.error)) process.exitCode = 1;
