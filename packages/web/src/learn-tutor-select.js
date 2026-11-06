// Tutor v2 Stage B: the claim candidate selector (docs/features/tutor-architecture-v2.md). Before JEV,
// keep only the claims the learner's message actually touches, out of the turn's candidates (the
// target's claims, the open question's, the returned-from claim, and their prerequisite concepts'
// claims). Deterministic: cue phrases per claim, then concept names. Locked semantic rule: evaluate
// ideas the learner actually attempted; untouched claims never get evidence. JEV still decides
// whether a touched claim was attempted (a question is not a failed explanation).
// ponytail: substring cues over the 10 slice claims; a learned or JEV-side selector when the registry
// grows past what hand-written cues can cover.
import { NANOGPT } from './learn-tutor-claims.js';

// The nanoGPT cue phrases live in its domain object (learn-tutor-claims.js NANOGPT.cues); re-exported for callers of CUES.
export { CUES } from './learn-tutor-claims.js';

// A cue matches at the start of a word ("read" never matches "already"; "multipl" matches "multiplier").
function hit(text, cue) {
  const word = /[a-z0-9]/;
  for (let at = text.indexOf(cue); at >= 0; at = text.indexOf(cue, at + 1)) if (!at || !word.test(text[at - 1]) || !word.test(cue[0])) return true;
  return false;
}

// candidates: claim ids, in priority order. forced: ids kept whatever the words (the open question's
// claim when answering, the returned-from claim). fallback: the target's claims, kept when no cue at
// all matched, so an explanation in unusual words is still evaluated (JEV's engaged check guards it).
// domain (TutorDomain): a claim's cues are the domain's cue map entry (domain.cues, the nanoGPT CUES), else its registry
// `cues`; a journey domain has no cue map, so its claims use their registry cues only (never CUES, even for an id that
// matches a slice claim's). Concept names are the domain's. Nothing here names a domain.
export function selectClaims(raw, { candidates, forced = [], fallback = [] }, domain = NANOGPT) {
  const started = performance.now();
  const text = String(raw || '').toLowerCase();
  const pool = [...new Set(candidates)].filter(id => domain.claims[id]);
  const matched = {};
  for (const id of pool) {
    const cues = (domain.cues?.[id] ?? domain.claims[id]?.cues ?? []).filter(cue => hit(text, cue.toLowerCase()));
    if (cues.length) matched[id] = cues;
  }
  const concepts = new Set(Object.keys(matched).map(id => domain.claims[id].concept));
  // A concept name inside a matched cue ("after softmax") is that cue's, not a mention of the concept.
  const rest = Object.values(matched).flat().reduce((left, cue) => left.split(cue.toLowerCase()).join(' '), text);
  for (const id of pool) {
    const concept = domain.claims[id].concept;
    if (matched[id] || concepts.has(concept)) continue;
    const name = (domain.concepts[concept]?.names || []).find(entry => hit(rest, entry.toLowerCase()));
    if (name) matched[id] = [`concept:${name}`];
  }
  let selected = pool.filter(id => forced.includes(id) || matched[id]);
  const usedFallback = !Object.keys(matched).length;
  if (usedFallback) selected = [...new Set([...forced, ...fallback])].filter(id => pool.includes(id));
  return { selected: selected.slice(0, 6), available: pool.length, matched, fallback: usedFallback, ms: +(performance.now() - started).toFixed(3) };
}
