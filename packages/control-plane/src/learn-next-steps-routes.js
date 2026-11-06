// Professor Next Steps routes (docs/features/professor-next-steps.md §1.5, §2.3). Owned: POST /api/learn/tutor/next-steps,
// a reply reused per one-way hash of its planning context (ownedCacheKey), capped per user (category tutor_next_steps, never the
// shared-ask budget). The browser builds the input from the learner's own state; it is checked, never trusted for limits.
// Shared: POST /api/learn/boards/shared/<token>/next-steps (learn-boards.js), the input built here from the shared board.
import { sha256Hex } from './learn-grade-jev.js';
import { NO_CAP, admitUsage, limitsFrom, sharedAskLimits } from './learn-shared-ask.js';
import { journeyCallModel, planNextSteps } from './learn-next-steps-planner.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { authorizedBoardApp } from './learn-board.js';
import { spendCallModel } from './learn-spend.js';
import { NEXT_STEPS_LIMITS as L, NEXT_STEPS_PLANNER_VERSION, capText, mintSet, nextStepsInputProblem, topicOf, trimToFit, withRepository } from './agents/learn-next-steps.js';
import { NOT_TRASHED } from './library-trash.js';
import { repositorySnapshot } from './repositories.js';
import { repositoryTool } from './repository-context.js';
import { resolveTarget } from '../../web/src/learn-target.js';
import { inputSummary } from '../../web/src/learn-next-steps.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
// Per signed-in user, an hour and a day; a worker var of the same name overrides one (limitsFrom, as the shared ask).
export const NEXT_STEPS_CAPS = { TUTOR_NEXT_STEPS_HOUR: 60, TUTOR_NEXT_STEPS_DAY: 300 };
export const NEXT_STEPS_PATH = '/api/learn/tutor/next-steps';
export const NEXT_STEPS_BODY_CHARS = 16000; // the raw request body, checked before parsing (ownedNextStepsRoute)
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

// Owner task 2 (professor-next-steps.md 2.8): the cache identity is the planning context - the user and canvas (isolation),
// the planner version, the whole input (its basis, canvas content and semantic fingerprint, scope and previous hooks) and a
// Refresh operation's id (r1, r2, ... per basis: the browser reuses one on a retry, so a retry never pays twice, and moves to
// the next only after a Refresh landed, so a Refresh never gets the reply it replaces). A one-way hash, never the values.
const REFRESH = /^r[0-9]{1,4}$/;
const refreshProblem = body => (body?.refresh !== undefined && !(typeof body.refresh === 'string' && REFRESH.test(body.refresh)) ? json({ error: 'refresh must be r and 1-4 digits' }, 400) : null);
// repository: the canvas's repository and the commit its digest is read at (repo-graph Release 1), so a new commit is a new
// entry; absent for a canvas with none, which keeps every earlier key.
export const ownedCacheKey = async (access, body, version = NEXT_STEPS_PLANNER_VERSION, repository = null) =>
  `${ORIGIN}/owned/${await sha256Hex(JSON.stringify([access.user_id || access.email, body.app, version, body.refresh ?? null, body.input, ...(repository ? [repository] : [])]))}`;

// The canvas's repository for Curious (repo-graph Release 1, brief section 10): a repository Main canvas is its own row
// (repositoryAccess already checked the owner); a project canvas reads its project's row under projectRepository's rule
// (canvases.js): the caller's own, in this workspace, not in Trash. Never a name the browser sent. null: no repository.
export async function curiousRepository(env, access) {
  if (access?.kind === 'repository') return access;
  if (!access?.project) return null;
  return env.LEARN_DB.prepare(`SELECT * FROM repository_apps r WHERE r.org=? AND r.name=? AND r.owner_email=? AND ${NOT_TRASHED('r.org', 'r.name')}`).bind(access.org, access.project, access.email).first().catch(() => null);
}

// The bounded per-commit digest Curious reads: a README excerpt and the most connected files and symbols (get_repo_overview's
// degree order). ponytail: an in-isolate performance memo of 32 digests, never storage - a cold isolate reads the snapshot again.
export const DIGEST_LIMITS = Object.freeze({ readme: 1500, files: 8, symbols: 12, label: 100, memo: 32 });
const digests = new Map();
export async function repositoryDigest(env, row, { load = repositorySnapshot } = {}) {
  const memo = `${row.id}@${row.commit_sha}`;
  if (digests.has(memo)) return digests.get(memo);
  const snapshot = await load(env, row, row.commit_sha);
  const { symbols } = repositoryTool(snapshot, 'get_repo_overview');
  // The shallowest README (the repository's own before a package's).
  const readme = Object.keys(snapshot.files).filter(path => /(^|\/)readme(\.\w+)?$/i.test(path)).sort((a, b) => a.split('/').length - b.split('/').length)[0];
  const digest = {
    repo: row.repo, commit: row.commit_sha,
    ...(readme ? { readme: capText(snapshot.files[readme], DIGEST_LIMITS.readme) } : {}),
    files: [...new Set(symbols.map(node => node.path).filter(Boolean))].slice(0, DIGEST_LIMITS.files).map(path => capText(path, DIGEST_LIMITS.label)),
    symbols: symbols.slice(0, DIGEST_LIMITS.symbols).map(node => capText(node.label, DIGEST_LIMITS.label)),
  };
  digests.set(memo, digest);
  if (digests.size > DIGEST_LIMITS.memo) digests.delete(digests.keys().next().value);
  return digest;
}
// Nothing on the canvas to plan from but the repository: no cards, no drawn objects, no scope.
const blank = input => !input.canvas?.blocks?.length && !input.canvas?.objects?.length && !Object.keys(input.scope?.claims || {}).length && !Object.keys(input.scope?.concepts || {}).length;
const UNREAD = 'Suggestions for this repository follow once its code has been read.';

// A HookSet plus the planner telemetry (TutorDecisionEvent input, never shown); reason_internal never leaves (mintSet
// keeps only the hook and its step). A cache hit was paid for once, so it reports no usage (ruling F13).
// repositoryOf and loadSnapshot: test seams for curiousRepository and the R2 snapshot read.
export async function ownedNextSteps(env, access, body, { callModel, cache = globalThis.caches?.default, repositoryOf = null, loadSnapshot = null } = {}) {
  if (!env.LEARN_DB) return json({ error: 'Next steps need the Learn database on this worker.' }, 503);
  const problem = nextStepsInputProblem(body?.input); // shape, limits (12000 characters) and forbidden keys
  if (problem) return json({ error: problem }, 400);
  if (refreshProblem(body)) return refreshProblem(body);
  // repo-graph Release 1: a canvas with a repository plans with its digest; one not read yet (queued, indexing, failed, or a
  // snapshot that will not load) is never invented - with nothing else on the canvas there is nothing to plan from (409).
  const repository = await (repositoryOf || curiousRepository)(env, access);
  const key = await ownedCacheKey(access, body, NEXT_STEPS_PLANNER_VERSION, repository ? `${repository.id}@${repository.commit_sha || repository.status}` : null);
  const hit = await nextStepsReply(cache, key);
  if (hit) return json({ ...hit, telemetry: { ...hit.telemetry, cached: true, calls: 0, usage: NO_USAGE, cost_usd: 0 } });
  let input = body.input, digest = null;
  if (repository) {
    digest = repository.commit_sha ? await repositoryDigest(env, repository, loadSnapshot ? { load: loadSnapshot } : {}).catch(() => null) : null;
    if (!digest && blank(input)) return json({ error: UNREAD, repository: 'unread' }, 409);
    input = withRepository(input, digest || { repo: repository.repo, status: 'unread' });
  }
  const limit = limitsFrom(NEXT_STEPS_CAPS, env);
  const refused = await admitUsage(env.LEARN_DB, { category: 'tutor_next_steps', viewer: access.email, shareKey: '', boardId: body.app, owner: access.email, viewerHour: limit.TUTOR_NEXT_STEPS_HOUR, viewerDay: limit.TUTOR_NEXT_STEPS_DAY, shareHour: NO_CAP, shareDay: NO_CAP });
  if (refused) return json({ error: 'Next steps are paused for now; try again later.', limited: true }, 429);
  let planned;
  try { planned = await planNextSteps(env, input, callModel ? { callModel } : {}); } catch (error) { return failed(env, error, { scope: 'owned', userId: access.user_id, board: body.app }); }
  const set = { ...mintSet(planned.options, input), telemetry: { ...planned.telemetry, cached: false } };
  // A snapshot that failed to load at an indexed commit is not kept under that commit's key: the next ask reads it again.
  if (!(repository?.commit_sha && !digest)) await keepReply(cache, key, set);
  await keepTelemetry(env.LEARN_DB, { scope: 'owned', userId: access.user_id, board: body.app, telemetry: set.telemetry });
  return json(set);
}

// POST /api/learn/tutor/next-steps, mounted in dev-worker.js: the gates every paid Tutor-family route runs (it was served inside
// learn-tutor-routes.js tutorRoute until the Tutor cleanup P1): POST only, the raw body bounded before parsing, the board
// authorized, same-origin, the subscription owner's refusal, then the model call under spend admission (category
// tutor_next_steps). null for any other path. deps: authorize, callModel (tests).
export async function ownedNextStepsRoute(path, req, env, deps = {}) {
  if (path !== NEXT_STEPS_PATH) return null;
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  const raw = await req.text();
  if (raw.length > NEXT_STEPS_BODY_CHARS) return json({ error: `the request body must be at most ${NEXT_STEPS_BODY_CHARS} characters` }, 400);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body?.app, body?.pending || null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  return ownedNextSteps(env, access, body, { ...deps, callModel: spendCallModel(env, access, 'tutor_next_steps', deps.callModel || journeyCallModel(env)) });
}

// The shared input (contract §2.1, owner correction 1 and the twelfth message, rulings F14, F15): the shared board's lesson
// blocks only (chat cards live in state.exchanges and are never read; a journey stamp on a block is never read), the board
// title and the selected card as data. Tutor cleanup P1: no claims, courses or evidence states - the scope is empty, as a plain
// canvas's, and no goal is inferred. A chat card origin reads as the root (it is not content): one input and one cache entry.
// key and version make the basis. The blocks are the 20 newest, the selected card kept in the oldest place when it is older. The
// input_chars cap is Task 7's (trimToFit) on the board alone: the selected card ranks above every other card, then the newest.
// { input, trim: { before, after, trimmed } } with { chars, block_count, claim_count } in before and after and the counts trimmed
// (beside the input, never in it), or { problem: 'input_too_large' }.
const ROOT = ':root';
const contentOrigin = (state, origin) => (!origin?.root && (state?.blocks || []).some(block => block?.id === origin.id) ? origin.id : ROOT);
export function sharedInput(state, { origin, key = '', version = null, title = '' }) {
  const lessons = state?.blocks || [], at = contentOrigin(state, origin);
  const nameOf = block => capText(block.title || block.question || block.prompt || block.text, L.block_title);
  const selected = at === ROOT ? null : lessons.find(block => block?.id === at);
  const newest = lessons.slice(-L.blocks), window = selected && !newest.includes(selected) ? [selected, ...newest.slice(1)] : newest;
  const scope = { concepts: {}, claims: {} };
  const input = {
    mode: 'shared', basis: `${key}:${version}:${at}`,
    canvas: {
      title: capText(title, L.block_title), selected: selected ? { id: selected.id, title: nameOf(selected) } : null,
      blocks: window.map(block => ({ id: block.id, kind: capText(block.type, 40), title: nameOf(block), concept_ids: [], claim_ids: [], practice: null })),
    },
    scope, recent: { intent: null, transitions: [], modalities: [], practice: [] }, previous: { hooks: [], goals: [] }, constraints: { learner: [] },
  };
  const last = window.at(-1)?.id;
  const count = () => ({ chars: JSON.stringify(input).length, block_count: input.canvas.blocks.length, claim_count: 0 });
  const before = count();
  const problem = trimToFit(input, { rank: b => (selected && b.id === selected.id ? 3 : b.id === last ? 1 : 0) });
  if (problem) return { problem };
  const after = count();
  return { input, trim: { before, after, trimmed: { block_count: before.block_count - after.block_count, claim_count: 0 } } };
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
// edge cache, a miss admitted under the share link's caps with no viewer (viewer_email ''). All under shared_canvas_hooks, never
// the shared-ask budget. (A signed-in viewer's own evidence states, body.viewer_states, are no longer read: Tutor cleanup P1.) An input the cap cannot fit (input_too_large), or over input_refuse, is refused before the cache, the limiter or the
// planner. A request without generate: true (a view) is answered from the content cache or idle, never generated (owner
// priority 1, 2026-10-21). row: the shared learn_boards row; state: its parsed board; title: sharedTitle's; viewer: the signed-in { email } or
// null; origin: originOf's.
export async function sharedNextSteps(env, { row, state, title, key, viewer, origin, body }, { callModel, cache = globalThis.caches?.default } = {}) {
  const options = { origin, key, version: row.version, title };
  const { input: content, trim: contentTrim, problem: tooLarge } = sharedInput(state, options);
  // The cap's own refusal, then the hard 12000 check as a backstop; neither reaches the cache, the limiter or the planner.
  const problem = tooLarge || nextStepsInputProblem({ ...content, mode: 'canvas' });
  if (problem) return json({ error: problem }, 400);
  if (refreshProblem(body)) return refreshProblem(body);
  // Task 14 A-I1: the personal subscription serves its owner alone, as on the shared ask (askShared): its 403 after the request
  // checks and before the cache, the limiter and the planner. An anonymous viewer is never the owner, even with no owner email
  // set (email null never equals an unset SUBSCRIPTION_OWNER_EMAIL).
  const ownerRefused = subscriptionOwnerRefusal(env, viewer || { email: null });
  if (ownerRefused) return ownerRefused;
  const input = content;
  // A Refresh (owner task 2) is its own entry: the same id on a retry, the next id only after one landed.
  const fingerprint = await titleFingerprint(title), cacheKey = `${ORIGIN}/shared/${encodeURIComponent(content.basis)}/${fingerprint}${body?.refresh ? `/${body.refresh}` : ''}`;
  // Owner priority 1 (2026-10-21, "/b Next steps charging credits automatically"): a view (opening or reloading the link,
  // selecting a card) only reads the saved content-only set; with none it is idle. Only the signed-in viewer's explicit ask
  // (generate: true) reaches the limiter and the planner.
  const generate = body?.generate === true;
  const hit = await nextStepsReply(cache, cacheKey);
  if (hit) return json({ ...hit, telemetry: { ...hit.telemetry, cached: true, calls: 0, usage: NO_USAGE, cost_usd: 0 } });
  if (!generate) return json({ idle: true });
  const limit = sharedAskLimits(env);
  const refused = await admitUsage(env.LEARN_DB, { category: 'shared_canvas_hooks', viewer: '', shareKey: key, boardId: row.id, owner: row.owner_email,
    viewerHour: NO_CAP, viewerDay: NO_CAP, shareHour: limit.SHARED_ASK_SHARE_HOUR, shareDay: limit.SHARED_ASK_SHARE_DAY });
  if (refused) return json({ error: 'Next steps are paused for now; try again later.', limited: true }, 429);
  let planned;
  try { planned = await planNextSteps(env, input, callModel ? { callModel } : {}); } catch (error) { return failed(env, error, { scope: 'shared', userId: viewer?.userId, board: key }); }
  // The reply telemetry (Ruling F11) carries the trim counts beside the set (owner sixth message 4), never in the model input.
  const set = { ...mintSet(planned.options, input, { source: { share_version: row.version, origin_block_id: contentOrigin(state, origin), title_fingerprint: fingerprint } }), telemetry: { ...planned.telemetry, cached: false, share_key: key, summary: inputSummary(input), trim: contentTrim } };
  await keepReply(cache, cacheKey, set);
  await keepTelemetry(env.LEARN_DB, { scope: 'shared', userId: viewer?.userId, board: key, telemetry: set.telemetry });
  return json(set);
}
