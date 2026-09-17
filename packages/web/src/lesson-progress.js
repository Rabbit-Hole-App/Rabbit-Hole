export function lessonProgressKey(app, lessonId, sourceVersion) {
  // Never fall back to the owner's email: every learner has their own attempts.
  if (!app.email) return null;
  return `small.lesson-progress:${JSON.stringify([app.org, app.email, app.name, sourceVersion, lessonId])}`;
}

export function checkEncoding(value) {
  const cleaned = value.trim().replace(/^\[\s*([\d\s,]+)\s*\]$/, '$1');
  if (!/^\d+(?:(?:\s*,\s*|\s+)\d+)*$/.test(cleaned)) return { valid: false };
  const ids = cleaned.split(/[\s,]+/).map(Number);
  if (ids.length !== 4) return { valid: false };
  return { valid: true, correct: ids.every((id, i) => id === [2, 3, 4, 0][i]), ids };
}

export function addEncodingAttempt(previous, response, now = Date.now()) {
  const score = checkEncoding(response);
  if (!score.valid) throw new Error('Enter four integer IDs, separated by commas or spaces.');
  const old = previous.encoding;
  const attempt = { number: (old?.count || 0) + 1, response: score.ids, correct: score.correct,
    revealedBeforeAnswer: !!old, at: now, checkId: 'encode-text', objectiveId: 'represent-text' };
  return { ...previous, encoding: { count: attempt.number, first: old?.first || attempt,
    last: attempt, everCorrect: !!old?.everCorrect || score.correct } };
}
