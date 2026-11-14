import { ScenePlanSchema, evalScalar } from './interact-plan.js';
import { isReviewProposal, plainPrompt } from './generation-review.js';
import { interactIdentity } from './interact-stage.js';

// The Chat side of INT-03 (docs/features/interact.md): a validated ScenePlan becomes the view model the existing generation review card
// draws as plan detail. Pure: no React, no model call, no network. The learner sees the exact Title and the concise card description
// (the card's own title and description slots), then this detail: full Story, scene design, Mode, Controls with exact labels, units
// and defaults, and the supporting panels. Never raw JSON, hashes, provider settings or internal task names.

export const MODE_LABELS = Object.freeze({ static: 'Static', time: 'Over time', experiment: 'Experiment' });
const SHA256 = /^[0-9a-f]{64}$/;
// The server names a model profile by a short hash (interact-models.js interactProfileHash: 16 hex characters), a plan by the full SHA-256.
const PROFILE_HASH = /^[0-9a-f]{16,64}$/;

const decimals = number => (String(number).split('.')[1] ?? '').length;
const shown = (number, places) => number.toFixed(places);
const unitText = unit => (unit ? ` ${unit}` : '');
const list = items => items.join(', ');
const signed = number => `${number > 0 ? '+' : number < 0 ? '−' : ''}${Math.abs(number)}`;

// One control as the learner reads it on the Canvas: its exact label and what it does, with units, range and default.
export function controlDetail(control) {
  const base = { id: control.id, label: control.label, type: control.type, purpose: control.purpose };
  switch (control.type) {
    case 'playback': return { ...base, detail: `${control.labels.paused}, ${control.labels.playing} and ${control.labels.ended}` };
    case 'scrubber': return { ...base, detail: `seek to any instant, in seconds, in steps of ${control.step} s` };
    case 'number': {
      const places = Math.max(decimals(control.step), decimals(control.min), decimals(control.max), decimals(control.default));
      const at = n => `${shown(n, places)}${unitText(control.unit)}`;
      return { ...base, detail: `starts at ${at(control.default)}, from ${at(control.min)} to ${at(control.max)}, in steps of ${at(control.step)}` };
    }
    case 'select': return { ...base, detail: `${list(control.options.map(o => o.label))}; starts at ${control.options.find(o => o.value === control.default)?.label ?? control.default}` };
    case 'boolean': return { ...base, detail: `On or Off; starts ${control.default ? 'On' : 'Off'}` };
    case 'index': return { ...base, detail: `${list(control.items.map(i => i.label))}; starts at ${control.items[control.default]?.label ?? control.default}` };
    case 'multi_select': return { ...base, detail: `${list(control.items.map(i => i.label))}; starts with ${control.default.length ? list(control.default.map(i => control.items[i]?.label ?? i)) : 'none selected'}` };
    case 'action': return { ...base, detail: control.effect };
    case 'target': return { ...base, detail: `${control.interaction === 'drag' ? 'select or drag' : 'select'}; ${control.effect}` };
    case 'seek': return { ...base, detail: control.effect };
    case 'reset': return { ...base, detail: control.effect };
    default: return { ...base, detail: '' };
  }
}

// The timeline the learner scrubs: its label, the displayed range at the starting values, and its marks. null for an untimed scene.
// The range is the plan's own arithmetic (evalScalar), never retyped; a plan that cannot be evaluated here shows the label alone.
export function timelineDetail(plan) {
  const t = plan.mode.timeline;
  if (!t) return null;
  const values = { ...Object.fromEntries(Object.entries(plan.mode.fixedValues).filter(([, v]) => typeof v === 'number')), ...Object.fromEntries(plan.controls.filter(c => c.type === 'number').map(c => [c.binding.id, c.default])) };
  let range = null, marks = [];
  try {
    const offset = evalScalar(t.displayOffset, values), end = evalScalar(t.end, values);
    const places = 3;
    // A signed range only where the displayed time has an origin inside the motion (Standard's time from the apex); from zero it is plain.
    const show = number => (offset === 0 ? String(number) : signed(number));
    range = `${show(Number(offset.toFixed(places)))} to ${show(Number((offset + end).toFixed(places)))} s`;
    marks = t.markers.map(m => m.label);
  } catch { range = null; }
  return { label: t.label, range, marks };
}

// The view model for a valid plan.
export function planDetail(plan) {
  return {
    story: plan.story,
    scene: {
      description: plan.scene.description,
      entities: plan.scene.entities.map(e => ({ label: e.label, purpose: e.purpose })),
      quantities: plan.scene.quantities.map(q => ({ label: q.label, unit: q.unit, meaning: q.meaning })),
      observations: plan.scene.observations.map(o => o.text),
    },
    mode: { label: MODE_LABELS[plan.mode.kind], initialState: plan.mode.initialState, timeline: timelineDetail(plan) },
    controls: plan.controls.map(controlDetail),
    supports: plan.supportingVisuals.map(s => ({ title: s.title, description: s.description, observations: s.observations.map(o => o.text) })),
    assumptions: plan.assumptions,
    limitations: plan.limitations,
  };
}

// The description the card shows, as plain text: a v3 proposal keeps it as a prompt with escapes (generation-review.js).
const shownDescription = p => (isReviewProposal(p) ? plainPrompt(p.prompt, p.references) ?? '' : p.prompt ?? p.description ?? '');

// The model the review card draws for a proposal of the new flow. -> null for any other proposal.
// ready is false (Generate stays off, the reason is said) unless the signed identity is complete, the plan is whole and valid, and the
// title and description the card shows ARE the plan's: Generate approves exactly what is drawn. The server stays the authority on the
// hash (approve() re-checks it); this is the fail-closed half the browser can do without the signing key.
// plan: the plan the job route served for this proposal (interact-stage.js planOfProposal), or null while it is not available.
export function reviewModel(proposal, plan = null) {
  const identity = interactIdentity(proposal);
  if (!identity) return null;
  const description = shownDescription(proposal);
  const refuse = reason => ({ newFlow: true, ready: false, reason, identity, title: proposal.title, cardDescription: description, detail: null });
  if (!plan) return refuse('The scene plan is not available yet.');
  if (!SHA256.test(identity.hash ?? '') || !PROFILE_HASH.test(identity.profileHash ?? '')) return refuse('This plan has no approval identity, so it cannot be generated.');
  const parsed = ScenePlanSchema.safeParse(plan);
  if (!parsed.success) return refuse('The scene plan is not complete, so it cannot be generated.');
  const value = parsed.data;
  if (value.schemaVersion !== identity.version) return refuse('This plan is in a version this app cannot generate.');
  if (proposal.title !== value.title || description !== value.cardDescription) return refuse('The card text does not match the reviewed plan. Ask for the plan again.');
  return { newFlow: true, ready: true, reason: null, identity, title: value.title, cardDescription: value.cardDescription, detail: planDetail(value) };
}
