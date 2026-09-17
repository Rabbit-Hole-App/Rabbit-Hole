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

// Page 3 prefix-target: positions 1-4 of Hello, choices are characters.
export const PREFIX_PAIRS = [
  { position: 1, prefix: 'H', target: 'e' },
  { position: 2, prefix: 'He', target: 'l' },
  { position: 3, prefix: 'Hel', target: 'l' },
  { position: 4, prefix: 'Hell', target: 'o' },
];

export function addPrefixAttempt(previous, position, choice, now = Date.now()) {
  const pair = PREFIX_PAIRS.find(item => item.position === position);
  if (!pair) throw new Error('Choose a position between 1 and 4.');
  const old = previous.prefixTarget;
  const attempt = { number: (old?.count || 0) + 1, position, choice, correct: choice === pair.target,
    revealedBeforeAnswer: !!old, at: now, checkId: 'prefix-target', objectiveId: 'predict-next' };
  return { ...previous, prefixTarget: { count: attempt.number, first: old?.first || attempt,
    last: attempt, everCorrect: !!old?.everCorrect || attempt.correct } };
}

// Page 4 generation-weights: yes/no; the correct answer is no.
export function addGenerationAttempt(previous, choice, now = Date.now()) {
  if (!['yes', 'no'].includes(choice)) throw new Error('Choose Yes or No.');
  const old = previous.generationWeights;
  const attempt = { number: (old?.count || 0) + 1, choice, correct: choice === 'no',
    revealedBeforeAnswer: !!old, at: now, checkId: 'generation-weights', objectiveId: 'training-vs-generation' };
  return { ...previous, generationWeights: { count: attempt.number, first: old?.first || attempt,
    last: attempt, everCorrect: !!old?.everCorrect || attempt.correct } };
}
