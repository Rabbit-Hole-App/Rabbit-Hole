// Item 47 (owner 2026-11-08, docs/features/explain.md section 2): the fast-chain author samples at temperature 0 (a seed where the provider documents one) and
// its repair at 0.3; flow rules the server can fix are fixed before any repair; the last-resort simplified diagram takes its kind from the learner's words;
// every correction is logged and counted on the card. Offline: the model is a double, nothing is sent or paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { settleExplanationBody, correctDiagrams, diagramProblem, flowsAsSequences, relationshipsAsGraphs, simplifiedDiagram } from '../src/learn-primitives.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderTutorDiagram } from '../../web/src/tutor-diagrams/TutorDiagram.js';
import { deriveVisualRequirements, fallbackKind } from '../src/explanation-visuals.js';
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
  assert.deepEqual([seq.kind, seq.actors.map(a => a.label), seq.messages.map(m => [m.from, m.to, m.label])], ['sequence', ['Browser', 'Server', 'Browser again'], [['a1', 'a2', 'GET the page'], ['a2', 'a1', 'The HTML'], ['a1', 'a1', 'self']]]); // the trailing self-step stays a loop on the first actor (the schema accepts a last self-message since Codex 586d565b)
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

// Owner 2026-11-08: a straight flow whose every step is a message between parties is drawn as a sequence; anything else stays a flow.
const chainOf = (title, labels) => flow(labels.map((label, i) => [`n${i}`, label]), labels.slice(1).map((_, i) => [`n${i}`, `n${i + 1}`]), { title });
const sequenced = (title, labels) => flowsAsSequences(`A.\n\n${fence(chainOf(title, labels))}\n\nB.`);
test('flow_to_sequence: a handshake and a 3-party exchange drawn as straight flows become sequences, the trailing outcome kept as the caption', () => {
  const tcp = sequenced('The TCP handshake', ['Client sends SYN', 'Server replies SYN-ACK', 'Client sends ACK', 'Connection Established']);
  assert.equal(tcp.count, 1);
  assert.deepEqual(specOf(tcp.md), { kind: 'sequence', title: 'The TCP handshake', caption: 'Connection Established', actors: [{ id: 'a1', label: 'Client' }, { id: 'a2', label: 'Server' }],
    messages: [{ from: 'a1', to: 'a2', label: 'SYN' }, { from: 'a2', to: 'a1', label: 'SYN-ACK' }, { from: 'a1', to: 'a2', label: 'ACK' }] });
  assert.equal(diagramProblem(tcp.md), null);
  // Three parties: each message goes to the next step's subject; the last step receives what the one before sent, so it is not drawn twice.
  const proxy = sequenced('A page through a proxy', ['Browser sends GET /page', 'Proxy forwards GET /page', 'Web Server returns page', 'Proxy forwards page', 'Browser receives page']);
  assert.deepEqual([specOf(proxy.md).actors.map(a => a.label), specOf(proxy.md).messages.map(m => [m.from, m.to, m.label])],
    [['Browser', 'Proxy', 'Web Server'], [['a1', 'a2', 'GET /page'], ['a2', 'a3', 'GET /page'], ['a3', 'a2', 'page'], ['a2', 'a1', 'page']]]);
  assert.equal(specOf(proxy.md).caption, undefined);
});

test('flow_to_sequence never fires on a single-actor pipeline, a flow with a decision, a non-message step or an ambiguous receiver', () => {
  const same = (title, labels) => { const out = sequenced(title, labels); assert.equal(out.count, 0, title); assert.equal(specOf(out.md).kind, 'flow', title); };
  same('Compiling', ['Compiler lexes source', 'Compiler parses tokens', 'Compiler generates code']);
  same('One party only', ['Client sends SYN', 'Client sends ACK']);
  // DECISION (owner 2026-11-08): stays a FLOW. validates and stores are not message verbs and nothing goes back to the user; a sequence needs every step to be a message.
  same('Submitting a form', ['User submits form', 'Server validates input', 'Server stores record']);
  same('Outcome in the middle', ['Client sends SYN', 'Connection Established', 'Server replies SYN-ACK']);
  // Three parties and the last message has no next subject: the receiver is ambiguous.
  same('Ambiguous', ['Browser sends GET', 'Proxy forwards GET', 'Server returns page']);
  const decided = `A.\n\n${fence(flow([['a', 'Client sends SYN'], ['b', 'Server up?', 'decision'], ['c', 'Server replies SYN-ACK'], ['d', 'Client sends RST']], [['a', 'b'], ['b', 'c', 'Yes'], ['b', 'd', 'No']]))}\n\nB.`;
  assert.deepEqual(flowsAsSequences(decided), { md: decided, count: 0 });
});

test('flow_to_sequence is logged and counted on the card like the other corrections, and a learner who named a flow keeps it', async () => {
  const card = { title: 'The TCP handshake', body: `The client and server agree to talk in three messages.\n\n${fence(chainOf('The TCP handshake', ['Client sends SYN', 'Server replies SYN-ACK', 'Client sends ACK']))}\n\nThen data can flow.` };
  const run = args => generateArtifact({}, { command: 'explanation', args, visualRequirements: deriveVisualRequirements(args) }, { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: card }] }) });
  const lines = [], log = console.log; console.log = line => lines.push(String(line));
  try {
    const out = await run('How does the TCP handshake work?');
    assert.deepEqual([out.result, specOf(out.block.body).kind, out.block.diagramCorrections], ['artifact', 'sequence', { flow_to_sequence: 1 }]);
    assert.deepEqual(lines.filter(l => l.includes('explanation_diagram_corrected')).map(l => JSON.parse(l)), [{ event: 'explanation_diagram_corrected', kind: 'flow_to_sequence' }]);
    const named = await run('Draw a flowchart of the TCP handshake');
    assert.deepEqual([named.result, specOf(named.block.body).kind, named.block.diagramCorrections], ['artifact', 'flow', undefined]);
  } finally { console.log = log; }
});

test('sampling: the author call is temperature 0 with a seed only where the provider documents one; the repair carries the problem and samples at 0.3, unseeded', () => {
  const body = { max_tokens: 3000, system: 'S', tools: [{ name: 'make_explanation', description: 'D', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false } }], messages: [{ role: 'user', content: 'Q' }] };
  const repair = { ...body, messages: [...body.messages, { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'make_explanation', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', is_error: true, content: 'Validation failed: explanation_bad_diagram' }] }] };
  const pick = r => ({ temperature: r.temperature, seed: r.seed });
  assert.deepEqual([AUTHOR_TEMPERATURE, REPAIR_TEMPERATURE], [0, 0.3]);
  assert.deepEqual(['fireworks', 'cerebras', 'google'].map(p => pick(stepRequest(CHAIN_STEPS[p], 'low', body))), [{ temperature: 0, seed: AUTHOR_SEED }, { temperature: 0, seed: AUTHOR_SEED }, { temperature: undefined, seed: undefined }]); // owner 2026-11-08: Gemini's author call takes the provider default temperature
  assert.ok(!('seed' in stepRequest(CHAIN_STEPS.google, 'low', body)) && !('temperature' in stepRequest(CHAIN_STEPS.google, 'low', body)), 'Gemini documents no seed and takes the default temperature: neither is sent');
  for (const p of ['fireworks', 'cerebras', 'google']) {
    const r = stepRequest(CHAIN_STEPS[p], 'low', repair);
    assert.deepEqual([r.temperature, 'seed' in r], [0.3, false], p);
    assert.match(r.messages.at(-1).content, /Validation failed: explanation_bad_diagram/, `${p}: the repair input differs, it carries the validator's problem`);
  }
});

// Owner M5 (2026-11-08): the real attention flow (Fireworks gpt-oss low, temperature 0, 3 of 3): three parallel input starts that converge. Joined under a fork.
test('M5: parallel input starts that converge (the real attention flow) are joined under a fork, not a decision', () => {
  const { spec } = JSON.parse(readFileSync(new URL('./fixtures/explanation-attention-flow.json', import.meta.url), 'utf8'));
  assert.ok(diagramProblem(`A.\n\n${fence(spec.diagram)}\n\nB.`), 'the raw answer is invalid: three starts');
  const out = fix(spec.diagram);
  assert.deepEqual(out.corrections, { joined_roots_fork: 1 });
  const d = specOf(out.md);
  assert.deepEqual(d.nodes[0], { id: 'start', label: 'Scaled Dot‑Product Attention', role: 'fork' });
  assert.deepEqual(d.edges.slice(0, 3), [{ from: 'start', to: 'Q' }, { from: 'start', to: 'K' }, { from: 'start', to: 'V' }]);
  assert.equal(diagramProblem(out.md), null);
});

// Owner M3 (2026-11-08): Gemini wrote an undeclared `layers` key on a comparison; it is removed before the card is read, logged and counted, with no repair.
test('M3: undeclared keys in the visuals are stripped and logged on every route; a clean answer is untouched', async () => {
  const comparison = { kind: 'comparison', title: 'Underfitting and overfitting', layers: ['x'], columns: [{ heading: 'Underfitting', items: ['Too simple'], extra: 1 }, { heading: 'Overfitting', items: ['Too complex'] }] };
  const body = 'A model can be too simple or too complex.\n\n[[visual:1]]\n\nThe right model sits between the two.';
  const answer = visuals => async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: { title: 'Underfitting and overfitting', visuals, body } }] });
  const lines = [], log = console.log; console.log = line => lines.push(String(line));
  try {
    let calls = 0;
    const call = answer([{ k: 'diagram', spec: { version: 1, diagram: comparison }, note: 'x' }]);
    const out = await generateArtifact({}, { command: 'explanation', args: 'What is the difference between underfitting and overfitting?' }, { callModel: async (...a) => { calls++; return call(...a); } });
    assert.deepEqual([out.result, calls, out.block.unknownKeysStripped], ['artifact', 1, 3], 'no repair call');
    assert.deepEqual(lines.filter(l => l.includes('explanation_unknown_key_stripped')).map(l => JSON.parse(l)).map(e => [e.kind, e.key]).sort(), [['comparison', 'extra'], ['comparison', 'layers'], ['diagram', 'note']]);
    const clean = await generateArtifact({}, { command: 'explanation', args: 'What is the difference between underfitting and overfitting?' }, { callModel: answer([{ k: 'diagram', spec: { version: 1, diagram: { ...comparison, layers: undefined, columns: comparison.columns.map(({ extra, ...c }) => c) } } }]) });
    assert.equal(clean.block.unknownKeysStripped, undefined);
  } finally { console.log = log; }
  // The undeclared keys are only those: every key of every reference survives (the schema declares the whole library).
  const { diagramReferences } = await import('../../web/src/tutor-diagrams/reference-library.js');
  const { stripUnknownKeys } = await import('../src/learn-primitives.js');
  for (const ref of diagramReferences) assert.deepEqual(stripUnknownKeys([{ k: 'diagram', spec: ref.spec }]).stripped, [], ref.id);
});

// Owner E3 (2026-11-08), log only: p_i outside maths delimiters is a smell; $p_i$ is not.
test('E3: bare maths in diagram text is logged and counted on the card, never repaired', async () => {
  const { bareMaths, diagramSmells } = await import('../src/learn-primitives.js');
  assert.deepEqual(['p_i', 'x^2', '\\frac{a}{b}', '$p_i$', 'the $x^2$ term', '\\(p_i\\)', 'Class A'].map(bareMaths), [true, true, true, false, false, false, false]);
  const rel = { kind: 'flow', title: 'Gini impurity', nodes: [{ id: 'a', label: 'Class shares p_i', role: 'process' }, { id: 'b', label: 'Gini $1-\\sum p_i^2$', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] };
  assert.deepEqual(diagramSmells(`A.\n\n${fence(rel)}\n\nB.`), ['Class shares p_i']);
  const lines = [], log = console.log; console.log = line => lines.push(String(line));
  try {
    const card = { title: 'Gini impurity', body: `Gini impurity measures how mixed the classes are.\n\n${fence(rel)}\n\nA pure node has Gini impurity zero.` };
    const out = await generateArtifact({}, { command: 'explanation', args: 'What is gini impurity?' }, { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: card }] }) });
    assert.deepEqual([out.result, out.block.diagramSmells], ['artifact', { bare_maths: 1 }]);
    assert.deepEqual(lines.filter(l => l.includes('explanation_diagram_smell')).map(l => JSON.parse(l)), [{ event: 'explanation_diagram_smell', kind: 'bare_maths', label: 'Class shares p_i' }]);
  } finally { console.log = log; }
});

// Owner 2026-11-08: a dev-only line with the author's visuals as returned, before any server step; never in production.
test('the raw author visuals are logged in dev and test, for the first answer and the repair, and never in production', async () => {
  const visuals = [{ k: 'diagram', spec: { version: 1, diagram: { kind: 'cycle', title: 'Seasons', steps: ['Spring', 'Summer'] } } }];
  const bad = { title: 'Seasons', visuals, body: 'Too short.' };
  const good = { title: 'Seasons', visuals, body: 'The seasons follow one another through the year.\n\n[[visual:1]]\n\nSpring comes back after summer and the rest.' };
  const run = async env => {
    const lines = [], log = console.log; console.log = line => lines.push(String(line));
    let n = 0;
    try { await generateArtifact(env, { command: 'explanation', args: 'Why do the seasons repeat?' }, { callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${n}`, name: 'make_explanation', input: n++ ? good : bad }] }) }); }
    finally { console.log = log; }
    return lines.filter(l => l.includes('explanation_author_raw')).map(l => JSON.parse(l));
  };
  for (const SMALL_ENV of ['dev', 'test']) {
    const raw = await run({ SMALL_ENV });
    assert.deepEqual(raw.map(r => [r.event, r.attempt, r.kinds]), [['explanation_author_raw', 0, ['cycle']], ['explanation_author_raw', 1, ['cycle']]], SMALL_ENV);
    assert.deepEqual(raw[0].visuals, visuals);
    // the worked examples this request carried: their ids, the same on the first answer and the repair
    assert.ok(Array.isArray(raw[0].references) && raw[0].references.length <= 2 && raw[0].references.every(id => typeof id === 'string'), JSON.stringify(raw[0].references));
    assert.deepEqual(raw[1].references, raw[0].references);
  }
  assert.deepEqual(await run({ SMALL_ENV: 'production' }), []);
  assert.deepEqual(await run({}), []);
});

// Owner C1.1 (2026-11-08): every relationship gets the graph layout, so each node is drawn once (the pairs layout repeats a node in every pair it is in).
test('C1.1: relationships are drawn as graphs, each node once; a disconnected one keeps the pairs layout', () => {
  const thermostat = JSON.parse(readFileSync(new URL('../../web/src/tutor-diagrams/examples.json', import.meta.url), 'utf8')).find(e => e.diagram.kind === 'relationship').diagram;
  const gini = { kind: 'relationship', title: 'Gini impurity', nodes: [{ id: 'A', label: 'Class A' }, { id: 'B', label: 'Class B' }, { id: 'C', label: 'Gini impurity' }], edges: [{ from: 'A', to: 'C', label: 'p_i' }, { from: 'B', to: 'C', label: 'p_i' }] };
  const ce = { kind: 'relationship', title: 'Cross entropy', nodes: [{ id: 'A', label: 'True distribution $p$' }, { id: 'B', label: 'Model distribution $q$' }, { id: 'C', label: 'Cross entropy $H(p,q)$' }], edges: [{ from: 'A', to: 'C', label: 'input' }, { from: 'B', to: 'C', label: 'output' }, { from: 'A', to: 'B', label: 'compare' }] };
  for (const d of [thermostat, gini, ce]) {
    const out = specOf(relationshipsAsGraphs(`Before.\n\n${fence(d)}\n\nAfter.`));
    assert.equal(out.layout, 'graph', d.title);
    const svg = renderToStaticMarkup(createElement('svg', null, renderTutorDiagram({ version: 1, diagram: out }, 408).element));
    for (const n of d.nodes) assert.equal(svg.split(`data-tutor-node="${n.id}"`).length - 1, 1, `${d.title}: ${n.label} drawn once`);
  }
  const apart = { kind: 'relationship', title: 'Two pairs', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }], edges: [{ from: 'a', to: 'b', label: 'x' }, { from: 'c', to: 'd', label: 'y' }] };
  const md = `Before.\n\n${fence(apart)}\n\nAfter.`;
  assert.equal(relationshipsAsGraphs(md), md, 'the graph layout refuses a disconnected relationship, so it is left as written');
});

// Owner 2026-11-08 (correct-SVG closing pass): the Roman Empire spec gpt-oss wrote at two depths (bench run 61e02eca9): a plain dated timeline sent with the
// scaled-lanes layout and empty lanes. The server drops the layout, domain and empty lanes; a timeline with real lane content is left for the repair.
test('a plain dated timeline sent with scaled-lanes and empty lanes becomes the plain timeline, without a repair', () => {
  const roman = { version: 1, diagram: { title: 'Roman Empire Timeline', kind: 'timeline', layout: 'scaled-lanes', events: [{ time: '753 BC', label: 'Founding of Rome' }, { time: '27 BC', label: 'Augustus becomes first emperor' }, { time: '117 AD', label: 'Empire at its greatest extent' }, { time: '284 AD', label: 'Diocletian splits empire' }, { time: '476 AD', label: 'Western empire falls' }], domain: { min: -800, max: 500, unit: 'year', label: 'Calendar years' }, lanes: [{ id: 'west', label: 'Western Empire' }, { id: 'east', label: 'Eastern Empire' }] } };
  const md = `Rome grew, split and fell.\n\n\`\`\`rh-diagram\n${JSON.stringify(roman)}\n\`\`\`\n\nThe East lasted longer.`;
  const out = correctDiagrams(md);
  assert.deepEqual(out.corrections, { timeline_plain: 1 });
  const fixed = JSON.parse(out.md.split('\n')[3]).diagram;
  assert.equal(fixed.layout, undefined); assert.equal(fixed.lanes, undefined); assert.equal(fixed.domain, undefined);
  assert.deepEqual(fixed.events.map(e => e.time), ['753 BC', '27 BC', '117 AD', '284 AD', '476 AD']);
  // a lane that holds content is a real scaled timeline: not touched here
  const real = structuredClone(roman); real.diagram.lanes[0].events = [{ at: -27, label: 'Augustus' }];
  assert.deepEqual(correctDiagrams(md.replace(JSON.stringify(roman), JSON.stringify(real))).corrections, {});
});

// Owner 2026-11-08 (arm E v2): the precision-recall matrix, written with the teaching layout and no row IDs at all three depths, is the matrix the server completes; short or
// long rows are padded or trimmed only when that is unambiguous.
test('a teaching matrix without row IDs gets them; cell counts are padded or trimmed only when unambiguous', () => {
  const fenceOf = diagram => `Prose.\n\n\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram })}\n\`\`\`\n\nMore prose.`;
  const base = { title: 'Precision and Recall formulas', caption: 'Worked example using a 2x2 confusion matrix.', kind: 'matrix', layout: 'teaching', columns: ['Predicted Positive', 'Predicted Negative'],
    rows: [{ heading: 'Actual Positive', cells: ['TP', 'FN'] }, { heading: 'Actual Negative', cells: ['FP', 'TN'] }], emphasis: { columns: [0] } };
  const fixedOf = md => JSON.parse(md.split('\n')[3]).diagram;
  let out = correctDiagrams(fenceOf(base));
  assert.deepEqual(out.corrections, { matrix_row_ids: 1 });
  assert.deepEqual(fixedOf(out.md).rows.map(r => r.id), ['actual-positive', 'actual-negative']);
  // duplicate headings stay distinct; a heading that does not start with a letter falls back to row-N
  out = correctDiagrams(fenceOf({ ...base, rows: [{ heading: 'Same', cells: ['a', 'b'] }, { heading: 'Same', cells: ['c', 'd'] }, { heading: '2024', cells: ['e', 'f'] }] }));
  assert.deepEqual(fixedOf(out.md).rows.map(r => r.id), ['same', 'same-2', 'row-3']);
  // every row short by the same count: padded with an em dash
  out = correctDiagrams(fenceOf({ ...base, rows: [{ id: 'a', heading: 'A', cells: ['x'] }, { id: 'b', heading: 'B', cells: ['y'] }] }));
  assert.deepEqual(out.corrections, { matrix_cells_padded: 1 }); assert.deepEqual(fixedOf(out.md).rows.map(r => r.cells), [['x', '—'], ['y', '—']]);
  // a row that is long loses its trailing cells
  out = correctDiagrams(fenceOf({ ...base, rows: [{ id: 'a', heading: 'A', cells: ['x', 'y', 'z'] }, { id: 'b', heading: 'B', cells: ['p', 'q'] }] }));
  assert.deepEqual(out.corrections, { matrix_cells_trimmed: 1 }); assert.deepEqual(fixedOf(out.md).rows.map(r => r.cells), [['x', 'y'], ['p', 'q']]);
  // rows that disagree with each other (one short, one long, or different shortfalls) are left for the repair
  for (const rows of [[{ id: 'a', heading: 'A', cells: ['x'] }, { id: 'b', heading: 'B', cells: ['p', 'q', 'r'] }], [{ id: 'a', heading: 'A', cells: [] }, { id: 'b', heading: 'B', cells: ['p'] }]]) {
    const md = fenceOf({ ...base, rows });
    assert.deepEqual(correctDiagrams(md), { md, corrections: {} });
  }
  // a valid matrix is untouched
  const ok = fenceOf({ ...base, rows: [{ id: 'p', heading: 'P', cells: ['TP', 'FN'] }, { id: 'n', heading: 'N', cells: ['FP', 'TN'] }] });
  assert.deepEqual(correctDiagrams(ok), { md: ok, corrections: {} });
});

// Owner 2026-11-08 (Gemini's 11 repairs by cause, run 2026-11-08T192441): the field-level parser rules are fixed on the server, the way their message says.
test('field corrections: too-long text is cut at a word, blank or multi-line optional text is cleaned, a mapping index to a missing item is dropped; anything else is left for the repair', () => {
  const fenceOf = diagram => `Prose.\n\n\`\`\`rh-diagram\n${JSON.stringify({ version: 1, diagram })}\n\`\`\`\n\nMore prose.`;
  const specOf = md => JSON.parse(md.split('\n')[3]).diagram;
  // an event detail over 90 characters (overview Roman Empire)
  const longDetail = 'The Republic gave way to rule by one man after a long series of civil wars that left the old institutions in place but empty of power.';
  let out = correctDiagrams(fenceOf({ kind: 'timeline', title: 'Rome', events: [{ time: '509 BC', label: 'Republic' }, { time: '27 BC', label: 'Empire', detail: longDetail }] }));
  assert.deepEqual(out.corrections, { field_trimmed: 1 }); assert.ok(specOf(out.md).events[1].detail.length <= 90 && longDetail.startsWith(specOf(out.md).events[1].detail));
  // blank and multi-line layer details (deep atmosphere)
  out = correctDiagrams(fenceOf({ kind: 'layers', title: 'Atmosphere', layers: [{ label: 'Troposphere', detail: '' }, { label: 'Stratosphere', detail: 'Ozone\nabsorbs UV' }] }));
  assert.deepEqual(out.corrections, { field_blank_dropped: 1, field_one_line: 1 });
  assert.deepEqual(specOf(out.md).layers, [{ label: 'Troposphere' }, { label: 'Stratosphere', detail: 'Ozone absorbs UV' }]);
  // an empty axis unit (Gini)
  const plot = { kind: 'coordinate-plot', title: 'Gini', x: { label: 'p', min: 0, max: 1, unit: '' }, y: { label: 'G', min: 0, max: 1, unit: '' }, series: [{ label: 'G', kind: 'line', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0 }] }] };
  out = correctDiagrams(fenceOf(plot));
  assert.ok(out.corrections.field_blank_dropped >= 1); assert.equal(specOf(out.md).x.unit, undefined); assert.equal(specOf(out.md).y.unit, undefined);
  // a transformation link naming an item that does not exist (standard entropy)
  const tr = { kind: 'transformation', title: 'Mixing', before: { label: 'Ordered', items: ['a', 'b'] }, after: { label: 'Mixed', items: ['a', 'b'] }, operation: 'Heat', links: [{ from: 0, to: 0 }, { from: 1, to: 7 }] };
  out = correctDiagrams(fenceOf(tr));
  assert.deepEqual(out.corrections, { mapping_dropped: 1 }); assert.deepEqual(specOf(out.md).links, [{ from: 0, to: 0 }]);
  // a required label that is blank is not ours: the repair's
  const bad = fenceOf({ kind: 'layers', title: 'X', layers: [{ label: '' }, { label: 'B' }] });
  assert.deepEqual(correctDiagrams(bad), { md: bad, corrections: {} });
});

test('long paragraphs are split before the layout check, so a visual that ended the card finds a gap between prose (Gemini: "a visual needs prose before and after it")', () => {
  const para = 'A softmax turns raw scores into shares. The biggest score keeps the biggest share. Every share is positive and together they make one whole. This is how a model turns scores into a choice. The shares can be read as how sure it is of each option.';
  assert.ok(para.length > 220);
  const D = '```rh-diagram\n{"version":1,"diagram":{"kind":"cycle","title":"Loop","steps":["Plan","Do","Check"]}}\n```';
  const out = settleExplanationBody(`${para}\n\n${D}`);
  const parts = out.split('\n\n');
  assert.ok(parts.some(p => p === D) && parts.indexOf(D) > 0 && parts.indexOf(D) < parts.length - 1, 'the visual sits between prose paragraphs');
  assert.equal(out.split(D).join(' ').replace(/\s+/g, ' ').trim(), para, 'same prose, only breaks and the visual moved');
});
