import katex from 'katex';

export const EQUATION_RESULT_LIMITS = Object.freeze({ latex: 4000, label: 120, assumptions: 4, assumption: 240, question: 240 });
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key));
const bounded = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const fail = error => ({ ok: false, error });

// Rendering compatibility only: a successful parse does not verify mathematics.
// Options match MathText's renderer bounds; generation additionally rejects errors.
export function validateEquationResult(input) {
  if (!keys(input, ['latex', 'label', 'assumptions', 'clarify'])) return fail('The equation response has an invalid structure.');
  if (Object.hasOwn(input, 'clarify')) {
    if (Object.keys(input).length !== 1 || !keys(input.clarify, ['question']) || !bounded(input.clarify.question, EQUATION_RESULT_LIMITS.question)) return fail('The equation clarification is invalid.');
    return { ok: true, result: { kind: 'clarify', question: input.clarify.question.trim() } };
  }
  if (!bounded(input.latex, EQUATION_RESULT_LIMITS.latex)) return fail('Provide LaTeX between 1 and 4000 characters.');
  if (Object.hasOwn(input, 'label') && !bounded(input.label, EQUATION_RESULT_LIMITS.label)) return fail('The equation label is too long or empty.');
  if (Object.hasOwn(input, 'assumptions') && (!Array.isArray(input.assumptions) || input.assumptions.length > EQUATION_RESULT_LIMITS.assumptions || input.assumptions.some(value => !bounded(value, EQUATION_RESULT_LIMITS.assumption)))) return fail('The equation assumptions are invalid.');
  const latex = input.latex.trim();
  let untrusted = false;
  try {
    katex.renderToString(latex, {
      displayMode: true, throwOnError: true, maxSize: 10, maxExpand: 1000,
      strict: 'ignore', output: 'htmlAndMathml',
      // Reject commands requiring trust, including commands expanded through macros.
      trust: () => { untrusted = true; return false; },
    });
  } catch {
    return fail('The LaTeX cannot be rendered by the current equation renderer.');
  }
  if (untrusted) return fail('External resources and HTML commands are not supported in equations.');
  return { ok: true, result: { kind: 'equation', latex, ...(input.label !== undefined ? { label: input.label.trim() } : {}), ...(input.assumptions !== undefined ? { assumptions: input.assumptions.map(value => value.trim()) } : {}) } };
}

// Authorization and one Undo transaction remain caller-owned. Match the complete
// frozen item so newer remote styling/position edits cannot be overwritten either.
export function previewEquationReplacement(result, { item, frozen, readOnly = false } = {}) {
  if (readOnly || item?.locked) return fail('This equation is read-only or locked.');
  if (!plain(item) || item.kind !== 'equation' || typeof item.id !== 'string' || !item.id || !plain(frozen) || JSON.stringify(item) !== JSON.stringify(frozen)) return fail('The equation changed. Request a new preview.');
  if (result?.kind !== 'equation' || !keys(result, ['kind', 'latex', 'label', 'assumptions'])) return fail('No valid equation replacement is available.');
  const { kind, ...candidate } = result;
  const checked = validateEquationResult(candidate);
  if (!checked.ok) return checked;
  return { ok: true, changes: item.latex === checked.result.latex ? [] : [{ id: item.id, list: 'items', before: item, after: { ...item, latex: checked.result.latex } }] };
}
