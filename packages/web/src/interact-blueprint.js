// The interactive-blueprint (Brief 38, docs/features/interact/interactive-blueprint.md section 4): the one form every scene is written in, as a strict zod schema.
// The FULL form carries every option, built or named; BUILT lists the options this test builds. The schema sent to the model (providerSchema) is the form restricted to BUILT,
// its fields in the form's order, which is the order of the reasoning. A named option is parsed by FULL and refused by BUILT; the checker answers it "not built yet".
// The reference is docs/features/interact/interactive-blueprint.schema.json: this file must accept and refuse the same forms (interact-blueprint.test.mjs).
// No subject appears anywhere in this file.
import { z } from 'zod';

// Every limit of section 4 in one table (the prompt file schema.js is tested against it). A text limit is only ever lowered, never raised, without the owner (section 4.12).
export const LIMITS = Object.freeze({
  id: 32,
  statement: 300, formula: 40, assumptions: [1, 3], assumption: 120,
  quantities: [2, 10], quantityLabel: 24, quantityUnit: 16, meaning: 120,
  things: [1, 4], thingLabel: 16,
  inputs: [1, 3], inputLabel: 24, inputUnit: 16, options: [2, 8], optionLabel: 24, optionValue: 32, items: [2, 12], itemLabel: 24,
  duration: [2, 20], timeLabel: 20, timeUnit: 6, steps: [2, 40],
  code: [20, 3000], outputs: [1, 24], outputUnit: 16, listLength: [2, 12], gridSide: [1, 8], sweeps: [0, 2],
  parts: [1, 12], pictureUnit: 16, partText: 24, arrowLabel: 4, decimals: [0, 3],
  title: 30, axisLabel: 20, axisUnit: 6, series: [1, 3], seriesLabel: 12, kindLabel: 42, kindLabels: [2, 12],
  values: [1, 4], valueLabel: 12, valueUnit: 6,
  always: [0, 3], cases: [0, 4], line: 36,
  claims: [2, 6], at: [1, 3],
  lessonTitle: 60, description: [130, 200], instructions: 300, goal: 200,
});

// The full set of options, and the subset this test builds (section 4.13). Every list names what a field may take.
export const FULL = Object.freeze({
  inputs: ['number', 'select', 'boolean', 'index'],
  time: ['continuous', 'steps', 'none'],
  outputs: ['number', 'flag', 'text', 'index', 'list', 'textList', 'grid'],
  sweeps: true,
  main: ['parts', 'coordinate-plot', 'bar-chart', 'heatmap', 'token-links'],
  panel: ['parts', 'coordinate-plot', 'bar-chart', 'heatmap', 'token-links'],
  parts: ['line', 'dot', 'arrow', 'trace', 'label', 'rect', 'number', 'curve'],
  labelFrom: true,
  plotStyles: ['line', 'scatter', 'step'], plotRange: true,
  claims: ['unchanged', 'increases', 'decreases', 'equal', 'sumsTo', 'between', 'holds'], claimTime: true,
});
export const BUILT = Object.freeze({
  inputs: ['number', 'select', 'boolean'],
  time: ['continuous'],
  outputs: ['number', 'flag'],
  sweeps: false,
  main: ['parts'],
  panel: ['coordinate-plot'],
  parts: ['line', 'dot', 'arrow', 'trace', 'label'],
  labelFrom: false,
  plotStyles: ['line'], plotRange: false,
  claims: ['unchanged', 'increases', 'decreases', 'equal'], claimTime: false,
});

const L = LIMITS;
const str = (min, max) => z.string().min(min).max(max);
const lit = value => z.literal(value);
const idRule = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/, 'an id starts with a letter and has at most 32 letters, digits or underscores');
const coordinate = z.union([z.number(), idRule]), point = z.tuple([coordinate, coordinate]);
const ids2 = z.tuple([idRule, idRule]);
const labels = z.union([z.array(str(1, L.kindLabel)).min(L.kindLabels[0]).max(L.kindLabels[1]), idRule]);
const object = shape => z.object(shape).strict();
const some = (list, kinds) => kinds.filter(kind => list.includes(kind));
const choice = (name, members) => { if (!members.length) throw new Error(`the form has no ${name}`); return members.length === 1 ? members[0] : z.discriminatedUnion(name === 'time' ? 'mode' : name === 'output' ? 'kind' : 'type', members); };

const settingValue = z.union([z.number(), z.string(), z.boolean()]);
const at = z.array(object({ input: idRule, value: settingValue })).min(L.at[0]).max(L.at[1]);

function inputs(o) {
  const all = {
    number: object({ type: lit('number'), id: idRule, label: str(1, L.inputLabel), unit: str(0, L.inputUnit), min: z.number(), max: z.number(), default: z.number(), step: z.number().gt(0) }),
    select: object({ type: lit('select'), id: idRule, label: str(1, L.inputLabel), options: z.array(object({ value: z.string().regex(/^[A-Za-z0-9_.-]{1,32}$/), label: str(1, L.optionLabel) })).min(L.options[0]).max(L.options[1]), default: z.string() }),
    boolean: object({ type: lit('boolean'), id: idRule, label: str(1, L.inputLabel), default: z.boolean() }),
    index: object({ type: lit('index'), id: idRule, label: str(1, L.inputLabel), items: z.array(str(1, L.itemLabel)).min(L.items[0]).max(L.items[1]), default: z.number().int().min(0) }),
  };
  return choice('type', some(o.inputs, Object.keys(all)).map(kind => all[kind]));
}

function time(o) {
  const all = {
    continuous: object({ mode: lit('continuous'), duration: z.number().min(L.duration[0]).max(L.duration[1]), label: str(1, L.timeLabel), unit: str(1, L.timeUnit) }),
    steps: object({ mode: lit('steps'), count: z.number().int().min(L.steps[0]).max(L.steps[1]), label: str(1, L.timeLabel) }),
    none: object({ mode: lit('none') }),
  };
  return choice('time', some(o.time, Object.keys(all)).map(kind => all[kind]));
}

function outputs(o) {
  const base = kind => ({ id: idRule, unit: str(0, L.outputUnit), meaning: str(1, L.meaning), kind: lit(kind) });
  const sized = kind => object({ ...base(kind), length: z.number().int().min(L.listLength[0]).max(L.listLength[1]).optional(), maxLength: z.number().int().min(L.listLength[0]).max(L.listLength[1]).optional() })
    .refine(out => (out.length === undefined) !== (out.maxLength === undefined), 'a list declares length (a fixed count) or maxLength (a count that changes), one of the two');
  const all = {
    number: object(base('number')), flag: object(base('flag')), text: object(base('text')), index: object(base('index')),
    list: sized('list'), textList: sized('textList'),
    grid: object({ ...base('grid'), rows: z.number().int().min(L.gridSide[0]).max(L.gridSide[1]), columns: z.number().int().min(L.gridSide[0]).max(L.gridSide[1]) }),
  };
  return choice('output', some(o.outputs, Object.keys(all)).map(kind => all[kind]));
}

function parts(o) {
  const of = { of: idRule.optional() };
  const all = {
    line: object({ type: lit('line'), id: idRule, from: point, to: point, ...of }),
    dot: object({ type: lit('dot'), id: idRule, at: point, size: z.union([z.enum(['small', 'medium', 'large']), idRule]), ...of }),
    arrow: object({ type: lit('arrow'), id: idRule, from: point, to: point, label: str(1, L.arrowLabel).optional(), ...of }),
    trace: object({ type: lit('trace'), id: idRule, at: ids2, ...of }),
    label: o.labelFrom
      ? object({ type: lit('label'), id: idRule, near: idRule, text: str(1, L.partText).optional(), textFrom: idRule.optional(), ...of }).refine(part => (part.text === undefined) !== (part.textFrom === undefined), 'a label has text (fixed) or textFrom (an output), one of the two')
      : object({ type: lit('label'), id: idRule, near: idRule, text: str(1, L.partText), ...of }),
    rect: object({ type: lit('rect'), id: idRule, at: point, size: point, ...of }),
    number: object({ type: lit('number'), id: idRule, at: point, value: idRule, decimals: z.number().int().min(L.decimals[0]).max(L.decimals[1]), ...of }),
    curve: object({ type: lit('curve'), id: idRule, over: idRule, y: idRule, ...of }),
  };
  return choice('type', some(o.parts, Object.keys(all)).map(kind => all[kind]));
}

function picture(o, where) {
  const title = str(1, L.title), members = [];
  const kinds = {
    'parts': () => object({ type: lit('parts'), unit: str(0, L.pictureUnit), parts: z.array(parts(o)).min(L.parts[0]).max(L.parts[1]) }),
    'coordinate-plot': () => object({ type: lit('kind'), kind: lit('coordinate-plot'), title,
      x: object({ over: z.union([lit('time'), idRule]), label: str(1, L.axisLabel), unit: str(0, L.axisUnit) }),
      y: object({ label: str(1, L.axisLabel), unit: str(0, L.axisUnit), ...(o.plotRange ? { range: z.tuple([z.number(), z.number()]).optional() } : {}) }),
      series: z.array(object({ value: idRule, label: str(1, L.seriesLabel), of: idRule, style: z.enum(o.plotStyles) })).min(L.series[0]).max(L.series[1]) }),
    'bar-chart': () => object({ type: lit('kind'), kind: lit('bar-chart'), title, unit: str(0, L.axisUnit), labels, values: idRule, highlight: idRule.optional() }),
    'heatmap': () => object({ type: lit('kind'), kind: lit('heatmap'), title, rowLabels: labels, columnLabels: labels, cells: idRule, highlight: ids2.optional() }),
    'token-links': () => object({ type: lit('kind'), kind: lit('token-links'), title, source: labels, target: labels, picked: idRule, weights: idRule }),
  };
  for (const kind of some(o[where], Object.keys(kinds))) members.push(kinds[kind]());
  // parts and kind share the discriminator "type"; a kind picture is told apart by "kind" inside it
  const kindMembers = members.filter(member => member.shape.type.value === 'kind'), partsMember = members.find(member => member.shape.type.value === 'parts');
  const kindUnion = kindMembers.length > 1 ? z.discriminatedUnion('kind', kindMembers) : kindMembers[0];
  return [partsMember, kindUnion].filter(Boolean).length > 1 ? z.union([partsMember, kindUnion]) : partsMember ?? kindUnion;
}

function claims(o) {
  const when = o.claimTime ? { atTime: z.enum(['start', 'end']).optional() } : {}, held = { at: at.optional() };
  const all = {
    unchanged: object({ type: lit('unchanged'), value: idRule, when: idRule, ...held, ...when }),
    increases: object({ type: lit('increases'), value: idRule, with: idRule, ...(o.claimTime ? { strict: z.boolean().optional() } : {}), ...held }),
    decreases: object({ type: lit('decreases'), value: idRule, with: idRule, ...(o.claimTime ? { strict: z.boolean().optional() } : {}), ...held }),
    equal: object({ type: lit('equal'), value: idRule, to: idRule, ...held, ...when }),
    sumsTo: object({ type: lit('sumsTo'), value: idRule, to: z.number(), ...held, ...when }),
    between: object({ type: lit('between'), value: idRule, min: z.number(), max: z.number(), ...held, ...when }),
    holds: object({ type: lit('holds'), value: idRule, ...held, ...when }),
  };
  return choice('type', some(o.claims, Object.keys(all)).map(kind => all[kind]));
}

// The relationship and the quantities: the first two fields, also the whole answer of the seeded arm's first call (section 7.8).
const relationship = object({ statement: str(1, L.statement), formula: z.union([str(1, L.formula), z.null()]), assumptions: z.array(str(1, L.assumption)).min(L.assumptions[0]).max(L.assumptions[1]) });
const quantities = z.array(object({ id: idRule, label: str(1, L.quantityLabel), unit: str(0, L.quantityUnit), role: z.enum(['control', 'fixed', 'result']), meaning: str(1, L.meaning) })).min(L.quantities[0]).max(L.quantities[1]);
export const quantitiesSchema = object({ relationship, quantities });

// The form, in the order of the reasoning. options = FULL or BUILT.
export function blueprintSchema(options = BUILT) {
  const o = options;
  return object({
    version: lit(1),
    relationship,
    quantities,
    things: z.array(object({ id: idRule, label: str(1, L.thingLabel) })).min(L.things[0]).max(L.things[1]),
    inputs: z.array(inputs(o)).min(L.inputs[0]).max(L.inputs[1]),
    time: time(o),
    math: object({
      code: str(L.code[0], L.code[1]),
      outputs: z.array(outputs(o)).min(L.outputs[0]).max(L.outputs[1]),
      ...(o.sweeps ? { sweeps: z.array(object({ id: idRule, min: z.number(), max: z.number(), default: z.number() })).min(L.sweeps[0]).max(L.sweeps[1]).optional() } : {}),
    }),
    pictures: object({ main: picture(o, 'main'), panel: z.union([picture(o, 'panel'), z.null()]) }),
    values: z.array(object({ value: idRule, label: str(1, L.valueLabel), unit: str(0, L.valueUnit).optional(), decimals: z.number().int().min(L.decimals[0]).max(L.decimals[1]).optional(), of: idRule })).min(L.values[0]).max(L.values[1]),
    explanation: object({ always: z.array(str(1, L.line)).min(L.always[0]).max(L.always[1]), cases: z.array(object({ when: idRule, text: str(1, L.line) })).min(L.cases[0]).max(L.cases[1]), otherwise: str(1, L.line).optional() }),
    layout: object({ pictureCount: z.enum(['one', 'two']), runs: z.enum(['left-to-right', 'top-to-bottom', 'compact']), panelRole: z.enum(['none', 'records-main', 'equal', 'aligned']) }),
    claims: z.array(claims(o)).min(L.claims[0]).max(L.claims[1]),
    lesson: object({ title: str(1, L.lessonTitle), description: str(L.description[0], L.description[1]), instructions: str(1, L.instructions), goal: str(1, L.goal) }),
  });
}

export const FULL_SCHEMA = blueprintSchema(FULL), BUILT_SCHEMA = blueprintSchema(BUILT);

// The JSON schema sent to the model: the form restricted to BUILT, the fields in the form's order (zod keeps the order a shape is written in).
const toJson = schema => { const { $schema, ...json } = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }); return json; };
export const providerSchema = () => toJson(BUILT_SCHEMA);
// The first call of the seeded arm: the first two fields only.
export const quantitiesProviderSchema = () => toJson(quantitiesSchema);

// parse -> { ok, value } or { ok: false, issues: [{ path, message, code }] }; path is the field path as text, "values[2].label".
export const pathText = path => path.reduce((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text ? `${text}.${String(key)}` : String(key)), '');
export function parseBlueprint(value, schema = BUILT_SCHEMA) {
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: parsed.error.issues.map(issue => ({ path: pathText(issue.path), message: issue.message, code: issue.code })) };
}
