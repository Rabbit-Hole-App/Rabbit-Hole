// The roadmap client's pure parts (R4 contract ui.md): wire shapes, the reducer, what each surface shows, the Tab ownership rule,
// idempotent delivery planning and the invitation idle rule. No React, no fetch, no clock: unit-tested against the recorded
// fixtures (docs/features/explain-on-canvas/contracts/fixtures). State is always the server's: nothing here predicts an outcome.
import { STRINGS } from './roadmap-strings.js';
import { isUnfinishedRoadmap } from './roadmap-contract.js';
import { stalePreview } from './inline-ai-proposal.js';
import { COVERAGE_STRINGS, coverageLines, choicesOf } from './roadmap-source-coverage.js';

export const BASE = '/api/learn/roadmap';
const q = boardId => `?boardId=${encodeURIComponent(boardId)}`;

// --- wire (fixtures win over api.md prose where they differ: mismatches are listed in the hand-back) -------------------------
// Routes, relative to BASE. Each returns { method, path, body? }.
export const routes = {
  status: boardId => ({ method: 'GET', path: `${BASE}${q(boardId)}` }),
  invitation: boardId => ({ method: 'GET', path: `${BASE}/invitations${q(boardId)}` }),
  invite: (boardId, sourceKeys, idleKey) => ({ method: 'POST', path: `${BASE}/invitations`, body: { boardId, sourceKeys, idleKey } }),
  dismiss: (boardId, id, actionKey) => ({ method: 'POST', path: `${BASE}/invitations/${id}/dismiss`, body: { boardId, actionKey } }),
  create: (boardId, fields, actionKey) => ({ method: 'POST', path: BASE, body: { boardId, ...fields, actionKey } }),
  answer: (view, fields, actionKey) => mutate(view, 'answer', fields, actionKey),
  revise: (view, fields, actionKey) => mutate(view, 'revise', fields, actionKey),
  acceptPlan: (view, actionKey) => mutate(view, 'accept-plan', { planVersion: view.roadmap.planVersion }, actionKey),
  proposeNext: (view, actionKey) => mutate(view, 'steps/propose', {}, actionKey),
  acceptProposal: (view, actionKey) => mutate(view, `proposals/${view.proposal.id}/accept`, { proposalVersion: view.proposal.version }, actionKey),
  cancelProposal: (view, actionKey) => mutate(view, `proposals/${view.proposal.id}/cancel`, { proposalVersion: view.proposal.version }, actionKey),
  deliver: (view, resultId, actionKey) => mutate(view, `results/${resultId}/deliver`, {}, actionKey),
  ack: (view, result, cardId, boardRevision, actionKey) => mutate(view, `results/${result.id}/ack`, { resultVersion: result.resultVersion ?? 1, cardId, boardRevision }, actionKey),
  removed: (view, resultId, cardId, actionKey) => mutate(view, `results/${resultId}/removed`, { cardId }, actionKey),
  recover: (view, stepId, action, actionKey) => mutate(view, `steps/${stepId}/${action}`, {}, actionKey),
  // R5: preview an edit of the pending proposal, apply or discard the preview, and offer an existing card as the next step.
  draft: (view, instruction, actionKey) => mutate(view, `proposals/${view.proposal.id}/drafts`, { proposalVersion: view.proposal.version, instruction }, actionKey),
  applyDraft: (view, draft, actionKey) => mutate(view, `drafts/${draft.draftId}/apply`, { draftRevision: draft.revision, proposalVersion: draft.proposalVersion }, actionKey),
  discardDraft: (view, draft) => ({ method: 'POST', path: `${BASE}/${view.roadmap.id}/drafts/${draft.draftId}/discard`, body: { boardId: view.roadmap.boardId } }),
  linkCard: (view, cardId, reason, actionKey) => mutate(view, 'steps/link', { cardId, reason }, actionKey),
  mode: (view, mode) => ({ method: 'POST', path: `${BASE}/${view.roadmap.id}/mode`, body: { boardId: view.roadmap.boardId, mode } }),
  end: (view, actionKey) => mutate(view, 'end', {}, actionKey),
};
function mutate(view, tail, fields, actionKey) {
  const { id, boardId, revision } = view.roadmap;
  return { method: 'POST', path: `${BASE}/${id}/${tail}`, body: { boardId, revision, ...fields, actionKey } };
}

// One action key per gesture, reused by automatic retries of that gesture and dropped once the server answered it (a recorded
// replay returns the same outcome for the same key; a new gesture gets a new key). Keys match learn-usage.js CLIENT_KEY.
export function actionKeys(random = () => globalThis.crypto.randomUUID()) {
  const held = new Map();
  return {
    for(gesture) { if (!held.has(gesture)) held.set(gesture, `ak_${random()}`); return held.get(gesture); },
    done(gesture) { held.delete(gesture); },
  };
}

// --- state ----------------------------------------------------------------------------------------------------------------
export const initialState = () => ({ flag: 'unknown', view: null, invitation: null, dismissed: [], suppressed: null, notice: null, busy: [], mode: 'auto', draft: null, editing: false, limitation: null });

const sameRoadmap = (a, b) => a?.roadmap?.id === b?.roadmap?.id;
// A view older than the one held (same roadmap) is ignored: a slow poll never rolls the screen back.
const newer = (held, next) => !held || !sameRoadmap(held, next) || next.roadmap.revision >= held.roadmap.revision;

export function reduce(state, event) {
  switch (event.type) {
    case 'view': if (!event.view?.roadmap) return { ...state, flag: 'on', view: null, draft: null, editing: false }; return newer(state.view, event.view) ? withPreview({ ...state, flag: 'on', view: event.view, notice: null, limitation: null }) : state;
    // 409: the response carries the current state; it replaces ours even when its revision looks lower (the server is the truth).
    case 'conflict': return withPreview({ ...state, flag: 'on', view: event.current || state.view, notice: STRINGS.stale });
    // R5: the editor box and its preview. A preview for a version the server no longer shows is dropped by withPreview (never trusted over the view).
    case 'edit_open': return state.view?.proposal && state.view.edit === true ? { ...state, editing: true } : state;
    case 'edit_close': return { ...state, editing: false, draft: null };
    case 'draft': return { ...state, draft: event.draft };
    // Anything else refused (credits, source changed): the sentence comes from the response; the proposal stays as the server has it.
    case 'refused': return { ...state, view: event.current && newer(state.view, event.current) ? event.current : state.view, notice: event.message || null, limitation: event.limitation || null };
    case 'invitation': return { ...state, flag: 'on', invitation: event.invitation && !state.dismissed.includes(event.invitation.id) ? event.invitation : null, suppressed: event.suppressed || null };
    // Dismissal scopes to this invitation id only: the id is remembered, nothing global changes.
    case 'dismissed': return { ...state, invitation: state.invitation?.id === event.id ? null : state.invitation, dismissed: [...state.dismissed, event.id] };
    case 'flag_off': return { ...initialState(), flag: 'off', mode: state.mode };
    case 'mode': return { ...state, mode: event.mode };
    case 'begin': return state.busy.includes(event.gesture) ? state : { ...state, busy: [...state.busy, event.gesture] };
    case 'end': return { ...state, busy: state.busy.filter(g => g !== event.gesture) };
    default: return state;
  }
}

// A preview whose proposal is no longer the pending one in the view is dropped; the editor closes with it.
const withPreview = next => (next.draft && stalePreview(next.draft, next.view) ? { ...next, draft: null, editing: false } : next.editing && !(next.view?.proposal && next.view.edit === true) ? { ...next, editing: false } : next);

// --- what each surface shows (all derived from the server view; the UI keeps nothing of its own) ---------------------------
// Contract shape (R3 sourceRef): scope.source.name, relation.sourceRef.source.name.
const titleOf = x => x?.source?.name || x?.sourceRef?.source?.name || x?.title || '';
export const relationTitle = proposal => titleOf(proposal?.sourceRelation);
export const enabled = state => state.flag !== 'off';
const unfinished = view => !!view && isUnfinishedRoadmap(view.roadmap.state);
const resultsOf = view => view?.results || [];
const askMode = state => state.mode === 'ask';

// The compact pill and its overlay. Ask pauses new initiative: no new proposal is shown, the accepted work still finishes.
// acceptable comes from the server (a held or blocked version is not accept-ready); the busy latch stops a second request.
export function pillOf(state) {
  const view = state.view, proposal = view?.proposal;
  if (!enabled(state) || !proposal || view.roadmap.state !== 'active' || proposal.state !== 'pending' || askMode(state)) return null;
  const gesture = `accept:${proposal.id}:${proposal.version}`;
  return {
    proposalId: proposal.id, version: proposal.version, title: proposal.title, description: proposal.description, format: proposal.format,
    source: relationTitle(proposal), sourceKey: proposal.sourceRelation?.sourceRef?.source?.key || proposal.sourceRelation?.source?.key || null, position: proposal.position, accept: proposal.acceptable === true && !state.editing && !state.busy.includes(gesture), gesture,
    cancelGesture: `cancel:${proposal.id}:${proposal.version}`, link: proposal.link || null, stepId: proposal.stepId, canEdit: state.view.edit === true && !proposal.link,
  };
}
// "Next step ready": only when a pending proposal exists, the server says it is ready and the overlay is offscreen. It navigates.
export const indicatorOf = (state, { offscreen }) => (nextStepReady(state) && offscreen ? { label: STRINGS.nextReady } : null);
export const nextStepReady = state => !!pillOf(state) && state.view.nextStepReady === true;

const stepNav = (step, view) => {
  const result = resultsOf(view).find(r => r.stepId === step.id);
  if (result?.delivery === 'delivered' && step.state === 'delivered') return { kind: 'card', cardId: result.slot.cardId };
  if (view.proposal?.stepId === step.id && view.proposal.state === 'pending') return { kind: 'proposal' };
  return null; // an entry with neither does not pretend there is anything to navigate to
};
export function recoveryOf(view) {
  return resultsOf(view).filter(r => r.failure && r.recovery?.length).map(r => ({ resultId: r.id, stepId: r.stepId, message: r.failure.message || STRINGS.failed, actions: r.recovery }));
}

// Manual Propose next step: at most one next independent step, after the accepted step's cards are ready or its failure resolved.
export function canProposeNext(state) {
  const view = state.view;
  if (!enabled(state) || !view || !['active', 'paused'].includes(view.roadmap.state)) return false;
  if (view.proposal && ['checking', 'held', 'pending'].includes(view.proposal.state)) return false;
  if (resultsOf(view).some(r => r.generation === 'pending' || r.generation === 'generating' || (r.generation === 'generated' && r.delivery === 'not_delivered') || (r.failure && r.recovery?.length))) return false;
  if (view.roadmap.deliveredCount >= view.roadmap.ceiling) return false;
  return view.steps.some(s => s.state === 'planned');
}
// ToC roadmap section. null = nothing to show (flag off, no unfinished or recent roadmap).
export function tocOf(state) {
  const view = state.view;
  if (!enabled(state) || !view) return null;
  const rm = view.roadmap, plan = view.plan;
  return {
    state: rm.state, depth: STRINGS.depthName[rm.depth] || rm.depth, practice: STRINGS.explanationsOnly,
    outcome: plan?.outcome || null, assumptions: plan?.assumptions || [], stoppingPoint: plan?.stoppingPoint || null,
    steps: view.steps.map(s => {
      const result = resultsOf(view).find(r => r.stepId === s.id);
      return { id: s.id, position: s.position, title: s.title, state: s.state, status: STRINGS.stepState[s.state] || s.state, removed: result?.delivery === 'removed', nav: stepNav(s, view) };
    }),
    recovery: recoveryOf(view), question: view.question, limitation: view.limitation,
    actions: {
      acceptPlan: rm.state === 'proposed' && plan ? { planVersion: plan.version } : null,
      editPlan: ['questioning', 'proposed', 'active', 'paused', 'completed'].includes(rm.state),
      proposeNext: canProposeNext(state),
      end: isUnfinishedRoadmap(rm.state) || rm.state === 'completed',
    },
  };
}
// Chat lines for the current state. Ask mode hides new initiative lines but never an accepted card's progress.
export function chatOf(state) {
  const view = state.view, lines = [];
  if (!enabled(state)) return lines;
  if (state.notice) lines.push({ id: 'notice', kind: 'notice', text: state.notice });
  if (!view && choicesOf(state.limitation).length) lines.push({ id: 'source-coverage', kind: 'coverage', text: COVERAGE_STRINGS.choose, notes: coverageLines(state.limitation), choices: choicesOf(state.limitation) }); // R7a
  if (view) {
    const rm = view.roadmap;
    if (rm.state === 'draft') lines.push({ id: 'planning', kind: 'status', text: STRINGS.planning });
    if (rm.state === 'proposed' && !askMode(state)) lines.push({ id: 'plan', kind: 'status', text: STRINGS.planReady });
    if (rm.state === 'paused' && view.steps.some(s => s.state === 'cancelled')) lines.push({ id: 'cancelled', kind: 'status', text: STRINGS.cancelled });
    if (rm.state === 'paused') lines.push({ id: 'paused', kind: 'status', text: STRINGS.paused });
    if (rm.state === 'completed') lines.push({ id: 'completed', kind: 'status', text: STRINGS.completed });
    if (view.limitation) lines.push({ id: 'limitation', kind: 'limitation', text: view.limitation.message, offers: view.limitation.offers || [] });
    if (view.question) lines.push({ id: view.question.id, kind: 'question', label: STRINGS.questionLabel, text: view.question.text, options: view.question.options || [] });
    for (const r of resultsOf(view)) if (r.held) lines.push({ id: `held:${r.id}`, kind: 'status', text: STRINGS.checking });
    for (const item of recoveryOf(view)) lines.push({ id: `recover:${item.resultId}`, kind: 'recovery', text: item.message, item });
  }
  return lines;
}
// The invitation card: the server offers (Auto-suggest, mode and unfinished roadmap are decided there); the client only holds it
// back while the learner is typing or an answer is streaming, and in Ask mode. Reload re-reads the same invitation.
export function invitationOf(state, { typing = false, answering = false } = {}) {
  const iv = state.invitation;
  if (!enabled(state) || !iv || iv.state !== 'offered' || typing || answering || askMode(state) || unfinished(state.view)) return null;
  return { id: iv.id, text: STRINGS.invite(iv.title), sourceKeys: iv.sourceKeys, choices: [{ id: 'explain_on_canvas', label: STRINGS.explain }, { id: 'keep_here', label: STRINGS.keepHere }] };
}
// Hover-only label from the actor's private index (D37): derived from the view, never stored on or read from the card.
export function stepLabelFor(view, cardId) {
  const result = resultsOf(view).find(r => r.slot?.cardId === cardId);
  const step = result && view.steps.find(s => s.id === result.stepId);
  return step ? STRINGS.stepLabel(step.position, view.steps.length) : null;
}
// Every learner string a state can put on screen, for the no-price assertion.
export const texts = state => [...chatOf(state).flatMap(l => [l.text, l.label, ...(l.options || []).map(o => o.label), ...(l.offers || []).map(o => o.label), ...(l.notes || []), ...(l.choices || []).map(o => o.label)]),
  pillOf(state)?.title, pillOf(state)?.description].filter(Boolean);

// --- Tab ownership (D18) -------------------------------------------------------------------------------------------------
// ctx: the keydown fields (key, ctrlKey, metaKey, altKey, shiftKey, repeat, isComposing, keyCode) plus
//   pill (pillOf), blocked (the key belongs to a field, dialog, menu, composer, card widget or code editor: the canvas's `busy`
//   plus shortcut-owner.js pageKeyAllowed), editorOpen, presenting, readOnly. Anything else: Tab keeps its normal focus meaning.
export function tabAccepts(ctx) {
  const e = ctx.event;
  if (!e || e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || e.isComposing || e.keyCode === 229) return false;
  if (!ctx.pill || !ctx.pill.accept) return false;
  if (ctx.blocked || ctx.editorOpen || ctx.presenting || ctx.readOnly) return false;
  return true;
}

// Who holds the keyboard for Tab: the page, the canvas surface or the proposal overlay itself. Any other focused control (toolbar,
// ToC row, composer, panel) keeps its normal Tab meaning. active: document.activeElement (duck-typed for tests).
export const keyboardOwned = active => !active || active.tagName === 'BODY' || active === active.ownerDocument?.documentElement || !!active.closest?.('[data-canvas-surface],[data-roadmap-overlay]');

// --- idempotent delivery -------------------------------------------------------------------------------------------------
// Results to deliver now: generated, not held, not yet delivered. The deliver route runs the entitlement predicate; a result that
// is not entitled simply returns nothing to insert.
export const deliverable = view => resultsOf(view).filter(r => r.generation === 'generated' && !r.held && r.delivery === 'not_delivered');
// Which authorized cards to insert: every card whose minted id is not already on the canvas. Reload, a second device and a lost
// acknowledgement therefore re-run this and get the same card once (the id is the server's, never minted here).
export function planDelivery(body, hasBlock) {
  const cards = body?.cards || [];
  return { insert: cards.filter(c => !hasBlock(c.block.id)).map(c => c.block), cardIds: cards.map(c => c.block.id), ackRequired: body?.ackRequired !== false && cards.length > 0 };
}

// --- a dropped Markdown source becoming ready ----------------------------------------------------------------------------------
// A Markdown card the learner just dropped (pending: block ids) is a ready source once its STORED source (fileRef.source.id + rev, the
// sha256 the server checks) is named by the board that was SAVED: that save writes the reference the server authorizes reads by.
// -> [{ blockId, key: 'file:<id>', rev }] for the cards to report now; the key is the server's `file:<id>` (no revision suffix).
export function readyMarkdownSources({ pending, blocks = [], savedBlocks = [] }) {
  const named = block => (block?.fileRef?.source?.id && block.fileRef.source.rev ? `${block.fileRef.source.id}@${block.fileRef.source.rev}` : null);
  const saved = new Map(savedBlocks.map(block => [block?.id, named(block)]));
  const ready = [];
  for (const block of blocks) {
    const at = named(block);
    if (!pending.has(block.id) || block.type !== 'file' || block.kind !== 'markdown' || !at || saved.get(block.id) !== at) continue;
    ready.push({ blockId: block.id, key: `file:${block.fileRef.source.id}`, rev: block.fileRef.source.rev });
  }
  return ready;
}

// --- invitation idle rule ------------------------------------------------------------------------------------------------
// Sources that become ready are collected and reported together once the learner is idle (not typing, no answer streaming):
// one grouped report per idle window. Reporting never interrupts: nothing is shown here, the server answers with the invitation.
export function idleGrouper({ isIdle, report }) {
  const waiting = new Set();
  let window = 0;
  return {
    ready(key) { waiting.add(key); },
    tick() {
      if (!waiting.size || !isIdle()) return false;
      const sourceKeys = [...waiting].sort();
      waiting.clear();
      window += 1;
      report({ sourceKeys, idleKey: `idle-${window}-${sourceKeys.join('-')}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 120) });
      return true;
    },
    pending: () => waiting.size,
  };
}
