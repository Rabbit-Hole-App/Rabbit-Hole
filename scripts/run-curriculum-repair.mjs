// Exercise a real rejection/revision starting from an explicitly synthetic flawed candidate.
import { writeFileSync } from 'node:fs';
import { subscriptionGenerate, subscriptionEvaluate, EVALUATOR_PROMPT } from './curriculum-api.mjs';
import { runCurriculumWorkflow } from '../packages/control-plane/src/curriculum-workflow.js';
import { OUTLINE_SYSTEM, outlineMarkdown } from '../packages/control-plane/src/curriculum-outline.js';
import { CASES } from '../tests/evals/curriculum/cases.mjs';

const [id, outputBase] = process.argv.slice(2);
const fixture = CASES.find(c => c.id === id && c.split === 'development' && c.expected.verdict === 'revise');
if (!fixture || !outputBase) throw new Error('Usage: node scripts/run-curriculum-repair.mjs flawed-development-case-id output-base');
const trace = [];
const request = { seededFixture: id, input: fixture.input, initialCandidate: fixture.candidate,
  prompts: { generator: OUTLINE_SYSTEM, evaluator: EVALUATOR_PROMPT } };
writeFileSync(`${outputBase}.request.json`, JSON.stringify(request, null, 2) + '\n');
try {
  const result = await runCurriculumWorkflow(fixture.input, {
    generate: (input, revision) => revision ? subscriptionGenerate(input, revision)
      : Promise.resolve({ curriculum: structuredClone(fixture.candidate), model: 'synthetic-fixture', elapsedMs: 0 }),
    evaluate: subscriptionEvaluate,
    onEvent: event => {
      trace.push(event); writeFileSync(`${outputBase}.trace.json`, JSON.stringify(trace, null, 2) + '\n');
      if (event.phase === 'evaluation') console.log(`Candidate ${event.iteration}: ${event.evaluation.verdict}; ${event.evaluation.findings.filter(f => f.severity === 'blocking').length} blockers`);
    },
  });
  writeFileSync(`${outputBase}.json`, JSON.stringify({ ...request, ...result }, null, 2) + '\n');
  writeFileSync(`${outputBase}.md`, `Workflow status: **${result.status}**. Initial candidate was a synthetic fixture.\n\n` + outlineMarkdown(result.curriculum));
  console.log(JSON.stringify({ status: result.status, candidates: result.history.length, elapsedMs: result.elapsedMs }));
} catch (error) {
  writeFileSync(`${outputBase}.failure.json`, JSON.stringify({ error: error.message, providerError: error.providerError, history: error.history }, null, 2) + '\n');
  throw error;
}
