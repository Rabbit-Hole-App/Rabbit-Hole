// packages/control-plane/src/learn-journey-planners.js
// The journey planners (architecture §6.3-§6.5, §7.2 rule 5, §11): planDiagnostic, planPath, adaptPath, planSection and
// resolveWithModel, each (env, input, { callModel }) with callModel(env, body, model, org) as learn-tutor-routes.js
// passes it to anthropic(). One call offers one tool on tool_choice auto: claude-opus-5-5 refuses a forced tool, as
// plannerRequest (agents/learn-tutor.js) documents. A reply without that tool call, or one the validators in
// agents/learn-journey.js reject, throws PlannerInvalid; the route then keeps the journey and every answer and shows a
// retryable error (§6.6), never cards.
//
// Inputs are sent to the model whole, as data. states (planPath, adaptPath, planSection) maps a claim id to
// { state, settled_passes, settled_negatives }: the derived state plus settled counts, never a score. evidence (adaptPath)
// is { claims: [ids], refs: [seq] }.
import { JOURNEY_SYSTEMS, JOURNEY_TOOLS, diagnosticOutput, pathOutput, resolverOutput, sectionOutput } from './agents/learn-journey.js';
import { callRole as callPlanner, invalidAs, journeyCallModel, valid } from './learn-next-steps-planner.js';
import { withAttemptKind } from './learn-usage.js';

// The shared call (learn-next-steps-planner.js) with the journey role's own tool and system text.
const callRole = (env, role, input, callModel) => callPlanner(env, role, input, callModel, { tool: JOURNEY_TOOLS[role], system: JOURNEY_SYSTEMS[role], failure: 'The journey planner is unavailable' });

// The five journey roles are LEARN_TASKS entries (learn-models.js): journey_resolver, journey_diagnostic, journey_path,
// journey_section and journey_adapt, each with effort (output_config.effort; null is the model default).

// input { topic, intake, grounding } -> { registry, probes, background? }; each mcq/prediction probe carries its key.
export async function planDiagnostic(env, input, { callModel = journeyCallModel(env) } = {}) {
  return valid('journey_diagnostic', diagnosticOutput(await callRole(env, 'journey_diagnostic', input, callModel)));
}

// input { topic, intake, states, constraints, pending_edits, registry, diagnostic_evidence_refs?, max_sections? } -> { path
// (version 1, change.source draft, the input's diagnostic_evidence_refs), concepts_added }. A draft longer than
// max_sections (a quick overview: 3) is PlannerInvalid.
export async function planPath(env, input, { callModel = journeyCallModel(env) } = {}) {
  const out = await callRole(env, 'journey_path', input, callModel);
  return valid('journey_path', pathOutput(out, { registry: input.registry, source: 'draft', diagnostic_evidence_refs: input.diagnostic_evidence_refs ?? [], max_sections: input.max_sections ?? null, states: input.states }));
}

// input { prev, edit | evidence, registry, states } -> { path, concepts_added, ambiguous, escalated }. journey_adapt
// first; journey_path (escalated: validator | ambiguous | contradictory) when the validators reject the adapt reply (no
// tool call included), when it says ambiguous: true, or, for an evidence-driven adaptation only, when the evidence it
// rests on is contradictory: one of evidence.claims is uncertain with both settled passes and settled negatives (§6.4).
// Contradiction is known before any call, so it goes straight to journey_path instead of paying for an adapt reply it
// would throw away. A learner edit escalates only on a rejection or ambiguity (controller ruling, Task 4 review round 1).
// change.evidence_refs is evidence.refs; the model never sets it.
export async function adaptPath(env, input, { callModel = journeyCallModel(env) } = {}) {
  const check = out => pathOutput(out, { prev: input.prev, registry: input.registry, source: input.evidence ? 'evidence' : 'learner_edit', evidence_refs: input.evidence?.refs ?? [], states: input.states });
  const contradictory = !!input.evidence && (input.evidence.claims ?? []).some(id => {
    const s = input.states?.[id];
    return s?.state === 'uncertain' && s.settled_passes > 0 && s.settled_negatives > 0;
  });
  let escalated = 'contradictory';
  if (!contradictory) {
    const out = await callRole(env, 'journey_adapt', input, callModel).catch(invalidAs(null));
    const checked = out && check(out);
    if (checked?.ok && out.ambiguous !== true) return { ...checked.value, ambiguous: false, escalated: null };
    escalated = checked?.ok ? 'ambiguous' : 'validator';
  }
  const out = await callRole(withAttemptKind(env, 'escalation'), 'journey_path', input, callModel);
  return { ...valid('journey_path', check(out)), ambiguous: out.ambiguous === true, escalated };
}

// input { path, section, registry, states } -> the §9.3 SectionPlan for section.id.
export async function planSection(env, input, { callModel = journeyCallModel(env) } = {}) {
  return valid('journey_section', sectionOutput(await callRole(env, 'journey_section', input, callModel), input));
}

// Resolver rule 5 (§7.2): input { text, tray } -> { kind, option_id? }. Only the tray's mode, prompt, options and
// free_text reach the model. A reply with no tool call is clarification_needed, like any unknown kind.
export async function resolveWithModel(env, { text, tray }, { callModel = journeyCallModel(env) } = {}) {
  const t = { mode: tray?.mode ?? null, prompt: tray?.prompt ?? null, options: (tray?.options || []).map(({ id, label }) => ({ id, label })), free_text: !!tray?.free_text };
  return resolverOutput(await callRole(env, 'journey_resolver', { text, tray: t }, callModel).catch(invalidAs(null)), t);
}
