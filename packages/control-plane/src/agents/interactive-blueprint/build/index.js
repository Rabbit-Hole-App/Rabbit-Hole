// Build MVP 1 (brief 45, spec section 6): the Build model's prompt is files joined, as Design's is: build-system-prompt = build-general + card-facts + kinds-facts + build-schema-prompt [+ examples, later], parts joined by one blank line.
// card-facts is rendered from the config; kinds-facts is generated per request from the blueprint; the user message is the trimmed blueprint (5.2) and the measurements (5.3). No prompt wording lives here.
import { BUILD_GENERAL } from './build-general.js';
import { cardFacts } from './card-facts.js';
import { kindsFacts } from './kinds-facts.js';
import { BUILD_SCHEMA_PROMPT } from './build-schema-prompt.js';
import { BUILD_EXAMPLES } from './examples.js';
import { measureBlueprint } from '../../../../../web/src/interact-build-measure.js';

const join = parts => parts.filter(Boolean).join('\n\n');
export const buildSystemText = kinds => join([BUILD_GENERAL, cardFacts(), kinds?.text, BUILD_SCHEMA_PROMPT, BUILD_EXAMPLES]);

// 5.2: what is sent of the blueprint. Not sent: math.code, relationship.statement and assumptions, quantities, claims, lesson. math.outputs: id, kind, unit, meaning.
export const trimBlueprint = blueprint => ({
  things: blueprint.things, inputs: blueprint.inputs, time: blueprint.time,
  math: { outputs: blueprint.math.outputs.map(({ id, kind, unit, meaning }) => ({ id, kind, unit, meaning })) },
  pictures: blueprint.pictures, values: blueprint.values, explanation: blueprint.explanation, relationship: { formula: blueprint.relationship.formula ?? null }, layout: blueprint.layout,
});
export const buildUserMessage = (trimmed, measurements) => `The lesson:\n${JSON.stringify(trimmed)}\n\nThe measurements:\n${JSON.stringify(measurements)}`;

// -> { system, user, kinds, measurements } for one blueprint (a legacy one whose labels still have `at` is accepted as it is).
export async function buildInputs(blueprint) {
  const kinds = await kindsFacts(blueprint), measurements = await measureBlueprint(blueprint); // the kinds' least sizes are in the system text (kinds-facts), not repeated here
  return { system: buildSystemText(kinds), user: buildUserMessage(trimBlueprint(blueprint), measurements), kinds, measurements };
}
