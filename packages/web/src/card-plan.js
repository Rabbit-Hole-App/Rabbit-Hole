// Phase 1 of card composition (docs/features/learn-card-composition.md):
// authoring and review discipline only - no product UI, schema or planner.
// Every new card declares a plan before it is built: the concept, a one-
// sentence objective, prerequisites, the causal steps it walks, its primary
// interaction, its check, and a boundary decision with a reason. Mechanical
// signals from the rubric that can be read reliably off a scene are raised as
// review flags; a flag does not split anything - the plan must acknowledge it
// with the reviewer's reason (e.g. "staged: one causal pipeline"). Density
// alone is never a flag. Nothing here names a card, a board or a lesson.

export const BOUNDARY_DECISIONS = ['single', 'staged', 'sequence'];
export const RELATIONSHIPS = ['prerequisite', 'deepens', 'alternative_explanation', 'practice_for'];
export const OBJECTIVE_STEM = 'After this card, the learner should understand ';

const text = value => typeof value === 'string' && value.trim().length > 0;
const texts = value => Array.isArray(value) && value.length > 0 && value.every(text);

// Problems with a declared plan; an empty list means it can be reviewed.
export function planProblems(plan) {
  if (!plan || typeof plan !== 'object') return ['the card exports no plan'];
  const problems = [];
  const need = (ok, message) => { if (!ok) problems.push(message); };
  need(text(plan.concept), 'plan.concept names the concept the card belongs to');
  need(text(plan.objective) && plan.objective.startsWith(OBJECTIVE_STEM), `plan.objective completes "${OBJECTIVE_STEM}…"`);
  if (text(plan.objective)) {
    const body = plan.objective.slice(OBJECTIVE_STEM.length).trim();
    need(body.endsWith('.') && !/[.!?]\s/.test(body.slice(0, -1)), 'plan.objective is one sentence');
  }
  need(Array.isArray(plan.prerequisites) && plan.prerequisites.every(text), 'plan.prerequisites lists what the learner needs first (may be empty)');
  need(texts(plan.causalSteps), 'plan.causalSteps lists the steps the card walks');
  need(text(plan.primaryInteraction), 'plan.primaryInteraction says what the learner changes and what it reveals');
  need(text(plan.check), 'plan.check names the check or practice ("none: …" with the reason when there is none)');
  const boundary = plan.boundary || {};
  need(BOUNDARY_DECISIONS.includes(boundary.decision), `plan.boundary.decision is one of ${BOUNDARY_DECISIONS.join(', ')}`);
  need(text(boundary.reason), 'plan.boundary.reason says why');
  if (boundary.decision === 'staged') need(texts(plan.causalSteps) && plan.causalSteps.length >= 2, 'a staged card stages at least two causal steps');
  if (boundary.decision === 'sequence') {
    // A sequence is documented, not wired: the cards stay visually adjacent on
    // the board and the plan records the path and relationships - no next-links.
    const sequence = boundary.sequence || {};
    need(text(sequence.name), 'a sequence card names its sequence');
    need(Number.isInteger(sequence.position) && Number.isInteger(sequence.of) && sequence.position >= 1 && sequence.position <= sequence.of && sequence.of >= 2 && sequence.of <= 5,
      'a sequence card gives its position of 2-5 cards');
    need(Array.isArray(sequence.relationships) && sequence.relationships.every(r => RELATIONSHIPS.includes(r?.type) && text(r?.card)),
      `sequence relationships are typed (${RELATIONSHIPS.join(', ')}) and name a card`);
  }
  return problems;
}

// The rubric signals a scene shows reliably. Each is a reason to look, not a
// verdict: the plan acknowledges it (plan.boundary.reviewed[flag] = reason).
// Readability (rubric 8) is not here - it is a hard gate (legibility floors,
// cellLegibilityIssues).
export const FLAG_RUBRIC = {
  'title-and': 'rubric 2: the title joins two things with "and"',
  'objective-two-clauses': 'one-sentence test: the objective reads as two clauses',
  'many-controls': 'rubric 4: three or more controls - are they one group?',
  'tall-default': 'rubric 9: the default state may need scrolling before the consequence shows',
  'separately-language': 'rubric 10: the card says "separately" / "another thing"',
};
export const TALL_SCENE = 900; // scene units; the review viewport shows about this much card

export function boundaryFlags({ scene, plan, visibleText = [] }) {
  const flags = [];
  // A depth card's title is "<Concept> · <Depth>: <own title>"; only its own part counts.
  const ownTitle = String(scene?.title || '').includes(': ') ? scene.title.slice(scene.title.indexOf(': ') + 2) : String(scene?.title || '');
  if (/\band\b|&/i.test(ownTitle)) flags.push('title-and');
  const body = String(plan?.objective || '').slice(OBJECTIVE_STEM.length);
  if (/;|,\s*and\b|\band also\b|\bas well as\b/i.test(body)) flags.push('objective-two-clauses');
  if ((scene?.inputs || []).filter(input => !input.hidden).length >= 3) flags.push('many-controls');
  if ((scene?.height || 0) > TALL_SCENE) flags.push('tall-default');
  if (visibleText.some(line => /\b(separately|another thing|unrelated)\b/i.test(line))) flags.push('separately-language');
  return flags;
}

// Raised flags the plan has not acknowledged with a reason.
export function unreviewedFlags(flags, plan) {
  const reviewed = plan?.boundary?.reviewed || {};
  return flags.filter(flag => !text(reviewed[flag]));
}
