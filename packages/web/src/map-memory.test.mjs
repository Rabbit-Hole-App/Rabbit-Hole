import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_STARTER, DECISIONS_STARTER, fixtureAnswer, layerGraph, memoryFor, STARTERS, visibleMemory, WHY } from './map-memory.js';

const graph = {
  nodes: [
    { id: 'attn', label: 'CausalSelfAttention', path: 'model.py', line: 29, kind: 'symbol' },
    { id: 'ln', label: 'LayerNorm', path: 'model.py', line: 18, kind: 'symbol' },
    { id: 'cfg', label: 'GPTConfig', path: 'model.py', line: 109, kind: 'symbol' },
  ],
  edges: [{ source: 'attn', target: 'ln', relation: 'calls', confidence: 'EXTRACTED' }],
};
const base = { fixture: true, visibility: 'project', owner: null };
const memory = {
  decisions: [
    { ...base, id: 'd-qkv', title: 'Fuse Q, K and V', rationale: 'One matmul instead of three.', alternatives: ['Three Linear layers'], who: 'Project maintainer', agent: 'Claude Code', session: 's-attn', at: '2026-09-12', evidence: [{ path: 'model.py', line: 35, note: 'c_attn' }], code: [{ id: 'attn', confidence: 'RECORDED' }] },
    { ...base, id: 'd-bias', title: 'Optional LayerNorm bias', rationale: 'PyTorch LayerNorm has no bias=False.', alternatives: [], who: 'Project maintainer', agent: null, session: 's-hidden', at: '2026-09-13', evidence: [], code: [{ id: 'ln', confidence: 'RECORDED' }, { id: 'cfg', confidence: 'INFERRED', score: 0.64 }, { id: 'gone', confidence: 'RECORDED' }] },
  ],
  questions: [
    { ...base, id: 'q-scale', question: 'Why divide by sqrt(head size)?', answer: 'It keeps the logits near unit variance.', resolved: true, session: 's-attn', code: [{ id: 'attn', confidence: 'RECORDED' }] },
    { ...base, id: 'q-open', question: 'Does the mask cost memory?', answer: null, resolved: false, session: 's-attn', code: [{ id: 'attn', confidence: 'RECORDED' }] },
    { ...base, id: 'q-private', visibility: 'private', owner: 'other@example.com', question: 'Why is my run slow?', answer: 'Batch size.', resolved: true, session: 's-hidden', code: [{ id: 'attn', confidence: 'RECORDED' }] },
  ],
  sessions: [
    { ...base, id: 's-attn', title: 'Attention walkthrough', summary: 'Went through attention.', participant: 'Project maintainer', agent: 'Claude Code', at: '2026-09-12', code: [{ id: 'attn', confidence: 'RECORDED' }] },
    { ...base, id: 's-hidden', visibility: 'private', owner: 'other@example.com', title: 'Private debugging', summary: 'Secret.', participant: 'Someone', agent: null, at: '2026-09-14', code: [{ id: 'attn', confidence: 'RECORDED' }] },
  ],
};
const me = 'me@example.com';
const seen = visibleMemory(memory, me);
const ids = (m) => [...m.decisions, ...m.questions, ...m.sessions].map((r) => r.id);

test('a private record owned by someone else never reaches the viewer, and nothing still points at it', () => {
  assert.deepEqual(ids(seen).sort(), ['d-bias', 'd-qkv', 'q-open', 'q-scale', 's-attn']);
  assert.equal(seen.decisions.find((d) => d.id === 'd-bias').session, null); // its session is private to another user
  assert.equal(seen.decisions.find((d) => d.id === 'd-qkv').session, 's-attn');
  assert.deepEqual(ids(visibleMemory(memory, 'other@example.com')).sort(), ['d-bias', 'd-qkv', 'q-open', 'q-private', 'q-scale', 's-attn', 's-hidden']);
  assert.deepEqual(ids(visibleMemory(memory, null)).sort(), ['d-bias', 'd-qkv', 'q-open', 'q-scale', 's-attn']);
});

test('a code node lists only the records linked to it', () => {
  const m = memoryFor(seen, 'attn');
  assert.deepEqual([m.decisions, m.questions, m.sessions].map((l) => l.map((r) => r.id)), [['d-qkv'], ['q-scale', 'q-open'], ['s-attn']]);
  assert.deepEqual(memoryFor(seen, 'cfg').decisions.map((d) => d.id), ['d-bias']);
});

test('layers add only the enabled kinds, link only code in the graph, and keep recorded and inferred apart', () => {
  assert.deepEqual(layerGraph(graph, seen, new Set()), graph);
  const g = layerGraph(graph, seen, new Set(['decisions']));
  assert.deepEqual(g.nodes.slice(3).map((n) => [n.id, n.kind]), [['d-qkv', 'decision'], ['d-bias', 'decision']]);
  assert.deepEqual(g.edges.slice(1).map((e) => [e.source, e.target, e.relation, e.confidence, e.score]), [
    ['d-qkv', 'attn', 'decided', 'RECORDED', null], ['d-bias', 'ln', 'decided', 'RECORDED', null], ['d-bias', 'cfg', 'decided', 'INFERRED', 0.64],
  ]);
  const all = layerGraph(graph, seen, new Set(['decisions', 'questions', 'sessions']));
  assert.deepEqual(all.nodes.filter((n) => n.kind !== 'symbol').map((n) => n.kind), ['decision', 'decision', 'question', 'question', 'session']);
  assert.ok(!all.nodes.some((n) => n.id === 's-hidden' || n.id === 'q-private'));
});

const RANK = ['decision', 'question', 'session', 'code', 'inferred', 'model'];
const ordered = (evidence) => evidence.every((e, i) => i === 0 || RANK.indexOf(evidence[i - 1].kind) <= RANK.indexOf(e.kind));

test('Why does this exist? answers from recorded decisions first, then questions and sessions, code, inferred links', () => {
  const a = fixtureAnswer(WHY, { node: graph.nodes[1], memory: seen, graph });
  assert.match(a.text, /1 recorded decision explains why LayerNorm/);
  assert.deepEqual(a.evidence.map((e) => e.kind), ['decision', 'code']);
  assert.equal(a.evidence[1].detail, 'model.py:18');
  const attn = fixtureAnswer(WHY, { node: graph.nodes[0], memory: seen, graph });
  assert.deepEqual(attn.evidence.map((e) => e.kind), ['decision', 'question', 'question', 'session', 'code', 'code']);
  assert.ok(ordered(attn.evidence));
  assert.ok(!JSON.stringify(attn).includes('Private debugging') && !JSON.stringify(attn).includes('slow'));
  // only an inferred link: no recorded decision, so the model answers instead
  assert.equal(fixtureAnswer(WHY, { node: graph.nodes[2], memory: seen, graph }), null);
});

test('a prior question answers with its recorded answer, or says it was not resolved', () => {
  const a = fixtureAnswer('Why divide by sqrt(head size)?', { node: null, memory: seen, graph });
  assert.equal(a.text, 'It keeps the logits near unit variance.');
  assert.deepEqual(a.evidence.map((e) => e.kind), ['question', 'session', 'code']);
  assert.equal(a.evidence[0].detail, 'Resolved'); // the answer is the text above; the row does not repeat it
  assert.match(fixtureAnswer('Does the mask cost memory?', { node: null, memory: seen, graph }).text, /asked in Attention walkthrough but not resolved/);
  assert.equal(fixtureAnswer('Why is my run slow?', { node: null, memory: seen, graph }), null); // private to someone else
});

test('the decisions and common-questions starters list the visible records; any other text goes to the model', () => {
  const d = fixtureAnswer(DECISIONS_STARTER, { node: null, memory: seen, graph });
  assert.match(d.text, /2 recorded decisions/);
  assert.ok(ordered(d.evidence) && d.evidence.filter((e) => e.kind === 'decision').length === 2);
  const q = fixtureAnswer(COMMON_STARTER, { node: null, memory: seen, graph });
  assert.deepEqual(q.evidence.map((e) => e.label), ['Why divide by sqrt(head size)?', 'Does the mask cost memory?']);
  assert.equal(fixtureAnswer('What does this do?', { node: graph.nodes[0], memory: seen, graph }), null);
  assert.equal(fixtureAnswer(WHY, { node: graph.nodes[0], memory: null, graph }), null);
  assert.equal(STARTERS.length, 5);
  assert.ok(STARTERS.includes(DECISIONS_STARTER) && STARTERS.includes(COMMON_STARTER));
});

// Node ids in the karpathy/nanoGPT snapshot the dev Map serves (repo-06745f10-nanogpt @ 3adf61e, read 2026-09-29).
const NANOGPT = ['model_causalselfattention', 'model_causalselfattention_init', 'model_causalselfattention_forward', 'model_layernorm', 'model_gptconfig', 'model_gpt_init', 'model_gpt_from_pretrained', 'model_gpt_configure_optimizers', 'model_gpt_crop_block_size', 'model_gpt_generate', 'configurator', 'train', 'train_get_lr'];

test('the nanoGPT fixture memory is labelled, links only real code ids, and holds one private session and question of another user', async () => {
  const { MEMORY } = await import('./home/map-memory-data.js');
  const m = MEMORY['karpathy/nanogpt'], all = [...m.decisions, ...m.questions, ...m.sessions];
  assert.deepEqual([m.decisions.length, m.questions.length, m.sessions.length], [6, 6, 4]);
  assert.equal(new Set(all.map((r) => r.id)).size, all.length);
  assert.ok(all.every((r) => r.fixture === true && r.code.length));
  assert.ok(all.every((r) => r.code.every((c) => NANOGPT.includes(c.id) && (c.confidence === 'RECORDED' || (c.confidence === 'INFERRED' && c.score > 0 && c.score < 1)))));
  assert.ok(all.every((r) => !r.session || m.sessions.some((s) => s.id === r.session)));
  const hidden = all.filter((r) => r.visibility === 'private');
  assert.deepEqual(hidden.map((r) => r.owner), ['teammate@example.com', 'teammate@example.com']);
  const seenHere = visibleMemory(m, 'viewer@example.com'), attn = { id: 'model_causalselfattention', label: 'CausalSelfAttention', path: 'model.py', line: 29 };
  assert.equal(ids(seenHere).length, all.length - 2);
  assert.match(fixtureAnswer(WHY, { node: attn, memory: seenHere, graph: { nodes: [attn], edges: [] } }).text, /2 recorded decisions explain why CausalSelfAttention/);
});
