// Professor Next Steps routes (docs/features/professor-next-steps.md §1.5, §2.3). Owned: POST /api/learn/tutor/next-steps,
// a reply reused per one-way hash of (user, canvas, basis), capped per user (category tutor_next_steps, never the
// shared-ask budget). The browser builds the input from the learner's own state; it is checked, never trusted for limits.
// Shared: POST /api/learn/boards/shared/<token>/next-steps (learn-boards.js), the input built here from the shared board.
import { sha256Hex } from './learn-grade-jev.js';
import { NO_CAP, admitUsage, limitsFrom, sharedAskLimits } from './learn-shared-ask.js';
import { planNextSteps } from './learn-journey-planners.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { NEXT_STEPS_LIMITS as L, capText, mintSet, nextStepsInputProblem, nextStepsScope, topicOf, trimToFit } from './agents/learn-next-steps.js';
import { TUTOR_DOMAINS } from '../../web/src/learn-tutor-domains.js';
import { resolveTarget } from '../../web/src/learn-target.js';
import { STATES } from '../../web/src/learn-tutor-evidence.js';
import { inputSummary } from '../../web/src/learn-tutor-trace.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
// Per signed-in user, an hour and a day; a worker var of the same name overrides one (limitsFrom, as the shared ask).
export const NEXT_STEPS_CAPS = { TUTOR_NEXT_STEPS_HOUR: 60, TUTOR_NEXT_STEPS_DAY: 300 };
export const NEXT_STEPS_BODY_CHARS = 16000; // the raw request body, checked before parsing (learn-tutor-routes.js)
const ORIGIN = 'https://next-steps.small.internal';
const NO_USAGE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

// Best effort, as learn-captions.js: a cache failure never costs the reply.
export async function nextStepsReply(cache, key) { try { const hit = await cache?.match(key); return hit ? await hit.json() : null; } catch { return null; } }
export async function keepReply(cache, key, value) { try { await cache?.put(key, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } })); } catch { /* best effort */ } }
// Owner 2026-10-08 (learn-migrations/0012): each planned set's telemetry is kept for the planner evaluation (escalation
// reasons and rule names, latency, models, usage, cost), never the hooks or the input. Best effort, as keepReply.
// ponytail: rows are never pruned, as shared_ask_events; prune or roll up when an evaluation reads them.
export async function keepTelemetry(db, { scope, userId, board, telemetry }) {
  try { await db.prepare('INSERT INTO next_steps_telemetry (created_at, scope, user_id, board, telemetry_json) VALUES (?, ?, ?, ?, ?)').bind(new Date().toISOString(), scope, userId || null, String(board), JSON.stringify(telemetry)).run(); } catch { /* best effort */ }
}
// A planner failure answers 502 with its message; a failed escalation's telemetry (failed: true) is kept like a planned set's.
const failed = async (env, error, row) => { if (error.telemetry) await keepTelemetry(env.LEARN_DB, { ...row, telemetry: { ...error.telemetry, cached: false } }); return json({ error: error.message }, 502); };

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
  try { planned = await planNextSteps(env, body.input, callModel ? { callModel } : {}); } catch (error) { return failed(env, error, { scope: 'owned', userId: access.user_id, board: body.app }); }
  const set = { ...mintSet(planned.options, body.input), telemetry: { ...planned.telemetry, cached: false } };
  await keepReply(cache, key, set);
  await keepTelemetry(env.LEARN_DB, { scope: 'owned', userId: access.user_id, board: body.app, telemetry: set.telemetry });
  return json(set);
}


// The shared input (contract §2.1, owner correction 1 and the twelfth message, rulings F14, F15): the shared board's lesson
// blocks only (chat cards live in state.exchanges and are never read; a journey stamp on a block is never read), the board
// title and the selected card as data, and the claims of public registered courses those blocks show, through the one scope
// builder, selected card first. No goal is inferred. A chat card origin reads as the root (it is not content): one input and
// one cache entry. key and version make the basis. The blocks are the 20 newest, the selected card kept in the oldest place
// when it is older. The input_chars cap is Task 7's (trimToFit) on the board alone: essential are the selected card's claims
// (at the root, or for a card naming none, the first claim, as the owned input) and the selected card ranks above every other
// card, the cards naming an essential claim next. A signed-in viewer's own states (already filtered) are laid on the kept
// scope after it, so generation and Start Rabbit Hole read the same trimmed scope, and a state is never longer than
// not_yet_observed, so the cap holds. { input, trim: { before, after, trimmed } } with { chars, block_count, claim_count } in
// before and after and the counts trimmed (beside the input, never in it), or { problem: 'input_too_large' }.
const PUBLIC = () => TUTOR_DOMAINS.filter(entry => entry.domain && entry.capabilities?.suppliedCourse === true);
const ROOT = ':root';
const contentOrigin = (state, origin) => (!origin?.root && (state?.blocks || []).some(block => block?.id === origin.id) ? origin.id : ROOT);
export function sharedInput(state, { origin, key = '', version = null, title = '', viewerStates = null }) {
  const lessons = state?.blocks || [], courses = PUBLIC(), at = contentOrigin(state, origin);
  const claims = Object.assign({}, ...courses.map(entry => entry.domain.claims)), concepts = Object.assign({}, ...courses.map(entry => entry.domain.concepts));
  const claimsAt = t => [...new Set(courses.flatMap(entry => entry.domain.targetClaims({ card_id: t.card_id, part_id: t.part_id, selected_object: t.selected_object, concept_ids: t.concept_ids })))];
  const nameOf = block => capText(block.title || block.question || block.prompt || block.text, L.block_title);
  const selected = at === ROOT ? null : lessons.find(block => block?.id === at);
  const newest = lessons.slice(-L.blocks), window = selected && !newest.includes(selected) ? [selected, ...newest.slice(1)] : newest;
  const shown = window.map(block => { const t = resolveTarget(block); return { block, t, ids: claimsAt(t) }; });
  const first = selected ? claimsAt(resolveTarget(selected)) : [];
  const order = [...first, ...shown.flatMap(b => b.ids)];
  const scope = nextStepsScope({ claims, concepts, order, presented: order });
  const input = {
    mode: 'shared', basis: `${key}:${version}:${at}`,
    canvas: {
      title: capText(title, L.block_title), selected: selected ? { id: selected.id, title: nameOf(selected) } : null,
      blocks: shown.map(({ block, ids, t }) => ({ id: block.id, kind: capText(block.type, 40), title: nameOf(block),
        concept_ids: t.concept_ids.filter(c => Object.hasOwn(scope.concepts, c)).slice(0, L.ids), claim_ids: ids.filter(id => Object.hasOwn(scope.claims, id)).slice(0, L.ids), practice: null })),
    },
    scope, recent: { intent: null, transitions: [], modalities: [], practice: [] }, previous: { hooks: [], goals: [] }, constraints: { learner: [] },
  };
  const essential = new Set(first.length ? first : Object.keys(scope.claims).slice(0, 1)), last = window.at(-1)?.id;
  const count = () => ({ chars: JSON.stringify(input).length, block_count: input.canvas.blocks.length, claim_count: Object.keys(scope.claims).length });
  const before = count();
  const problem = trimToFit(input, { essential, rank: b => (selected && b.id === selected.id ? 3 : b.claim_ids.some(id => essential.has(id)) ? 2 : b.claim_ids.length || b.id === last ? 1 : 0) });
  if (problem) return { problem };
  for (const [id, s] of Object.entries(viewerStates || {})) if (Object.hasOwn(scope.claims, id)) scope.claims[id].state = s;
  const after = count();
  return { input, trim: { before, after, trimmed: { block_count: before.block_count - after.block_count, claim_count: before.claim_count - after.claim_count } } };
}
// The one-way fingerprint of a shared board's title: in the content cache key and in each shared step's source, so a rename
// without a version bump is a new cache entry and a stale hook (409), as a version change is. Never the title itself.
export const titleFingerprint = title => sha256Hex(title);
// What a returned shared step may carry (twelfth message): the ids and topic (ruling F2) of the same trimmed input that
// generation read, rebuilt from the board as it is (another version is already 409 stale_hook), and its origin as the
// steps name it. options: sharedInput's (origin, key, version, title). A board too large for any input never minted a step:
// its empty ids refuse every step that names one.
export function sharedStepIds(state, options) {
  const { input } = sharedInput(state, options), origin = contentOrigin(state, options.origin);
  if (!input) return { claims: new Set(), concepts: new Set(), topic: '', origin };
  return { claims: new Set(Object.keys(input.scope.claims)), concepts: new Set(Object.keys(input.scope.concepts)), topic: topicOf(input), origin };
}

// Shared canvases (contract §1.5, §2.3; owner correction 9; ruling F7). Anonymous, or signed in without evidence: one
// content-only reply per (one-way share key, board version, origin card or :root, one-way hash of the board title) from the
// edge cache, a miss admitted under the share link's caps with no viewer (viewer_email ''). Signed in with evidence
// (body.viewer_states, filtered to the server scope; not_yet_observed is no evidence): never cached, never served to anyone
// else, capped per viewer and per share link and billed to the viewer. All under shared_canvas_hooks, never the shared-ask
// budget. An input the cap cannot fit (input_too_large), or over input_refuse, is refused before the cache, the limiter or the
// planner. row: the shared learn_boards row; state: its parsed board; title: sharedTitle's; viewer: the signed-in { email } or
// null; origin: originOf's.
export async function sharedNextSteps(env, { row, state, title, key, viewer, origin, body }, { callModel, cache = globalThis.caches?.default } = {}) {
  const options = { origin, key, version: row.version, title };
  const { input: content, trim: contentTrim, problem: tooLarge } = sharedInput(state, options);
  // The cap's own refusal, then the hard 12000 check as a backstop; neither reaches the cache, the limiter or the planner.
  const problem = tooLarge || nextStepsInputProblem({ ...content, mode: 'canvas' });
  if (problem) return json({ error: problem }, 400);
  // Task 14 A-I1: the personal subscription serves its owner alone, as on the shared ask (askShared): its 403 after the request
  // checks and before the cache, the limiter and the planner. An anonymous viewer is never the owner, even with no owner email
  // set (email null never equals an unset SUBSCRIPTION_OWNER_EMAIL).
  const ownerRefused = subscriptionOwnerRefusal(env, viewer || { email: null });
  if (ownerRefused) return ownerRefused;
  const asked = viewer && body?.viewer_states && typeof body.viewer_states === 'object' && !Array.isArray(body.viewer_states) ? body.viewer_states : {};
  const own = Object.entries(asked).filter(([id, s]) => Object.hasOwn(content.scope.claims, id) && STATES.includes(s) && s !== 'not_yet_observed').slice(0, L.scope_claims);
  const personal = own.length ? Object.fromEntries(own) : null;
  const input = personal ? sharedInput(state, { ...options, viewerStates: personal }).input : content;
  const fingerprint = await titleFingerprint(title), cacheKey = `${ORIGIN}/shared/${encodeURIComponent(content.basis)}/${fingerprint}`;
  if (!personal) {
    const hit = await nextStepsReply(cache, cacheKey);
    if (hit) return json({ ...hit, telemetry: { ...hit.telemetry, cached: true, calls: 0, usage: NO_USAGE, cost_usd: 0 } });
  }
  const limit = sharedAskLimits(env);
  const refused = await admitUsage(env.LEARN_DB, { category: 'shared_canvas_hooks', viewer: personal ? viewer.email : '', shareKey: key, boardId: row.id, owner: row.owner_email,
    viewerHour: personal ? limit.SHARED_ASK_VIEWER_HOUR : NO_CAP, viewerDay: personal ? limit.SHARED_ASK_VIEWER_DAY : NO_CAP, shareHour: limit.SHARED_ASK_SHARE_HOUR, shareDay: limit.SHARED_ASK_SHARE_DAY });
  if (refused) return json({ error: 'Next steps are paused for now; try again later.', limited: true }, 429);
  let planned;
  try { planned = await planNextSteps(env, input, callModel ? { callModel } : {}); } catch (error) { return failed(env, error, { scope: 'shared', userId: viewer?.userId, board: key }); }
  // The reply telemetry (Ruling F11) carries the trim counts beside the set (owner sixth message 4), never in the model input.
  const set = { ...mintSet(planned.options, input, { source: { share_version: row.version, origin_block_id: contentOrigin(state, origin), title_fingerprint: fingerprint } }), telemetry: { ...planned.telemetry, cached: false, share_key: key, summary: inputSummary(input), trim: contentTrim } };
  if (!personal) await keepReply(cache, cacheKey, set);
  await keepTelemetry(env.LEARN_DB, { scope: 'shared', userId: viewer?.userId, board: key, telemetry: set.telemetry });
  return json(set);
}
