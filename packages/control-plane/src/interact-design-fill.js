// The fill of the fast design path (owner brief 11 section 2, brief 12 section 1): the system text of the one call that writes the plan brief of a vertical-throw scene (packages/web/src/interact-plan-brief.js).
// One source for the bench (scripts/interact/bench-design-mvp.mjs) and the job (interact-design.js fastDesign). SCENE_TEACHING_GUIDE verbatim, the family description, the keys, the formula grammar, no examples.
import { familyDescription } from '../../web/src/interact-plan-brief.js';
import { SCENE_TEACHING_GUIDE } from './agents/interact-design-author.js';
import { INTERACT_ROLES } from './interact-models.js';

export const FILL_MAX_TOKENS = INTERACT_ROLES.design_fill.maxOutputTokens; // a brief is a few hundred to a thousand tokens: cap a runaway reply

// The formula grammar, as in bench-formulas.mjs: what the parser reads and nothing else.
const GRAMMAR = [
  'A formula is text: numbers, names, + - * /, unary minus, parentheses, and ^ with a literal whole-number exponent 2, 3 or 4 (for example t^2). Nothing else: no functions, no conditions, no other powers. At most 200 characters and 32 nodes.',
  'The readable names are `t` (elapsed seconds since launch, 0 at the launch), the scene\'s numeric inputs by id (launchSpeed, gravity, mass where the scene has them) and, where the scene fixes gravity, `gravity`. Up is positive; a force is a magnitude. A quantity that changes rule at one moment is piecewise: `formula` applies while t < switchAt, `formulaAfter` from switchAt on; switchAt is a formula over the inputs only (no t). Give switchAt and formulaAfter as null when the quantity has one rule at every time.',
].join('\n');

// The keys of the brief with what each one is, from briefSchema(depth).keys (one source for the schema and the prompt): the text keys, the launch height, the inputs, the formula roles with unit, meaning and sign
// convention, and the word keys with their length limits.
function keyLines(keys) {
  const piece = role => (role.piecewise ? ' Piecewise: formula applies before switchAt, formulaAfter from switchAt on.' : '');
  return [
    ...keys.text.map(k => `- ${k.key}: ${k.what} (at most ${k.max} characters)`),
    `- launchHeight: ${keys.launchHeight}`,
    ...keys.inputs.map(i => `- ${i.id}: ${i.label}, ${i.unit}. ${i.meaning}${i.reference ? ` ${i.reference}` : ''} (${i.kind})`),
    // A formula role's `reference` IS the answer (its reference formula): never sent. The role keeps its label, unit and meaning (the sign convention).
    // (a role's meaning may spell out its switch moment, "(switchAt = ...)": that is the formula the model is asked to write, so it is cut)
    ...keys.formulas.map(f => `- formulas.${f.id}: ${f.label}, ${f.unit}. ${f.meaning.replace(/ \(switchAt = [^)]*\)/, '')}${piece(f)}`),
    ...keys.words.map(w => `- words.${w.key}: ${w.what} (at most ${w.max} characters)`),
  ];
}

// Brief 12: three lines the first matrix showed the fast model needs (two briefs wrote launchHeight as a name, some formulas ran past 32 nodes, a detailed timeline began before the launch).
const RULES = [
  'launchHeight is a number: write it as a literal, never as a name in a formula.',
  'A formula has at most 32 nodes.',
  'The detailed timeline counts time from the launch, and a marker is never before 0.',
];

// Brief 12 (owner 00:15): the limits the plan checks enforce and the model was never told, in one block. cardDescription: the card measures 2 to 4 lines at 406, 686 and 794 px of text column; with the
// card's own style (interact-description-fit.js estimateLines) 130 to 200 characters is 2 to 4 lines at all three. The rest are the plan's own bounds (PLAN_LIMITS) and each word's own maximum.
const LIMITS = [
  'title: at most 120 characters. story: at most 3000 characters. instructions: at most 300 characters.',
  'cardDescription: exactly two sentences of 130 to 200 characters in all, one plain paragraph with no line break and no markdown (one sentence is one line and is refused; so is anything over 4 lines).',
  'Every word is at most the number of characters its key states.',
];

export function fillSystem(depth, schemaInfo, describe = familyDescription) {
  return [SCENE_TEACHING_GUIDE, '', `## The scene family (depth ${depth})`, describe(depth), '', '## The keys of the plan brief', ...keyLines(schemaInfo.keys), '', '## Limits', ...LIMITS, '', '## Formulas', GRAMMAR, ...RULES, '', 'Return the brief only: no prose.'].join('\n');
}


// referenceFormulaCheck's failures as problem lines: the role, the point (a parse failure has none), got and expected.
export const formulaProblems = result => (result?.failures ?? []).map(f => `formula ${f.role}${f.point ? ` at ${JSON.stringify(f.point)}` : ''}: got ${f.got}, expected ${f.expected}`);
