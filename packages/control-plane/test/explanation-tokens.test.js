// VAR-1 step 2: {{d:N.path}} tokens in an explanation's prose are filled from the card's own diagram (derived fields included) before any check reads the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact } from '../src/learn-artifact.js';
import { fillTokens, leftoverToken } from '../src/explanation-tokens.js';
import { EXPLANATION_VISUAL_RULES } from '../src/learn-primitives.js';
import { withVisual, diagramFence } from './explanation-layout-fixture.js';

const scripted = (...inputs) => {
  const seen = [];
  const callModel = async (env, body) => {
    seen.push(body);
    return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `call-${seen.length}`, name: 'make_explanation', input: inputs[Math.min(seen.length, inputs.length) - 1] }] });
  };
  return { callModel, seen };
};
const box = extra => ({ version: 1, diagram: { kind: 'box-plot', title: 'Fences from the quartiles', x: { label: 'Reading', min: -5, max: 25 }, boxes: [{ label: 'Trial', whiskerLow: 4, q1: 6, median: 9, q3: 12, whiskerHigh: 14, ...extra }] } });
const lead = 'The fences from the quartiles mark where an outlier begins.';
const card = (prose, after = 'A reading beyond a fence is an outlier.', spec = box()) => ({ title: 'Fences from the quartiles', body: withVisual(prose, { after, visual: diagramFence(spec) }) });
const run = (...inputs) => { const trace = {}, stub = scripted(...inputs); return generateArtifact({}, { command: 'explanation', args: 'Explain the box plot fences' }, { callModel: stub.callModel, trace }).then(out => ({ out, trace, stub })); };
const fence = '```';

test('a token for a fence the author left out is delivered as the computed number (Q1 6, Q3 12: fences -3 and 21)', async () => {
  const { out, trace } = await run(card(`${lead} The upper fence is {{d:boxes.0.fences.upper}} and the lower fence is {{d:1.boxes.0.fences.lower}}.`));
  assert.equal(out.result, 'artifact');
  assert.match(out.block.body, /The upper fence is 21 and the lower fence is -3\./);
  assert.doesNotMatch(out.block.body, /\{\{/);
  assert.equal(trace.tokensFilled, 2);
  assert.match(trace.bodyWithTokens, /\{\{d:boxes\.0\.fences\.upper\}\}/, 'the archive keeps the body as written');
});

test('one decimal can be forced: {{d:path|1}}', async () => {
  const { out } = await run(card(`${lead} The upper fence is {{d:boxes.0.fences.upper|1}}.`));
  assert.match(out.block.body, /upper fence is 21\.0\./);
});

test('an unknown path is refused, naming the numbers the figure computes; the repair gets that text and a fixed answer is delivered', async () => {
  const { out, stub } = await run(card(`${lead} The top fence is {{d:boxes.0.fences.top}}.`), card(`${lead} The top fence is {{d:boxes.0.fences.upper}}.`));
  assert.equal(stub.seen.length, 2);
  const message = JSON.stringify(stub.seen[1].messages.at(-1).content);
  assert.match(message, /explanation_bad_token/);
  assert.match(message, /1\.boxes\.0\.fences\.lower, 1\.boxes\.0\.fences\.upper/, 'the valid paths are named');
  assert.equal(out.result, 'artifact');
  assert.match(out.block.body, /top fence is 21\./);
  assert.deepEqual(out.failedOn, ['validation_error'], 'a token problem is not an arithmetic issue');
});

test('a token fill that never succeeds fails the step: no raw token is delivered', async () => {
  const bad = card(`${lead} The top fence is {{d:boxes.0.fences.top}}.`);
  const { out } = await run(bad, bad, bad);
  assert.equal(out.result, 'validation_error');
  assert.match(out.error, /explanation_bad_token/);
});

test('the checks read the filled card: wrong typed fences still fail first, the token is right once they are fixed', async () => {
  const wrong = card(`${lead} The upper fence is {{d:boxes.0.fences.upper}}.`, undefined, box({ fences: { lower: 2, upper: 16 } }));
  const right = card(`${lead} The upper fence is {{d:boxes.0.fences.upper}}.`, undefined, box({ fences: { lower: -3, upper: 21 } }));
  const { out } = await run(wrong, right);
  assert.equal(out.result, 'artifact');
  assert.equal(out.repaired, true, 'the 154 fence check refused the first answer');
  assert.match(out.block.body, /upper fence is 21\./);
});

test('a card with two diagrams needs the diagram number', () => {
  const body = prose => `${lead}\n\n${diagramFence(box())}\n\n${prose}\n\n${diagramFence(box({ q3: 14 }))}\n`;
  const second = fillTokens({ body: body('Then {{d:2.boxes.0.fences.upper}} and {{d:1.boxes.0.fences.upper}}.') });
  assert.equal(second.problem, null);
  assert.match(second.block.body, /Then 26 and 21\./, 'diagram 2: Q1 6, Q3 14, IQR 8, upper fence 14 + 12; diagram 1: 21');
  assert.equal(second.filled, 2);
  assert.match(fillTokens({ body: body('Then {{d:boxes.0.fences.upper}}.') }).problem, /needs the diagram number first.*has 2/);
  assert.match(fillTokens({ body: body('Then {{d:3.boxes.0.fences.upper}}.') }).problem, /names diagram 3, but the card has 2/);
});

test('folded sections are filled too; a fence is left as written; a token left anywhere is refused', () => {
  const more = fillTokens({ body: `${lead}\n\n${diagramFence(box())}`, more: [{ title: 'Detail', text: 'The lower fence is {{d:boxes.0.fences.lower}}.' }] });
  assert.equal(more.problem, null);
  assert.equal(more.block.more[0].text, 'The lower fence is -3.');
  const inside = { body: `${lead}\n\n${fence}rh-diagram\n{{d:boxes.0.fences.lower}}\n${fence}` };
  assert.equal(fillTokens(inside).block.body, inside.body, 'a fence is never edited');
  assert.match(leftoverToken(inside), /explanation_bad_token/);
  assert.equal(leftoverToken({ body: 'Plain prose.' }, ['What next?']), null);
  assert.match(leftoverToken({ body: 'Plain prose.' }, ['What is {{d:1.q1}}?']), /explanation_bad_token/);
});

test('a malformed token and a path to something that is not a number are named', () => {
  const body = prose => ({ body: `${lead}\n\n${diagramFence(box())}\n\n${prose}` });
  assert.match(fillTokens(body('A {{d:boxes.0.fences.upper|9}}.')).problem, /decimals 0 to 3/);
  assert.match(fillTokens(body('A {{d:boxes.0.label}}.')).problem, /does not name a number in diagram 1/);
  assert.match(fillTokens(body('A {{d:}}.')).problem, /is not a token/);
});

test("a token whose diagram does not parse is left for that diagram's own problem (the repair names the diagram, not the token)", async () => {
  const broken = box();
  broken.diagram.boxes[0].q1 = 12; broken.diagram.boxes[0].q3 = 6; // Q1 above Q3
  const prose = `${lead} The fence is {{d:boxes.0.fences.upper}}.`;
  const { out, stub } = await run(card(prose, undefined, broken), card(prose));
  assert.equal(stub.seen.length, 2);
  assert.doesNotMatch(JSON.stringify(stub.seen[1].messages.at(-1).content), /explanation_bad_token/);
  assert.match(out.block.body, /The fence is 21\./);
});

test('the author is told to write computed numbers as tokens (the shared visual rule)', () => {
  assert.match(EXPLANATION_VISUAL_RULES, /A number the figure computes from others \(fences, means, normalised weights, softmax outputs\) is written as \{\{d:N\.path\}\}, never typed/);
});
