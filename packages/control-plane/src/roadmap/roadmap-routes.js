// R4 routes (contracts/api.md): /api/learn/roadmap/*. NOT MOUNTED: the Lead mounts roadmapRoute(path, req, env, deps) beside explainRoute in the Learn
// worker (dev-worker.js, exact patch in the hand-back). Behind ROADMAP_ENABLED: unset or not 'true', every roadmap route answers 404 as if absent
// before anything else is read, and the feedback and Depth routes are untouched. Owner-only, same origin, server-built access object.
import { repositoryIdentity } from '../repositories.js';
import { refusalBody } from '../learn-spend-ledger.js';
import { StateError, ERROR_CODES, conflictReply } from './roadmap-contract.js';
import { acceptPlan, acceptRoadmapStep, acknowledgeDelivery, createRoadmap, readEntitledResult, readRoadmap, readResult } from './roadmap-store.js';
import { bindTutorThread, cancelProposal, endRoadmap, markResultRemoved, markResultRestored, proposeNextStep, retakeUnreadyOffer, setMode } from './roadmap-lifecycle.js';
import { currentView, roadmapHistory } from './roadmap-view.js';
import { acceptInvitation, dismissInvitation, offerInvitation, pendingInvitation } from './roadmap-invitations.js';
import { answerQuestion, revisePlan } from './roadmap-planning.js';
import { applyProposalDraft, discardProposalDraft, roadmapEditEnabled, saveProposalDraft } from './roadmap-proposal-drafts.js';
import { acceptLinkProposal, offerLinkProposal, readLink } from './roadmap-links.js';
import { readSlots, saveSlot } from './roadmap-slots.js';

const PREFIX = '/api/learn/roadmap';
export const roadmapEnabled = env => env?.ROADMAP_ENABLED === 'true';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const NOT_AVAILABLE = { error: 'Not available', code: 'not_found' };
const EDIT_SEGMENTS = new Set(['drafts', 'link']);
// The gate's view of the path: every segment decoded until it stops changing (the dispatcher below decodes once); null when an escape is malformed.
const decodeAll = segment => { let out = segment; for (let n = 0; n < 4; n += 1) { const next = decodeURIComponent(out); if (next === out) return out; out = next; } return out; };
function pathSegments(path) {
  try { return path.slice(PREFIX.length).split('/').filter(Boolean).flatMap(segment => { const full = decodeAll(segment); return full.split('/').filter(Boolean); }); } catch { return null; }
}

// deps (all optional in tests): identity(req, env), readSource(access, {sourceId, revision, scope}) -> { key, rev, scopeFingerprint, scope, language? } (Tools,
// request-bound: the session reads the Markdown once; roadmap-source-read.js), startPlanning(env, access, roadmapId) (kicks the planning event),
// compose(roadmap, step) (roadmap-compose.js), onAccepted(env, access, body) (kicks the RoadmapJobs object), composeEdit({ roadmap, step, proposal, instruction }) and screen(text, { role, access, roadmap, proposal, actionKey }) (R5 edit drafts; both required, else 503), onFact(env, access, body) (the same kick after a delivery acknowledgment or a mode change: R6), mintStepRefs(env, access, roadmapId)
// (R3 references at Accept plan, roadmap-source-refs.js), settings(db, access) (R2's Auto-suggest and mode readers), now. roadmap-wire.js builds them.
export async function roadmapRoute(path, req, env, deps = {}) {
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  if (!roadmapEnabled(env)) return json({ error: 'Not found', code: 'roadmap_disabled' }, 404);
  // R5: draft and link routes answer 404 as if absent, before identity or any read, unless ROADMAP_EDIT_ENABLED is also 'true'. The gate reads the SAME decoded
  // segments the dispatch below reads, and keeps decoding until the segment stops changing, so no spelling (%64rafts, %2564rafts, Drafts, a malformed escape) gets past it.
  const editOn = roadmapEditEnabled(env), segments = pathSegments(path);
  if (!segments) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (!editOn && segments.some(segment => EDIT_SEGMENTS.has(segment.toLowerCase()))) return json({ error: 'Not found', code: 'not_found' }, 404);
  if (!env.LEARN_DB) return json({ error: 'Not available', code: 'not_found' }, 503);
  const url = new URL(req.url);
  if (req.method !== 'GET' && req.headers.has('origin') && req.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin', code: 'forbidden' }, 403);
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Method not allowed' }, 405);
  const user = await (deps.identity || repositoryIdentity)(req, env);
  if (user instanceof Response) return user;
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { return json({ error: 'Invalid JSON', code: 'invalid_request' }, 400); } }
  const boardId = req.method === 'GET' ? url.searchParams.get('boardId') : body.boardId;
  if (typeof boardId !== 'string' || !boardId) return json({ error: 'boardId is required', code: 'invalid_request' }, 400);
  const db = env.LEARN_DB;
  const board = await db.prepare('SELECT id, app, board FROM learn_boards WHERE id = ? AND org = ? AND owner_email = ?').bind(boardId, user.org, user.email).first();
  if (!board) return json(NOT_AVAILABLE, 404);
  // The access object: from the authenticated session and the owned board row, never from the body. Owner-only before R14.
  const userId = user.userId || user.user_id;
  if (!userId) return json(NOT_AVAILABLE, 404);
  const access = { org: user.org, actorUserId: userId, actorEmail: user.email, boardId: board.id, boardOwnerEmail: user.email, role: 'owner', payerUserId: userId, app: board.app };
  const rest = path.slice(PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
  // R5: with the edit flag on, every view tells the web so (the Edit button renders only then). Flag off: the view is exactly R4's, no new field.
  const viewOf = async id => { const v = await currentView(db, access, id); return v && editOn ? { ...v, edit: true } : v; };
  const roadmapId = rest[0];
  const now = deps.now?.();
  const arg = { actionKey: body.actionKey, expectedRevision: body.expectedRevision ?? body.revision, ...(now ? { now } : {}) };
  const reply = async result => {
    if (result.refusal) return json({ ...refusalBody(result.refusal), current: await viewOf(rest[0]) }, result.refusal.reason === 'unavailable' || result.refusal.reason === 'payer_unavailable' || result.refusal.reason === 'allowance_unavailable' ? 503 : 429);
    // api.md 3: a mutating response IS the RoadmapView (the UI reads it as one); the action's own fields (roadmapId, slots) ride beside it.
    return json(result.body && result.status < 300 ? { ...result.body, ...(await viewOf(result.body.roadmapId ?? rest[0])) } : result.body, result.status);
  };
  try {
    // GET /  (status for this board)
    if (req.method === 'GET' && rest.length === 0) {
      if (url.searchParams.get('history') === '1') return json(await roadmapHistory(db, access)); // route 19: ended and completed roadmaps for the ToC
      const view = await viewOf();
      if (view && req.headers.get('if-none-match') === view.poll.etag) return new Response(null, { status: 304, headers: { ETag: view.poll.etag, 'Cache-Control': 'no-store' } });
      return json(view ?? { roadmap: null, poll: { afterMs: 5000, etag: 'rv-none' } });
    }
    // Invitations (api.md routes 1 to 3): deterministic, no model, dismissal scoped to one invitation.
    if (rest[0] === 'invitations') {
      if (req.method === 'GET' && rest.length === 1) { const got = await pendingInvitation(db, access); return json(got.body, got.status); }
      if (req.method === 'POST' && rest.length === 1) { const got = await offerInvitation(db, access, { sourceKeys: body.sourceKeys, idleKey: body.idleKey, mode: body.mode, settings: deps.settings, ...(now ? { now } : {}) }); return json(got.body, got.status); }
      if (req.method === 'POST' && rest.length === 3 && rest[2] === 'dismiss') { const got = await dismissInvitation(db, access, { invitationId: rest[1], actionKey: body.actionKey, ...(now ? { now } : {}) }); return json(got.body, got.status); }
      return json({ error: 'Not found', code: 'not_found' }, 404);
    }
    // POST /  (create). source: { key, rev, scope } (api.md 4 row 4); sourceId/revision are the older spelling.
    if (req.method === 'POST' && rest.length === 0) {
      if (!deps.readSource) return json({ error: 'Not available', code: 'source_unavailable' }, 503);
      const source = await deps.readSource(access, { sourceId: body.source?.key ?? body.source?.sourceId, revision: body.source?.rev ?? body.source?.revision, scope: body.source?.scope });
      if (source?.error) return json({ error: source.error, code: source.code || 'source_unsupported', ...(source.limitation ? { limitation: source.limitation } : {}) }, source.status || 422);
      const created = await createRoadmap(db, access, { actionKey: body.actionKey, app: board.app, instruction: body.instruction, allowEmpty: !!body.invitationId, source: { key: source.key, rev: source.rev }, scope: source.scope, scopeFingerprint: source.scopeFingerprint, depth: body.depth, language: source.language ?? null, practiceMode: body.practiceMode ?? null, ...(now ? { now } : {}) });
      if (!created.replayed) { await acceptInvitation(db, access, body.invitationId, created.body.roadmapId, now); await deps.startPlanning?.(env, access, created.body.roadmapId); }
      return reply(created);
    }
    if (req.method === 'GET' && rest.length === 1) { const view = await viewOf(roadmapId); return view ? json(view) : json(NOT_AVAILABLE, 404); }
    // GET /:rm/results/:rs  (the entitlement predicate; not entitled is indistinguishable from unknown)
    if (req.method === 'GET' && rest[1] === 'results' && rest.length === 3) {
      const got = await readEntitledResult(db, access, { roadmapId, resultId: rest[2] });
      return got ? json({ resultId: got.id, cardId: got.cardId, primitive: got.primitive, block: got.block }) : json(NOT_AVAILABLE, 404);
    }
    // UI.06: the Tutor slots' private places (roadmap-slots.js), owner and board scoped like every route here.
    if (rest[1] === 'slots' && rest.length === 2) { const got = req.method === 'GET' ? await readSlots(db, access, roadmapId) : await saveSlot(db, access, { roadmapId, stepId: body.stepId, proposalId: body.proposalId ?? null, x: body.x, y: body.y, w: body.w }); return json(got.body, got.status); }
    if (req.method !== 'POST') return json({ error: 'Not found', code: 'not_found' }, 404);
    const [, kind, id, verb] = rest;
    if (kind === 'thread' && rest.length === 2) return reply(await bindTutorThread(db, access, { roadmapId, threadId: body.threadId })); // the roadmap's one Tutor Chat thread
    if (kind === 'answer' && rest.length === 2) { const done = await answerQuestion(db, access, { roadmapId, expectedRevision: arg.expectedRevision, actionKey: body.actionKey, questionId: body.questionId, optionId: body.optionId, text: body.text, ...(now ? { now } : {}) }); if (!done.replayed) await deps.startPlanning?.(env, access, roadmapId); return reply(done); }
    if (kind === 'revise' && rest.length === 2) { const done = await revisePlan(db, access, { roadmapId, expectedRevision: arg.expectedRevision, actionKey: body.actionKey, instruction: body.instruction, settings: body.settings, scope: body.scope, ...(now ? { now } : {}) }); if (!done.replayed && done.status === 202) await deps.startPlanning?.(env, access, roadmapId); return reply(done); }
    if (kind === 'accept-plan' && rest.length === 2) {
      // The session is present only here: mint each step's R3 reference now (api.md 12.2). A source that changed refuses the acceptance.
      const minted = await deps.mintStepRefs?.(env, access, roadmapId);
      if (minted && !minted.ok) return json({ error: minted.error, code: minted.code, current: await viewOf(roadmapId) }, 409);
      const planned = await acceptPlan(db, access, { roadmapId, planVersion: body.planVersion, ...arg });
      // Accepting the plan offers the FIRST proposal, once: the same deterministic compose and offer as Propose next step, under a key derived from the accept's key
      // (a replay of the accept, or a second device's accept, offers nothing more; a busy roadmap refuses and is left as is). It generates, authorizes and charges nothing.
      // The proposal belongs to the learner's own Accept plan click, so Auto-suggest does not gate it (the client still hides it in Ask). A failure here leaves the
      // accepted plan and the manual Propose next step working.
      if (!planned.replayed && !planned.refusal && planned.status < 300 && deps.compose) {
        try {
          const fresh = await readRoadmap(db, access, roadmapId);
          await proposeNextStep(db, access, { roadmapId, compose: deps.compose, env, revalidate: deps.revalidate, expectedRevision: fresh.revision, actionKey: `${body.actionKey}_first`, ...(now ? { now } : {}) });
        } catch (error) { if (!(error instanceof StateError)) throw error; }
      }
      return reply(planned);
    }
    if (kind === 'end' && rest.length === 2) return reply(await endRoadmap(db, access, { roadmapId, ...arg }));
    if (kind === 'mode' && rest.length === 2) {
      // api.md 17: the mode fact carries no client key; its identity is the roadmap and the next mode revision, so a repeat of the same change replays.
      const current = await readRoadmap(db, access, roadmapId);
      const done = await setMode(db, access, { roadmapId, mode: body.mode, actionKey: body.actionKey ?? `rmmode_${roadmapId}_${body.mode}_${(current?.mode_revision ?? 0) + 1}`, ...(now ? { now } : {}) });
      if (!done.replayed) await deps.onFact?.(env, access, done.body); // R6: wake the outbox for the mode_changed event just committed
      return reply(done);
    }
    if (kind === 'steps' && id === 'propose' && rest.length === 3) {
      if (!deps.compose) return json({ error: 'Not available', code: 'not_found' }, 503);
      return reply(await proposeNextStep(db, access, { roadmapId, compose: deps.compose, env, revalidate: deps.revalidate, ...arg }));
    }
    // The learner chose the alternative for a required format (the Chat recovery entry's question): offered for the SAME step with its own review.
    // The choice must still be the recorded recovery of that step, else it is stale. Edit roadmap is the Chat's own edit target and needs no request.
    if (kind === 'steps' && id === 'recover' && rest.length === 3) {
      if (!deps.compose) return json({ error: 'Not available', code: 'not_found' }, 503);
      const current = await readRoadmap(db, access, roadmapId), held = current && (() => { try { return JSON.parse(current.scope_json || '{}').offerRecovery ?? null; } catch { return null; } })();
      if (body.choice !== 'alternative') return json({ error: 'choice', code: 'invalid_request' }, 400);
      if (!held || held.stepId !== body.stepId || !held.alternative) throw new StateError('recovery_stale', 'This choice is no longer available.', 409);
      return reply(await proposeNextStep(db, access, { roadmapId, compose: deps.compose, env, revalidate: deps.revalidate, useAlternative: true, ...arg }));
    }
    // R5: preview an edit of the pending proposal, apply or discard it, and offer an existing card as the next step. Gated above by ROADMAP_EDIT_ENABLED.
    if (kind === 'proposals' && verb === 'drafts' && rest.length === 4) {
      if (!deps.composeEdit || !deps.screen) return json({ error: 'Not available', code: 'edit_unavailable' }, 503);
      const draft = await saveProposalDraft(db, access, { roadmapId, proposalId: id, proposalVersion: body.proposalVersion, instruction: body.instruction, actionKey: body.actionKey, composeEdit: deps.composeEdit, screen: deps.screen, ...(now ? { now } : {}) });
      return json({ draft: draft.body, ...(await viewOf(roadmapId)) }, draft.status);
    }
    if (kind === 'drafts' && verb === 'apply' && rest.length === 4) return reply(await applyProposalDraft(db, access, { roadmapId, draftId: id, draftRevision: body.draftRevision, proposalVersion: body.proposalVersion, actionKey: body.actionKey, ...(now ? { now } : {}) }));
    if (kind === 'drafts' && verb === 'discard' && rest.length === 4) { const done = await discardProposalDraft(db, access, { roadmapId, draftId: id }); return json(done.body, done.status); }
    if (kind === 'steps' && id === 'link' && rest.length === 3) return reply(await offerLinkProposal(db, access, { roadmapId, cardId: body.cardId, reason: body.reason, origin: body.origin === 'tutor' ? 'tutor' : 'learner', ...arg }));
    if (kind === 'proposals' && verb === 'accept' && rest.length === 4) {
      if (roadmapEditEnabled(env) && await readLink(db, id, body.proposalVersion).catch(() => null)) return reply(await acceptLinkProposal(db, access, { roadmapId, revision: arg.expectedRevision, proposalId: id, proposalVersion: body.proposalVersion, actionKey: body.actionKey, ...(now ? { now } : {}) }));
      let done;
      try { done = await acceptRoadmapStep(env, access, { roadmapId, revision: arg.expectedRevision, proposalId: id, proposalVersion: body.proposalVersion, actionKey: body.actionKey, ...(deps.quote ? { quote: args => deps.quote(env, access, args) } : {}), ...(now ? { now } : {}) }); }
      catch (error) {
        // The offered format is no longer ready (nothing was written: no hold, no author call): take the offer back and offer again through the same check, so the
        // 409 below already shows the alternative's own review or the Chat recovery entry.
        if (error instanceof StateError && error.code === 'offer_unready' && deps.compose) await retakeUnreadyOffer(db, access, { roadmapId, proposalId: id, proposalVersion: body.proposalVersion, actionKey: body.actionKey, compose: deps.compose, env, revalidate: deps.revalidate, ...(now ? { now } : {}) }).catch(() => null);
        throw error;
      }
      if (!done.refusal && !done.replayed) await deps.onAccepted?.(env, access, done.body);
      return reply(done);
    }
    if (kind === 'proposals' && verb === 'cancel' && rest.length === 4) return reply(await cancelProposal(db, access, { roadmapId, proposalId: id, proposalVersion: body.proposalVersion, ...arg }));
    if (kind === 'results' && verb === 'deliver' && rest.length === 4) {
      // Idempotent: the same authorized blocks every time. Also the resume path after a reload or a second device.
      const got = await readEntitledResult(db, access, { roadmapId, resultId: id });
      if (!got) return json(NOT_AVAILABLE, 404);
      const row = await readResult(db, access, id);
      return json({ resultId: id, stepId: row.step_id, cards: [{ slot: { index: row.slot_index, cardId: got.cardId }, block: { ...got.block, id: got.cardId, stepId: row.step_id } }], ackRequired: got.delivery === 'not_delivered' });
    }
    if (kind === 'results' && verb === 'ack' && rest.length === 4) {
      const done = await acknowledgeDelivery(db, access, { roadmapId, resultId: id, cardIds: body.cardIds ?? (body.cardId ? [body.cardId] : undefined), boardVersion: body.boardVersion ?? body.boardRevision ?? null, ...arg }); // api.md 14 names cardId and boardRevision
      if (!done.replayed) await deps.onFact?.(env, access, done.body); // R6: wake the outbox for the card_delivered event just committed
      return reply(done);
    }
    if (kind === 'results' && verb === 'removed' && rest.length === 4) return reply(await markResultRemoved(db, access, { roadmapId, resultId: id, ...arg }));
    if (kind === 'results' && verb === 'restored' && rest.length === 4) return reply(await markResultRestored(db, access, { roadmapId, resultId: id, ...arg }));
    return json({ error: 'Not found', code: 'not_found' }, 404);
  } catch (error) {
    if (!(error instanceof StateError)) throw error;
    const status = error.status || ERROR_CODES[error.code] || 409;
    const out = { error: status === 409 ? 'This roadmap changed. Showing the latest.' : error.message, code: error.code };
    if (status === 409) {
      Object.assign(out, error.reply || conflictReply({ code: error.code, currentRevision: (roadmapId ? await readRoadmap(db, access, roadmapId) : null)?.revision ?? null }));
      out.current = await viewOf(roadmapId);
    }
    return json(out, status);
  }
}
