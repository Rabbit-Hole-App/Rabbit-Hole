// The journey and tray-interaction extension of the shared Learner Intent Resolver (docs/features/adaptive-tutor-v1.md
// "Future shared input layer"; docs/features/adaptive-learning-path-v1-architecture.md R7, 6.1 and 7.2). Motion's
// learner-intent.js resolveLearnerTurn is the canonical resolver and embeds these two readings as
// structured_interpretation.journey (journeyInterpretation) and structured_interpretation.interaction
// (interactionInterpretation). Nothing here binds targets, reads selection or deixis, or builds a LearnerTurn.
// Import-free on purpose: the browser bundle and the control-plane worker both import this one copy.

// Every rule runs on this form, which is how punctuation can never decide: "Can we skip this?" and "can we skip this" are one text.
const norm = (s) => String(s ?? '').toLowerCase().replace(/['’]/g, '').replace(/[?.!,;:]/g, '').replace(/\s+/g, ' ').trim();

// ---- Intent (6.1) ----
// ponytail: regex intent and edit rules; a model classifier when misses show
// The broad verbs are web/src/agent/router.js LEARN_INTENT's (copied, router.js is untouched) plus "i want to understand" and "i need to learn".
const BROAD = /^(?:please )?(?:teach me|walk me through|i want to learn|i would like to learn|id like to learn|help me learn|i want to understand|i need to learn) (.+)$/;
const FOCUSED = /^(?:please )?(?:show me how to (?:build|implement|code) (.+?)|teach me how (.+?) works?)$/;
// ponytail: replace with request-duration.js parseDuration (Motion) once on main; it needs hyphen support ("10-minute")
const OVERVIEW = /^(?:just )?give me (?:an? )?(\d+)[- ]minutes? (visual )?overview of (.+)$/;
// A setup clause starts at a word: "skip setup" ends a request, the "no setup" inside "piano setup" does not.
const SETUP_CLAUSE = /(?:^|\s)(?:skip (?:the )?setup|dont ask me (?:any )?(?:setup )?questions|no setup)\b.*$/;
const QUESTION = /^(?:what|why|how|when|who|where|which|is|are|does|do|can|explain)\b/;
// "about transformers", "the basics of attention", "how to code", "a transformer" name the topic after the noise.
// "the basics of" before "the": the first alternative that matches wins.
const TOPIC_NOISE = /^(?:(?:about|the basics of|how to|an?|the) )+/;

const cleanTopic = (t) => (t ?? '').replace(TOPIC_NOISE, '').replace(/\s+from scratch$/, '').trim() || null;
const intent = (kind, topic = null, constraints = {}, skip_setup = false) => ({ kind, topic, constraints, skip_setup });

export function journeyIntent(text) {
  const n = norm(text);
  if (SETUP_CLAUSE.test(n)) {
    // "Skip setup and start" has no topic; "Teach me X, skip setup and just start" keeps X.
    const rest = journeyIntent(n.replace(SETUP_CLAUSE, ''));
    return intent('fast_start', rest.topic, rest.constraints, true);
  }
  let m = n.match(OVERVIEW);
  if (m) return intent('quick_overview', cleanTopic(m[3]), { minutes: Number(m[1]), depth: 'overview', ...(m[2] ? { style: 'visual' } : {}) });
  if ((m = n.match(FOCUSED))) return intent('focused_skill', cleanTopic(m[1] ?? m[2]), m[1] ? { coding: true } : {});
  if ((m = n.match(BROAD))) return intent('learning_journey', cleanTopic(m[1]));
  return intent(QUESTION.test(n) ? 'direct_question' : 'none');
}

// ---- Interaction resolver rules 1-4 (7.2); rule 5 is the caller's model call ----
// Politeness is stripped once, before every rule: "can we drop this" is "drop this", "option two please" is "option two".
const POLITE = /^(?:(?:can|could) we )?(?:please )?| please$/g;
const ORDINALS = [['first', '1', 'one', 'a'], ['second', '2', 'two', 'b'], ['third', '3', 'three', 'c'], ['fourth', '4', 'four', 'd']];
const ORDINAL = new RegExp(`^(?:do |pick )?(?:option |number |the )?(${ORDINALS.flat().join('|')})(?: one| option)?$`);
const ACCEPT = new Set(['start', 'looks good', 'lets go', 'go ahead', 'yes', 'ok', 'okay', 'sounds good', 'start with section 1']);
const CANCEL = /^(?:skip|cancel|never mind|not now|stop|move on)(?: (?:this|that|it|this one|for now|the rest|(?:the )?(?:setup|assessment|quiz|diagnostic)|(?:this|these|the) questions?))?$/;
// "do" is an edit verb ("do Python first") but not in a question ("do I need calculus") or a choice ("do the first one").
const EDIT = /^(?:go deeper\b.*|(?:skip|drop|remove|add|include|move|put|make (?:it|this|the path)|more|less|do(?! (?:you|i|we|they|not|option|number|(?:the )?(?:first|second|third|fourth|one|two|three|four|[1-4]))\b)) .+)$/;
const NOT_AN_OBJECT = /^(?:drop|remove|do) (?:this|that|it|the assessment)$/;

// No tray open: rule 4 only (rules 1-2 have no options or mode to match, rule 3 is gated), anything else is a Tutor turn.
export function resolveTurnRules(text, tray) {
  const n = norm(text).replace(POLITE, '');
  // 3 first: a bare skip means cancel even when a diagnostic tray carries a "Skip the assessment" option (same effect, one
  // result). A cancel phrase is never a path edit either, so with no tray open there is nothing to cancel.
  if (CANCEL.test(n)) return tray ? { kind: 'cancel' } : null;
  const opts = tray?.options || [];
  const answer = (o) => ({ kind: 'tray_answer', option_id: o.id });
  // 1. exact label, ordinal, or a unique label prefix of 4+ characters. Ordinals need 2+ options: on a skip-only tray
  // (explain_back) "a" or "one" is not a choice.
  const exact = opts.find((o) => norm(o.label) === n);
  if (exact) return answer(exact);
  const ord = opts.length > 1 && n.match(ORDINAL);
  if (ord) {
    const o = opts[ORDINALS.findIndex((row) => row.includes(ord[1]))];
    if (o) return answer(o);
  }
  if (n.length >= 4) {
    const pre = opts.filter((o) => norm(o.label).startsWith(n));
    if (pre.length === 1) return answer(pre[0]);
  }
  // 2. accept words only mean "start" while a path is on offer
  if (tray?.mode === 'path_preview' && ACCEPT.has(n)) return { kind: 'tray_answer', option_id: 'start' };
  // 4. an edit verb with a path object
  if (EDIT.test(n) && !NOT_AN_OBJECT.test(n)) return { kind: 'path_edit', edit: text };
  return null;
}

// The resolver field names (structured_interpretation.journey / .interaction): the same functions.
export { journeyIntent as journeyInterpretation, resolveTurnRules as interactionInterpretation };
