// The Tutor's offers as cards ON the canvas (Fix C, T6/T7): pure. A roadmap step has one place on the canvas from the moment it is proposed until its card lands:
// a private placeholder (canvas-slots.js, an anchored slot: never a block, so never saved, shared, forked, undone or read by the Tutor) beside the passage it comes
// from. This file turns the server's RoadmapView into those placeholders and plans the change from what the canvas holds now. No React, no DOM.

import { pillOf } from './roadmap-client.js';

export const SLOT_PREFIX = 'roadmap:';
export const slotIdOf = key => `${SLOT_PREFIX}${key}`;
export const isRoadmapSlot = slot => !!slot?.roadmap;

// The source card the roadmap's source key names: 'file:<id>' is the stored file whose card holds fileRef.source.id (LearnPage sourceBlock does the same).
export const sourceBlockOf = (blocks, key) => (key ? (blocks || []).find(block => block?.fileRef?.source?.id === String(key).replace(/^file:/, '')) || null : null);

const FORMATS = new Set(['explanation', 'table']);
const formatOf = value => (FORMATS.has(value) ? value : 'explanation');

// The placeholders the view asks for, one per step (key = the step id, the same from proposal to result so the position never changes).
//   pending     the offer, not accepted: type, title, description, Accept / Cancel; no timer, no spinner.
//   checking    the server is checking the accepted card's output: private, nothing to accept (drawn as generating). An offer being checked is not drawn.
//   generating  accepted: the existing skeleton with its honest label.
//   failed      the terminal failure with its sentence (owner 2026-11-06: no Retry, Replace or Omit on explanation cards).
// busy: the gestures in flight (roadmap-client state.busy); hasBlock(id): whether the canvas already holds that card (delivered: no placeholder).
export function canvasCardsOf(view, { state: roadmapState = null, busy = roadmapState?.busy || [], hasBlock = () => false } = {}) {
  if (!view?.roadmap || !['active', 'paused', 'completed'].includes(view.roadmap.state)) return [];
  const steps = new Map((view.steps || []).map(step => [step.id, step]));
  const sourceKey = view.roadmap.scope?.source?.key ?? null;
  const cards = new Map();
  const base = (step, extra) => ({ key: extra.stepId, stepId: extra.stepId, title: extra.title ?? step?.title ?? '', description: extra.description ?? step?.goal ?? '', format: formatOf(extra.format ?? step?.format),
    sourceKey: step?.sourceRef?.source?.key ?? sourceKey, sourceRef: step?.sourceRef ?? null, passage: step?.passage ?? null, excerpt: extra.excerpt ?? step?.excerpt ?? null });
  for (const result of view.results || []) {
    if (result.existingCard || result.delivery === 'delivered' || result.delivery === 'removed' || hasBlock(result.slot?.cardId)) continue;
    const step = steps.get(result.stepId);
    if (!step) continue;
    const failed = result.stage === 'failed' || result.generation === 'failed' || result.generation === 'expired' || (result.billing === 'refunded' && result.delivery === 'not_delivered');
    // The server's stage (contracts.md results[].stage) when it sends one; saving also while this client is delivering it (busy deliver:<id>).
    const state = failed ? 'failed' : result.stage === 'saving' || busy.includes(`deliver:${result.id}`) ? 'saving' : result.stage === 'checking' || result.held ? 'checking' : 'generating';
    // The ACCEPTED proposal's words (result.title/description when the view carries them; planSlots keeps the shown offer's otherwise), never the unedited step.
    cards.set(result.stepId, { ...base(step, { stepId: result.stepId, title: result.title, description: result.description, format: result.format, excerpt: result.excerpt }), state, resultId: result.id,
      version: result.proposalVersion ?? null, named: !!result.title, cardId: result.slot?.cardId ?? null, ...(failed ? { failure: result.failure ?? null } : {}) });
  }
  // The offer is shown, and can be accepted, exactly when the pill would be (roadmap-client.js pillOf: the flag on, an active roadmap, not Ask mode, the editor closed, no
  // acceptance in flight). A proposal the server is still checking draws NOTHING (its words have not passed the check and it may yet be held or blocked; the pill is null
  // for it too). `state` absent (a caller with only the view): the view's own acceptable flag.
  const proposal = view.proposal;
  if (proposal && !proposal.link && proposal.state === 'pending') {
    const gate = roadmapState ? pillOf(roadmapState.view === view ? roadmapState : { ...roadmapState, view }) : (view.roadmap.state === 'active' ? {
      accept: proposal.acceptable === true && !busy.includes(`accept:${proposal.id}:${proposal.version}`), accepting: busy.includes(`accept:${proposal.id}:${proposal.version}`) } : null);
    // While the learner edits the offer (Ctrl/Cmd+K) the editor lives in the proposal overlay: the slot steps aside for it (same place when it returns), never both.
    if (gate && !roadmapState?.editing) {
      const step = steps.get(proposal.stepId);
      cards.set(proposal.stepId, { ...base(step, { stepId: proposal.stepId, title: proposal.title, description: proposal.description, format: proposal.format, excerpt: proposal.excerpt }), state: 'pending',
        proposalId: proposal.id, version: proposal.version, acceptable: gate.accept === true, accepting: gate.accepting === true,
        next: (view.results || []).some(r => r.stepId !== proposal.stepId) }); // a subsequent offer: Next card | Cancel in the bottom pill, none on the slot
    }
  }
  return [...cards.values()];
}

// The cards whose delivered card is not already on the canvas (placed: an id the canvas holds or is placing). The page's list can be a poll behind the canvas: after the
// card fills its slot and before the acknowledgement reaches the view, the list still names the step as generating, and its slot must not come back as a second skeleton.
export const liveCards = (cards, placed) => (cards || []).filter(card => !(card.cardId && placed(card.cardId)));

// What a slot shows of a card; two cards with the same visible fields leave the slot alone.
const SHOWN = ['state', 'title', 'description', 'format', 'excerpt', 'acceptable', 'accepting', 'next', 'proposalId', 'version', 'resultId', 'cardId'];
const same = (a, b) => SHOWN.every(field => (a[field] ?? null) === (b[field] ?? null)) && JSON.stringify(a.failure ?? null) === JSON.stringify(b.failure ?? null);

// The change that brings the canvas's roadmap slots to `cards`: { add: [card], update: [{ id, card }], remove: [id] }. A slot keeps its position for as long as it stands.
export function planSlots(slots, cards) {
  const have = new Map(slots.filter(isRoadmapSlot).map(slot => [slot.id, slot]));
  const want = new Map(cards.map(card => [slotIdOf(card.key), card]));
  return {
    add: cards.filter(card => !have.has(slotIdOf(card.key))),
    update: [...want].map(([id, card]) => [id, have.has(id) ? accepted(have.get(id).roadmap, card) : card]).filter(([id, card]) => have.has(id) && !same(have.get(id).roadmap, card)).map(([id, card]) => ({ id, card })),
    remove: [...have.keys()].filter(id => !want.has(id)),
  };
}

// UI.04: once accepted, the slot keeps the words of the offer the learner accepted (an applied Edit card included): the same step and proposal version carry the
// shown title, description and excerpt through generating, checking, saving and failure; a view that names the accepted words itself wins (result.title).
const accepted = (held, card) => (held?.proposalId && card.state !== 'pending' && card.version != null && card.version === held.version
  ? { ...card, proposalId: held.proposalId, title: card.named ? card.title : held.title, description: held.description, excerpt: card.excerpt ?? held.excerpt ?? null } : card);

// Whether a step's kept canvas place still belongs to this card: the same offer (or its accepted work, which has no proposal id) keeps it; a new proposal for the step
// after a Cancel (another proposal id) is placed afresh.
export const keepsSpot = (kept, card) => !!kept && (!card?.proposalId || !kept.proposalId || kept.proposalId === card.proposalId);
