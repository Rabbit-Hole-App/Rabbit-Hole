// Depth (Overview, Standard, Deep): one learner setting that shapes how much an answer or an explanation covers. The same three
// words reach ordinary Chat (chat-modes.js chatSystem), the /explain v2 job's brief and author calls (explain-brief.js,
// explain-author.js) and the artifact path (learn-artifact.js). Standard is today's behavior: it adds nothing to any prompt.
// Depth sets how much to cover; a limit the caller states (a catalogue, a card size, the learner's own words) still wins.
export const DEPTHS = Object.freeze(['overview', 'standard', 'deep']);
export const DEFAULT_DEPTH = 'standard';
export const validDepth = value => (DEPTHS.includes(value) ? value : null);

const WORDS = {
  // An answer in Chat: how much to say.
  answer: {
    overview: 'Depth: Overview. Give the short version: the central idea and the one or two points that matter most, in a few sentences. Leave out derivations, side cases and extended examples unless the learner asks for them. An explicit instruction in this turn about length or detail wins over this setting.',
    deep: 'Depth: Deep. Go thorough: build the idea from its foundations, show the reasoning step by step, include a worked example, and name the common mistakes and edge cases that matter. An explicit instruction in this turn about length or detail wins over this setting.',
  },
  // An explanation card (brief and author): how much to plan and draw, inside the limits and catalogue given.
  card: {
    overview: 'Depth: Overview. For someone new to the subject: plain words, no formulas or jargon; one simple visual with plain-word labels. Never go below what the request needs to be correct. The limits and catalogue given still apply.', // owner 2026-11-08: Depth is the technical level, not the amount
    deep: 'Depth: Deep. For someone who knows the basics: precise terms, the formula or exact relationship, the quantitative view — maths in diagram labels, a plot or chart where a quantity is involved. Same length. The limits and catalogue given still apply; never add anything the sources and request do not support.',
  },
};

// The sentence to add to a system prompt, or '' for Standard, an unknown value or no value. kind: 'answer' (Chat) or 'card'
// (the brief and author of an explanation, and the artifact that is one).
export const depthInstruction = (depth, kind = 'answer') => WORDS[kind]?.[validDepth(depth)] ?? '';

// Artifact commands that make an explanation (learn-artifact.js): the others (a quiz, a table, a graph, a diagram) are not
// "how much to explain", so Depth does not reach them.
// ponytail: Depth reaches /explain and /walkthrough only; add a command here when its card has a depth to choose.
export const DEPTH_COMMANDS = Object.freeze(['explain', 'explanation', 'walkthrough']);

// CORE.09: an Explanation card's teaching objective and prose budget per Depth (EXP-13: prose only), the same on the direct and roadmap paths.
// Unlike depthInstruction, Standard has an explicit target too. An omitted or unknown Depth is the default.
// Owner 2026-11-08: one budget for every Depth, about 10 lines of the 440 px card (408 px of 14 px text, about 60 characters a line).
// Owner 2026-11-08 (EXP-13, revised after the gpt-oss benchmark): the author is asked for 450; the server accepts up to 700 without a repair, and above 700 it
// trims whole sentences or list items (learn-primitives.js trimExplanationProse) before anything goes to the one repair.
export const EXPLANATION_BUDGET = Object.freeze({ target: 450, hard: 700 });
// Owner 2026-11-08: a prose paragraph longer than this is split at sentence ends by the server (learn-primitives.js settleExplanationBody); about 4 lines at the Explanation card's width.
export const PARAGRAPH_MAX = 220;
export const EXPLANATION_CAPS = Object.freeze({ overview: EXPLANATION_BUDGET.target, standard: EXPLANATION_BUDGET.target, deep: EXPLANATION_BUDGET.target });
export const EXPLANATION_OBJECTIVES = Object.freeze({
  overview: 'Depth: Overview. Explain the central idea and essential mechanism in everyday language. A concrete example can make the idea easier to follow.',
  standard: 'Depth: Standard. Explain how and why the mechanism works, with enough reasoning to apply it to another case.',
  deep: 'Depth: Deep. Develop the reasoning and relevant assumptions, limitations or connections. Work through a calculation or consequence when it helps.',
});
export const explanationTarget = depth => { const d = validDepth(depth) || DEFAULT_DEPTH; return `${EXPLANATION_OBJECTIVES[d]} Budget: at most ${EXPLANATION_CAPS[d].toLocaleString('en-US')} characters of prose (paragraph, heading and list text); the title, tables, diagrams and illustrations do not count. Layout: prose, a visual, prose, and optionally a second and a third visual, each followed by prose.`; };
