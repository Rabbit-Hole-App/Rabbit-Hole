// Brief 38 spec section 7.2: the joining, and the user-message builders. No prompt wording lives here: blueprint-prompt = general + depth + schema [+ examples], parts joined by one blank line.
import { GENERAL } from './general.js';
import { DEPTH_LABELS, DEPTH_PROMPTS } from './depth.js';
import { SCHEMA } from './schema.js';
import { EXAMPLES } from './examples.js';
import { QUANTITIES } from './quantities.js';

const join = parts => parts.filter(Boolean).join('\n\n');
const depthPrompt = depth => { if (!DEPTH_PROMPTS[depth]) throw new Error(`unknown depth "${depth}"`); return DEPTH_PROMPTS[depth]; };
export const blueprintPrompt = depth => join([GENERAL, depthPrompt(depth), SCHEMA, EXAMPLES]);
export const quantitiesPrompt = depth => join([GENERAL, depthPrompt(depth), QUANTITIES]);

// 7.7: the blueprint call, complete (and the seeded arm's first call has the same user message)
export const blueprintMessage = (question, depth) => `Question: ${question}\nDepth: ${DEPTH_LABELS[depth]}`;
export const quantitiesMessage = blueprintMessage;
// 7.8: the seeded arm's second call: the settled relationship and quantities (roles as settled by code)
export const seededMessage = (question, depth, settled) => `${blueprintMessage(question, depth)}\n\nThe relationship and the quantities are already settled. Use them exactly as given, with these roles:\n${JSON.stringify(settled, null, 2)}`;
// 7.7: the correction call; `first` is the message of the first call (blueprintMessage, or seededMessage in the seeded arm), `previous` the model's own answer text exactly as returned; at most 12 problems
export const correctionMessage = (first, previous, problems) => `${first}\n\nYour previous blueprint:\n${previous}\n\nThe program tested it and found these problems:\n${problems.slice(0, 12).map((problem, k) => `${k + 1}. ${problem}`).join('\n')}\n\nReturn the whole blueprint again with these problems fixed. Change only what the problems require.`;
