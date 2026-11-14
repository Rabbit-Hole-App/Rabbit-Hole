import { z } from 'zod';
import { PLAN_LIMITS } from './interact-plan.js';
import { TEMPLATE_WORDS, evalQuantity, parseQuantity } from './interact-formula.js';
import { FAMILY, INPUTS, ROLES, expandBrief, extractBrief, familyDescription } from './interact-family-vertical-throw.js';

export { FAMILY, ROLES, INPUTS, expandBrief, extractBrief, familyDescription };

// The plan brief (owner brief 11, design MVP): the few things a model writes for a vertical-throw card; expandBrief (interact-family-vertical-throw.js) turns it into the whole ScenePlan in code.
// Flat on purpose: strings and numbers, one nesting level, keys fixed per depth, so one strict schema fits every provider (the formula bench's lesson). Nothing about the toss is in the schema's
// shape beyond the family's own roles; the model returns the brief and nothing else.
export const BRIEF_LIMITS = Object.freeze({ title: PLAN_LIMITS.title, story: 3000, cardDescription: PLAN_LIMITS.cardDescription, instructions: PLAN_LIMITS.instructions, formula: PLAN_LIMITS.formula, launchHeight: 10 });

const TEXT_KEYS = [['title', 'the card title'], ['story', 'a short story that motivates the question, a few short paragraphs'], ['cardDescription', 'two to four lines under the title: the idea of the card, with $...$ for maths'], ['instructions', 'two or three short sentences: what to change and press']];
const nullable = { anyOf: [{ type: 'string', maxLength: BRIEF_LIMITS.formula }, { type: 'null' }] };
const numberObject = keys => ({ type: 'object', properties: Object.fromEntries(keys.map(k => [k, { type: 'number' }])), required: keys, additionalProperties: false });
const RANGE = ['min', 'max', 'default', 'step'];

// -> { jsonSchema, parse(raw), keys }: the strict schema of a depth's brief for a provider's tool or response schema, a parser that returns { ok, value } or { ok: false, problems }, and the key lists the fill's system text
// is written from (text keys, input ranges, formula roles with unit and meaning, word keys with their length limits).
export function briefSchema(depth) {
  const family = FAMILY.depths[depth];
  if (!family) throw new Error(`the family ${FAMILY.id} has no depth "${depth}"`);
  const words = TEMPLATE_WORDS[family.template];
  const inputs = [['launchSpeed', 'range'], ...(family.gravity === 'range' ? [['gravity', 'range']] : [['gravity', 'fixed']]), ...(family.mass ? [['mass', 'range']] : [])];
  const properties = {
    ...Object.fromEntries(TEXT_KEYS.map(([key, what]) => [key, { type: 'string', maxLength: BRIEF_LIMITS[key], description: what }])),
    launchHeight: { type: 'number', description: 'height of the launch mark above the ground mark in metres (0 when the ball is thrown from the ground mark)' },
    ...Object.fromEntries(inputs.map(([id, kind]) => [id, kind === 'fixed' ? numberObject(['fixed']) : numberObject(RANGE)])),
    formulas: { type: 'object', properties: Object.fromEntries(family.roles.map(id => [id, { type: 'object', properties: { formula: { type: 'string', maxLength: BRIEF_LIMITS.formula }, switchAt: nullable, formulaAfter: nullable }, required: ['formula', 'switchAt', 'formulaAfter'], additionalProperties: false }])), required: [...family.roles], additionalProperties: false },
    words: { type: 'object', properties: Object.fromEntries(words.map(({ key, max, what }) => [key, { type: 'string', maxLength: max, description: what }])), required: words.map(w => w.key), additionalProperties: false },
  };
  const required = Object.keys(properties);
  const jsonSchema = { type: 'object', properties, required, additionalProperties: false };

  const num = z.number().finite(), range = z.object({ min: num, max: num, default: num, step: num.positive() }).strict().superRefine((r, ctx) => {
    if (!(r.min < r.max)) ctx.addIssue({ code: 'custom', message: 'min is below max' });
    if (r.default < r.min || r.default > r.max) ctx.addIssue({ code: 'custom', message: 'default is inside min..max' });
  });
  const formula = z.object({ formula: z.string().min(1).max(BRIEF_LIMITS.formula), switchAt: z.string().min(1).max(BRIEF_LIMITS.formula).nullable(), formulaAfter: z.string().min(1).max(BRIEF_LIMITS.formula).nullable() }).strict()
    .refine(f => (f.switchAt === null) === (f.formulaAfter === null), 'switchAt and formulaAfter come together or are both null');
  const shape = {
    ...Object.fromEntries(TEXT_KEYS.map(([key]) => [key, z.string().min(1).max(BRIEF_LIMITS[key])])), launchHeight: num.min(0).max(BRIEF_LIMITS.launchHeight),
    ...Object.fromEntries(inputs.map(([id, kind]) => [id, kind === 'fixed' ? z.object({ fixed: num.positive() }).strict() : range])),
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
      text: TEXT_KEYS.map(([key, what]) => ({ key, what, max: BRIEF_LIMITS[key] })), launchHeight: properties.launchHeight.description,
      inputs: inputs.map(([id, kind]) => ({ id, ...INPUTS[id], kind: kind === 'fixed' ? 'one number, fixed' : 'range: min, max, default, step' })),
      formulas: family.roles.map(id => ({ id, ...ROLES[id] })), words: words.map(({ key, max, what }) => ({ key, max, what })),
    },
  };
}

// The reference physics (up positive; the force a magnitude; the second ball held at the top height until the top, then falling from rest): the value a role must have at inputs `v` (launch speed), `g`, `m` and time `t`
// for a launch height `h0`.
export function referenceValue(role, t, { v, g, m = 1, h0 = 0 }) {
  const top = v / g, toss = h0 + v * t - g * t * t / 2, held = t < top;
  switch (role) {
    case 'height': case 'tossedHeight': return toss;
    case 'velocity': case 'tossedVelocity': return v - g * t;
    case 'acceleration': case 'tossedAcceleration': return -g;
    case 'force': return m * g;
    case 'apexTime': return top;
    case 'apexHeight': return h0 + v * v / (2 * g);
    case 'dropHeight': return held ? h0 + v * v / (2 * g) : toss;
    case 'dropVelocity': return held ? 0 : -g * (t - top);
    case 'dropAcceleration': return held ? 0 : -g;
    default: throw new Error(`no reference physics for the role "${role}"`);
  }
}

// -> { ok, failures: [{ role, point, got, expected }] }: the brief's formulas against the reference physics at 24 points over the brief's own input ranges and timeline (0 to 2 v / g, the return to the launch height),
// skipping 1e-3 s around a piecewise switch, relative tolerance 1e-4 (against the larger of the expected value and 1, so a reference of zero is an absolute 1e-4). A formula that does not parse is a failure with
// point null and the parser's message as `got`. At most 12 failures are listed.
export function referenceFormulaCheck(brief, depth) {
  const family = FAMILY.depths[depth], fixedGravity = family.gravity === 'fixed' ? brief.gravity.fixed : null;
  const names = ['launchSpeed', ...(fixedGravity === null ? ['gravity'] : []), ...(family.mass ? ['mass'] : [])], fixed = fixedGravity === null ? {} : { gravity: fixedGravity };
  const failures = [], quantities = {};
  for (const role of family.roles) {
    const f = brief.formulas[role], quantity = { id: role, formula: f.formula, ...(f.switchAt != null && f.formulaAfter != null ? { switchAt: f.switchAt, formulaAfter: f.formulaAfter } : {}) };
    try { parseQuantity(quantity, { names, fixed }); quantities[role] = quantity; } catch (error) { if (!error.code) throw error; failures.push({ role, point: null, got: error.message, expected: 'a formula over t and the input names' }); }
  }
  // The input sets: every corner of the ranges plus the defaults; the times: evenly spread over the timeline, enough per set to reach 24 points.
  const axes = [['launchSpeed', brief.launchSpeed], ...(fixedGravity === null ? [['gravity', brief.gravity]] : []), ...(family.mass ? [['mass', brief.mass]] : [])];
  let sets = [Object.fromEntries(axes.map(([id, r]) => [id, r.default]))];
  for (let bits = 0; bits < 2 ** axes.length; bits++) sets.push(Object.fromEntries(axes.map(([id, r], i) => [id, bits >> i & 1 ? r.max : r.min])));
  const perSet = Math.ceil(24 / sets.length);
  for (const inputs of sets) {
    const v = inputs.launchSpeed, g = fixedGravity ?? inputs.gravity, m = inputs.mass ?? 1, end = 2 * v / g, top = v / g;
    for (let k = 1; k <= perSet; k++) {
      const t = end * k / (perSet + 1);
      for (const [role, quantity] of Object.entries(quantities)) {
        if (ROLES[role].piecewise && Math.abs(t - top) < 1e-3) continue;
        const expected = referenceValue(role, t, { v, g, m, h0: brief.launchHeight });
        let got; try { got = evalQuantity(quantity, inputs, t, {}, fixed); } catch (error) { if (!error.code) throw error; if (failures.length < 12) failures.push({ role, point: { ...inputs, t }, got: error.message, expected }); continue; }
        if (!Number.isFinite(got) || Math.abs(got - expected) > 1e-4 * Math.max(Math.abs(expected), 1)) { if (failures.length < 12) failures.push({ role, point: { ...inputs, t: Number(t.toFixed(6)) }, got, expected }); }
      }
    }
  }
  const seen = new Set(), unique = failures.filter(f => { const key = `${f.role}|${f.point ? JSON.stringify(f.point) : 'parse'}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return { ok: unique.length === 0, failures: unique.slice(0, 12) };
}
