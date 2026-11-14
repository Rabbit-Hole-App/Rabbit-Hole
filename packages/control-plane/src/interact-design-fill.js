// The fill of the fast design path (owner brief 11 section 2, brief 12 section 1): the system text of the one call that writes the plan brief of a vertical-throw scene (packages/web/src/interact-plan-brief.js).
// One source for the bench (scripts/interact/bench-design-mvp.mjs) and the job (interact-design.js fastDesign). SCENE_TEACHING_GUIDE verbatim, the family description, the keys, the formula grammar, no examples.
import { verticalThrow } from '../../web/src/interact-family-vertical-throw.js';
import { SCENE_TEACHING_GUIDE } from './agents/interact-design-author.js';
import { INTERACT_ROLES } from './interact-models.js';

export const FILL_MAX_TOKENS = INTERACT_ROLES.design_fill.maxOutputTokens; // a brief is a few hundred to a thousand tokens: cap a runaway reply

// The formula grammar (as in bench-formulas.mjs: what the parser reads and nothing else), its independent-variable sentence and the family's formula rules are the family's own text
// (interact-family-vertical-throw.js formulaGrammar / formulaRules); this file adds only what every family shares.

// The keys of the brief with what each one is, from briefSchema(depth).keys (one source for the schema and the prompt): the text keys, the launch height, the inputs, the formula roles with unit, meaning and sign
// convention, and the word keys with their length limits.
function keyLines(keys) {
  const piece = role => (role.piecewise ? ' Piecewise: formula applies before switchAt, formulaAfter from switchAt on.' : '');
  return [
    ...keys.text.map(k => `- ${k.key}: ${k.what} (at most ${k.max} characters)`),
    ...keys.scalars.map(s => `- ${s.id}: ${s.description}`),
    ...keys.inputs.map(i => `- ${i.id}: ${i.label}, ${i.unit}. ${i.meaning}${i.reference ? ` ${i.reference}` : ''} (${i.kind})`),
    // A formula role's `reference` IS the answer (its reference formula): never sent. The role keeps its label, unit and meaning (the sign convention).
    // (a role's meaning may spell out its switch moment, "(switchAt = ...)": that is the formula the model is asked to write, so it is cut)
    ...keys.formulas.map(f => `- formulas.${f.id}: ${f.label}, ${f.unit}. ${f.meaning.replace(/ \(switchAt = [^)]*\)/, '')}${piece(f)}`),
    ...keys.words.map(w => `- words.${w.key}: ${w.what} (at most ${w.max} characters)`),
  ];
}

// Brief 12 (owner 00:15): the limits the plan checks enforce and the model was never told, in one block. cardDescription: the card measures 2 to 4 lines at 406, 686 and 794 px of text column; with the
// card's own style (interact-description-fit.js estimateLines) 130 to 200 characters is 2 to 4 lines at all three. The rest are the plan's own bounds (PLAN_LIMITS) and each word's own maximum.
const LIMITS = [
  'title: at most 120 characters. story: at most 3000 characters. instructions: at most 300 characters.',
  'cardDescription: exactly two sentences of 130 to 200 characters in all, one plain paragraph with no line break and no markdown (one sentence is one line and is refused; so is anything over 4 lines).',
  'Every word is at most the number of characters its key states.',
];

export function fillSystem(depth, schemaInfo, family = verticalThrow) {
  return [SCENE_TEACHING_GUIDE, '', `## The scene family (depth ${depth})`, family.familyDescription(depth), '', '## The keys of the plan brief', ...keyLines(schemaInfo.keys), '', '## Limits', ...LIMITS, '', '## Formulas', family.formulaGrammar.join('\n'), ...family.formulaRules, '', 'Return the brief only: no prose.'].join('\n');
}


// referenceFormulaCheck's failures as problem lines: the role, the point (a parse failure has none), got and expected.
export const formulaProblems = result => (result?.failures ?? []).map(f => `formula ${f.role}${f.point ? ` at ${JSON.stringify(f.point)}` : ''}: got ${f.got}, expected ${f.expected}`);
