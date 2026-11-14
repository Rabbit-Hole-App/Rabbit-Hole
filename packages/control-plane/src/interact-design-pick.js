// The pick (brief 13): ONE System One (JEV) call decides which registered scene family fits a prompt, or that none does (a gap, which goes to the Opus design). Same transport, model, timeout and credential
// name as explanation-planner.js. Any failure or timeout is a gap, logged as interact_pick_failed; the learner never sees it. The question is built from the registry: a family adds a criterion, not code.
import { INTERACT_FAMILIES } from './interact-families.js';
import { PLANNER_MODEL } from './explanation-planner.js';

export const PICK_TIMEOUT_MS = 1200, PICK_THRESHOLD = 0.7, NONE_CRITERION = 'Nothing above fits: another mechanism, a process with steps, a structure, a comparison, a grid of values, a network.';
const INSTRUCTIONS = 'Which scene would show the answer to this request? Judge by what the scene draws, not by the subject of the words.';

export const pickQuestions = (families = INTERACT_FAMILIES) => ({
  family: { type: 'choice', instructions: INSTRUCTIONS, criteria: { ...Object.fromEntries(families.map(f => [f.id, f.pickCriterion])), none: NONE_CRITERION } },
});

// -> { family: id | null, confidence, probabilities, ms, reason }. family is an id only when that family is the choice with confidence >= threshold; otherwise null ('gap').
export async function pickFamily(env, { request, depth }, { families = INTERACT_FAMILIES, threshold = PICK_THRESHOLD, fetchImpl = globalThis.fetch, timeoutMs = PICK_TIMEOUT_MS } = {}) {
  const started = Date.now(), gap = (reason, rest = {}) => ({ family: null, confidence: null, probabilities: null, ...rest, ms: Date.now() - started, reason });
  try {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', { method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-explain/1' },
      body: JSON.stringify({ model: PLANNER_MODEL, state: { request: String(request).slice(0, 2000), depth }, questions: pickQuestions(families) }) });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const answer = (await response.json())?.answers?.family;
    if (!answer || typeof answer.choice !== 'string' || typeof answer.confidence !== 'number') throw new Error('incomplete answers');
    const { choice, confidence, probabilities = null } = answer, rest = { confidence, probabilities };
    if (choice === 'none') return gap('none', rest);
    if (!families.some(f => f.id === choice)) return gap('unknown_choice', rest);
    return confidence >= threshold ? { family: choice, confidence, probabilities, ms: Date.now() - started, reason: 'fit' } : gap('below_threshold', rest);
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError' || /timeout|aborted/i.test(String(error?.message || ''));
    const reason = timedOut ? 'timeout' : String(error?.message || error).slice(0, 120);
    console.log(JSON.stringify({ event: 'interact_pick_failed', reason, timeout: timedOut, ms: Date.now() - started }));
    return gap(reason);
  }
}
