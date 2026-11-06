// R4.09: the checks a generated card must pass before publication, as one deterministic verdict (v1.4 4.4, 6.2, 6.4). The money and
// publication state belongs to State's roadmap-publish.js; this returns what the checks establish and whether delivery must be held,
// blocked, or ended with the refund rule. Grounding and safety run together inside the overall checking deadline.
import { cardText, checkSupport, referenceProblems } from './roadmap-grounding.js';
import { screenText } from './roadmap-safety.js';

// Why a card was withheld, from a verdict or its stored check_json (same fields). Only 'safety' and 'personal_risk' are refusals; 'source' is a grounding problem
// (quote not in the passage, contradiction, unsupported claim); 'unavailable' is a check that could not finish.
export function withheldCause({ grounding, safety }) {
  if (safety?.action === 'pause_support') return 'personal_risk';
  if (safety?.decision === 'block') return 'safety';
  if (grounding?.validation === 'blocked' || (grounding?.validation === 'held' && grounding.reason !== 'checking_unavailable')) return 'source';
  return 'unavailable';
}

// { block, passage, rev, instruction? } -> { validation: 'passed'|'held'|'blocked', publishable, terminal, pauseSupport, limitation, grounding, safety }
// validation uses the result-validation enum of roadmap-contract.js. `held` with terminal=false is repairable (unsupported claims: one
// regeneration is the caller's); terminal=true means checking could not conclude in time: end the delivery and refund.
// grounding: false (owner MVP policy for ordinary explanations, 2026-11-06) records the citation check as not run, never as passed.
export async function checkRoadmapCard({ block, passage, rev, instruction = '', grounding: runGrounding = true }, deps) {
  const parts = [...(instruction.trim() ? [{ role: 'learner', text: instruction }] : []), { role: 'source', text: passage }, { role: 'output', text: cardText(block) }];
  const notRun = () => referenceProblems({ block, passage, rev }).includes('source_revision_mismatch')
    ? { validation: 'blocked', reason: 'source_revision_mismatch', calls: 0, unresolved: [], failed: [] }
    : { validation: 'not_run', reason: 'owner_mvp_policy', calls: 0, unresolved: [], failed: [] };
  const [grounding, safety] = await Promise.all([runGrounding ? checkSupport({ block, passage, rev }, deps) : notRun(), screenText(parts, deps)]);
  const blocked = grounding.validation === 'blocked' || safety.decision === 'block';
  const ok = (grounding.validation === 'passed' || grounding.validation === 'not_run') && safety.publishable;
  return { validation: blocked ? 'blocked' : ok ? 'passed' : 'held', publishable: ok && !blocked, terminal: !blocked && safety.terminal,
    pauseSupport: safety.action === 'pause_support', limitation: safety.decision === 'restrain', grounding, safety };
}
