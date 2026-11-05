// The Slash Commands window's /practice example (owner 2026-11-05: the example shows the current Practice card, not the legacy one). A local,
// in-memory stand-in for the Explain-back store (explain-back-service.js) with only what the card reads: card(blockId) in the store's raw
// shape (serviceView reads it) and submit. Submit adds one attempt holding what was typed, already reviewed, whose feedback is the
// example's canned text (slash-sheet.js PREVIEWS.practice.feedback without its VERDICT line). Nothing is sent, saved, read or graded; no
// drafts, voice or recording store, so the card offers neither. attempts: the raw attempts so far; onChange(next) keeps them (React state).
export function practiceService({ attempts = [], onChange, feedback }) {
  const canned = String(feedback ?? '').replace(/^VERDICT:[^\n]*\n/, '').trim();
  return {
    app: 'slash-help', board: '',
    card: () => ({ attempts, draft: null }),
    submit: async ({ text = '', parentAttemptId = null }) => {
      const attemptId = `example-${attempts.length + 1}`;
      onChange([...attempts, {
        attemptId, submittedContent: { text: String(text), ...(parentAttemptId ? { baseline: { parentAttemptId } } : {}) },
        // Not rated: it is an example, not a grade of what was typed.
        assessment: { assessmentId: `${attemptId}-review`, status: 'completed', provenance: { review: { feedback: { revisit: { text: canned, citations: [] } } } } },
      }]);
    },
  };
}
