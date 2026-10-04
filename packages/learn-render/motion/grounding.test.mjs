// Source grounding against the pinned nanoGPT fixture (spec §4.4, §27): which softmax, the
// branch it depends on, verbatim evidence, and the cases that must ask instead of guess.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLearnerTurn } from '../../control-plane/src/learner-intent.js';
import { groundTarget } from '../../control-plane/src/source-grounding.js';
import { fixtureSource } from './fixture-source.js';

const source = fixtureSource();
const COMMIT = '3adf61e154c3fe3fca428ad6bc3818b27a3b8291';
const ground = (message, extra = {}) => groundTarget(resolveLearnerTurn({ message, ...extra }), source);
const at = r => `${r.path}:${r.start_line}-${r.end_line}`;
const lines = (path, a, b) => source.read(path).split('\n').slice(a - 1, b).join('\n');

test('the fixture is the pinned commit, byte for byte', () => {
  assert.equal(source.commit, COMMIT);
  assert.ok(source.files.includes('model.py') && source.files.includes('LICENSE'));
  assert.match(source.read('LICENSE'), /Copyright \(c\) 2022 Andrej Karpathy/);
});

test('softmax in the attention lesson: the attention occurrence, its flash/fallback condition, verbatim evidence', () => {
  const g = ground('/motion 15s explain me softmax func', { location: { concept: 'attention' } });
  assert.equal(g.status, 'grounded');
  assert.equal(g.resolution, 'context_disambiguated');
  assert.equal(g.chosen.symbol, 'CausalSelfAttention.forward');
  // Not one generic softmax: the sampling occurrence was considered and set aside, with the reason.
  assert.deepEqual(g.resolved_target.candidates_considered, [{ label: 'GPT.generate (model.py:324)', reason: 'not the current concept "attention"', range: { path: 'model.py', start: 324, end: 324 } }]);
  assert.deepEqual(g.source_refs.map(r => [r.id, r.role, at(r), r.condition_ids]), [
    ['S1', 'condition', 'model.py:44-45', []], // the flash flag
    ['S2', 'definition', 'model.py:48-50', ['K1']], // the causal-mask buffer (fallback only)
    ['S3', 'branch', 'model.py:62-64', ['K1']], // SDPA with is_causal=True
    ['S4', 'occurrence', 'model.py:65-71', ['K1']], // the explicit mask -> F.softmax fallback
  ]);
  const [k] = g.implementation_conditions;
  assert.equal(g.implementation_conditions.length, 1);
  assert.equal(k.id, 'K1');
  assert.match(k.condition, /`self\.flash`/);
  assert.match(k.branches[0].runs, /^model\.py:62-64: y = torch\.nn\.functional\.scaled_dot_product_attention\(.*is_causal=True\)/);
  assert.match(k.branches[1].runs, /^model\.py:65-71: /);
  assert.deepEqual(k.source_ref_ids, ['S3', 'S4', 'S1']);
  for (const r of g.source_refs) assert.equal(g.evidence.find(e => e.source_ref_id === r.id).excerpt, lines(r.path, r.start_line, r.end_line), r.id);
  const fallback = g.evidence.find(e => e.source_ref_id === 'S4').excerpt;
  assert.ok(fallback.indexOf('masked_fill') < fallback.indexOf('F.softmax'), 'the mask comes before softmax in the fallback evidence');
});

test('ambiguity: softmax with no lesson and no selection asks one question and grounds nothing', () => {
  const g = ground('/motion explain me softmax func');
  assert.equal(g.status, 'needs_clarification');
  assert.equal(g.clarification.question, 'Softmax in CausalSelfAttention.forward (model.py:69) or in GPT.generate (model.py:324)?');
  assert.deepEqual(g.clarification.options.map(o => [o.symbol, o.line]), [['CausalSelfAttention.forward', 69], ['GPT.generate', 324]]);
  assert.deepEqual([g.source_refs, g.evidence], [[], []]);
});

test('a selected code range picks the occurrence when the name is ambiguous', () => {
  const g = ground('/motion explain me softmax func', { repository_context: { commit: COMMIT, label: 'sampling', range: { path: 'model.py', start: 318, end: 326 } } });
  assert.equal(g.chosen.symbol, 'GPT.generate');
  assert.equal(g.resolution, 'context_disambiguated');
});

test('named concept vs canvas context: gradient descent on the attention canvas never drifts to attention', () => {
  const g = ground('/motion 10s explain gradient descent', { location: { concept: 'attention' } });
  assert.equal(g.target.name, 'gradient descent');
  assert.equal(g.status, 'not_found');
  assert.match(g.clarification.question, /"gradient descent"/);
  assert.deepEqual(g.source_refs, []);
  assert.ok(!JSON.stringify(g).includes('CausalSelfAttention'));
});

test('deictic: "explain this" on a selected attention range uses the selection, not the canvas concept', () => {
  const g = ground('/motion explain this', { location: { concept: 'tokenization' }, repository_context: { commit: COMMIT, label: 'attention', range: { path: 'model.py', start: 62, end: 71 } } });
  assert.equal(g.status, 'grounded');
  assert.equal(g.resolution, 'deictic');
  assert.equal(g.chosen.symbol, 'CausalSelfAttention.forward');
  // The selected if/else is split into its two branches, each carrying the condition.
  assert.deepEqual(g.source_refs.filter(r => r.role === 'occurrence').map(r => [at(r), r.condition_ids]), [['model.py:62-64', ['K1']], ['model.py:65-71', ['K1']]]);
  assert.equal(g.resolved_target.repository_context.range.start, 62);
});

test('a pointing request with nothing selected asks; a selection at another commit is refused', () => {
  assert.equal(ground('/motion explain this', { location: { concept: 'attention' } }).status, 'needs_clarification');
  const g = ground('/motion explain this', { repository_context: { commit: 'f'.repeat(40), label: 'x', range: { path: 'model.py', start: 1, end: 5 } } });
  assert.equal(g.status, 'needs_clarification');
  assert.match(g.clarification.question, /commit/);
});

test('deictic on a selected card: the card text is the evidence, the canvas concept is ignored', () => {
  const g = ground('/motion make this intuitive', { location: { concept: 'tokenization' }, selection: { kind: 'card', id: 'card-attn' }, canvas_target: { id: 'card-attn', kind: 'explanation', title: 'Attention', text: 'Each token looks back at earlier tokens and mixes what it finds.' } });
  assert.equal(g.status, 'grounded');
  assert.deepEqual([g.resolved_target.kind, g.resolved_target.label], ['card', 'Attention']);
  assert.deepEqual(g.source_refs, [{ id: 'S1', kind: 'card', card_id: 'card-attn', role: 'occurrence', condition_ids: [] }]);
  assert.equal(g.evidence[0].excerpt, 'Each token looks back at earlier tokens and mixes what it finds.');
});
