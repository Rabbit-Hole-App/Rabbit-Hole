import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildConstraints, OUTPUT } from '../build-renderer-constraints.mjs';
import { RULES } from '../checks/reference-linter.mjs';

const source = name => readFile(new URL(name, import.meta.url), 'utf8');

test('every linter rule number raised by the checks has a row in the rule table', async () => {
  const raised = new Set();
  for (const name of ['../checks/reference-linter.mjs', '../checks/preview-wrap.mjs', '../author-runtime.mjs']) {
    const text = await source(name);
    for (const match of text.matchAll(/\bflag\([^,()]+(?:\([^)]*\))?,\s*[^,]+,\s*(\d+)\s*,/gu)) raised.add(Number(match[1]));
    for (const match of text.matchAll(/\brule:\s*(\d+)\b/gu)) raised.add(Number(match[1]));
  }
  assert.ok(raised.size >= 10, `the scan finds the rules the checks raise (${[...raised].sort((a, b) => a - b).join(', ')})`);
  assert.deepEqual([...raised].filter(rule => !RULES[rule]), [], 'a rule raised by a check needs a row in RULES (checks/reference-linter.mjs)');
  assert.deepEqual(Object.keys(RULES).map(Number), Array.from({ length: 12 }, (_, i) => i + 1), 'rules 1 to 12, in order');
  for (const [number, rule] of Object.entries(RULES)) for (const field of ['name', 'text', 'exempt', 'pass', 'fail']) assert.ok(typeof rule[field] === 'string' && rule[field].trim(), `rule ${number} has ${field}`);
});

test('the constraints sheet carries every linter rule and the lengths, and is current', async () => {
  const sheet = await buildConstraints();
  for (const number of Object.keys(RULES)) assert.match(sheet, new RegExp(`- Rule ${number}, `, 'u'));
  assert.match(sheet, /Rule 5, axis names:.*Residual \(y units\)/u, 'the rule that cost rounds carries its fail example');
  assert.match(sheet, /Exemptions: inside \$…\$ the exponents, the subscripts and the integers 0, 1 and 2 are formula constants/u);
  assert.match(sheet, /## Lengths/u);
  assert.match(sheet, /A comparison reference with exactly two panels \(or two columns\) must also supply a single-diagram variant \(reference-single-specs\); the pipeline author writes it alongside the reference/u);
  assert.match(sheet, /coordinate-plot: .*x\.unit at most 12 characters/u);
  const current = (await readFile(OUTPUT, 'utf8')).replace(/\r\n/gu, '\n');
  assert.equal(current, sheet, 'renderer-constraints.md is stale; run node scripts/topic-pipeline/build-renderer-constraints.mjs');
});
