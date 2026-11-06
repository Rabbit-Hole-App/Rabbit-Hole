// The roadmap client's runtime, free of React so it is tested with a fake API and a fake canvas host. It polls the server,
// sends one guarded action per gesture, applies the answer (state is always the server's), and delivers accepted cards: ask the
// server for the authorized cards, insert each by its server-minted id once, save the board, then acknowledge. Nothing here
// mints an id, predicts a result or touches a price.
import { STRINGS } from './roadmap-strings.js';
import { actionKeys, canProposeNext, deliverable, idleGrouper, initialState, pillOf, planDelivery, reduce, routes } from './roadmap-client.js';
import { isUnfinishedRoadmap } from './roadmap-contract.js';

// host: the canvas as the page sees it.
//   hasBlock(id) -> bool, insertCard(block) -> id, persist() -> Promise (rejects when the save failed), boardRevision() -> number|null,
//   readOnly() -> bool (shared view: the controller stays silent), sourceRev(key) -> sha, instruction() -> the learner's own words.
export function createRoadmapController({ api, boardId, host, schedule = setTimeout, cancel = clearTimeout, random }) {
  let state = initialState(), timer = null, stopped = true;
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
    return dispatch({ type: 'refused', message: data.error || null, current: data.current });
  }

  // One gesture, one request at a time: a second press of the same gesture (a Tab and a click together) joins the first.
  function act(gesture, route) {
    if (stopped || host.readOnly?.()) return Promise.resolve(null);
    if (flight.has(gesture)) return flight.get(gesture);
    dispatch({ type: 'begin', gesture });
    const run = call(route(keys.for(gesture)))
      .then(body => { keys.done(gesture); return body; }, error => { keys.done(gesture); refuse(error); return null; })
      .finally(() => { flight.delete(gesture); dispatch({ type: 'end', gesture }); });
    flight.set(gesture, run);
    return run;
  }
  const applyView = body => { if (body?.roadmap !== undefined) { dispatch({ type: 'view', view: body }); reconcile(); } return body; };
  const mutateView = (gesture, route) => (state.view ? act(gesture, route).then(applyView) : Promise.resolve(null)); // every roadmap action needs a view to take its revision from

  async function refresh() {
    if (stopped || host.readOnly?.()) return;
    try { applyView(await call(routes.status(boardId))); } catch (error) { refuse(error); }
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
    await host.persist(); // the board save comes first; a rejected save means no acknowledgement
    for (const cardId of plan.cardIds) {
      const send = () => call(routes.ack(state.view, result, cardId, host.boardRevision?.() ?? null, keys.for(`ack:${result.id}:${cardId}`)));
      try { applyView(await send()); } catch (error) {
        if (error?.status !== 409 || !error.data?.current) throw error;
        dispatch({ type: 'conflict', current: error.data.current }); // fresh revision, same card id, same key: one retry
        applyView(await send());
      }
      keys.done(`ack:${result.id}:${cardId}`);
    }
  }
  async function reconcile() {
    if (stopped || host.readOnly?.() || !state.view) return;
    for (const result of deliverable(state.view)) {
      if (delivering.has(result.id)) continue;
      delivering.add(result.id);
      try { await deliverOne(result); } catch (error) { if (roadmapOff(error)) dispatch({ type: 'flag_off' }); /* next poll retries */ } finally { delivering.delete(result.id); }
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
  const grouper = idleGrouper({
    isIdle: () => !host.busy?.(),
    report: ({ sourceKeys, idleKey }) => call(routes.invite(boardId, sourceKeys, idleKey)).then(body => dispatch({ type: 'invitation', invitation: body.invitation, suppressed: body.suppressed }), refuse),
  });

  return {
    getState: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    start() { if (!stopped) return; stopped = false; refresh().then(() => (state.view ? null : refreshInvitation())).then(loop); },
    stop() { stopped = true; if (timer) cancel(timer); timer = null; },
    refresh,
    // A supported source finished importing: reported, grouped, once the learner is idle.
    sourceReady: key => grouper.ready(key), idleTick: () => grouper.tick(),
    setMode(mode) {
      if (mode === state.mode) return;
      dispatch({ type: 'mode', mode });
      if (state.view && unfinished()) call(routes.mode(state.view, mode)).then(applyView, () => {}); // idempotent by value; failure is harmless
    },
    // Invitation
    explain() {
      const iv = state.invitation;
      if (!iv) return Promise.resolve(null);
      const key = iv.sourceKeys[0];
      return act(`create:${iv.id}`, actionKey => routes.create(boardId, { invitationId: iv.id, source: { key, rev: host.sourceRev?.(key), scope: { kind: 'whole' } }, instruction: host.instruction?.() || '', depth: host.depth?.() || 'standard' }, actionKey)).then(applyView);
    },
    dismiss() {
      const iv = state.invitation;
      if (!iv) return Promise.resolve(null);
      return act(`dismiss:${iv.id}`, actionKey => routes.dismiss(boardId, iv.id, actionKey)).then(body => { if (body) dispatch({ type: 'dismissed', id: iv.id }); return body; });
    },
    // Plan
    acceptPlan: () => mutateView(`plan:${state.view?.roadmap.id}:${state.view?.plan?.version}`, key => routes.acceptPlan(state.view, key)),
    revise: fields => mutateView(`revise:${state.view?.roadmap.id}:${state.view?.roadmap.revision}`, key => routes.revise(state.view, fields, key)),
    answer: fields => mutateView(`answer:${state.view?.question?.id}`, key => routes.answer(state.view, { questionId: state.view.question.id, ...fields }, key)),
    // Proposal: the same call from the Accept button and from Tab; a second press joins the first (same gesture).
    acceptProposal() {
      const pill = pillOf(state);
      if (!pill?.accept) return Promise.resolve(null);
      return mutateView(pill.gesture, key => routes.acceptProposal(state.view, key));
    },
    cancelProposal() {
      const pill = pillOf(state);
      if (!pill) return Promise.resolve(null);
      return mutateView(pill.cancelGesture, key => routes.cancelProposal(state.view, key));
    },
    proposeNext() {
      if (!canProposeNext(state)) return Promise.resolve(null);
      return mutateView(`propose:${state.view.roadmap.id}:${state.view.roadmap.revision}`, key => routes.proposeNext(state.view, key));
    },
    end: () => mutateView(`end:${state.view?.roadmap.id}`, key => routes.end(state.view, key)),
    // Retry, Replace and Omit are the same three calls from Chat and from the ToC (D36).
    recover: (stepId, action) => mutateView(`${action}:${stepId}`, key => routes.recover(state.view, stepId, action, key)),
  };
}
