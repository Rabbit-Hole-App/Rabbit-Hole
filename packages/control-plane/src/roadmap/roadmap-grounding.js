// R4.09 source-support check (v1.4 6.2; contracts/planning.md 10). Deterministic reference checks first, then one batched model
// verdict per card, enforced by code: the model proposes verdicts, this module decides what they allow. Evidence classes for R4:
// source_supported, inferred, unresolved (externally_supported and computed are never claimed; nothing here runs research or code).
// callModel(role, body) -> parsed message is injected, as in roadmap-plan.js.
import { validateToolInput } from '../learn-validation.js';
import { CHECK_PROMPTS, ROADMAP_CHECK_VERSION, GROUNDING_TOOL } from '../agents/roadmap-check.js';
import { ROADMAP_LIMITS } from './roadmap-policy.js';
import { sha256 } from './roadmap-source.js';

// A quote matches the raw Markdown passage whatever its emphasis/code marks, curly quotes or dashes: both sides are folded the same way, so only markup is forgiven.
const norm = s => String(s).replace(/[*_`~#]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const edges = s => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); // "…learning," quoted with American punctuation still matches "…learning."
const inPassage = (passage, span) => !!span && !!edges(norm(span)) && norm(passage).includes(edges(norm(span))); // a quote that is only markup folds to nothing and supports nothing

// The text of a delivered text/table card, for claims and screening.
export function cardText(block) {
  if (!block) return '';
  if (block.type === 'table') return [block.title, block.caption, ...(block.columns || []), ...(block.rows || []).flat()].filter(Boolean).join('\n');
  return [block.title, block.body, ...(block.more || []).flatMap(m => [m.label, m.text])].filter(Boolean).join('\n');
}

// Quoted spans the card claims to take from the source: "..." / curly quotes of at least 12 characters.
// An opening quote must not follow a letter or digit and a closing quote must not precede one, so the gap between two short quotes ("Yes" ... "No") is never read as a quotation.
export const quotedSpans = text => [...String(text).matchAll(/(?<![\p{L}\p{N}])["“]([^"“”\n]{12,300})["”](?![\p{L}\p{N}])/gu)].map(m => m[1]);

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

// Each evidence snippet must be one exact stretch of the passage (after the markup folds of norm). Scattered-fragment matching is
// deliberately not done: dropping words can drop a negation or pick the wrong Yes/No edge. -> null when valid, else the reason.
const ELLIPSIS = /\.\.\.|…/;
const snippetError = (passage, s) => typeof s !== 'string' || !s.trim() ? 'empty' : ELLIPSIS.test(s) ? 'ellipsis_joined' : inPassage(passage, s) ? null : 'not_in_passage';
const evidenceOf = v => Array.isArray(v.evidence) ? v.evidence : typeof v.quote === 'string' && v.quote ? [v.quote] : []; // quote: the pre-roadmap-check-2 single span
const evidenceErrors = (passage, list) => list.map(s => ({ snippet: String(s).slice(0, 400), error: snippetError(passage, s) })).filter(e => e.error);

// Deterministic enforcement of one model verdict against the passage -> { class, settled, blocked?, errors }; settled=false means
// the citation, not the judgement, failed (escalation candidate).
function enforce(v, passage) {
  if (v.verdict === 'contradicts' || v.verdict === 'supports') {
    const ev = evidenceOf(v);
    const errors = ev.length ? evidenceErrors(passage, ev) : [{ snippet: '', error: 'no_evidence' }];
    if (errors.length) return { class: 'unresolved', settled: false, errors };
    return v.verdict === 'contradicts' ? { class: 'unresolved', blocked: true, settled: true, errors: [] } : { class: 'source_supported', settled: true, errors: [] };
  }
  // not_established: valid only as a checked inference (premises that are really in the passage); calling it an inference is not enough.
  const premises = v.premises || [];
  const errors = evidenceErrors(passage, premises);
  if (v.class === 'inferred' && premises.length && !errors.length) return { class: 'inferred', settled: true, errors: [] };
  return { class: 'unresolved', settled: true, errors };
}

const detail = d => ({ id: d.id, claim: String(d.v.claim).slice(0, 300), verdict: d.v.verdict, evidence: [...evidenceOf(d.v), ...(d.v.premises || [])].slice(0, 4).map(s => String(s).slice(0, 400)), errors: d.errors.slice(0, 4) });

// checkSupport({ block, passage, rev }, { callModel, limits }) ->
//   { validation: 'passed'|'held'|'blocked', reason?, verdicts:[{id, claim, class}], unresolved:[claim], failed:[private diagnostics], escalated, calls, cacheKey }
// held = checking unavailable or an unresolved claim; never passed by default. Claims carry server-assigned ids (c1..c6); the escalation
// gets each unsettled claim with its rejected evidence and exact error, and its answers are merged by id (then by exact text), so a
// rephrased claim is still matched. The generated card is reused: only its citations are rechecked, never a new authoring call.
export async function checkSupport({ block, passage, rev }, { callModel, limits = ROADMAP_LIMITS } = {}) {
  const cacheKey = await groundingCacheKey({ block, rev });
  const base = { verdicts: [], unresolved: [], failed: [], escalated: false, calls: 0, cacheKey };
  const refs = referenceProblems({ block, passage, rev });
  if (refs.length) return { ...base, validation: 'blocked', reason: refs[0] };
  const user = `Passage:\n<source>\n${passage}\n</source>\n\nCard:\n<card>\n${cardText(block)}\n</card>`;
  let verdicts = await ask('roadmap_grounding_check', user, { callModel, limits }), calls = 1;
  if (!verdicts) return { ...base, calls, validation: 'held', reason: 'checking_unavailable' };
  if (!verdicts.length) return { ...base, calls, validation: 'held', reason: 'no_claims_checked' }; // an empty list is not "no claims", it is no check
  let decided = verdicts.map((v, i) => ({ id: `c${i + 1}`, v, ...enforce(v, passage) }));
  let escalated = false, escalation = null;
  const doubtful = decided.filter(d => !d.settled);
  if (doubtful.length && limits.calls.groundingEscalationsPerCard > 0) {
    escalated = true; calls++;
    const asked = doubtful.map(d => ({ id: d.id, claim: d.v.claim, firstVerdict: d.v.verdict, rejectedEvidence: evidenceOf(d.v), errors: d.errors.map(e => `${e.error}: ${JSON.stringify(e.snippet)}`) }));
    const second = await ask('roadmap_grounding_escalation', `${user}\n\nClaims to decide again (copy each id):\n${JSON.stringify(asked)}`, { callModel, limits });
    escalation = second ? 'answered' : 'unavailable';
    if (second) decided = decided.map(d => {
      if (d.settled) return d;
      const s = second.find(x => x.id === d.id) || second.find(x => x.claim === d.v.claim);
      return s ? { id: d.id, v: { ...s, claim: d.v.claim }, ...enforce(s, passage), first: detail(d) } : d;
    });
  }
  const out = decided.map(d => ({ id: d.id, claim: d.v.claim, class: d.settled ? d.class : 'unresolved', ...(d.blocked ? { contradicted: true } : {}) }));
  const bad = decided.filter(d => !d.settled || d.class === 'unresolved');
  const failed = bad.map(d => ({ ...detail(d), ...(d.first ? { first: d.first } : {}), escalation: d.first ? 'answered' : escalated ? (escalation === 'unavailable' ? 'unavailable' : 'no_answer_for_claim') : 'not_escalated' }));
  const result = { verdicts: out, escalated, calls, cacheKey, failed, unresolved: out.filter(o => o.class === 'unresolved').map(o => o.claim) };
  if (decided.some(d => d.blocked)) return { ...result, validation: 'blocked', reason: 'contradicts_source' };
  return result.unresolved.length ? { ...result, validation: 'held', reason: 'unsupported_claims' } : { ...result, validation: 'passed' };
}
