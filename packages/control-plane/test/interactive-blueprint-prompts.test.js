import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITS as L, providerSchema, quantitiesProviderSchema } from '../../web/src/interact-blueprint.js';
import { blueprintPrompt, quantitiesPrompt, blueprintMessage, seededMessage, correctionMessage } from '../src/agents/interactive-blueprint/index.js';
import { SCHEMA } from '../src/agents/interactive-blueprint/schema.js';
import { GENERAL } from '../src/agents/interactive-blueprint/general.js';
import { DEPTH_PROMPTS } from '../src/agents/interactive-blueprint/depth.js';
import { QUANTITIES } from '../src/agents/interactive-blueprint/quantities.js';

// Brief 38 section 7.2: the two tests that keep the prompt files honest.
const examples = JSON.parse(readFileSync(new URL('../../../docs/features/interact/interactive-blueprint-examples.json', import.meta.url), 'utf8'));
const range = ([low, high]) => `${low} to ${high}`;

test('schema.js agrees with the schema: every number it states is a limit of LIMITS, and every field the model is told to fill is named in it', () => {
  const phrases = [
    `at most ${L.statement} characters`, `at most ${L.formula} characters`, `${range(L.assumptions)} short sentences`, `at most ${L.assumption} characters each`, `${range(L.quantities)}, each`, `label is at most ${L.quantityLabel} characters, meaning at most ${L.meaning}`,
    `the ${range(L.things)} objects`, `label at most ${L.thingLabel} characters`, `the controls, ${range(L.inputs)}`, `Labels are at most ${L.inputLabel} characters`, `options: ${range(L.options)} of`, `(${range(L.duration)})`,
    `at most ${L.code[1]} characters`, `parts is ${range(L.parts)} parts`, `label is at most ${L.arrowLabel} characters`, `text of at most ${L.partText} characters`, `series: ${range(L.series)} of`,
    `title is at most ${L.title} characters, an axis label ${L.axisLabel}, a line's label ${L.seriesLabel}`, `values: ${range(L.values)} live numbers`, `label is at most ${L.valueLabel} characters, unit at most ${L.valueUnit}, decimals ${range(L.decimals)}`,
    `Each line is at most ${L.line} characters`, `always: ${range(L.always)} lines`, `cases: ${range(L.cases)} of`, `claims: ${range(L.claims)} statements`, `a list of ${range(L.at)} of { input, value }`,
    `title: the card's title, a question or a statement (at most ${L.lessonTitle} characters)`, `${L.description[0]} to ${L.description[1]} characters in all`, `instructions: how to use the controls (at most ${L.instructions} characters)`, `(at most ${L.goal} characters)`,
  ];
  for (const phrase of phrases) assert.ok(SCHEMA.includes(phrase), `schema.js lacks "${phrase}"`);
  // the other direction: a number stated as a character limit is some limit of the schema
  const known = new Set(Object.values(L).flat());
  for (const [, n] of SCHEMA.matchAll(/at most (\d+) characters/g)) assert.ok(known.has(Number(n)), `schema.js states ${n}, which is no limit of the schema`);
  for (const [, n] of SCHEMA.matchAll(/(?:an axis label|line's label) (\d+)/g)) assert.ok(known.has(Number(n)), `schema.js states ${n}, which is no limit of the schema`);
  // every field name of the provider schema (the form restricted to BUILT) is described, except the version
  const names = new Set(), walk = node => { if (!node || typeof node !== 'object') return; if (node.properties) for (const [key, child] of Object.entries(node.properties)) { names.add(key); walk(child); } for (const value of Object.values(node)) if (value && typeof value === 'object' && !node.properties?.[value]) walk(value); };
  walk(providerSchema()); names.delete('version');
  for (const name of names) assert.ok(new RegExp(`\\b${name}\\b`).test(SCHEMA), `the provider schema has the field "${name}" and schema.js never names it`);
  const quantityNames = new Set(); const take = node => { if (node?.properties) for (const [key, child] of Object.entries(node.properties)) { quantityNames.add(key); take(child); } if (node?.items) take(node.items); };
  take(quantitiesProviderSchema());
  for (const name of quantityNames) assert.ok(new RegExp(`\\b${name}\\b`).test(QUANTITIES), `the quantities schema has the field "${name}" and quantities.js never names it`);
  // a named option is not told
  for (const named of ['textList', 'sweeps', 'bar-chart', 'heatmap', 'token-links', 'sumsTo', 'textFrom', 'atTime', 'type: "rect"', 'type: "curve"', 'type: "holds"', 'type: "between"', 'mode: "steps"', 'mode: "none"', 'type: "index"']) assert.equal(SCHEMA.includes(named), false, `${named} is only named, not built, so the prompt must not tell it`);
});

test('no subject in any prompt file: the joined system texts name none of the subjects of the examples', () => {
  const subjects = ['pendulum', 'thrown ball', 'softmax', 'attention', 'gradient descent', 'bubble sort', 'tokenizer'];
  assert.ok(Object.keys(examples).length === 7);
  for (const depth of Object.keys(DEPTH_PROMPTS)) for (const text of [blueprintPrompt(depth), quantitiesPrompt(depth), GENERAL, SCHEMA, QUANTITIES, DEPTH_PROMPTS[depth]]) for (const subject of subjects) assert.equal(text.toLowerCase().includes(subject), false, `"${subject}" is in a prompt file`);
});

test('the system text is the three files joined by one blank line (general + depth + schema), only the request\'s depth is sent; the quantities text swaps schema for quantities', () => {
  assert.equal(blueprintPrompt('detailed'), [GENERAL, DEPTH_PROMPTS.detailed, SCHEMA].join('\n\n'));
  assert.equal(quantitiesPrompt('brief'), [GENERAL, DEPTH_PROMPTS.brief, QUANTITIES].join('\n\n'));
  assert.equal(blueprintPrompt('detailed').includes('Depth: Brief'), false); assert.ok(blueprintPrompt('detailed').includes('Depth: Detailed. Make the reasoning inspectable.'));
  assert.throws(() => blueprintPrompt('deep'), /unknown depth/);
});

test('the user messages are the ones of section 7.7 and 7.8, character for character', () => {
  assert.equal(blueprintMessage('what changes a pendulum swing', 'detailed'), 'Question: what changes a pendulum swing\nDepth: Detailed');
  const settled = { relationship: { statement: 'S' }, quantities: [] };
  assert.equal(seededMessage('q', 'detailed', settled), `Question: q\nDepth: Detailed\n\nThe relationship and the quantities are already settled. Use them exactly as given, with these roles:\n${JSON.stringify(settled, null, 2)}`);
  assert.equal(correctionMessage(blueprintMessage('q', 'detailed'), '{"a":1}', ['first', 'second']), 'Question: q\nDepth: Detailed\n\nYour previous blueprint:\n{"a":1}\n\nThe program tested it and found these problems:\n1. first\n2. second\n\nReturn the whole blueprint again with these problems fixed. Change only what the problems require.');
  assert.equal(correctionMessage('x', 'y', Array.from({ length: 15 }, (_, k) => `p${k}`)).split('\n').filter(line => /^\d+\. /.test(line)).length, 12); // at most 12 problems go back
});
