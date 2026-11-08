// Item 47 (owner 2026-11-08, docs/features/explain.md section 2): the fast-chain author samples at temperature 0 (a seed where the provider documents one) and
// its repair at 0.3; flow rules the server can fix are fixed before any repair; the last-resort simplified diagram takes its kind from the learner's words;
// every correction is logged and counted on the card. Offline: the model is a double, nothing is sent or paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctDiagrams, diagramProblem, simplifiedDiagram } from '../src/learn-primitives.js';
import { fallbackKind } from '../src/explanation-visuals.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { AUTHOR_SEED, AUTHOR_TEMPERATURE, REPAIR_TEMPERATURE, stepRequest } from '../src/explanation-fast-chain.js';
import { CHAIN_STEPS } from '../src/explanation-models.js';

const fence = diagram => '```rh-diagram\n' + JSON.stringify({ version: 1, diagram }) + '\n```';
const specOf = md => JSON.parse(md.match(/```rh-diagram\n(.*)\n```/)[1]).diagram;
const flow = (nodes, edges, extra = {}) => ({ kind: 'flow', title: 'Making bread', nodes: nodes.map(([id, label, role = 'process']) => ({ id, label, role })), edges: edges.map(([from, to, label]) => ({ from, to, ...(label ? { label } : {}) })), ...extra });
const fix = diagram => correctDiagrams(`Bread rises.\n\n${fence(diagram)}\n\nSo it bakes.`);

test('one_branch_decision: a decision with one outgoing edge becomes a process', () => {
  const out = fix(flow([['a', 'Mix'], ['b', 'Risen?', 'decision'], ['c', 'Bake', 'outcome']], [['a', 'b'], ['b', 'c', 'Yes']]));
  assert.deepEqual(out.corrections, { one_branch_decision: 1 });
  assert.equal(specOf(out.md).nodes[1].role, 'process');
  assert.equal(diagramProblem(out.md), null);
});

test('joined_roots: two starts with no edge between them get a synthetic start; an edge that names the other start by its label makes it that edge\'s child', () => {
  const apart = fix(flow([['a', 'Mix flour'], ['b', 'Shape', 'outcome'], ['c', 'Feed starter'], ['d', 'Starter ready', 'outcome']], [['a', 'b'], ['c', 'd']]));
  assert.deepEqual(apart.corrections, { joined_roots: 1 });
  const joined = specOf(apart.md);
  assert.deepEqual(joined.nodes[0], { id: 'start', label: 'Making bread', role: 'decision' }, 'a synthetic start, named by the title');
  assert.deepEqual(joined.edges.slice(0, 2), [{ from: 'start', to: 'a', label: 'Mix flour' }, { from: 'start', to: 'c', label: 'Feed starter' }], 'its branches named by the starts');
  assert.equal(diagramProblem(apart.md), null);
  // The author wrote the edge a -> "Shape dough" with the label for the id: the same edge, read by id, so b is a's child and no start is invented.
  const linked = fix(flow([['a', 'Mix flour'], ['b', 'Shape dough'], ['c', 'Bake', 'outcome']], [['a', 'Shape dough'], ['b', 'c']]));
  assert.deepEqual(linked.corrections, { joined_roots: 1 });
  assert.deepEqual(specOf(linked.md).edges[0], { from: 'a', to: 'b' });
  assert.equal(specOf(linked.md).nodes.length, 3, 'no synthetic node');
  assert.equal(diagramProblem(linked.md), null);
  // A node with no edge at all is never placed: that is the repair's job.
  const orphan = `A.\n\n${fence(flow([['a', 'Mix'], ['b', 'Bake', 'outcome'], ['c', 'Sell', 'outcome']], [['a', 'b']]))}\n\nB.`;
  assert.deepEqual(correctDiagrams(orphan), { md: orphan, corrections: {} });
});

test('flow_loop_to_cycle: a flow that is one closed loop becomes a cycle of the same steps in order; over 7 steps it is left for the repair', () => {
  const steps = ['Evaporation', 'Condensation', 'Rain', 'Runoff'];
  const ring = n => flow(steps.concat(['Soak', 'Flow', 'Melt', 'Freeze']).slice(0, n).map((label, i) => [`s${i}`, label]), Array.from({ length: n }, (_, i) => [`s${i}`, `s${(i + 1) % n}`]));
  const out = fix(ring(4));
  assert.deepEqual(out.corrections, { flow_loop_to_cycle: 1 });
  assert.deepEqual([specOf(out.md).kind, specOf(out.md).steps, specOf(out.md).title], ['cycle', steps, 'Making bread']);
  assert.deepEqual(fix(ring(8)).corrections, {}, 'a cycle holds at most 7 steps');
});

test('label_trimmed: an over-long label is cut at a word boundary and the full label kept as the node title (the renderer draws it as a tooltip)', () => {
  const long = 'Knead the dough on a floured board until it is smooth, stretchy and springs back';
  const out = fix(flow([['a', long], ['b', 'Bake', 'outcome']], [['a', 'b']]));
  assert.deepEqual(out.corrections, { label_trimmed: 1 });
  const node = specOf(out.md).nodes[0];
  assert.equal(node.title, long);
  assert.ok(node.label.length <= 60 && long.startsWith(node.label) && long[node.label.length] === ' ', `cut at a word: "${node.label}"`);
  assert.equal(diagramProblem(out.md), null);
});

test('a diagram the rules cannot make valid is left exactly as written for the one repair; a valid one is untouched', () => {
  const broken = `A.\n\n${fence(flow([['a', 'Mix', 'decision'], ['b', 'Bake', 'outcome']], [['a', 'b'], ['a', 'nowhere', 'No']]))}\n\nB.`;
  assert.deepEqual(correctDiagrams(broken), { md: broken, corrections: {} });
  const fine = `A.\n\n${fence(flow([['a', 'Mix'], ['b', 'Bake', 'outcome']], [['a', 'b']]))}\n\nB.`;
  assert.equal(correctDiagrams(fine).md, fine);
});

test('the corrections run before any repair, one log line each, and their count is saved on the card', async () => {
  const lines = [], log = console.log; console.log = line => lines.push(String(line));
  try {
    const card = { title: 'Making bread', body: `Bread is mixed, shaped and baked.\n\n${fence(flow([['a', 'Mix bread'], ['b', 'Risen?', 'decision'], ['c', 'Bake bread', 'outcome']], [['a', 'b'], ['b', 'c', 'Yes']]))}\n\nSo the bread bakes.` };
    const seen = [];
    const out = await generateArtifact({}, { command: 'explanation', args: 'How is bread made?' }, { callModel: async (env, body) => { seen.push(body); return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: card }] }); } });
    assert.deepEqual([out.result, seen.length, out.block.diagramCorrections], ['artifact', 1, { one_branch_decision: 1 }], 'no repair call');
    assert.deepEqual(lines.filter(l => l.includes('explanation_diagram_corrected')).map(l => JSON.parse(l)), [{ event: 'explanation_diagram_corrected', kind: 'one_branch_decision' }]);
  } finally { console.log = log; }
});

test('the last-resort simplified diagram takes its kind from the learner\'s words: cycle for repeat words, sequence for messages between named actors, else flow', async () => {
  assert.deepEqual(['How does the water cycle repeat?', 'What messages does the browser send to the server?', 'How is bread made?'].map(fallbackKind), ['cycle', 'sequence', 'flow']);
  const labels = { kind: 'timeline', title: 'Water on the move', events: [{ label: 'Evaporation' }, { label: 'Rain' }, { label: 'Runoff' }] };
  assert.deepEqual([simplifiedDiagram([JSON.stringify({ version: 1, diagram: labels })], 'cycle').diagram.kind, simplifiedDiagram([JSON.stringify({ version: 1, diagram: labels })]).diagram.kind], ['cycle', 'flow']);
  const talk = { kind: 'sequence', title: 'A page load', actors: [{ id: 'b', label: 'Browser' }, { id: 's', label: 'Server' }, { id: 'b', label: 'Browser again' }], messages: [{ from: 'b', to: 's', label: 'GET the page' }, { from: 'Server', to: 'Browser', label: 'The HTML' }, { from: 'b', to: 'b', label: 'self' }] };
  const seq = simplifiedDiagram([JSON.stringify({ version: 1, diagram: talk })], 'sequence').diagram;
  assert.deepEqual([seq.kind, seq.actors.map(a => a.label), seq.messages.map(m => [m.from, m.to, m.label])], ['sequence', ['Browser', 'Server', 'Browser again'], [['a1', 'a2', 'GET the page'], ['a2', 'a1', 'The HTML']]]);
  assert.equal(simplifiedDiagram([JSON.stringify({ version: 1, diagram: labels })], 'sequence').diagram.kind, 'flow', 'no named actors: a flow');
  // End to end, the only diagram still invalid after the repair, with repeat words in the question: a cycle, counted.
  const broken = { kind: 'flow', title: 'The water cycle', nodes: [{ id: 'e', label: 'Evaporation', role: 'process' }, { id: 'c', label: 'Condensation', role: 'process' }, { id: 'r', label: 'Rain', role: 'process' }], edges: [{ from: 'e', to: 'nowhere' }] };
  const card = { title: 'The water cycle', body: `Water evaporates, condenses and falls as rain, again and again.\n\n${fence(broken)}\n\nThe water cycle repeats every day.` };
  const log = console.log; console.log = () => {};
  try {
    const out = await generateArtifact({}, { command: 'explanation', args: 'Why does the water cycle repeat?' }, { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c', name: 'make_explanation', input: card }] }) });
    assert.deepEqual([out.result, out.block.visualFallback, specOf(out.block.body).kind, out.block.diagramCorrections], ['artifact', 'simplified', 'cycle', { simplified_cycle: 1 }]);
  } finally { console.log = log; }
});

test('sampling: the author call is temperature 0 with a seed only where the provider documents one; the repair carries the problem and samples at 0.3, unseeded', () => {
  const body = { max_tokens: 3000, system: 'S', tools: [{ name: 'make_explanation', description: 'D', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } }], messages: [{ role: 'user', content: 'Q' }] };
  const repair = { ...body, messages: [...body.messages, { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'make_explanation', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', is_error: true, content: 'Validation failed: explanation_bad_diagram' }] }] };
  const pick = r => ({ temperature: r.temperature, seed: r.seed });
  assert.deepEqual([AUTHOR_TEMPERATURE, REPAIR_TEMPERATURE], [0, 0.3]);
  assert.deepEqual(['fireworks', 'cerebras', 'google'].map(p => pick(stepRequest(CHAIN_STEPS[p], 'low', body))), [{ temperature: 0, seed: AUTHOR_SEED }, { temperature: 0, seed: AUTHOR_SEED }, { temperature: 0, seed: undefined }]);
  assert.ok(!('seed' in stepRequest(CHAIN_STEPS.google, 'low', body)), 'Gemini documents no seed: none is sent');
  for (const p of ['fireworks', 'cerebras', 'google']) {
    const r = stepRequest(CHAIN_STEPS[p], 'low', repair);
    assert.deepEqual([r.temperature, 'seed' in r], [0.3, false], p);
    assert.match(r.messages.at(-1).content, /Validation failed: explanation_bad_diagram/, `${p}: the repair input differs, it carries the validator's problem`);
  }
});
