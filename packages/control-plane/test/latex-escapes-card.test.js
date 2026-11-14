// Release 124: a card body whose LaTeX commands came back with ONE backslash in the model's JSON (\f, \t read as form feed and tab) is saved with the
// commands restored. Offline: the model is a double.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact } from '../src/learn-artifact.js';
import { cycleSpec } from './explanation-layout-fixture.js';

const WRONG = JSON.parse('"The probability is $p = \\frac{1}{1 + e^{-z}}$. At $z = 0$ it is $\\frac{1}{1 + 1} = 0.5$, and $\\theta \\times 2$ gives $\\rho \\neq \\nu$."');
const RIGHT = 'The probability is $p = \\frac{1}{1 + e^{-z}}$. At $z = 0$ it is $\\frac{1}{1 + 1} = 0.5$, and $\\theta \\times 2$ gives $\\rho \\neq \\nu$.';

test('the saved explanation body has every one-backslash LaTeX command restored (\\frac, \\theta, \\times, \\rho, \\neq, \\nu)', async () => {
  assert.ok(/[\f\t\r\n]/.test(WRONG), 'the wire text carries the control characters');
  const input = { title: 'The sigmoid', visuals: [{ k: 'diagram', spec: cycleSpec('Score to probability') }], body: `${WRONG}\n\n[[visual:1]]\n\nA larger score gives a larger probability.` };
  const log = console.log; console.log = () => {};
  let out; try {
    out = await generateArtifact({}, { command: 'explanation', args: 'What is the sigmoid?' }, {
      callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input }] }),
    });
  } finally { console.log = log; }
  assert.equal(out.result, 'artifact', JSON.stringify(out).slice(0, 300));
  assert.ok(out.block.body.startsWith(RIGHT), out.block.body.slice(0, 200));
  assert.ok(!/[\f\x08]/.test(out.block.body) && !/\t/.test(out.block.body), 'no control character is saved');
});
