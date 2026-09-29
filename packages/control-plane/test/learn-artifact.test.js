import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLASH, primitive } from '../../web/src/agent/slash.js';
import { PRIMITIVES, artifactBlock } from '../src/learn-primitives.js';
import { artifactPlan, generateArtifact, artifactFetch } from '../src/learn-artifact.js';

// A model stub: answers each call with the next scripted tool call and
// records the tools it was offered.
const scripted = (...replies) => {
  const seen = [];
  const callModel = async (env, body) => {
    seen.push(body);
    const [name, input] = replies[seen.length - 1];
    return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `call-${seen.length}`, name, input }] });
  };
  return { callModel, seen };
};
const offered = body => body.tools.map(tool => tool.name);

const explanation = { title: 'Why softmax', body: 'It turns scores into probabilities.' };
const quiz = { question: 'What does softmax output sum to?', options: [{ text: '1', correct: true }, { text: '0', correct: false }], why: 'It normalises.' };
const sigmoid = { title: 'Sigmoid', brief: 'Drag k.', spec: { op: 'interactive_plot', id: 'sigmoid', renderer: 'desmos', concept: 'sigmoid', parameters: { k: { value: 1, min: 0.2, max: 5 } }, expressions: [{ id: 'curve', expression: 'y=\\frac{1}{1+e^{-kx}}' }] } };
const loss = { title: 'Loss', brief: 'Loss falls.', illustrative: true, spec: { op: 'interactive_plot', id: 'loss', renderer: 'plotly', concept: 'training loss', traces: [{ id: 'train', type: 'line', x: [0, 1, 2], y: [3, 2, 1.5] }] } };
const flow = { title: 'A transformer block', direction: 'DOWN', nodes: [{ id: 'x', label: 'input' }, { id: 'attn', label: 'attention' }, { id: 'mlp', label: 'MLP' }], edges: [{ source: 'x', target: 'attn' }, { source: 'attn', target: 'mlp' }] };
const video = { title: 'Prism', caption: 'Light splitting.', operation: { op: 'generate_video', id: 'prism', prompt: 'White light through a prism', purpose: 'physical_process' } };

test('every primitive a command family names is in the registry, and each ready one builds a block', () => {
  for (const command of SLASH) for (const id of command.family || []) assert.ok(PRIMITIVES[id], `${command.name} names ${id}`);
  for (const [id, entry] of Object.entries(PRIMITIVES)) if (entry.ready) assert.ok(entry.schema && entry.block && entry.about, id);
  assert.equal(artifactBlock('quiz', quiz).options.filter(option => option.correct).length, 1);
});

test('a command resolves to its family on the server: direct, chat, unavailable or a ready set', () => {
  assert.deepEqual(artifactPlan('notebook'), { result: 'direct', action: 'insert_notebook' });
  assert.deepEqual(artifactPlan('paper', { args: '1706.03762' }), { result: 'direct', action: 'insert_paper' });
  assert.equal(artifactPlan('deeper').result, 'not_artifact');
  assert.deepEqual(artifactPlan('graph').ready, ['interactive_graph', 'data_plot']);
  assert.deepEqual(artifactPlan('diagram').ready, ['flow_diagram', 'mermaid_diagram']);
  assert.deepEqual(artifactPlan('practice', { args: 'multiple choice' }).ready, ['quiz']);
  // /practice coding narrows to Code exercise, which is not generated yet: say so, never substitute.
  assert.deepEqual(artifactPlan('practice', { args: 'coding' }), { result: 'unsupported', message: "Code exercise generation isn't available yet. I can open a notebook or show a code sample instead." });
  assert.throws(() => artifactPlan('rm-rf'), /not a Learn command/);
  assert.throws(() => artifactPlan('graph', { selection: { kind: 'shell' } }), /unknown selection/);
});

test('/explain, /quiz, /graph and /diagram each return a validated block from their own family', async () => {
  for (const [command, args, reply, type] of [
    ['explain', 'softmax', ['make_explanation', explanation], 'explanation'],
    ['quiz', '', ['make_quiz', quiz], 'quiz'],
    ['graph', 'sigmoid', ['make_interactive_graph', sigmoid], 'graph'],
    ['graph', 'training loss', ['make_data_plot', loss], 'graph'],
    ['diagram', 'transformer block', ['make_flow_diagram', flow], 'flow'],
    ['diagram', 'training step', ['make_mermaid_diagram', { title: 'Step', code: 'sequenceDiagram\n  A->>B: logits' }], 'mermaid'],
  ]) {
    const { callModel, seen } = scripted(reply);
    const out = await generateArtifact({}, { command, args }, { callModel });
    assert.equal(out.result, 'artifact', command);
    assert.equal(out.block.type, type);
    assert.deepEqual(offered(seen[0]), [...artifactPlan(command).ready.map(id => `make_${id}`), 'ask_clarifying_question']);
  }
  const plotted = await generateArtifact({}, { command: 'graph', args: 'training loss' }, scripted(['make_data_plot', loss]));
  assert.match(plotted.block.brief, /Illustrative numbers/);
});

test('a primitive outside the family is rejected on the server, whatever the browser sent', async () => {
  const { callModel, seen } = scripted(['make_video_generate', video]);
  const out = await generateArtifact({}, { command: 'graph', args: 'sigmoid', allowedPrimitives: ['video_generate'], family: 'video' }, { callModel });
  assert.equal(out.result, 'validation_error');
  assert.match(out.error, /allows only interactive_graph, data_plot/);
  assert.equal(seen.length, 1, 'no repair for a contract violation');
  assert.ok(!offered(seen[0]).includes('make_video_generate'));
});

test('a malformed spec gets exactly one repair', async () => {
  const bad = { ...quiz, options: quiz.options.map(option => ({ ...option, correct: true })) };
  const fixed = scripted(['make_quiz', bad], ['make_quiz', quiz]);
  const out = await generateArtifact({}, { command: 'quiz' }, fixed);
  assert.equal(out.result, 'artifact');
  assert.equal(out.repaired, true);
  assert.equal(fixed.seen.length, 2);
  assert.match(fixed.seen[1].messages.at(-1).content[0].content, /exactly one correct option/);
  const stuck = scripted(['make_quiz', bad], ['make_quiz', bad], ['make_quiz', quiz]);
  assert.equal((await generateArtifact({}, { command: 'quiz' }, stuck)).result, 'validation_error');
  assert.equal(stuck.seen.length, 2);
});

test('an underspecified request comes back as a clarifying question, not a card', async () => {
  const out = await generateArtifact({}, { command: 'compare', args: 'these' }, scripted(['ask_clarifying_question', { question: 'What would you like to compare?' }]));
  assert.deepEqual(out, { result: 'clarification', question: 'What would you like to compare?' });
});

test('a paid primitive comes back as a proposal and starts nothing', async () => {
  assert.equal(primitive('video_generate').needsConfirm, true);
  const out = await generateArtifact({}, { command: 'video', args: 'light through a prism' }, scripted(['make_video_generate', video]));
  assert.equal(out.result, 'paid_proposal');
  assert.equal(out.message, 'This uses paid generation.');
  assert.equal(out.estimatedCost, null);
  assert.equal(out.block.status, 'idle');
});

test('the endpoint checks input and app access before any model call', async () => {
  let calls = 0;
  const generate = async () => { calls++; return { result: 'artifact' }; };
  const post = (body, headers = {}) => new Request('https://dev.example/api/learn/artifact', { method: 'POST', headers: { cookie: 's', ...headers }, body: JSON.stringify(body) });
  const env = { CONTROL_PLANE: { fetch: async () => Response.json({ error: 'no' }, { status: 403 }) } };
  assert.equal((await artifactFetch(post({ app: 'demo', command: 'nope' }), env, generate)).status, 400);
  assert.equal((await artifactFetch(post({ app: 'demo', command: 'graph' }), env, generate)).status, 403);
  assert.equal((await artifactFetch(post({ app: 'demo', command: 'graph' }, { origin: 'https://evil.example' }), env, generate)).status, 403);
  assert.equal(calls, 0);
  env.CONTROL_PLANE.fetch = async () => Response.json({ name: 'demo' });
  const response = await artifactFetch(post({ app: 'demo', command: 'graph', args: 'sigmoid', allowedPrimitives: ['blender_scene'] }), env, async (_, input) => { calls++; return input; });
  assert.deepEqual(await response.json(), { command: 'graph', args: 'sigmoid', selection: null, context: null });
  assert.equal(calls, 1);
});
