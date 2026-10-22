// EXP-T17: authoring component specs. The author call goes through the real anthropic() dispatcher to a recording fetch (a
// fixture provider: no paid call); validation uses Lane A's real registry and compiler and the existing scene gates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropic } from '../src/ask.js';
import { catalogue } from '../../web/src/visual-components/registry.js';
import { EXAMPLES } from '../../web/src/visual-components/examples/index.js';
import { SPEC_LIMITS, authorExplanation, capabilityGaps, compilerSupport, selectExamples, specFacts, validateStage } from '../src/explain-author.js';

const env = { SMALL_ENV: 'test', ANTHROPIC_API_KEY: 'test-key' };
const SPEC = { version: 1, id: 'water', title: 'Where rain comes from', components: [
  { id: 'cycle', component: 'flow', version: 1, params: { steps: ['Sun warms the sea', 'Vapour rises and cools', 'Droplets form clouds', 'Rain falls'] } },
], presentation: { mode: 'static' } };
const module = (id, label, extra = {}) => ({ id, component: 'module', version: 1, params: { label }, ...extra });

function provider(t, replies) {
  const calls = [], original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const input = replies.shift();
    return Response.json({ model: body.model, content: [{ type: 'tool_use', id: 't', name: body.tools[0].name, input }], stop_reason: 'tool_use', usage: { input_tokens: 2000, output_tokens: 700 } });
  };
  return calls;
}
const author = (prompt, options = {}) => authorExplanation(prompt, { env, callModel: anthropic, ...options });

test('the author receives the actual catalogue (every capability and parameter limit), the supported features and the limits', async t => {
  const calls = provider(t, [{ kind: 'spec', spec: SPEC }]);
  const out = await author('Explain where rain comes from.');
  assert.equal(out.kind, 'spec');
  assert.deepEqual(out.identity, { requested: 'claude-opus-5-5', served: 'claude-opus-5-5', matches: true });
  const [body] = calls;
  const sent = JSON.parse(body.messages[0].content[0].text);
  assert.deepEqual(sent.catalogue, JSON.parse(JSON.stringify(catalogue())), 'the registry entries themselves, not a summary');
  for (const entry of sent.catalogue) for (const field of ['name', 'version', 'description', 'params', 'hints', 'repairWritable', 'anchors']) assert.ok(field in entry, `${entry.name}.${field}`);
  assert.deepEqual(sent.supported, { static: true, time: true, math: false, steps: false, experiment: false });
  assert.deepEqual(sent.limits, SPEC_LIMITS);
  assert.equal(sent.request, 'Explain where rain comes from.');
  assert.deepEqual(sent.examples, [], 'no examples unless explicitly selected');
  assert.deepEqual([body.model, body.tool_choice, body.tools.map(x => x.name)], ['claude-opus-5-5', { type: 'auto' }, ['author_explanation']]);
  // The tool states the instance shape and the registered names (a real run with a bare object wrote "type", spend.md row 2).
  const instance = body.tools[0].input_schema.properties.spec.properties.components.items;
  assert.deepEqual(instance.required, ['id', 'component', 'version']);
  assert.deepEqual(instance.properties.component.enum, catalogue().map(entry => entry.name));
  // Owner requirement: Lane B2's presentation contract (static first, named steps, purposeful experiments) and math runs.
  const system = body.system[0].text;
  for (const rule of ['presentation contract', 'static (prefer it)', 'a highlight alone is not a step', 'purpose (the question moving it answers', 'math runs in TeX', 'never calculator text', 'about 27 characters per line'])
    assert.ok(system.includes(rule), rule);
  // The compiled result is the trusted compiler's.
  assert.equal(out.compiled.counts.authored, 1);
  assert.equal(out.compiled.componentVersions.flow, 1);
});

test('a request needing unsupported math, steps or an experiment is a structured capability gap, never a degraded card', async t => {
  // The author says so itself...
  provider(t, [{ kind: 'capability_gap', gap: { needs: ['math'], reason: 'The period law needs a typeset formula.' } }]);
  const said = await author('Show T = 2 pi sqrt(L/g) as a formula.');
  assert.deepEqual([said.kind, said.gap.needs, said.gap.source, said.gap.capability], ['gap', ['math'], 'author', 'explain']);
  assert.match(said.gap.message, /typeset math/);
  // ...or writes the feature anyway: the trusted check finds it before compiling, and nothing is drawn.
  const math = { ...SPEC, components: [module('law', { runs: [{ kind: 'text', text: 'Period ' }, { kind: 'math', tex: 'T = 2\\pi\\sqrt{L/g}' }] })] };
  const steps = { ...SPEC, presentation: { mode: 'steps', steps: [{ id: 'a', title: 'Heat' }, { id: 'b', title: 'Rise' }] } };
  const experiment = { ...SPEC, presentation: { mode: 'static', experiments: [{ id: 'e', purpose: 'Compare lengths.', input: 'length', domain: { values: [1, 4] }, affects: ['cycle'], contrasts: ['Longer is slower.'] }] } };
  for (const [spec, need] of [[math, 'math'], [steps, 'steps'], [experiment, 'experiment']]) {
    provider(t, [{ kind: 'spec', spec }]);
    const out = await author('x');
    assert.deepEqual([out.kind, out.gap.needs, out.gap.source], ['gap', [need], 'compiler'], need);
    assert.equal(out.compiled, undefined);
  }
  assert.deepEqual(capabilityGaps(SPEC), []);
  assert.deepEqual(compilerSupport(), { static: true, time: true, math: false, steps: false, experiment: false });
});

test('invented components, invalid parameters and complexity over the limits are refused, never compiled', async t => {
  const cases = [
    [{ ...SPEC, components: [{ id: 'g', component: 'galaxy', version: 1, params: {} }] }, /unknown component "galaxy"/],
    [{ ...SPEC, components: [{ id: 'm', component: 'module', version: 2, params: { label: 'A' } }] }, /no version 2/],
    [{ ...SPEC, components: [module('m', 'A', { params: { label: 'A', colour: 'red' } })] }, /unknown parameter "colour"/],
    [{ ...SPEC, components: [module('m', 'A', { hints: { width: 9000 } })] }, /at most 480/],
    [{ ...SPEC, components: [module('m', 'x'.repeat(201))] }, /at most 200/],
    [{ ...SPEC, components: Array.from({ length: 41 }, (_, i) => module(`m${i}`, `Unit ${i}`)) }, /40/],
    [{ ...SPEC, connections: [{ from: 'cycle.nowhere', to: 'cycle.top' }] }, /not an anchor/],
    // The real 2026-10-22 run's shape: "type" in place of "component".
    [{ ...SPEC, components: [{ id: 'root', type: 'stack', version: 1, params: {} }] }, /component/],
  ];
  for (const [spec, why] of cases) {
    provider(t, [{ kind: 'spec', spec }]);
    const out = await author('x');
    assert.equal(out.kind, 'invalid', String(why));
    assert.match(out.problems.join(' '), why);
    assert.equal(out.compiled, undefined);
  }
  // Too many objects for one card: the scene validators refuse it (60 on screen at once).
  const crowded = { ...SPEC, components: Array.from({ length: 31 }, (_, i) => module(`m${i}`, `Unit ${i}`)), connections: Array.from({ length: 30 }, (_, i) => ({ from: `m${i}.bottom`, to: `m${i + 1}.top` })) };
  assert.match(validateStage({ spec: crowded, prompt: 'x' }).problems.join(' '), /60|objects|too/);
});

test('evidence bindings come only from the records provided; examples add no facts, wording or source ids', async t => {
  const evidence = [{ id: 'ev1', kind: 'web', location: 'https://example.org/rain', excerpt: 'Water vapour condenses into droplets.' }];
  const bound = { ...SPEC, components: [{ ...SPEC.components[0], evidence: ['ev1'] }] };
  provider(t, [{ kind: 'spec', spec: bound }]);
  assert.equal((await author('x', { evidence })).kind, 'spec');
  provider(t, [{ kind: 'spec', spec: { ...SPEC, components: [{ ...SPEC.components[0], evidence: ['ev9'] }] } }]);
  assert.match((await author('x', { evidence })).problems[0], /"ev9" is not one of the records provided/);
  // An example is shown only when selected, marked as composition guidance.
  const calls = provider(t, [{ kind: 'spec', spec: SPEC }]);
  await author('Explain where rain comes from.', { examples: ['pipeline'] });
  assert.deepEqual(JSON.parse(calls[0].messages[0].content[0].text).examples, [{ id: 'pipeline', use: 'composition only, never facts', spec: EXAMPLES.pipeline }]);
  assert.throws(() => selectExamples(['nope']), /Unknown example/);
  assert.throws(() => selectExamples(['pipeline', 'pendulum-law', 'pipeline']), /at most 2/);
  // Copying an example's wording that the request does not contain is refused; the same words from the learner are fine.
  const law = EXAMPLES['pendulum-law'].components.find(item => item.id === 'law').params.text;
  const copied = { ...SPEC, components: [{ id: 'note', component: 'callout', version: 1, params: { text: law, tone: 'key' } }] };
  provider(t, [{ kind: 'spec', spec: copied }, { kind: 'spec', spec: copied }]);
  assert.match((await author('Explain pendulums.', { examples: ['pendulum-law'] })).problems.join(' '), /copies wording from an example/);
  assert.equal((await author(`Explain this: ${law}`, { examples: ['pendulum-law'] })).kind, 'spec');
});

test('the facts the reviewer reads are the text the spec carries', () => {
  assert.deepEqual(specFacts(SPEC), ['Where rain comes from', 'Sun warms the sea', 'Vapour rises and cools', 'Droplets form clouds', 'Rain falls']);
});
