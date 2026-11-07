// The roadmap client's runtime, free of React so it is tested with a fake API and a fake canvas host. It polls the server,
// sends one guarded action per gesture, applies the answer (state is always the server's), and delivers accepted cards: ask the
// server for the authorized cards, insert each by its server-minted id once, save the board, then acknowledge. Nothing here
// mints an id, predicts a result or touches a price.
import { STRINGS } from './roadmap-strings.js';
import { actionKeys, canProposeNext, deliverable, draftOf, initialState, offerOf, planDelivery, reduce, routes } from './roadmap-client.js';
import { markEnd, markStart } from './client-timing.js';
import { isUnfinishedRoadmap } from './roadmap-contract.js';
import { FOLLOW_UP_MS, createAutoMeter } from './roadmap-auto.js';

// host: the canvas as the page sees it.
//   hasBlock(id) -> bool, insertCard(block) -> id, settled(id) -> Promise<bool> (its final offsets are in the canvas's blocks), persist() -> Promise<{ ok }> (ok:false when
//   the save failed), boardRevision() -> the saved board's revision|null, savedHas(id) -> bool (the saved board holds that card at the canvas's geometry),
//   readOnly() -> bool (shared view: the controller stays silent), sourceRev(key) -> sha, instruction() -> the learner's own words.
export function createRoadmapController({ api, boardId, host, schedule = setTimeout, cancel = clearTimeout, random, now }) {
  let state = initialState(), timer = null, stopped = true;
  const meter = createAutoMeter({ now }), followUps = new Set();
  const listeners = new Set(), keys = actionKeys(random), delivering = new Set(), seen = new Set(), flight = new Map();
  const dispatch = event => { const next = reduce(state, event); if (next !== state) { state = next; listeners.forEach(fn => fn()); } };
  const call = ({ method, path, body }) => api(path, method === 'GET' ? {} : { method, body: JSON.stringify(body) });
  const roadmapOff = error => error?.status === 404 && error.data?.code === 'roadmap_disabled';

  // One place that turns an HTTP refusal into state (409 current, 429 sentence, flag off).
  function refuse(error) {
    const data = error?.data || {};
    if (roadmapOff(error)) return dispatch({ type: 'flag_off' });
    if (error?.status === 409 && data.code === 'source_changed') return dispatch({ type: 'refused', message: STRINGS.sourceChanged, current: data.current });
    if (error?.status === 409 && data.current) return dispatch({ type: 'conflict', current: data.current });
    if (error?.status === 409) return refresh();
    if (data.code === 'allowance_limited' || data.code === 'spend_limited') return dispatch({ type: 'refused', message: data.error, current: data.current });
    if (error?.status === 404) return refresh(); // not_found: whatever we held is gone; show what the server has
    return dispatch({ type: 'refused', message: data.error || null, current: data.current, limitation: data.limitation });
  }

  // Benchmark timings (client-timing.js; docs/features/telemetry.md "Timing events"). A gesture starts its intervals; each view that arrives (the
  // response or a poll) ends the ones it shows, so the stage hops are as fine as the poll interval. Nothing here changes what the controller does.
  const STAGES = ['generating', 'checking', 'saving'];
  const timeStart = gesture => {
    if (gesture.startsWith('create:')) markStart('plan', 'roadmap_plan_ms');
    else if (gesture.startsWith('revise:')) markStart('revise', 'roadmap_revise_ms');
    else if (gesture.startsWith('plan:')) { markStart('req:' + gesture, 'roadmap_accept_plan_ms'); markStart('first_proposal', 'roadmap_first_proposal_ms'); }
    else if (gesture.startsWith('accept:')) { markStart('req:' + gesture, 'card_accept_ms'); markStart('ready:' + state.view?.proposal?.stepId, 'card_ready_ms'); }
  };
  const timeEnd = (gesture, outcome) => {
    markEnd('req:' + gesture, outcome);
    if (outcome === 'ok') return;
    if (gesture.startsWith('create:')) markEnd('plan', outcome);
    else if (gesture.startsWith('revise:')) markEnd('revise', outcome);
    else if (gesture.startsWith('plan:')) markEnd('first_proposal', outcome);
    else if (gesture.startsWith('accept:')) markEnd('ready:' + state.view?.proposal?.stepId, outcome);
  };
  const timeViews = (prev, next) => {
    try {
      const draft = draftOf(next);
      if (draft) { const count = draft.steps?.length; markEnd('plan', 'ok', { count }); if (draftOf(prev)?.version !== draft.version) markEnd('revise', 'ok', { count }); }
      if (next.proposal?.state === 'pending') markEnd('first_proposal');
      const before = new Map((prev?.steps || []).map(step => [step.id, step.stage]));
      for (const step of next.steps || []) {
        const was = before.get(step.id), now = step.stage;
        if (was !== now) {
          if (STAGES.includes(was)) markEnd('stage:' + step.id + ':' + was, now === 'failed' ? 'failed' : 'ok');
          if (STAGES.includes(now)) markStart('stage:' + step.id + ':' + now, 'card_stage_' + now + '_ms');
        }
        if (now === 'ready') markEnd('ready:' + step.id); else if (now === 'failed') markEnd('ready:' + step.id, 'failed');
      }
    } catch { /* a timing is never worth a failure */ }
  };

  // One gesture, one request at a time: a second press of the same gesture (a Tab and a click together) joins the first.
  function act(gesture, route) {
    if (stopped || host.readOnly?.()) return Promise.resolve(null);
    if (flight.has(gesture)) return flight.get(gesture);
    dispatch({ type: 'begin', gesture });
    timeStart(gesture);
    const run = call(route(keys.for(gesture)))
      .then(body => { keys.done(gesture); timeEnd(gesture, 'ok'); return body; }, error => { keys.done(gesture); timeEnd(gesture, 'failed'); refuse(error); return null; })
      .finally(() => { flight.delete(gesture); dispatch({ type: 'end', gesture }); });
    flight.set(gesture, run);
    return run;
  }
  const applyView = body => { if (body?.roadmap !== undefined && (body.roadmap === null || (typeof body.roadmap === 'object' && Array.isArray(body.steps)))) { timeViews(state.view, body); dispatch({ type: 'view', view: body }); meter.observe(state.view); reconcile(); } return body; };
  const mutateView = (gesture, route) => (state.view ? act(gesture, route).then(applyView) : Promise.resolve(null)); // every roadmap action needs a view to take its revision from

  async function refresh() {
    if (stopped || host.readOnly?.()) return;
    try { applyView(await call(routes.status(boardId))); } catch (error) { refuse(error); }
  }
  // Reload: with no unfinished roadmap, the latest finished one (history is newest first) supplies the accepted tree the Table of contents keeps (state.past).
  async function refreshPast() {
    if (stopped || state.view || state.past || host.readOnly?.()) return;
    try {
      const last = ((await call(routes.history(boardId)))?.roadmaps || []).find(r => r.state === 'completed' || r.state === 'ended');
      if (last) dispatch({ type: 'past', view: await call(routes.view(boardId, last.id)) });
    } catch (error) { refuse(error); }
  }
  async function refreshInvitation() {
    if (stopped || host.readOnly?.()) return;
    try { const body = await call(routes.invitation(boardId)); dispatch({ type: 'invitation', invitation: body.invitation, suppressed: body.suppressed }); } catch (error) { if (roadmapOff(error)) dispatch({ type: 'flag_off' }); }
  }
  function loop() {
    if (stopped) return;
    const wait = state.flag === 'off' ? 60000 : state.view?.poll?.afterMs || 5000;
    timer = schedule(async () => { await refresh(); if (!state.view) await refreshInvitation(); loop(); }, wait);
  }

  // Accepted work: deliver each generated result once. A failed save or a lost acknowledgement leaves the result undelivered
  // on the server, so the next poll runs this again and the same minted card is found, saved and acknowledged.
  async function deliverOne(result) {
    const body = await call(routes.deliver(state.view, result.id, keys.for(`deliver:${result.id}`)));
    keys.done(`deliver:${result.id}`);
    const plan = planDelivery(body, id => host.hasBlock(id));
    for (const block of plan.insert) host.insertCard(block);
    plan.cardIds.forEach(id => seen.add(id));
    if (!plan.ackRequired) return;
    // UI.06: the card's final place (its id, top-left offsets and width in the canvas's blocks) settles before the board is saved, so the save holds that geometry,
    // never the default column place it is inserted at. Not settled: nothing is saved or acknowledged; the next poll finds the same card and tries again.
    for (const cardId of plan.cardIds) if (await host.settled?.(cardId) === false) throw Object.assign(Error('card_not_settled'), { retry: true });
    // The board save comes first. persist() resolves { ok:false } (it does not reject) when the save failed, and the revision is only
    // real once the saved board holds the card: otherwise nothing is acknowledged, the result stays undelivered, and the next poll
    // runs this again (the card is already on the canvas and the server hands back the same result: one card, one charge).
    const saved = await host.persist();
    if (saved?.ok !== true) throw Object.assign(Error('board_not_saved'), { retry: true });
    for (const cardId of plan.cardIds) {
      if (host.savedHas && !host.savedHas(cardId)) throw Object.assign(Error('board_not_saved'), { retry: true });
      const revision = host.boardRevision?.();
      if (!Number.isInteger(revision) || revision < 1) throw Object.assign(Error('board_not_saved'), { retry: true });
      const send = () => call(routes.ack(state.view, result, cardId, revision, keys.for(`ack:${result.id}:${cardId}`)));
      try { applyView(await send()); } catch (error) {
        if (error?.status !== 409 || !error.data?.current) throw error;
        dispatch({ type: 'conflict', current: error.data.current }); // fresh revision, same card id, same key: one retry
        applyView(await send());
      }
      keys.done(`ack:${result.id}:${cardId}`);
      afterDelivery();
    }
  }
  // R6: the server may offer the next step by itself right after a delivery. Read twice more soon (the poll cadence is slower) and time it; the
  // proposal, if any, simply appears in the view: this never moves the camera, focuses anything or adds a Chat line.
  function afterDelivery() {
    meter.ack();
    for (const ms of FOLLOW_UP_MS) { const id = schedule(() => { followUps.delete(id); refresh(); }, ms); followUps.add(id); }
  }
  async function reconcile() {
    if (stopped || host.readOnly?.() || !state.view) return;
    for (const result of deliverable(state.view)) {
      if (delivering.has(result.id)) continue;
      delivering.add(result.id);
      dispatch({ type: 'begin', gesture: `deliver:${result.id}` }); // the slot says Saving while this client inserts, saves and acknowledges (roadmap-canvas.js)
      try { await deliverOne(result); } catch (error) { if (roadmapOff(error)) dispatch({ type: 'flag_off' }); /* next poll retries */ } finally { delivering.delete(result.id); dispatch({ type: 'end', gesture: `deliver:${result.id}` }); }
    }
    await watchRemoval();
  }
  // A delivered card that was on this canvas and is gone: record delivery `removed` (history stays, no refund).
  async function watchRemoval() {
    for (const result of state.view?.results || []) {
      const id = result.slot?.cardId;
      if (result.delivery !== 'delivered' || !id) continue;
      if (host.hasBlock(id)) { seen.add(id); continue; }
      if (!seen.has(id)) continue;
      seen.delete(id);
      await mutateView(`removed:${result.id}`, key => routes.removed(state.view, result.id, id, key));
    }
  }

  const unfinished = () => !!state.view && isUnfinishedRoadmap(state.view.roadmap.state);
  // UI.01: an explicit drop is reported at once, one source per report (never a silent multi-source invitation), under a 'drop-' key: the
  // server acknowledges it in every mode (roadmap-invitations.js). No typing or idle deferral. An unfinished roadmap answers suppressed, and
  // the Chat explains the one-roadmap boundary for that source (state.boundary). The same source's ready events coalesce into one report.
  const reported = new Set();
  const report = key => {
    if (stopped || host.readOnly?.() || reported.has(key)) return Promise.resolve(null);
    reported.add(key);
    const idleKey = `drop-${key}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 120);
    return call(routes.invite(boardId, [key], idleKey)).then(body => {
      dispatch({ type: 'invitation', invitation: body.invitation, suppressed: body.suppressed });
      markEnd('drop:' + key); // drop_to_invite_ms (LearnPage.jsx starts it at the drop)
      if (body.suppressed?.reason === 'unfinished_roadmap') dispatch({ type: 'boundary', boundary: { key, name: host.sourceName?.(key) || '' } });
      return body;
    }, error => { reported.delete(key); markEnd('drop:' + key, 'failed'); refuse(error); return null; });
  };

  // Fix B (T5): the Depth and instruction the learner confirmed for THIS source in Chat (explain); a part chosen later (R7a) keeps them.
  let chosen = {};
  function createWith(scope, suffix) {
    const iv = state.invitation;
    if (!iv) return Promise.resolve(null);
    const key = iv.sourceKeys[0];
    return act(`create:${iv.id}${suffix}`, actionKey => routes.create(boardId, { invitationId: iv.id, source: { key, rev: host.sourceRev?.(key), scope }, instruction: chosen.instruction ?? host.instruction?.() ?? '', depth: chosen.depth || host.depth?.() || 'standard' }, actionKey)).then(applyView);
  }

  return {
    getState: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    start() { if (!stopped) return; stopped = false; refresh().then(() => (state.view ? null : refreshInvitation())).then(refreshPast).then(loop); },
    stop() { stopped = true; if (timer) cancel(timer); timer = null; for (const id of followUps) cancel(id); followUps.clear(); },
    // Delivery-to-visible samples of automatic proposals (roadmap-auto.js): { n, p50, p95 } in milliseconds.
    timings: () => meter.summary(), timingSamples: () => meter.samples(),
    refresh,
    // A supported source finished importing: reported, grouped, once the learner is idle.
    sourceReady: key => report(key), idleTick: () => false,
    setMode(mode) {
      if (mode === state.mode) return;
      dispatch({ type: 'mode', mode });
      if (state.view && unfinished()) call(routes.mode(state.view, mode)).then(applyView, () => {}); // idempotent by value; failure is harmless
    },
    // Invitation
    explain: ({ depth, instruction } = {}) => { chosen = { depth, instruction }; return createWith({ kind: 'whole' }, ''); },
    // R7a: a part of a long source the server offered after the whole source did not fit. The server resolves it against its own outline.
    // A clear typed lesson request (CHAT.02): the SAME create the button runs, with the learner's words and the composer Depth bound once. With the
    // source's invitation offered it shares the button's gesture (one request, one draft); otherwise the create route takes the source itself. An
    // unfinished roadmap keeps its draft: nothing is created twice. threadId: the Chat thread the request came in, bound to the new roadmap.
    async lesson({ depth, instruction, source, threadId = null, scope = null } = {}) {
      if (stopped || (state.view && unfinished())) return null;
      const iv = state.invitation, text = typeof instruction === 'string' ? instruction.trim() : '';
      const named = scope && typeof scope.kind === 'string' ? scope : { kind: 'whole' }; // the scope the tool call named: whole unless a passage was chosen
      if (!text) return null;
      let body;
      if (iv && (!source || iv.sourceKeys[0] === source.key)) { chosen = { depth, instruction: text }; body = await createWith(named, named.kind === 'whole' ? '' : `:${named.kind}:${named.start ?? ''}:${named.end ?? ''}`); }
      else if (source?.key && source.rev) body = await act(`create:${source.key}@${source.rev}`, actionKey => routes.create(boardId, { source: { key: source.key, rev: source.rev, scope: named }, instruction: text, depth: depth || host.depth?.() || 'standard' }, actionKey)).then(applyView);
      else return null;
      if (threadId) { await refresh(); if (state.view && !state.view.roadmap.threadId) await call(routes.thread(state.view, threadId)).then(applyView, () => {}); }
      return body;
    },
    explainPart: choice => (choice && typeof choice.locationId === 'string' ? createWith({ kind: 'section', locationId: choice.locationId, part: choice.part || 1 }, `:${choice.locationId}:${choice.part || 1}`) : Promise.resolve(null)),
    dismiss() {
      const iv = state.invitation;
      if (!iv) return Promise.resolve(null);
      return act(`dismiss:${iv.id}`, actionKey => routes.dismiss(boardId, iv.id, actionKey)).then(body => { if (body) dispatch({ type: 'dismissed', id: iv.id }); return body; });
    },
    // Restore a removed roadmap card (owner 2026-11-07): the server hands back the stored result body (deliver is idempotent: no model call, no charge), it is
    // inserted and saved, then the server returns the result to delivered. Idempotent: pressed again after a failed save, it finds the card and only retries the last step.
    async restoreCard(resultId) {
      const view = state.view, result = (view?.results || []).find(r => r.id === resultId);
      if (stopped || host.readOnly?.() || !result || result.delivery !== 'removed') return null;
      const body = await act(`restore-get:${resultId}`, key => routes.deliver(view, resultId, key));
      if (!body) return null;
      const plan = planDelivery(body, id => host.hasBlock(id));
      for (const block of plan.insert) host.insertCard(block);
      for (const cardId of plan.cardIds) if (await host.settled?.(cardId) === false) return null;
      const saved = await host.persist();
      if (saved?.ok !== true) return null; // not saved: the row stays Card removed with its Restore, and pressing it again retries
      const done = await mutateView(`restore:${resultId}`, key => routes.restored(state.view, resultId, key));
      await refresh(); // the answer is the small outcome, not the view: read the new delivery now instead of waiting for the next poll
      return done;
    },
    // Plan
    acceptPlan: () => mutateView(`plan:${state.view?.roadmap.id}:${state.view?.plan?.version}`, key => routes.acceptPlan(state.view, key)),
    // UI.03: a Depth change or the typed Edit roadmap request is a new draft revision (contracts.md revise; 422 practice_unavailable).
    revise: fields => mutateView(`revise:${state.view?.roadmap.id}:${state.view?.roadmap.revision}`, key => routes.revise(state.view, fields, key)),
    answer: fields => mutateView(`answer:${state.view?.question?.id}`, key => routes.answer(state.view, { questionId: state.view.question.id, ...fields }, key)),
    // Proposal: the same call from the Accept button and from Tab; a second press joins the first (same gesture).
    acceptProposal() {
      const pill = offerOf(state); // explicit in every mode (Chat, canvas, Tab): the same gesture, so one request
      if (!pill?.accept) return Promise.resolve(null);
      return mutateView(pill.gesture, key => routes.acceptProposal(state.view, key));
    },
    cancelProposal() {
      const pill = offerOf(state);
      if (!pill) return Promise.resolve(null);
      return mutateView(pill.cancelGesture, key => routes.cancelProposal(state.view, key));
    },
    proposeNext() {
      if (!canProposeNext(state)) return Promise.resolve(null);
      meter.manual();
      return mutateView(`propose:${state.view.roadmap.id}:${state.view.roadmap.revision}`, key => routes.proposeNext(state.view, key));
    },
    // BE.05a: the learner chose the alternative offered when a required format could not be prepared; the same step then gets its own review.
    recoverOffer({ choice = 'alternative' } = {}) {
      const held = state.view?.offerRecovery;
      if (!held || state.view.proposal) return Promise.resolve(null);
      return mutateView(`recover:${state.view.roadmap.id}:${held.stepId}:${choice}`, key => routes.recover(state.view, held.stepId, choice, key));
    },
    // R5: edit the pending proposal. The preview never changes it; Apply (after the server confirms) replaces it with the next version.
    openEditor() { dispatch({ type: 'edit_open' }); },
    closeEditor() { const draft = state.draft; dispatch({ type: 'edit_close' }); if (draft && state.view && !stopped) call(routes.discardDraft(state.view, draft)).catch(() => {}); }, // best effort: the Apply guard is the correctness boundary
    previewEdit(instruction) {
      const pill = offerOf(state), text = String(instruction || '').trim();
      if (!pill || !text || !state.editing) return Promise.resolve(null);
      return act(`draft:${pill.proposalId}:${pill.version}:${text}`, key => routes.draft(state.view, text, key)).then(body => { if (!body) return null; applyView(body); if (body.draft) dispatch({ type: 'draft', draft: body.draft }); return body; });
    },
    applyEdit() {
      const draft = state.draft;
      if (!draft || !state.view) return Promise.resolve(null);
      return mutateView(`apply:${draft.draftId}:${draft.revision}`, key => routes.applyDraft(state.view, draft, key)).then(body => { if (body) dispatch({ type: 'edit_close' }); return body; });
    },
    linkCard: (cardId, reason) => mutateView(`link:${cardId}`, key => routes.linkCard(state.view, cardId, reason, key)),
    end: () => mutateView(`end:${state.view?.roadmap.id}`, key => routes.end(state.view, key)),
    // Records the roadmap's Tutor thread (RoadmapTranscript.jsx). Rejects on refusal, so the caller can start a fresh thread instead; no error is shown.
    bindThread: threadId => (state.view ? call(routes.thread(state.view, threadId)).then(body => { applyView(body); return body; }) : Promise.resolve(null)),
  };
}
