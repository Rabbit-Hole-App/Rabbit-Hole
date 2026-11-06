// R4.09 source-support check (v1.4 6.2; contracts/planning.md 10). Deterministic reference checks first, then one batched model
// verdict per card, enforced by code: the model proposes verdicts, this module decides what they allow. Evidence classes for R4:
// source_supported, inferred, unresolved (externally_supported and computed are never claimed; nothing here runs research or code).
// callModel(role, body) -> parsed message is injected, as in roadmap-plan.js.
import { validateToolInput } from '../learn-validation.js';
import { CHECK_PROMPTS, ROADMAP_CHECK_VERSION, GROUNDING_TOOL } from '../agents/roadmap-check.js';
import { ROADMAP_LIMITS } from './roadmap-policy.js';
import { sha256 } from './roadmap-source.js';

const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
const inPassage = (passage, span) => !!span && norm(passage).includes(norm(span));

// The text of a delivered text/table card, for claims and screening.
export function cardText(block) {
  if (!block) return '';
  if (block.type === 'table') return [block.title, block.caption, ...(block.columns || []), ...(block.rows || []).flat()].filter(Boolean).join('\n');
  return [block.title, block.body, ...(block.more || []).flatMap(m => [m.label, m.text])].filter(Boolean).join('\n');
}

// Quoted spans the card claims to take from the source: "..." / curly quotes of at least 12 characters.
export const quotedSpans = text => [...String(text).matchAll(/["“]([^"”\n]{12,300})["”]/g)].map(m => m[1]);

// Step 1, no model: the card's sourceRef names the roadmap's source at its revision, and every long quotation in the card is really in
// the passage. A mismatch blocks that result version. -> [] when clean, else reasons.
export function referenceProblems({ block, passage, rev }) {
  const out = [], ref = block?.sourceRef;
  if (ref && ref.source?.rev !== rev) out.push('source_revision_mismatch');
  for (const q of quotedSpans(cardText(block))) if (!inPassage(passage, q)) out.push('quote_not_in_passage');
  return out;
}

// The content-version key of a cached verdict (the card text, the passage revision, the prompt and the policy). A change of any is a miss.
export const groundingCacheKey = async ({ block, rev }) => sha256(JSON.stringify([cardText(block), rev, ROADMAP_CHECK_VERSION, ROADMAP_LIMITS.version]));

async function ask(role, user, { callModel, limits }) {
  const { system, tools } = CHECK_PROMPTS[role];
  let message;
  try { message = await callModel(role, { max_tokens: limits.maxTokens[role], system, tools, tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: user }] }); } catch { return null; }
  const used = (message?.content || []).filter(p => p.type === 'tool_use');
  if (used.length !== 1 || used[0].name !== GROUNDING_TOOL.name) return null;
  try { validateToolInput(used[0].input, GROUNDING_TOOL.input_schema, 'submit_verdicts'); } catch { return null; }
  return used[0].input.verdicts;
}

// Deterministic enforcement of one model verdict against the passage -> { class, settled } ; settled=false means ambiguous (escalation candidate).
function enforce(v, passage) {
  if (v.verdict === 'contradicts') return inPassage(passage, v.quote) ? { class: 'unresolved', blocked: true, settled: true } : { class: 'unresolved', settled: false }; // a contradiction needs a real quote
  if (v.verdict === 'supports') return inPassage(passage, v.quote) ? { class: 'source_supported', settled: true } : { class: 'unresolved', settled: false }; // support without a genuine quote is not support
  // not_established: valid only as a checked inference (premises that are really in the passage); calling it an inference is not enough.
  const premises = v.premises || [];
  if (v.class === 'inferred' && premises.length && premises.every(p => inPassage(passage, p))) return { class: 'inferred', settled: true };
  return { class: 'unresolved', settled: true };
}

// checkSupport({ block, passage, rev }, { callModel, limits }) ->
//   { validation: 'passed'|'held'|'blocked', reason?, verdicts:[{claim, class}], unresolved:[claim], escalated, calls, cacheKey }
// held = checking unavailable or an unresolved claim (the owner of the flow repairs once or terminates); never passed by default.
export async function checkSupport({ block, passage, rev }, { callModel, limits = ROADMAP_LIMITS } = {}) {
  const cacheKey = await groundingCacheKey({ block, rev });
  const base = { verdicts: [], unresolved: [], escalated: false, calls: 0, cacheKey };
  const refs = referenceProblems({ block, passage, rev });
  if (refs.length) return { ...base, validation: 'blocked', reason: refs[0] };
  const user = `Passage:\n<source>\n${passage}\n</source>\n\nCard:\n<card>\n${cardText(block)}\n</card>`;
  let verdicts = await ask('roadmap_grounding_check', user, { callModel, limits }), calls = 1;
  if (!verdicts) return { ...base, calls, validation: 'held', reason: 'checking_unavailable' };
  if (!verdicts.length) return { ...base, calls, validation: 'held', reason: 'no_claims_checked' }; // an empty list is not "no claims", it is no check
  let decided = verdicts.map(v => ({ v, ...enforce(v, passage) }));
  let escalated = false;
  const doubtful = decided.filter(d => !d.settled);
  if (doubtful.length && limits.calls.groundingEscalationsPerCard > 0) {
    escalated = true; calls++;
    const second = await ask('roadmap_grounding_escalation', `${user}\n\nClaims to decide again:\n${JSON.stringify(doubtful.map(d => d.v.claim))}`, { callModel, limits });
    if (second) decided = decided.map(d => { if (d.settled) return d; const s = second.find(x => x.claim === d.v.claim); return s ? { v: s, ...enforce(s, passage) } : d; });
  }
  const out = decided.map(d => ({ claim: d.v.claim, class: d.settled ? d.class : 'unresolved', ...(d.blocked ? { contradicted: true } : {}) }));
  const result = { verdicts: out, escalated, calls, cacheKey, unresolved: out.filter(o => o.class === 'unresolved').map(o => o.claim) };
  if (decided.some(d => d.blocked)) return { ...result, validation: 'blocked', reason: 'contradicts_source' };
  return result.unresolved.length ? { ...result, validation: 'held', reason: 'unsupported_claims' } : { ...result, validation: 'passed' };
}
