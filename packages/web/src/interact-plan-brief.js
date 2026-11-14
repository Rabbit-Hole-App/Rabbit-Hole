import { z } from 'zod';
import { PLAN_LIMITS } from './interact-plan.js';
import { TEMPLATE_WORDS } from './interact-formula.js';
import { FAMILY, INPUTS, ROLES, expandBrief, extractBrief, familyDescription, referenceValue, verticalThrow } from './interact-family-vertical-throw.js';

export { FAMILY, ROLES, INPUTS, expandBrief, extractBrief, familyDescription, referenceValue };

// The plan brief (owner brief 11, design MVP): the few things a model writes for a vertical-throw card; expandBrief (interact-family-vertical-throw.js) turns it into the whole ScenePlan in code.
// Flat on purpose: strings and numbers, one nesting level, keys fixed per depth, so one strict schema fits every provider (the formula bench's lesson). Nothing about the toss is in the schema's
// shape beyond the family's own roles; the model returns the brief and nothing else.
// briefLimits(family): the shared limits plus the family's own (LIMITS); BRIEF_LIMITS are the vertical-throw's, as before.
export const briefLimits = family => Object.freeze({ title: PLAN_LIMITS.title, story: 3000, cardDescription: PLAN_LIMITS.cardDescription, instructions: PLAN_LIMITS.instructions, formula: PLAN_LIMITS.formula, ...family.LIMITS });
export const BRIEF_LIMITS = briefLimits(verticalThrow);

const TEXT_KEYS = [['title', 'the card title'], ['story', 'a short story that motivates the question, a few short paragraphs'], ['cardDescription', 'two to four lines under the title: the idea of the card, with $...$ for maths'], ['instructions', 'two or three short sentences: what to change and press']];
const nullable = { anyOf: [{ type: 'string', maxLength: BRIEF_LIMITS.formula }, { type: 'null' }] };
// An input's sign (family contract, owner 2026-11-14): 'positive' (> 0), 'nonnegative' (>= 0) or 'any' (any finite number: a zero coordinate, a negative offset); undeclared is today's rule (a fixed value positive, a range unconstrained). A family declares it as the
// optional third entry of an input, [id, 'range' | 'fixed', { sign }]. The model-facing JSON schema gains a keyword only for 'nonnegative' (minimum 0); 'positive' and 'any' keep the plain number, so the toss schema is unchanged.
const SIGNS = Object.freeze({ positive: [v => v > 0, 'must be greater than 0 (sign: positive)'], nonnegative: [v => v >= 0, 'must be 0 or more (sign: nonnegative)'], any: [() => true, ''] });
const signOf = ([, kind, options]) => { const sign = options?.sign ?? (kind === 'fixed' ? 'positive' : 'any'); // undeclared keeps today's rule: a fixed value is > 0, a range's min, max and default are unconstrained (the curve's x0 range is negative at its left end)
   if (!SIGNS[sign]) throw new Error(`input sign "${sign}" is not positive, nonnegative or any`); return sign; };
const numberObject = (keys, sign = 'positive') => ({ type: 'object', properties: Object.fromEntries(keys.map(k => [k, { type: 'number', ...(sign === 'nonnegative' && k !== 'step' ? { minimum: 0 } : {}) }])), required: keys, additionalProperties: false });
const RANGE = ['min', 'max', 'default', 'step'];

// -> { jsonSchema, parse(raw), keys }: the strict schema of a depth's brief for a provider's tool or response schema, a parser that returns { ok, value } or { ok: false, problems }, and the key lists the fill's system text
// is written from (text keys, input ranges, formula roles with unit and meaning, word keys with their length limits).
export function briefSchema(depth, module = verticalThrow) {
  const family = module.FAMILY.depths[depth], { INPUTS, ROLES } = module, limits = briefLimits(module);
  if (!family) throw new Error(`the family ${module.FAMILY.id} has no depth "${depth}"`);
  const words = TEMPLATE_WORDS[family.template];
  const inputs = family.inputs;
  const properties = {
    ...Object.fromEntries(TEXT_KEYS.map(([key, what]) => [key, { type: 'string', maxLength: limits[key], description: what }])),
    ...Object.fromEntries(module.scalars.map(s => [s.id, { type: 'number', description: s.description }])),
    ...Object.fromEntries(inputs.map(input => [input[0], input[1] === 'fixed' ? numberObject(['fixed'], signOf(input)) : numberObject(RANGE, signOf(input))])),
    formulas: { type: 'object', properties: Object.fromEntries(family.roles.map(id => [id, { type: 'object', properties: { formula: { type: 'string', maxLength: limits.formula }, switchAt: nullable, formulaAfter: nullable }, required: ['formula', 'switchAt', 'formulaAfter'], additionalProperties: false }])), required: [...family.roles], additionalProperties: false },
    words: { type: 'object', properties: Object.fromEntries(words.map(({ key, max, what }) => [key, { type: 'string', maxLength: max, description: what }])), required: words.map(w => w.key), additionalProperties: false },
  };
  const required = Object.keys(properties);
  const jsonSchema = { type: 'object', properties, required, additionalProperties: false };

  const num = z.number().finite(), signed = sign => (SIGNS[sign][1] ? num.refine(SIGNS[sign][0], SIGNS[sign][1]) : num);
  const rangeOf = sign => z.object({ min: signed(sign), max: signed(sign), default: signed(sign), step: num.positive() }).strict().superRefine((r, ctx) => {
    if (!(r.min < r.max)) ctx.addIssue({ code: 'custom', message: 'min is below max' });
    if (r.default < r.min || r.default > r.max) ctx.addIssue({ code: 'custom', message: 'default is inside min..max' });
  });
  const formula = z.object({ formula: z.string().min(1).max(limits.formula), switchAt: z.string().min(1).max(limits.formula).nullable(), formulaAfter: z.string().min(1).max(limits.formula).nullable() }).strict()
    .refine(f => (f.switchAt === null) === (f.formulaAfter === null), 'switchAt and formulaAfter come together or are both null');
  const shape = {
    ...Object.fromEntries(TEXT_KEYS.map(([key]) => [key, z.string().min(1).max(limits[key])])), ...Object.fromEntries(module.scalars.map(s => [s.id, num.min(0).max(s.max)])),
    ...Object.fromEntries(inputs.map(input => [input[0], input[1] === 'fixed' ? z.object({ fixed: signed(signOf(input)) }).strict() : rangeOf(signOf(input))])),
    formulas: z.object(Object.fromEntries(family.roles.map(id => [id, formula]))).strict(),
    words: z.object(Object.fromEntries(words.map(({ key, max }) => [key, z.string().min(1).max(max)]))).strict(),
  };
  const schema = z.object(shape).strict();
  const parse = raw => {
    const out = schema.safeParse(raw);
    return out.success ? { ok: true, value: out.data } : { ok: false, problems: out.error.issues.slice(0, 12).map(issue => `${issue.path.join('.') || 'brief'}: ${issue.message}`) };
  };
  return {
    jsonSchema, parse,
    keys: {
      text: TEXT_KEYS.map(([key, what]) => ({ key, what, max: limits[key] })), scalars: module.scalars.map(s => ({ id: s.id, description: s.description })), launchHeight: properties.launchHeight?.description,
      inputs: inputs.map(([id, kind]) => ({ id, ...INPUTS[id], kind: kind === 'fixed' ? 'one number, fixed' : 'range: min, max, default, step' })), // the sign is a validator, not fill text: the toss text is unchanged
      formulas: family.roles.map(id => ({ id, ...ROLES[id] })), words: words.map(({ key, max, what }) => ({ key, max, what })),
    },
  };
}

// The brief's formulas against the family's reference physics (family.referenceCheck, interact-family-vertical-throw.js) -> { ok, failures: [{ role, point, got, expected }] }.
export const referenceFormulaCheck = (brief, depth, module = verticalThrow) => module.referenceCheck(brief, depth);

