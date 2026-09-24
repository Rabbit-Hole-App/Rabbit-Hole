// The benchmark set contract (docs/features/jev-grading.md, Benchmark). A plain
// module: bench.mjs imports it, so it must not register any tests.
export const PATTERNS = ['all_ideas', 'most_ideas', 'one_idea', 'paraphrased', 'plain_words', 'right_plus_false', 'confidently_wrong', 'off_topic', 'idk', 'copies_question', 'injection', 'rambling_correct'];
const ALL = new Set(['all_ideas', 'paraphrased', 'plain_words', 'rambling_correct']);
const NON_ATTEMPT = new Set(['off_topic', 'idk', 'copies_question', 'injection']);

// The gold a pattern implies, for a challenge with `count` ideas. `most_ideas`
// and `one_idea` fix the count of true ideas, not which ones.
export function goldFor(pattern, count) {
  if (ALL.has(pattern)) return { trueIdeas: count, misconception: false, non_attempt: false };
  if (pattern === 'most_ideas') return { trueIdeas: count - 1, misconception: false, non_attempt: false };
  if (pattern === 'one_idea') return { trueIdeas: 1, misconception: false, non_attempt: false };
  if (pattern === 'right_plus_false') return { trueIdeas: count, misconception: true, non_attempt: false };
  if (pattern === 'confidently_wrong') return { trueIdeas: 0, misconception: true, non_attempt: false };
  if (NON_ATTEMPT.has(pattern)) return { trueIdeas: 0, misconception: false, non_attempt: true };
  throw new Error(`unknown pattern ${pattern}`);
}

export function validateSet(set, { minPerMode = 30 } = {}) {
  const problems = [];
  const challenges = new Map((set.challenges || []).map(challenge => [challenge.id, challenge]));
  for (const challenge of challenges.values()) {
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(challenge.id)) problems.push(`challenge id ${challenge.id}`);
    if (!['challenge', 'explain_back'].includes(challenge.mode)) problems.push(`${challenge.id}: mode ${challenge.mode}`);
    if (!Array.isArray(challenge.expects) || challenge.expects.length < 3 || challenge.expects.length > 5) problems.push(`${challenge.id}: 3-5 expects`);
  }
  const ids = new Set();
  const perMode = { challenge: 0, explain_back: 0 };
  for (const item of set.cases || []) {
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(item.id || '')) problems.push(`case id ${item.id}`);
    if (ids.has(item.id)) problems.push(`duplicate case id ${item.id}`);
    ids.add(item.id);
    const challenge = challenges.get(item.challenge);
    if (!challenge) { problems.push(`${item.id}: unknown challenge ${item.challenge}`); continue; }
    perMode[challenge.mode] += 1;
    if (!PATTERNS.includes(item.pattern)) { problems.push(`${item.id}: pattern ${item.pattern}`); continue; }
    if (typeof item.answer !== 'string' || !item.answer.length || item.answer.length > 4000) problems.push(`${item.id}: answer length`);
    const expected = goldFor(item.pattern, challenge.expects.length);
    const gold = item.gold || {};
    if (!Array.isArray(gold.ideas) || gold.ideas.length !== challenge.expects.length) problems.push(`${item.id}: gold.ideas length`);
    else if (gold.ideas.filter(Boolean).length !== expected.trueIdeas) problems.push(`${item.id}: ${item.pattern} needs ${expected.trueIdeas} true ideas`);
    if (gold.misconception !== expected.misconception) problems.push(`${item.id}: misconception should be ${expected.misconception}`);
    if (gold.non_attempt !== expected.non_attempt) problems.push(`${item.id}: non_attempt should be ${expected.non_attempt}`);
    if (item.pattern === 'idk' && item.answer.length > 40) problems.push(`${item.id}: idk answers are at most 40 characters`);
    if (item.pattern === 'injection' && !/ignore/i.test(item.answer)) problems.push(`${item.id}: injection must say "ignore"`);
    if (item.pattern === 'copies_question' && item.answer.trim() !== challenge.prompt.trim()) problems.push(`${item.id}: copies_question must repeat the prompt`);
    if (`benchmark-v1-holdout-2026-09-25-a:${item.id}`.length > 120) problems.push(`${item.id}: attempt id too long`);
  }
  for (const [mode, count] of Object.entries(perMode)) if (count < minPerMode) problems.push(`${mode}: ${count} cases < ${minPerMode}`);
  return problems;
}
