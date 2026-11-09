// Depth (Brief, Balanced, Detailed; renamed 2026-11-08 from Overview, Standard, Deep): one learner setting that shapes how much an answer or an explanation covers. The same three
// words reach ordinary Chat (chat-modes.js chatSystem), the /explain v2 job's brief and author calls (explain-brief.js,
// explain-author.js) and the artifact path (learn-artifact.js). Balanced is today's behavior: it adds nothing to any prompt.
// Depth sets how much to cover; a limit the caller states (a catalogue, a card size, the learner's own words) still wins.
export const DEPTHS = Object.freeze(['brief', 'balanced', 'detailed']);
export const DEFAULT_DEPTH = 'balanced';
// Read-side aliases for the old names (renamed 2026-11-08): a stored card, a saved canvas setting or an old client may still say overview, standard or deep. Every place that reads a stored
// or incoming Depth goes through depthOf / validDepth; everything is written with the new names. Keep for one release, then run the stored-value rewrite
// (packages/control-plane/scripts/rewrite-depth-names.mjs) and delete this map.
export const DEPTH_ALIASES = Object.freeze({ overview: 'brief', standard: 'balanced', deep: 'detailed' });
export const depthOf = value => (typeof value === 'string' && Object.hasOwn(DEPTH_ALIASES, value) ? DEPTH_ALIASES[value] : value);
export const validDepth = value => { const depth = depthOf(value); return DEPTHS.includes(depth) ? depth : null; };

const WORDS = {
  // An answer in Chat: how much to say.
  answer: {
    brief: 'Depth: Brief. Give the short version: the central idea and the one or two points that matter most, in a few sentences. Leave out derivations, side cases and extended examples unless the learner asks for them. An explicit instruction in this turn about length or detail wins over this setting.',
    detailed: 'Depth: Detailed. Go thorough: build the idea from its foundations, show the reasoning step by step, include a worked example, and name the common mistakes and edge cases that matter. An explicit instruction in this turn about length or detail wins over this setting.',
  },
  // An explanation card (brief and author): how much to plan and draw, inside the limits and catalogue given.
  card: {
    brief: 'Depth: Brief. For someone new to the subject: plain words, no formulas or jargon; one simple visual with plain-word labels. Never go below what the request needs to be correct. The limits and catalogue given still apply.', // owner 2026-11-08: Depth is the technical level, not the amount
    detailed: 'Depth: Detailed. For someone who knows the basics: precise terms, the formula or exact relationship, the quantitative view — maths in diagram labels, a plot or chart where a quantity is involved. Same length. The limits and catalogue given still apply; never add anything the sources and request do not support.',
  },
};

// The sentence to add to a system prompt, or '' for Balanced, an unknown value or no value. kind: 'answer' (Chat) or 'card'
// (the brief and author of an explanation, and the artifact that is one).
export const depthInstruction = (depth, kind = 'answer') => WORDS[kind]?.[validDepth(depth)] ?? '';

// Artifact commands that make an explanation (learn-artifact.js): the others (a quiz, a table, a graph, a diagram) are not
// "how much to explain", so Depth does not reach them.
// ponytail: Depth reaches /explain and /walkthrough only; add a command here when its card has a depth to choose.
export const DEPTH_COMMANDS = Object.freeze(['explain', 'explanation', 'walkthrough']);

// CORE.09: an Explanation card's teaching objective and prose budget per Depth (EXP-13: prose only), the same on the direct and roadmap paths.
// Unlike depthInstruction, Balanced has an explicit target too. An omitted or unknown Depth is the default.
// Owner 2026-11-08: one budget for every Depth, about 10 lines of the 440 px card (408 px of 14 px text, about 60 characters a line).
// Owner 2026-11-08 (EXP-13, revised after the gpt-oss benchmark): the author is asked for 450; the server accepts up to 700 without a repair, and above 700 it
// trims whole sentences or list items (learn-primitives.js trimExplanationProse) before anything goes to the one repair.
export const EXPLANATION_BUDGET = Object.freeze({ target: 450, hard: 700 });
// Owner 2026-11-08: a prose paragraph longer than this is split at sentence ends by the server (learn-primitives.js settleExplanationBody); about 4 lines at the Explanation card's width.
export const PARAGRAPH_MAX = 220;
export const EXPLANATION_CAPS = Object.freeze({ brief: EXPLANATION_BUDGET.target, balanced: EXPLANATION_BUDGET.target, detailed: EXPLANATION_BUDGET.target });
export const EXPLANATION_OBJECTIVES = Object.freeze({
  brief: 'Depth: Brief. Explain the central idea and essential mechanism in everyday language. A concrete example can make the idea easier to follow.',
  balanced: 'Depth: Balanced. Explain how and why the mechanism works, with enough reasoning to apply it to another case.',
  detailed: 'Depth: Detailed. Develop the reasoning and relevant assumptions, limitations or connections. Work through a calculation or consequence when it helps.',
});
// Owner 2026-11-08 (clean-up): what the Explanation author reads under "# Depth" (the shared line, this Depth's paragraph, the one-line precision hint), replacing
// EXPLANATION_OBJECTIVES there; EXPLANATION_OBJECTIVES stays for the roadmap's table card (agents/roadmap-card.js). Only this card's Depth is sent.
export const EXPLANATION_DEPTH_LINES = Object.freeze({
  shared: "All three depths have the same length budget. Depth changes who the card is written for, not how much it says.",
  brief: "**Brief** — Written for someone meeting the subject for the first time. Open with one concrete case or picture the reader already knows; explain the idea in everyday words; do not use a technical term unless the sentence explains it; no symbols, formulas, dates or named parts unless they are the subject itself. The visual shows the idea in plain labels — a simple comparison, a short flow, a picture — never a chart with symbols. If a sentence uses a term, that same sentence says what it is in plain words.",
  balanced: "**Balanced** — Written for someone who knows the basics of the field. Open with one concrete case, then explain the mechanism — how it works and why — then give the proper terms, each explained in half a sentence the first time it appears. Use the subject's own precision where it exists: a formula if there is one, a named part, a date, a quantity. The visual shows the mechanism; if a quantity is central, a plot or chart.",
  detailed: "**Detailed** — Written for someone comfortable with the subject who wants the exact account. State the precise form of the thing — the formula and its name if there is one, otherwise the exact terms, parts, dates or quantities — and show how it produces what the visual draws. Add the one or two properties, limits or failure modes that matter in practice. The visual is the quantitative or structural view: maths in labels, a plot or chart where a quantity is involved, a full structure where the subject is a structure. Assume the reader already knows the basic mechanism: do not re-explain it. Spend the words on the exact form - formula and its name, named parts and thresholds, dates and actors - and on one property or limit that matters in practice.",
  hint: "What \"precise\" means depends on the subject: for a quantity it is the formula; for a mechanism the named parts and their order; for history the dates and actors; for a protocol the messages and their fields; for a living thing the structures and their functions.",
});
export const explanationTarget = depth => { const d = validDepth(depth) || DEFAULT_DEPTH, L = EXPLANATION_DEPTH_LINES; return `${L.shared}\n\n${L[d]}\n\n${L.hint}\nBudget: at most ${EXPLANATION_CAPS[d].toLocaleString('en-US')} characters of prose (paragraph, heading and list text); the title, tables, diagrams and illustrations do not count. Layout: prose, a visual, prose, and optionally a second and a third visual, each followed by prose.`; };
