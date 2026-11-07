// The one readiness check for a card offer (checklist 4.1.1, BE.05a; explain-on-canvas-workflow.md "Confirm how to teach the current step").
// Roadmap acceptance fixed WHAT to teach (goal, scope, Depth, order, explicit requirements); the planner only SUGGESTED a format. Before an offer
// becomes actionable, and again when the learner accepts it, this confirms that a built-in format can really deliver the step now. The first offer
// after Accept roadmap, a manual Propose next step / Next card and the automatic next offer all reach it through proposeNextStep
// (roadmap-lifecycle.js); acceptance reaches it through quoteStepAcceptance (roadmap-run.js). Pure: the caller reads the facts.
// Built-in formats only (R12 adapters are on hold): `explanation` and `table` (roadmap-tools.js FORMATS).
import { ROADMAP_FORMATS } from './roadmap-tools.js';

// What each built-in format is and what it can stand in for. An explanation card can carry a Markdown table (CORE.09), so it can deliver a
// table step; a table card cannot deliver an explanation. `covers` lists the planned formats a card can teach.
const FACTS = Object.freeze({
  explanation: Object.freeze({ label: 'explanation card', covers: Object.freeze(['explanation', 'table']) }),
  table: Object.freeze({ label: 'table card', covers: Object.freeze(['table']) }),
});
export const formatLabel = format => FACTS[format]?.label ?? 'card';
const a = format => `${/^[aeiou]/i.test(formatLabel(format)) ? 'an' : 'a'} ${formatLabel(format)}`; // a table card, an explanation card

// ROADMAP_FORMATS_OFF: a comma list that switches built-in formats off at runtime (a kill switch; unset = none). A suggested format can become
// unready after the roadmap was approved, and this is the fact that changes.
export const offFormats = env => String(env?.ROADMAP_FORMATS_OFF ?? '').split(/[\s,]+/).filter(Boolean);
const usable = (format, off) => ROADMAP_FORMATS.includes(format) && !off.includes(format) && !!FACTS[format];

// step: the roadmap step row ({ id, format, passage_start, passage_end }); planStep: its accepted plan row ({ formatRequired? }) or null;
// off: offFormats(env); source: { ok, code? } the source revalidation ({ ok: true } when the caller already read it).
// -> { ready: true, format, settings: { depth }, sourceRevision }
//  | { ready: false, reason, help, alternative?: { format, label }, question?: { id, text, options } }
export function checkOffer({ step, planStep = null, off = [], source = { ok: true }, depth = null, sourceRevision = null }) {
  const planned = step.format, required = planStep?.formatRequired === true;
  if (!source.ok) return { ready: false, reason: 'source_unavailable', help: 'The source changed or can no longer be read here. Open the source again, or use Edit roadmap to plan from what it says now.' };
  if (!(step.passage_end > step.passage_start)) return { ready: false, reason: 'passage_missing', help: 'This step has no passage to teach from. Use Edit roadmap to fix the step, then continue.' };
  if (usable(planned, off)) return { ready: true, format: planned, settings: { depth }, sourceRevision };
  // The planned format cannot be prepared now. An alternative must cover the same goal; one that would change a format the learner explicitly
  // required is never applied silently: it becomes one focused question.
  const alt = ROADMAP_FORMATS.find(f => f !== planned && usable(f, off) && FACTS[f].covers.includes(planned));
  const reason = ROADMAP_FORMATS.includes(planned) ? 'format_unavailable' : 'format_unsupported';
  if (!alt) return { ready: false, reason, help: `${a(planned)[0].toUpperCase()}${a(planned).slice(1)} cannot be prepared right now, and no other card can teach this step yet. Try again later, or use Edit roadmap to change the step.` };
  const alternative = { format: alt, label: formatLabel(alt) };
  if (!required) return { ready: false, reason, alternative };
  return { ready: false, reason, alternative, question: { id: `offer:${step.id}`, text: `${a(planned)[0].toUpperCase()}${a(planned).slice(1)} cannot be prepared right now, and you asked for one. Use ${a(alt)} instead, or change the roadmap?`,
    options: [{ id: 'alternative', label: `Use ${a(alt)}` }, { id: 'edit', label: 'Edit roadmap' }] }, help: null };
}

// The stored recovery fact for a blocked offer (scope_json.offerRecovery) and what the view shows of it.
export const recoveryOf = (step, verdict) => ({ stepId: step.id, reason: verdict.reason,
  ...(verdict.question ? { question: verdict.question } : {}), ...(verdict.help ? { help: verdict.help } : {}), ...(verdict.alternative ? { alternative: verdict.alternative } : {}) });
