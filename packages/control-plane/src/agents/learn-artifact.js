// The slash-command card prompt (src/learn-artifact.js builds the tools and
// runs the call). Server-only; pinned by test/learn-prompts.test.js.

import { MATH_FORMAT } from './math-format.js';
import { promptBlock } from '../explanation-prompt.js';

// The tool paragraph goes only where tools exist (owner 2026-11-08, A3): the json_schema fast chain (explanation-fast-chain.js) offers no tool to call.
const TOOL_RULES = `${promptBlock('explanation-opening.md', 'tool-rules')}\n`;

// Owner 2026-11-08 (clean-up): the pieces of the system prompt, so the Explanation author can place the number rule and the maths line under its own
// headings (explanationSystem below) while every other card keeps artifactSystem's text unchanged.
const INTRO = promptBlock('explanation-opening.md', 'intro');
// N1, the one number rule (its worked-example clause is the computed-from-a-formula case).
export const NUMBER_RULE = promptBlock('explanation-numbers-and-maths.md', 'number-rule');
// GEN-1 G2 (R2, Reviewer to approve): with the seeded examples of GEN-1 the number rule gets this sentence right after it (learn-artifact.js adds it only to those requests, so every other request stays byte-identical).
// ponytail: INPUTS_RULE is model-facing text that stays in code: the spec's table assigns it to no section file and task 3 keeps it unchanged.
export const INPUTS_RULE = "You choose the inputs; a result that follows from them is computed for you.";
const DATA_RULE = promptBlock('explanation-opening.md', 'data-rule');

// route: 'tools' (a tool call) | 'json_schema' (the fast chain's one JSON object).
export const artifactSystem = route => `${INTRO}
${route === 'json_schema' ? '' : TOOL_RULES}${MATH_FORMAT} This applies to every text field of every card: prompts, hints, quiz options, flashcard fronts and backs, table cells and explanations.
${NUMBER_RULE}
${DATA_RULE}`;
// The Explanation author's system head: no maths or number rule here, they sit under the Numbers and maths section of its tool description (learn-primitives.js).
export const explanationSystem = route => `${INTRO}
${route === 'json_schema' ? '' : TOOL_RULES}${DATA_RULE}`;

export const ARTIFACT_SYSTEM = artifactSystem('tools');
