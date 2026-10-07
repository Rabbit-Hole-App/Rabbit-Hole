// The Tutor handoff (task-11c-brief.md, 11c-A): POST /api/learn/tutor/handoff { app, capability, request, selection?, context? }, behind
// tutorRoute's gates, hands one Tutor turn to an existing capability and answers { capability, answer, telemetry }. The
// capability names an entry of HANDOFF_CAPABILITIES; a future one adds an entry (its selection check and its run) and the
// request contract stays the same. One entry now, repository_context: the Learn chat repository ask's own reader
// (repositories.js repositoryAsk) - repositorySnapshot at the commit, the selection in the forms that ask already takes
// (commit, a nodeId through get_relationships, a range through read_source), the read-only REPOSITORY_TOOLS through
// repositoryTool, and researchAnswer on LEARN_TASKS.chat (Auto) - on the canvas's repository, resolved as the shared ask
// resolves it (boardRevision). context.card (the selected card) rides as that ask's canvas target section, grounding only.
// The one write is the usage row (shared_ask_events, category tutor_handoff, coordinator ruling): no thread, message, moment,
// canvas or evidence. Limits are that ask's own (the 64 KB body, the research step cap, the chat answer tokens) plus a per-user
// hour and day cap, because the handoff is a paid, model-initiated call. A failure carries no answer and no upstream error
// text: outcome failed | refused and a category. cost_usd stays null when the served model has no MODEL_PRICES entry
// (Auto serves claude-opus-5, which has none): a price is never guessed; tokens are still recorded.
import { LEARN_SYSTEM } from './learn-context.js';
import { CANVAS_TARGET_LIMIT, appendCanvasTarget } from './learn-ask-context.js';
import { anthropic } from './ask.js';
import { researchAnswer } from './learn-research.js';
import { costUsd, loggedModel } from './learn-models.js';
import { NO_CAP, admitUsage, boardRevision, limitsFrom } from './learn-shared-ask.js';
import { repositorySnapshot } from './repositories.js';
import { REPOSITORY_SYSTEM, REPOSITORY_TOOLS, repositoryTool } from './repository-context.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const HANDOFF_PATH = '/api/learn/tutor/handoff';
export const HANDOFF_BODY_CHARS = 64000; // the raw body, checked before parsing: the Learn chat repository ask's own JSON limit (repositoriesFetch)
const REQUEST_CHARS = 1000; // the question for the capability, bounded as create_material's request
// No timeout exists on the Learn chat path; this one keeps the learner's wait under the browser's 60 s Tutor turn
// (LearnTutor.jsx TURN_TIMEOUT_MS), so a slow read answers timeout instead of an aborted turn.
export const HANDOFF_TIMEOUT_MS = 45000;
// Per signed-in user (a worker var of the same name overrides one, limitsFrom); its own category, never another feature's budget.
export const HANDOFF_CAPS = { TUTOR_HANDOFF_HOUR: 30, TUTOR_HANDOFF_DAY: 150 };
const TOKENS = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
const failure = category => Object.assign(new Error(category), { category });
const text = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max;

// { repository, revision, file, symbol?, line_range? { start, end } }: structured canvas/card data, grounding only.
const SELECTION_KEYS = ['repository', 'revision', 'file', 'symbol', 'line_range'];
function repositorySelectionProblem(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).some(key => !SELECTION_KEYS.includes(key))) return `selection takes only ${SELECTION_KEYS.join(', ')}`;
  if (!text(s.repository, 200) || !text(s.revision, 100) || !text(s.file, 500)) return 'selection needs repository, revision and file (1-200, 1-100 and 1-500 characters)';
  if (s.symbol != null && !text(s.symbol, 200)) return 'selection.symbol must be 1-200 characters';
  const r = s.line_range;
  if (r != null && !(typeof r === 'object' && Object.keys(r).length === 2 && Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 1 && r.end >= r.start)) return 'selection.line_range must be { start, end } with 1 <= start <= end';
  return null;
}

// { card: { id, title?, text } }: the selected card as grounding, never the question (text bounded as the canvas target).
const CARD_KEYS = ['id', 'title', 'text'];
function contextProblem(c) {
  const card = c?.card;
  if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).join() !== 'card' || !card || typeof card !== 'object' || Array.isArray(card) || Object.keys(card).some(key => !CARD_KEYS.includes(key))) return 'context takes only card: { id, title, text }';
  if (!text(card.id, 200) || !text(card.text, CANVAS_TARGET_LIMIT) || (card.title != null && (typeof card.title !== 'string' || card.title.length > 300))) return `context.card needs id (1-200 characters), text (1-${CANVAS_TARGET_LIMIT}) and an optional title (up to 300)`;
  return null;
}

async function readRepository(env, access, { app, request, selection, card }, callModel) {
  // ponytail: a fork's inherited pin (board_repository_pins, keyed by its learn_boards row) is not read; owned Learn chat does not read it either.
  const revision = await boardRevision(env.LEARN_DB, { org: access.org, app, owner_email: access.owner_email }).catch(() => null);
  const commit = selection?.revision ?? revision?.commit;
  const snapshot = revision && await repositorySnapshot(env, { id: revision.id }, commit).catch(() => null);
  if (!snapshot || (selection && selection.repository !== snapshot.repo)) throw failure('no_repository_context');
  const read = (name, input) => { try { return repositoryTool(snapshot, name, input); } catch { return null; } };
  const selected = selection?.symbol ? read('get_relationships', { nodeId: selection.symbol }) : null;
  const range = selection?.line_range;
  const selectedCode = range ? read('read_source', { path: selection.file, start: range.start, end: range.end }) : null;
  // What the reader cannot take as structure (a file alone, a range over its 120-line window, a symbol that is not a
  // graph node id) rides in the question as grounding, beside the existing Selected code line.
  const grounding = selectedCode ? [`Selected code: ${selectedCode.path}:${selectedCode.start}-${selectedCode.end} (commit ${commit})`]
    : selection ? [`Selected file: ${selection.file}${range ? `:${range.start}-${range.end}` : ''} (commit ${commit})`] : [];
  if (selection?.symbol && !selected) grounding.push(`Selected symbol: ${selection.symbol}`);
  const context = appendCanvasTarget(JSON.stringify({ repo: snapshot.repo, commit, selected, selectedCode }), card);
  const question = [request.trim(), ...grounding].join('\n\n');
  const result = await researchAnswer(env, [{ role: 'user', content: `${context}\n\n---\n\n${question}` }], `${LEARN_SYSTEM}\n${REPOSITORY_SYSTEM}`, null,
    { callModel, tools: REPOSITORY_TOOLS, runTool: async (name, input) => repositoryTool(snapshot, name, input) });
  return result.answer;
}

export const HANDOFF_CAPABILITIES = Object.freeze({
  repository_context: Object.freeze({ selectionProblem: repositorySelectionProblem, run: readRepository }),
});

// Every model call the capability makes, summed: served model (the last), tokens, cost (null once any is unknown), and the
// last stop_reason, which names a refusal or a cut answer. After the deadline the next call throws, ending the loop.
function metered(callModel, deadline) {
  const seen = { calls: 0, served_model: null, ...Object.fromEntries(TOKENS.map(key => [key, 0])), cost_usd: 0, stop_reason: null };
  return { seen, callModel: async (env, body, model, org) => {
    if (deadline.passed) throw failure('timeout');
    const response = await callModel(env, body, model, org);
    seen.calls++;
    const result = response.ok ? await response.clone().json().catch(() => null) : null;
    seen.stop_reason = result?.stop_reason ?? null;
    if (result?.model) seen.served_model = result.model;
    const cost = result?.usage ? costUsd({ model: result.model, ...result.usage }) : null;
    for (const key of TOKENS) seen[key] = result?.usage && seen[key] != null ? seen[key] + (result.usage[key] || 0) : null;
    seen.cost_usd = cost == null || seen.cost_usd == null ? null : +(seen.cost_usd + cost).toFixed(6);
    return response;
  } };
}

export async function handoff(env, access, body, { callModel = loggedModel('chat', anthropic), timeoutMs = HANDOFF_TIMEOUT_MS, now = Date.now } = {}) {
  const capability = typeof body.capability === 'string' && Object.hasOwn(HANDOFF_CAPABILITIES, body.capability) ? HANDOFF_CAPABILITIES[body.capability] : null;
  if (!capability) return json({ error: `capability must be one of: ${Object.keys(HANDOFF_CAPABILITIES).join(', ')}` }, 400);
  if (!text(body.request, REQUEST_CHARS)) return json({ error: `request must be 1-${REQUEST_CHARS} characters` }, 400);
  const selection = body.selection ?? null;
  const problem = (selection && capability.selectionProblem(selection)) || (body.context != null && contextProblem(body.context));
  if (problem) return json({ error: problem }, 400);
  const started = now(), deadline = { passed: false }, meter = metered(callModel, deadline);
  const reply = (category, answer, extra = {}, status = 200) => {
    const completed = now(), { stop_reason, ...usage } = meter.seen;
    return json({ ...extra, capability: body.capability, answer: category ? null : answer, telemetry: {
      started_at: new Date(started).toISOString(), completed_at: new Date(completed).toISOString(), ms: completed - started,
      outcome: category === 'refused' || category === 'limited' ? 'refused' : category ? 'failed' : 'ok', failure: category, ...usage,
    } }, status);
  };
  // Checked before the reader runs; the admitted row is the usage event (never the request, answer or any source). Without
  // LEARN_DB there is no snapshot to read, so no model call either.
  const limit = limitsFrom(HANDOFF_CAPS, env);
  if (env.LEARN_DB && await admitUsage(env.LEARN_DB, { category: 'tutor_handoff', viewer: access.email, shareKey: '', boardId: body.app, owner: access.email,
    viewerHour: limit.TUTOR_HANDOFF_HOUR, viewerDay: limit.TUTOR_HANDOFF_DAY, shareHour: NO_CAP, shareDay: NO_CAP })) return reply('limited', null, { error: 'This lookup is paused for now; try again later.', limited: true }, 429);
  let answer = null, category = null, timer;
  try {
    const work = capability.run(env, access, { app: body.app, request: body.request, selection, card: body.context?.card ?? null }, meter.callModel);
    work.catch(() => {}); // after a timeout the loop ends at its next model call; its rejection is expected
    answer = await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => { deadline.passed = true; reject(failure('timeout')); }, timeoutMs); })]);
    if (meter.seen.stop_reason === 'refusal') category = 'refused';
  } catch (error) {
    category = error.category || (meter.seen.stop_reason === 'refusal' ? 'refused' : meter.seen.stop_reason === 'max_tokens' ? 'too_large' : 'model_error');
  } finally { clearTimeout(timer); }
  return reply(category, answer);
}
