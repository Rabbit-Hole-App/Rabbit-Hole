// packages/control-plane/src/learn-journey.js
// The Learning Journey Orchestrator route (docs/features/adaptive-learning-path-v1-architecture.md §6, §7.1, §9, §10):
//   GET  /api/learn/journey?app=&board=   -> { journey, path, tray }
//   POST /api/learn/journey { app, board, action, revision?, ... } -> { journey, path, tray } | { error } (400/403/409/502)
// The pure state machine (web/src/learn-journey.js journeyStep) decides every transition; this route loads, steps, saves
// and runs the planner effect the step asks for, synchronously. A step that waits on a planner is saved with `pending`
// first (another tab gets 409, a reload shows busy), then the planner's result is stepped and saved. A planner failure is
// stepped as planner_failed: same state, answers kept, a retryable error, 502 - never cards, never the artifact route.
// Only the journey's owner reads or writes it: the scope is (org, owner_email, app, board) of the signed-in account on an
// app it may open (§10.2). The learner's words are never logged; start stores them once, through createJourney.
import { authorizedBoardApp } from './learn-board.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { journeyIntent } from './learner-intent-journey.js';
import { TRAY_MODES, journeyStep, nextIntakeQuestion, nextProbe, slotsFromIntent, trayFor, validateRegistry } from '../../web/src/learn-journey.js';
import { JourneyConflict, appendPathVersion, archiveJourney, createJourney, loadJourney, loadPath, saveJourney, toClient } from './learn-journey-store.js';
import { PlannerInvalid, adaptPath, journeyCallModel, planDiagnostic, planPath, planSection, resolveWithModel } from './learn-journey-planners.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const BOARD = /^[A-Za-z0-9 _.-]{1,100}$/; // learn-boards.js board names
const STARTS = new Set(['learning_journey', 'focused_skill', 'quick_overview', 'fast_start']);
const ASK_TOPIC = { id: 'clarification:topic', mode: 'clarification', prompt: 'What do you want to learn?', options: [], free_text: true, dismissible: true };
const SKIP = { intake: 'intake_skip', diagnostic: 'diagnostic_skip' }; // cancel on a tray step is that step's skip
// A planner call this old that never reported back (the worker was cancelled mid-call, e.g. by a reload) counts as failed,
// or `pending` would block the journey forever: only retry clears it.
const STALE_MS = 3 * 60 * 1000;
const QUICK_SECTIONS = 3; // AT-14: a quick overview's path
const FAILED = 'The planner failed. Try again.';
const EVENTS = {
  intake_skip: () => ({ type: 'intake_skip' }),
  diagnostic_skip: () => ({ type: 'diagnostic_skip' }),
  path_edit: b => ({ type: 'path_edit', text: b.text }),
  section_materialized: b => ({ type: 'section_materialized', section_id: b.section_id, heading_block_id: b.heading_block_id }),
  retry: () => ({ type: 'retry' }),
};

// The trust boundary: what the browser sends is checked here, before anything is stepped, saved or sent to a model.
const sized = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
// An intake answer is an option of the open question q, or goal's free text; anything else would be saved as the slot's
// default, so it is refused. The slot, when given, must be q's.
const badAnswer = (q, b) => (b.slot ?? q.slot) !== q.slot || (b.option_id == null && b.text == null)
  || (b.option_id != null && (typeof b.option_id !== 'string' || !q.options.some(o => o.id === b.option_id)))
  || (b.text != null && (q.slot !== 'goal' || !sized(b.text, 300)));
// resolve sends the tray to a paid model: only a §7.1-shaped tray, bounded.
const goodTray = t => t != null && typeof t === 'object' && typeof t.prompt === 'string' && t.prompt.length <= 300 && (t.mode == null || TRAY_MODES.includes(t.mode))
  && (t.options == null || (Array.isArray(t.options) && t.options.length <= 6 && t.options.every(o => sized(o?.id, 40) && sized(o?.label, 120))));

// Only a planner's own verdicts reach the learner: a rejected plan, or the model's HTTP failure (modelFailure's message).
// Anything else is internal: the generic message, and one log line with ids only (never learner text).
function plannerMessage(error, journeyId, op) {
  if (error instanceof PlannerInvalid || /\(model HTTP \d{3}/.test(error?.message)) return error.message;
  console.error(JSON.stringify({ event: 'learn_journey_planner_error', journey_id: journeyId, op, error: error?.name || 'Error' }));
  return FAILED;
}

// Planner `states`: per registry claim, a derived state plus settled counts, never a score. Conservative: understood only
// for a settled transfer pass that covers the claim's ideas with no later settled negative; any other evidence is uncertain.
// ponytail: local derivation (no misconception / prerequisite_gap); Task 7 swaps in the registry-aware deriveClaimStates
// once R6 lifts and learn-tutor-evidence.js takes the journey's claims.
const negative = e => e.result === 'fail' || e.result === 'misconception';
function claimStates(j) {
  const events = j.evidence?.events || [];
  return Object.fromEntries(Object.entries(j.registry?.claims || {}).map(([id, claim]) => {
    const own = events.filter(e => e.claim === id), settled = own.filter(e => e.settled), passes = settled.filter(e => e.result === 'pass');
    const transfer = passes.filter(e => e.kind === 'demonstrated_in_transfer').at(-1);
    const covered = passes.some(e => e.idea == null) || claim.ideas.every((_, i) => passes.some(e => e.idea === i));
    const understood = transfer && covered && !settled.some(e => e.seq > transfer.seq && negative(e));
    return [id, { state: understood ? 'understood' : own.length ? 'uncertain' : 'not_yet_observed', settled_passes: passes.length, settled_negatives: settled.filter(negative).length }];
  }));
}

// The walker's reading of the open probe (§6.3), from the evidence the evaluate route stored for it: the events tagged with
// its id, else the events on its claims after its ask point (the seq recorded on the previous asked entry). A partial
// answer reads as its negative: the walker steps down rather than up on mixed evidence.
function probeResult(j, probe) {
  const events = j.evidence?.events || [], tagged = events.filter(e => e.ref?.probe_id === probe.id);
  const from = j.diagnostic.asked?.at(-1)?.seq ?? 0;
  const own = tagged.length ? tagged : events.filter(e => !e.ref?.probe_id && e.seq > from && probe.claims.includes(e.claim));
  const settled = own.filter(e => e.settled), any = test => settled.some(test);
  if (!own.length) return 'error';
  if (any(e => e.result === 'non_attempt')) return 'non_attempt';
  if (any(negative)) return 'fail';
  if (any(e => e.result === 'gap')) return 'gap';
  if (any(e => e.result === 'pass' && e.kind === 'demonstrated_in_transfer')) return 'settled_transfer';
  return any(e => e.result === 'pass') ? 'pass' : 'uncertain';
}

const current = (path, id) => ({ ...path, current_section_id: id, sections: path.sections.map(s => (s.id === id ? { ...s, status: 'current' } : s)) });
const must = step => { if (step.error) throw new Error(step.error); return step; };

// A drafted or revised path: the server sets version and change.source, stamps grounding and intake_ref, and merges
// concepts_added into the registry (new ids only: an existing concept or claim is never overwritten). path_drafted and the
// path row are one atomic write; a fast start's draft is accepted at once, its first section current in this version.
async function drafted(env, j, out, source, prev = null) {
  const added = out.concepts_added || {};
  const registry = { concepts: { ...added.concepts, ...j.registry.concepts }, claims: { ...added.claims, ...j.registry.claims } };
  const checked = validateRegistry(registry, { prev: j.registry, events: j.evidence.events });
  if (!checked.ok) throw new PlannerInvalid(prev ? 'journey_adapt' : 'journey_path', checked.errors);
  const version = (prev?.version ?? 0) + 1;
  const path = { ...out.path, version, grounding: j.grounding, intake_ref: { journey_revision: j.revision }, change: { ...out.path.change, source } };
  const step = must(journeyStep({ ...j, registry }, { type: 'path_drafted', version, path }));
  const id = step.journey.active_section_id;
  const { journey } = await appendPathVersion(env, step.journey, id ? current(path, id) : path, j.revision);
  return { journey, effects: step.effects };
}

async function stepped(env, j, event, revision) {
  const step = must(journeyStep(j, event));
  return { journey: await saveJourney(env, step.journey, revision), effects: step.effects };
}

// journeyStep's effects (§6.6). Each runs one planner on the saved journey j and returns the next saved journey.
const EFFECTS = {
  async plan_diagnostic(env, j, callModel) {
    const out = await planDiagnostic(env, { topic: j.request.topic, intake: j.intake, grounding: j.grounding }, { callModel });
    const diagnostic = { probes: out.probes, asked: [], skipped: false, ...(out.background ? { background: out.background } : {}) };
    return stepped(env, { ...j, registry: out.registry, diagnostic }, { type: 'diagnostic_ready' }, j.revision);
  },
  // A draft rests on all the evidence so far: before a path exists, that is the diagnostic's. A quick overview's draft is
  // capped (the planner rejects a longer one).
  async plan_path(env, j, callModel) {
    const quick = (j.request.intent?.kind ?? j.request.intent) === 'quick_overview';
    const input = { topic: j.request.topic, intake: j.intake, states: claimStates(j), constraints: j.constraints, pending_edits: j.pending_edits, registry: j.registry,
      diagnostic_evidence_refs: j.evidence.events.map(e => e.seq), ...(quick ? { max_sections: QUICK_SECTIONS } : {}) };
    return drafted(env, j, await planPath(env, input, { callModel }), 'draft');
  },
  async revise_path(env, j, callModel) {
    const prev = await loadPath(env, j.id);
    const out = await adaptPath(env, { prev, edit: j.pending_edits.join('\n'), registry: j.registry, states: claimStates(j) }, { callModel });
    return drafted(env, j, out, 'learner_edit', prev);
  },
  // R5: only the current section gets a SectionPlan.
  async plan_section(env, j, callModel) {
    const path = await loadPath(env, j.id), section = path.sections.find(s => s.id === j.active_section_id);
    const plan = await planSection(env, { path, section, registry: j.registry, states: claimStates(j) }, { callModel });
    return stepped(env, { ...j, section_plan: plan }, { type: 'section_planned' }, j.revision);
  },
};

// The response: the browser copy of the journey (no answer keys), its current path with the materialized heading of the
// current section (kept on the journey row, not in a path version) so pathEntries can show it, and the tray.
async function reply(env, j, status = 200, extra = {}) {
  let path = j?.path_version ? await loadPath(env, j.id) : null;
  const tray = trayFor(j, path, j?.state === 'diagnostic' ? { probe: nextProbe(j.diagnostic) } : {});
  const heading = j?.section_plan?.heading_block_id;
  if (path && heading) path = { ...path, sections: path.sections.map(s => (s.id === j.active_section_id ? { ...s, heading_block_id: heading } : s)) };
  return json({ ...extra, journey: j && toClient(j), path, tray }, status);
}

// Runs the effect chain from a saved journey. A planner failure is saved as planner_failed and answered 502.
async function run(env, j, effects, callModel) {
  while (effects.length) {
    let next;
    try { next = await EFFECTS[effects[0]](env, j, callModel); }
    catch (error) {
      if (error instanceof JourneyConflict) throw error;
      const message = plannerMessage(error, j.id, j.pending);
      const failed = must(journeyStep(j, { type: 'planner_failed', message }));
      return reply(env, await saveJourney(env, failed.journey, j.revision), 502, { error: message });
    }
    ({ journey: j, effects } = next);
  }
  return reply(env, j);
}

async function live(env, scope, now) {
  const j = await loadJourney(env, scope);
  if (!j?.pending || now() - Date.parse(j.updated_at) < STALE_MS) return j;
  const failed = must(journeyStep(j, { type: 'planner_failed', message: 'The planner did not finish.' }));
  return saveJourney(env, failed.journey, j.revision).catch(error => { if (error instanceof JourneyConflict) return loadJourney(env, scope); throw error; });
}

async function start(env, scope, body, callModel) {
  const { text } = body;
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) return json({ error: 'text must be 1-4000 characters' }, 400);
  const intent = journeyIntent(text);
  if (!STARTS.has(intent.kind)) return json({ error: 'not_a_learning_journey' }, 400);
  if (!intent.topic) return json({ error: 'topic_required', tray: ASK_TOPIC }, 400);
  const request = { raw_user_message: text, topic: intent.topic, intent, channel: body.channel === 'voice' ? 'voice' : 'text' };
  let j;
  try { j = await createJourney(env, scope, { request, grounding: { kind: 'topic' }, intake: slotsFromIntent(intent) }); }
  catch (error) { if (error instanceof JourneyConflict) return reply(env, await loadJourney(env, scope), 409, { error: 'live_journey' }); throw error; }
  if (intent.kind !== 'fast_start') return reply(env, j);
  // A fast start skips the intake at once: defaults, then the path draft, auto-accept and section 1's plan.
  const { journey, effects } = await stepped(env, j, { type: 'intake_skip' }, j.revision);
  return run(env, journey, effects, callModel);
}

async function act(env, scope, body, callModel, now) {
  const j = await live(env, scope, now);
  if (!j) return json({ error: 'no_journey', journey: null }, 409);
  if (body.revision != null && body.revision !== j.revision) return reply(env, j, 409, { error: 'revision' });
  const refuse = step => reply(env, j, 409, { error: step.error });
  // The learner starts another topic on this board (§6.1 continue-or-start): the live journey is archived, read-only for
  // good, and the board has none until the next start.
  if (body.action === 'archive') { await archiveJourney(env, j); return json({ journey: null, path: null, tray: null }); }
  if (body.action === 'accept') {
    // Section 1 becomes current in a new version with only that status change, then only it is planned.
    const path = await loadPath(env, j.id), step = journeyStep(j, { type: 'accept', path });
    if (step.error) return refuse(step);
    const next = { ...current(path, step.journey.active_section_id), version: path.version + 1, change: { source: 'learner_edit', reason: 'accepted', evidence_refs: [], sections_changed: [] } };
    return run(env, (await appendPathVersion(env, step.journey, next, j.revision)).journey, step.effects, callModel);
  }
  let step;
  if (body.action === 'probe_advance') {
    const probe = j.diagnostic.probes.find(p => p.id === body.probe_id);
    step = journeyStep(j, { type: 'probe_result', probe_id: body.probe_id, result: probe ? probeResult(j, probe) : 'error' });
    // The ask point of the next probe: evidence after this seq belongs to it.
    if (step.journey) step.journey.diagnostic.asked = step.journey.diagnostic.asked.map((a, i, all) => (i === all.length - 1 ? { ...a, seq: j.evidence.seq } : a));
  } else if (body.action === 'intake_answer') {
    const q = j.state === 'intake' ? nextIntakeQuestion(j.intake) : null; // outside intake, journeyStep refuses it (409)
    if (q && badAnswer(q, body)) return json({ error: 'invalid_answer' }, 400);
    step = journeyStep(j, { type: 'intake_answer', slot: body.slot ?? q?.slot, answer: { option_id: body.option_id, text: body.text } });
  } else {
    if (body.action === 'path_edit' && !sized(body.text, 300)) return json({ error: 'text must be 1-300 characters' }, 400);
    const type = body.action === 'cancel' ? SKIP[j.state] ?? 'cancel' : null;
    step = journeyStep(j, type ? { type } : EVENTS[body.action](body));
  }
  if (step.error) return refuse(step);
  return run(env, await saveJourney(env, step.journey, j.revision), step.effects, callModel);
}

const ACTIONS = new Set(['start', 'resolve', 'accept', 'probe_advance', 'intake_answer', 'cancel', 'archive', ...Object.keys(EVENTS)]);

export async function journeyRoute(path, req, env, deps = {}) {
  if (path !== '/api/learn/journey') return null;
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'GET or POST required' }, 405);
  let body;
  if (req.method === 'GET') {
    const query = new URL(req.url).searchParams;
    body = { app: query.get('app'), board: query.get('board') };
  } else {
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON' }, 400);
  }
  const access = await (deps.authorize || authorizedBoardApp)(req, env, body.app, null);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  if (typeof body.board !== 'string' || !BOARD.test(body.board)) return json({ error: 'Board name must be 1-100 letters, digits, spaces, dots, dashes or underscores' }, 400);
  // LP1 journeys live on canvases only; repository-grounded journeys are LP-T.
  if (access.kind !== 'canvas') return req.method === 'GET' ? json({ journey: null, path: null, tray: null }) : json({ error: 'journeys_on_canvases_only' }, 400);
  const scope = { org: access.org, owner_email: access.email, app: body.app, board: body.board };
  const callModel = deps.callModel || journeyCallModel(env), now = deps.now || Date.now;
  try {
    if (req.method === 'GET') return reply(env, await live(env, scope, now));
    if (!ACTIONS.has(body.action)) return json({ error: `Unknown action ${String(body.action).slice(0, 40)}` }, 400);
    if (body.action === 'start') return await start(env, scope, body, callModel);
    if (body.action === 'resolve') {
      if (!sized(body.text, 1000)) return json({ error: 'text must be 1-1000 characters' }, 400);
      if (!goodTray(body.tray)) return json({ error: 'tray must be the open tray: a prompt of at most 300 characters, at most 6 { id, label } options, a tray mode' }, 400);
      try { return json(await resolveWithModel(env, { text: body.text, tray: body.tray }, { callModel })); } catch (error) { return json({ error: plannerMessage(error, null, 'resolve') }, 502); }
    }
    return await act(env, scope, body, callModel, now);
  } catch (error) {
    // Another tab (or a stale-call recovery) moved the journey between our load and our write.
    if (error instanceof JourneyConflict) return reply(env, await loadJourney(env, scope), 409, { error: error.code });
    throw error;
  }
}
