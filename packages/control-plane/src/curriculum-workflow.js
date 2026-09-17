import { validateOutline } from './curriculum-outline.js';
import { validateEvaluation } from './curriculum-evaluator.js';

// Initial candidate plus two revisions. The model cannot extend this budget.
export const MAX_CANDIDATES = 3;

export async function runCurriculumWorkflow(input, { generate, evaluate, onEvent = () => {} }) {
  const history = [];
  const startedAt = Date.now();
  let curriculum;
  try {
    for (let iteration = 1; iteration <= MAX_CANDIDATES; iteration++) {
      const previous = history.at(-1);
      const generated = await generate(structuredClone(input), previous ? {
        candidate: structuredClone(previous.curriculum), feedback: structuredClone(previous.evaluation),
      } : null);
      curriculum = validateOutline(generated.curriculum);
      const { curriculum: _candidate, ...generation } = generated;
      const entry = { iteration, curriculum, generation };
      history.push(entry);
      onEvent({ phase: 'candidate', ...entry });
      const reviewed = await evaluate(structuredClone(input), structuredClone(curriculum), {
        iteration, previousFindings: structuredClone(previous?.evaluation.findings || []),
      });
      const { evaluation, ...evaluationCall } = reviewed;
      // Preserve the returned review in the trace even when its verdict is inconsistent.
      onEvent({ phase: 'review_received', iteration, evaluation, evaluationCall });
      entry.evaluation = validateEvaluation(evaluation, previous?.evaluation.findings || []);
      entry.evaluationCall = evaluationCall;
      onEvent({ phase: 'evaluation', iteration, evaluation: entry.evaluation });
      if (entry.evaluation.verdict !== 'revise') return {
        curriculum, status: entry.evaluation.verdict, history, elapsedMs: Date.now() - startedAt,
      };
    }
    return { curriculum, status: 'exhausted', history, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    error.history = history;
    onEvent({ phase: 'error', message: error.message, history });
    throw error;
  }
}
