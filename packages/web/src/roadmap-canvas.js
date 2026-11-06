// The Tutor's offers as cards ON the canvas (Fix C, T6/T7): pure. A roadmap step has one place on the canvas from the moment it is proposed until its card lands:
// a private placeholder (canvas-slots.js, an anchored slot: never a block, so never saved, shared, forked, undone or read by the Tutor) beside the passage it comes
// from. This file turns the server's RoadmapView into those placeholders and plans the change from what the canvas holds now. No React, no DOM.

export const SLOT_PREFIX = 'roadmap:';
export const slotIdOf = key => `${SLOT_PREFIX}${key}`;
export const isRoadmapSlot = slot => !!slot?.roadmap;

// The source card the roadmap's source key names: 'file:<id>' is the stored file whose card holds fileRef.source.id (LearnPage sourceBlock does the same).
export const sourceBlockOf = (blocks, key) => (key ? (blocks || []).find(block => block?.fileRef?.source?.id === String(key).replace(/^file:/, '')) || null : null);

const FORMATS = new Set(['explanation', 'table']);
const formatOf = value => (FORMATS.has(value) ? value : 'explanation');

// The placeholders the view asks for, one per step (key = the step id, the same from proposal to result so the position never changes).
//   pending     the offer, not accepted: type, title, description, Accept / Cancel; no timer, no spinner.
//   checking    the server is checking the offer, or the accepted card's output: private, nothing to accept.
//   generating  accepted: the existing skeleton with its honest label.
//   failed      the terminal failure with its sentence and the recoveries the server allows.
// busy: the gestures in flight (roadmap-client state.busy); hasBlock(id): whether the canvas already holds that card (delivered: no placeholder).
export function canvasCardsOf(view, { busy = [], hasBlock = () => false } = {}) {
  if (!view?.roadmap || !['active', 'paused', 'completed'].includes(view.roadmap.state)) return [];
  const steps = new Map((view.steps || []).map(step => [step.id, step]));
  const sourceKey = view.roadmap.scope?.source?.key ?? null;
  const cards = new Map();
  const base = (step, extra) => ({ key: extra.stepId, stepId: extra.stepId, title: extra.title ?? step?.title ?? '', description: extra.description ?? step?.goal ?? '', format: formatOf(extra.format ?? step?.format),
    sourceKey: step?.sourceRef?.source?.key ?? sourceKey, sourceName: step?.sourceRef?.source?.name ?? view.roadmap.scope?.source?.name ?? null, sourceRef: step?.sourceRef ?? null, passage: step?.passage ?? null });
  for (const result of view.results || []) {
    if (result.existingCard || result.delivery === 'delivered' || result.delivery === 'removed' || hasBlock(result.slot?.cardId)) continue;
    const step = steps.get(result.stepId);
    if (!step) continue;
    const failed = result.generation === 'failed' || result.generation === 'expired' || (result.billing === 'refunded' && result.delivery === 'not_delivered');
    const state = failed ? 'failed' : result.held ? 'checking' : 'generating';
    cards.set(result.stepId, { ...base(step, { stepId: result.stepId, title: step.title, format: step.format }), state, resultId: result.id, cardId: result.slot?.cardId ?? null,
      ...(failed ? { failure: result.failure ?? null, recovery: result.recovery ?? [] } : {}) });
  }
  const proposal = view.proposal;
  if (proposal && !proposal.link && ['pending', 'checking'].includes(proposal.state) && view.roadmap.state === 'active') {
    const step = steps.get(proposal.stepId), gesture = `accept:${proposal.id}:${proposal.version}`;
    cards.set(proposal.stepId, { ...base(step, { stepId: proposal.stepId, title: proposal.title, description: proposal.description, format: proposal.format }), state: proposal.state === 'pending' ? 'pending' : 'checking',
      proposalId: proposal.id, version: proposal.version, acceptable: proposal.acceptable === true, accepting: busy.includes(gesture), cancelling: busy.includes(`cancel:${proposal.id}:${proposal.version}`) });
  }
  return [...cards.values()];
}

// What a slot shows of a card; two cards with the same visible fields leave the slot alone.
const SHOWN = ['state', 'sourceName', 'title', 'description', 'format', 'acceptable', 'accepting', 'cancelling', 'proposalId', 'version', 'resultId', 'cardId'];
const same = (a, b) => SHOWN.every(field => (a[field] ?? null) === (b[field] ?? null)) && JSON.stringify(a.failure ?? null) === JSON.stringify(b.failure ?? null) && JSON.stringify(a.recovery ?? null) === JSON.stringify(b.recovery ?? null);

// The change that brings the canvas's roadmap slots to `cards`: { add: [card], update: [{ id, card }], remove: [id] }. A slot keeps its position for as long as it stands.
export function planSlots(slots, cards) {
  const have = new Map(slots.filter(isRoadmapSlot).map(slot => [slot.id, slot]));
  const want = new Map(cards.map(card => [slotIdOf(card.key), card]));
  return {
    add: cards.filter(card => !have.has(slotIdOf(card.key))),
    update: [...want].filter(([id, card]) => have.has(id) && !same(have.get(id).roadmap, card)).map(([id, card]) => ({ id, card })),
    remove: [...have.keys()].filter(id => !want.has(id)),
  };
}
