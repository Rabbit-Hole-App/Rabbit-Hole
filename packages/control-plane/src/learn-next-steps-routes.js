// Professor Next Steps routes (docs/features/professor-next-steps.md §1.5, §2.3). Owned: POST /api/learn/tutor/next-steps,
// a reply reused per one-way hash of (user, canvas, basis), capped per user (category tutor_next_steps, never the
// shared-ask budget). The browser builds the input from the learner's own state; it is checked, never trusted for limits.
import { sha256Hex } from './learn-grade-jev.js';
import { NO_CAP, admitUsage, limitsFrom } from './learn-shared-ask.js';
import { planNextSteps } from './learn-journey-planners.js';
import { mintSet, nextStepsInputProblem } from './agents/learn-next-steps.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
// Per signed-in user, an hour and a day; a worker var of the same name overrides one (limitsFrom, as the shared ask).
export const NEXT_STEPS_CAPS = { TUTOR_NEXT_STEPS_HOUR: 60, TUTOR_NEXT_STEPS_DAY: 300 };
export const NEXT_STEPS_BODY_CHARS = 16000; // the raw request body, checked before parsing (learn-tutor-routes.js)
const ORIGIN = 'https://next-steps.small.internal';
const NO_USAGE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

// Best effort, as learn-captions.js: a cache failure never costs the reply.
export async function nextStepsReply(cache, key) { try { const hit = await cache?.match(key); return hit ? await hit.json() : null; } catch { return null; } }
export async function keepReply(cache, key, value) { try { await cache?.put(key, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })); } catch { /* best effort */ } }

// A HookSet plus the planner telemetry (TutorDecisionEvent input, never shown); reason_internal never leaves (mintSet
// keeps only the hook and its step). A cache hit was paid for once, so it reports no usage (ruling F13).
export async function ownedNextSteps(env, access, body, { callModel, cache = globalThis.caches?.default } = {}) {
  if (!env.LEARN_DB) return json({ error: 'Next steps need the Learn database on this worker.' }, 503);
  const problem = nextStepsInputProblem(body?.input); // shape, limits (12000 characters) and forbidden keys
  if (problem) return json({ error: problem }, 400);
  const key = `${ORIGIN}/owned/${await sha256Hex(`${access.user_id || access.email}|${body.app}|${body.input.basis}`)}`;
  const hit = await nextStepsReply(cache, key);
  if (hit) return json({ ...hit, telemetry: { ...hit.telemetry, cached: true, calls: 0, usage: NO_USAGE, cost_usd: 0 } });
  const limit = limitsFrom(NEXT_STEPS_CAPS, env);
  const refused = await admitUsage(env.LEARN_DB, { category: 'tutor_next_steps', viewer: access.email, shareKey: '', boardId: body.app, owner: access.email, viewerHour: limit.TUTOR_NEXT_STEPS_HOUR, viewerDay: limit.TUTOR_NEXT_STEPS_DAY, shareHour: NO_CAP, shareDay: NO_CAP });
  if (refused) return json({ error: 'Next steps are paused for now; try again later.', limited: true }, 429);
  let planned;
  try { planned = await planNextSteps(env, body.input, callModel ? { callModel } : {}); } catch (error) { return json({ error: error.message }, 502); }
  const set = { ...mintSet(planned.options, body.input), telemetry: { ...planned.telemetry, cached: false } };
  await keepReply(cache, key, set);
  return json(set);
}
