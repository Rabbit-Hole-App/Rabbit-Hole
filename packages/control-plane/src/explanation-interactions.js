// E2 (docs/features/explain.md section 5 "Approved interaction contract", GAP-02/03/05, EXP-03-C01/C03/C05, EXP-12-C05): the additive `interactions` envelope of a
// newly authored written Explanation: exactly three suggested questions and zero to six one-or-two-word terms with short definitions, each term anchored to an
// exact occurrence in the card's canonical display text. The author writes questions and anchors in the existing ONE author call; the SERVER validates them
// against the final normalized text, assigns the IDs and the content revision, and saves the envelope with the card. Off by default (EXPLANATION_INTERACTIONS).
// Pure and Worker/browser compatible: the web imports the display-text mapping and the revision check from here. No fixture answer is ever part of a question.
import { explanationFieldProse, explanationFieldText } from './learn-primitives.js';
import { sha256Hex } from './learn-grade-jev.js';

export const INTERACTIONS_VERSION = 1;
export const DISPLAY_TEXT_VERSION = 1; // the canonical per-field mapping (learn-primitives.js explanationFieldText); bump it and every stored anchor is stale
export const INTERACTIONS_SETTING = 'EXPLANATION_INTERACTIONS';
export const interactionsEnabled = env => env?.[INTERACTIONS_SETTING] === 'true';
// Separate bounded UI allowance (not a higher teaching cap): 6 definitions x 160 + 3 questions x 120 code points.
export const INTERACTION_LIMITS = Object.freeze({ questions: 3, question: 120, terms: 6, definition: 160, termWords: 2, quote: 60, occurrence: 50 });

const cp = s => Array.from(String(s ?? ''));
const len = s => cp(s).length;
const FIELD = /^body$/; // EXP-13: a new card has no sections, so a new anchor is always in the body (saved anchors in more[n].text still read through fieldText)
const WORD = /[\p{L}\p{N}]/u;

// ---- author-facing schema (appended to the Explanation tool's schema while the switch is on) ----
// Owner review 2026-11-08 (output tokens are latency): a term is { t, d, n }, the term as written in the prose, its definition and which prose occurrence
// (zero-based) to mark. The field is always the body and the quote is the term itself, so neither is asked for; the server fills both (authorTerms).
const text = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
export const INTERACTION_PROPERTIES = Object.freeze({
  questions: { type: 'array', minItems: 3, maxItems: 3, items: text(INTERACTION_LIMITS.question * 2) },
  terms: { type: 'array', minItems: 0, maxItems: INTERACTION_LIMITS.terms, items: { type: 'object', additionalProperties: false, required: ['t', 'd', 'n'],
    properties: { t: text(INTERACTION_LIMITS.quote), d: text(INTERACTION_LIMITS.definition * 2), n: { type: 'integer', minimum: 0, maximum: INTERACTION_LIMITS.occurrence } } } },
});
export const INTERACTION_GUIDANCE = 'Also return, in this same call, "questions": exactly three distinct questions a curious learner would ask next about this explanation (each at most 120 characters, a question to ask, never an answer), and optionally "terms": up to six one- or two-word terms that appear in the prose of the body (paragraph, heading or list text, never a table cell, a diagram label or an illustration), each {"t": the term exactly as written there, "d": its definition in at most 160 characters, "n": which occurrence of that exact word or phrase in the prose of the body to mark, zero-based, counting whole-word matches in reading order}. Use terms only for a real concept the learner may not know; no terms is fine. Questions and definitions are not part of the lesson text.';

// -> the Markdown field's canonical display text (the one mapping selection, anchors and term decorations share).
export const fieldText = (block, field) => {
  if (field === 'body') return explanationFieldText(block?.body);
  const m = /^more\[([0-2])\]\.text$/.exec(field);
  return m && block?.more?.[Number(m[1])] ? explanationFieldText(block.more[Number(m[1])].text) : null;
};

// Whole-word occurrences of `quote` in `text`, in reading order: [{ start, end }] in Unicode code points, end exclusive.
export function occurrences(textValue, quote) {
  const hay = cp(textValue), needle = cp(quote), out = [];
  if (!needle.length) return out;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.some((c, j) => hay[i + j] !== c)) continue;
    const before = hay[i - 1], after = hay[i + needle.length];
    if ((before && WORD.test(before)) || (after && WORD.test(after))) continue;
    out.push({ start: i, end: i + needle.length });
    i += needle.length - 1;
  }
  return out;
}

// The content revision: a versioned canonical serialization of title, body and every section (label and text), hashed. No timestamps, no UI state, no
// card id: a resize, a reload or a move never changes it; a text edit always does.
export const contentRevisionInput = block => JSON.stringify({ v: DISPLAY_TEXT_VERSION, title: block?.title ?? '', body: block?.body ?? '', more: (block?.more || []).map(s => ({ label: s?.label ?? '', text: s?.text ?? '' })) });
export const contentRevision = async block => `r${DISPLAY_TEXT_VERSION}-${(await sha256Hex(contentRevisionInput(block))).slice(0, 16)}`;

// EXP-13 fix 1b (owner 2026-11-08): what the server keeps of the author's questions and terms instead of a repair. A question that is blank, too long or a
// repeat is dropped, the others kept (owner's choice between a repair below three and keeping what is valid: keeping never fails a card, and the questions
// are suggestions under the card, not the lesson); a term that is invalid or cannot be anchored in the prose is dropped, the others kept. Both forms of a
// term are read: the author's short { t, d, n } (n counts prose occurrences only, as the author sees the body) and the saved long form. -> { questions, terms }
// that interactionsProblem accepts for this block, ready for bindInteractions.
export function keptInteractions(block, meta) {
  const questions = [], seen = new Set();
  for (const q of Array.isArray(meta?.questions) ? meta.questions : []) {
    // Batch-1 review (card 07): the author sometimes starts a question with a stray comma, quote or bullet; the first letter is where a question starts.
    const t = String(q ?? '').replace(/\s+/g, ' ').trim().replace(/^[\s,;:\-\u2013\u2014\u2022\u00b7*>"'\u201c\u201d\u2018\u2019]+/u, '');
    if (t && len(t) <= INTERACTION_LIMITS.question && !seen.has(t.toLowerCase()) && questions.length < INTERACTION_LIMITS.questions) { seen.add(t.toLowerCase()); questions.push(t); }
  }
  const field = fieldText(block, 'body') ?? '', prose = explanationFieldProse(block?.body), chars = cp(field);
  const inProse = hit => { for (let k = hit.start; k < hit.end; k++) if (chars[k] !== ' ' && !prose[k]) return false; return true; };
  const terms = [];
  for (const raw of Array.isArray(meta?.terms) ? meta.terms : []) {
    if (terms.length >= INTERACTION_LIMITS.terms || !raw || typeof raw !== 'object') continue;
    let term = raw;
    if ('t' in raw) {
      const label = String(raw.t ?? '').trim(), all = occurrences(field, label), hits = all.filter(inProse);
      const hit = hits[Number.isInteger(raw.n) ? raw.n : 0] ?? hits[0];
      term = { label, definition: raw.d, field: 'body', quote: label, occurrence: hit ? all.indexOf(hit) : -1 };
    }
    if (!termsProblem(block, [...terms, term])) terms.push(term);
  }
  return { questions, terms };
}

// -> null, or the validator's words (starting explanation_bad_interactions:, so the one repair and the roadmap's terminal reason read the same). `meta` is the author's
// { questions, terms }; the block is the FINAL card (accepted title applied, diagrams settled).
export function interactionsProblem(block, meta) {
  const L = INTERACTION_LIMITS, bad = message => `explanation_bad_interactions: ${message}`;
  const questions = meta?.questions, terms = meta?.terms ?? [];
  if (!Array.isArray(questions) || questions.length !== L.questions) return bad(`return exactly ${L.questions} questions; received ${Array.isArray(questions) ? questions.length : 'none'}.`);
  const seen = new Set();
  for (const [i, q] of questions.entries()) {
    const t = String(q ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return bad(`question ${i + 1} is blank.`);
    if (len(t) > L.question) return bad(`question ${i + 1} has ${len(t)} characters; the limit is ${L.question}.`);
    if (seen.has(t.toLowerCase())) return bad(`question ${i + 1} repeats another question.`);
    seen.add(t.toLowerCase());
  }
  return termsProblem(block, terms);
}
function termsProblem(block, terms) {
  const L = INTERACTION_LIMITS, bad = message => `explanation_bad_interactions: ${message}`;
  if (!Array.isArray(terms) || terms.length > L.terms) return bad(`at most ${L.terms} terms.`);
  const taken = [];
  for (const [i, term] of terms.entries()) {
    const n = i + 1;
    if (!term || typeof term !== 'object') return bad(`term ${n} is not an object.`);
    const label = String(term.label ?? '').trim();
    if (!label || label.split(/\s+/).length > L.termWords) return bad(`term ${n} must be one or two words.`);
    if (!String(term.definition ?? '').trim()) return bad(`term ${n} has no definition.`);
    if (len(String(term.definition).trim()) > L.definition) return bad(`term ${n} definition has ${len(String(term.definition).trim())} characters; the limit is ${L.definition}.`);
    if (!FIELD.test(String(term.field))) return bad(`term ${n} field must be body.`);
    if (term.quote !== label) return bad(`term ${n} quote must be exactly the label "${label.slice(0, 40)}".`);
    if (!Number.isInteger(term.occurrence) || term.occurrence < 0) return bad(`term ${n} occurrence must be a zero-based integer.`);
    const field = fieldText(block, term.field);
    if (field == null) return bad(`term ${n} names ${term.field}, which this card does not have.`);
    const hit = occurrences(field, label)[term.occurrence];
    if (!hit) return bad(`term ${n} "${label.slice(0, 40)}" has no occurrence ${term.occurrence} in ${term.field} (whole-word matches in the displayed text: ${occurrences(field, label).length}).`);
    const prose = explanationFieldProse(block?.body), chars = Array.from(field);
    for (let k = hit.start; k < hit.end; k++) if (chars[k] !== ' ' && !prose[k]) return bad(`term ${n} "${label.slice(0, 40)}" occurrence ${term.occurrence} is in a table, a diagram or an illustration; anchor terms in the prose only.`);
    if (taken.some(t => t.field === term.field && hit.start < t.end && t.start < hit.end)) return bad(`term ${n} overlaps another term in ${term.field}.`);
    taken.push({ field: term.field, ...hit });
  }
  return null;
}

// The saved envelope, after interactionsProblem returned null: server-assigned revision and stable IDs (revision + ordinal), anchors with resolved offsets.
// The author's own text is normalized (whitespace) and nothing else it wrote is kept.
export async function bindInteractions(block, meta) {
  const revision = await contentRevision(block), tag = revision.slice(-8);
  const questions = meta.questions.map((q, i) => ({ id: `q-${tag}-${i + 1}`, text: String(q).replace(/\s+/g, ' ').trim() }));
  const terms = (meta.terms ?? []).map((term, i) => {
    const hit = occurrences(fieldText(block, term.field), term.label)[term.occurrence];
    return { id: `t-${tag}-${i + 1}`, label: term.label.trim(), definition: String(term.definition).replace(/\s+/g, ' ').trim(), anchor: { field: term.field, quote: term.quote, occurrence: term.occurrence, start: hit.start, end: hit.end } };
  });
  return { version: INTERACTIONS_VERSION, displayTextVersion: DISPLAY_TEXT_VERSION, contentRevision: revision, questions, terms };
}

// Do the saved term decorations still belong to this text? A card edited after authoring has another revision: the decorations are then omitted by the
// reader (old terms never attach to equal text in a different revision), while captured quotes and notes stay readable elsewhere.
export const interactionsCurrent = async block => !!block?.interactions && block.interactions.contentRevision === await contentRevision(block);
