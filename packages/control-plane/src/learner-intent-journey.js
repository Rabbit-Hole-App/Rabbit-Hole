// The journey and tray-interaction extension of the shared Learner Intent Resolver (docs/features/adaptive-tutor-v1.md
// "Future shared input layer"; docs/features/adaptive-learning-path-v1-architecture.md R7, 6.1 and 7.2). Motion's
// learner-intent.js resolveLearnerTurn is the canonical resolver and embeds these two readings as
// structured_interpretation.journey (journeyInterpretation) and structured_interpretation.interaction
// (interactionInterpretation). Nothing here binds targets, reads selection or deixis, or builds a LearnerTurn.
// Import-free on purpose: the browser bundle and the control-plane worker both import this one copy.

// Every rule runs on this form, which is how punctuation can never decide: "Can we skip this?", "can we skip this…" and
// "can we skip this" are one text. Any mark is a word break ("option,2", "skip...this", "skip 🙂", "#2"), except a hyphen,
// dot, slash or ampersand inside a word ("10-minute", "node.js", "a/b", "r&d"), + or # after one ("c++", "c#") and * after
// a one-letter word ("a*", while "*skip*" is still "skip"). Hyphen-like dashes (U+2010-2013) become hyphens first, so a
// spaced dash is a break; an em dash is always a break ("transformers—skip setup").
const norm = (s) => String(s ?? '').toLowerCase().replace(/['‘’]/g, '').replace(/[‐-–]/g, '-')
  .replace(/[^\p{L}\p{M}\p{N}.\-\/&+#*]+|[.\-\/&](?![\p{L}\p{N}])|(?<![\p{L}\p{N}])[.\-\/&]|(?<![\p{L}\p{N}+#])[+#]+|(?<!(?<![\p{L}\p{N}])\p{L})\*+/gu, ' ')
  .replace(/\s+/g, ' ').trim();

// ---- Intent (6.1) ----
// ponytail: regex intent and edit rules; a model classifier when misses show
// The broad verbs are web/src/agent/router.js LEARN_INTENT's (copied, router.js is untouched) plus "i want to understand",
// "i need to learn" and "start teaching me".
const BROAD = /^(?:(?:please|just) )*(?:teach me|walk me through|i want to learn|i would like to learn|id like to learn|help me learn|i want to understand|i need to learn|start teaching me|start an? rabbit hole(?: on)?) (.+)$/;
const FOCUSED = /^(?:(?:please|just) )*(?:show me how to (?:build|implement|code) (.+?)|teach me how (.+?) works?)$/;
// ponytail: replace with request-duration.js parseDuration (Motion) once on main; it needs hyphen support ("10-minute")
// (OVERVIEW and IN_MINUTES both).
const OVERVIEW = /^(?:just )?give me (?:an? )?(\d+)[- ]minutes? (visual )?overview of (.+)$/;
const IN_MINUTES = / in (\d+) (?:minutes?|mins?)$/;
// Spoken filler anywhere and a greeting in front never decide either: "So, um, teach me transformers" is "teach me transformers".
const FILLER = /\b(?:um+|uh+m?|erm|hmm+|you know)\b/g;
const GREETING = /^(?:(?:so|okay|ok|well|hey|hi|hello|yeah|right|alright) )+/;
// A setup clause starts at a word ("piano setup" is a topic). It means a fast start only when what stands around it is a
// journey request or bare politeness ("Skip the setup, teach me X", "Teach me X with no setup questions", "Can we skip
// setup and just start?"), or when a request comes right before an imperative skip ("Teach me X, skip setup, I know the
// basics"); in "What happens if I skip setup?" or "the no setup method" it is part of the text.
const CLAUSE = /(?:^|\s)(?:(?:and|but|then) )?(?:skip (?:the )?(?:setup(?: questions)?|questions)|dont ask (?:me )?(?:any )?(?:setup )?questions|(?:with )?no (?:setup|questions)(?: questions)?|just start)(?: and| then)?(?=\s|$)/;
const BARE = /^(?:(?:(?:can|could) (?:we|you|i)|please|just|lets|and|then|now|for now|start|begin|thanks)(?: |$))*$/;
export const STARTS = new Set(['learning_journey', 'focused_skill', 'quick_overview', 'fast_start']);
const QUESTION = /^(?:what|why|how|when|who|where|which|is|are|does|do|can|explain)\b/;
// "about transformers", "all about attention", "the basics of attention", "how to code", "a transformer" name the topic
// after the noise. "the basics of" before "the": the first alternative that matches wins.
const TOPIC_NOISE = /^(?:(?:like|(?:more |all |everything )?about|the basics of|how to|an?|the) )+/;
// A trailing adverb, politeness or time frame is not the topic ("SQL this week" is "sql"); it may be all there is ("start
// teaching me now", "teach me please"), which leaves no topic and no journey.
const TOPIC_TAIL = /(?:(?:^| )(?:from scratch|step by step|please|thanks|thank you|now|already|(?:this|next|by) (?:week(?:end)?|month|year|summer|winter|spring|fall|semester|term|quarter|morning|afternoon|evening|(?:mon|tues|wednes|thurs|fri|satur|sun)day)))+$/;
// A deictic topic ("teach me this", "how this works", "this diagram", "it all") names what is on the canvas, not a
// subject: that is target binding, the canonical resolver's job, so it is no journey here. "that" counts only first
// ("models that scale" is a topic) and "it" only in a short clause it heads ("how it works", "how to use it effectively")
// or as "it all": after a named subject it refers to that subject ("Python and how to use it"), and "IT security" is a
// topic. A contentless topic ("more", "something new", "the basics") is none too. A missed journey is cheap (the responder
// can offer the path); a false start is not.
const DEICTIC = /(?:^|\s)(?:this|these|those)(?:\s|$)|^that(?:\s|$)|^(?:\S+ ){1,2}it(?: \S+){0,2}$|\sit all(?:\s|$)|^it(?: (?:better|stuff|part|one|thing|more|all))?$|^(?:(?:more|something|everything|anything)(?: new| else)?|basics)$/;

// The trailing space lets a lone noise word go too: "I want to learn the" has no topic.
const cleanTopic = (t) => ((t ?? '') + ' ').replace(TOPIC_NOISE, '').trimEnd().replace(TOPIC_TAIL, '').trim() || null;
const intent = (kind, topic = null, constraints = {}, skip_setup = false) => ({ kind, topic, constraints, skip_setup });
const start = (kind, raw, constraints) => {
  const topic = cleanTopic(raw);
  return !topic || DEICTIC.test(topic) ? intent('none') : intent(kind, topic, constraints);
};

export function journeyIntent(text) {
  const n = norm(text).replace(FILLER, ' ').replace(/\s+/g, ' ').trim().replace(GREETING, '');
  const c = n.match(CLAUSE);
  if (c) {
    const sides = [n.slice(0, c.index).trim(), n.slice(c.index + c[0].length).trim()].map((s) => [s, journeyIntent(s)]);
    const left = sides[0][1];
    if (/^(?:(?:and|but|then) )?(?:skip|dont ask)/.test(c[0].trim()) && STARTS.has(left.kind) && left.topic)
      return intent('fast_start', left.topic, left.constraints, true);
    const req = sides.map(([, i]) => i).find((i) => STARTS.has(i.kind));
    // Only a clause that names setup stands alone ("Skip setup and start"). "Just start", "no questions" and "skip the
    // questions" need a request beside them, or a chat reply ("No questions, thanks") would be a topicless journey.
    if ((req || /\bsetup\b/.test(c[0])) && sides.every(([s, i]) => BARE.test(s) || STARTS.has(i.kind)))
      return intent('fast_start', req?.topic ?? null, req?.constraints ?? {}, true);
  }
  const t = n.match(IN_MINUTES);
  const body = t ? n.slice(0, t.index) : n, time = t ? { minutes: Number(t[1]) } : {};
  let m = body.match(OVERVIEW);
  if (m) return start('quick_overview', m[3], { minutes: Number(m[1]), depth: 'overview', ...(m[2] ? { style: 'visual' } : {}) });
  if ((m = body.match(FOCUSED))) return start('focused_skill', m[1] ?? m[2], { ...time, ...(m[1] ? { coding: true } : {}) });
  if ((m = body.match(BROAD))) return start('learning_journey', m[1], time);
  return intent(QUESTION.test(n) ? 'direct_question' : 'none');
}

// ---- Interaction resolver rules 1-4 (7.2); rule 5 is the caller's model call ----
// Politeness is stripped once, before every rule: "can we drop this" is "drop this", "option two please" is "option two".
const POLITE = /^(?:(?:can|could) we )?(?:please )?| please$/g;
const ORDINALS = [['first', '1', 'one', 'a'], ['second', '2', 'two', 'b'], ['third', '3', 'three', 'c'], ['fourth', '4', 'four', 'd']];
const ORDINAL = new RegExp(`^(?:do |pick )?(?:option |number |the )?(${ORDINALS.flat().join('|')})(?: one| option)?$`);
const ACCEPT = new Set(['start', 'looks good', 'lets go', 'go ahead', 'yes', 'ok', 'okay', 'sounds good', 'start with section 1']);
// A skip or move-on of the current step, with a deictic, next-step or setup object and an optional "for now". A next-step
// object needs "to": "skip to the next step" moves on, "skip the next section" names a path element (rule 4).
const CANCEL = /^(?:skip|cancel|never mind|not now|stop|move on)(?: (?:this|that|it|ahead|all of (?:this|it)|the rest|to the next (?:question|one|step|section)|(?:the )?(?:setup|assessment|quiz|diagnostic|test)|(?:this|these|the) (?:questions?|part|step|bit|one)))?(?: for now)?$/;
// "do" edits only in the spec's shape, an object then an order ("do Python first"): "do I need calculus", "do those need
// calculus" and "do the first one" are a question or a choice.
const EDIT = /^(?:go deeper\b.*|(?:skip|drop|remove|add|include|move|put|make (?:it|this|the path)|more|less) .+|do (?!(?:this|that|it|these|those|you|i|we|they|not)\b).+ (?:first|last|earlier|later|next|before .+|after .+))$/;
// A bare deictic object names no path element: "add this", "move it", "drop that" are the Tutor's, with Motion's target binding.
const NOT_AN_OBJECT = /^\w+ (?:this|that|it|these|those|the assessment)$/;

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
  // An answer is due (free text: goal "something else", explain_back; or a probe): "Skip connections let gradients flow
  // back" or "more data" is that answer, never an edit. A real edit typed here still reaches rule 5, which has path_edit.
  if (tray?.free_text || tray?.mode === 'diagnostic_probe') return null;
  // 4. an edit verb with a path object
  if (EDIT.test(n) && !NOT_AN_OBJECT.test(n)) return { kind: 'path_edit', edit: text };
  return null;
}

// The resolver field names (structured_interpretation.journey / .interaction): the same functions.
export { journeyIntent as journeyInterpretation, resolveTurnRules as interactionInterpretation };
