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
  // Structural sides: SDPA runs when the flag holds; the mask buffer and the explicit path when it does not.
  assert.deepEqual(k.branches.map(b => [b.source_ref_ids, b.no_op]), [[['S3'], undefined], [['S2', 'S4'], undefined]]);
  assert.deepEqual(k.source_ref_ids, ['S3', 'S2', 'S4', 'S1']);
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

// Conditions are statements read by indentation; every if is one, with or without an else.
const synthetic = files => ({ repository: 'example/synthetic', commit: 'a'.repeat(40), files: Object.keys(files), read: p => files[p] });
const FLOW = [
  'def step(x, flag, top_k=None, debug=False, verbose=False):', //  1
  '    y = x * 2', //                                                2
  '    if flag:', //                                                 3
  '        y = y + 1', //                                            4
  '    else:', //                                                    5
  '        y = y - 1', //                                            6
  '    if top_k is not None:', //                                    7
  '        y = clip(y, top_k)', //                                   8
  '        if debug:', //                                            9
  '            log(y)', //                                           10
  '        y = y + 0', //                                            11
  '', //                                                             12
  '    if verbose:', //                                              13
  '        log(x)', //                                               14
  '    if not ready(y):', //                                         15
  '        wait()', //                                               16
  '    for item in y:', //                                           17
  '        use(item)', //                                            18
  '    else:', //                                                    19
  '        done()', //                                               20
  '    return y', //                                                 21
].join('\n');
const flow = synthetic({ 'flow.py': FLOW });
const selectRange = (src, path, start, end) => groundTarget(resolveLearnerTurn({ message: '/motion explain this', repository_context: { commit: src.commit, label: `${path}:${start}-${end}`, range: { path, start, end } } }), src);
const refsOf = g => g.source_refs.map(r => [`${r.start_line}-${r.end_line}`, r.condition_ids]);
const sides = (g, key) => { const k = g.implementation_conditions.find(x => x.condition.startsWith(`\`${key}\``)); return [k.id, k.branches.map(b => b.no_op ? 'no_op' : b.source_ref_ids)]; };

test('if/else, if without else, nested and sequential ifs each become structural conditions', () => {
  const g = selectRange(flow, 'flow.py', 1, 21);
  assert.deepEqual(refsOf(g), [
    ['1-2', []],
    ['3-4', ['K1']], ['5-6', ['K1']], // if/else: one condition, both sides
    ['7-8', ['K2']], ['9-10', ['K2', 'K3']], ['11-11', ['K2']], // nested: the inner body runs under both
    ['13-14', ['K4']], // sequential and independent: its own condition only
    ['15-16', ['K5']], // a negated if: the body runs when `ready(y)` is false
    ['17-21', []], // for/else is a loop, not a condition
  ]);
  assert.deepEqual(sides(g, 'flag'), ['K1', [['S2'], ['S3']]]);
  assert.deepEqual(sides(g, 'top_k is not None'), ['K2', [['S4', 'S5', 'S6'], 'no_op']]);
  assert.deepEqual(sides(g, 'debug'), ['K3', [['S5'], 'no_op']]);
  assert.deepEqual(sides(g, 'verbose'), ['K4', [['S7'], 'no_op']]);
  assert.deepEqual(sides(g, 'ready(y)'), ['K5', ['no_op', ['S8']]]);
  const topK = g.implementation_conditions.find(k => k.id === 'K2');
  // No invented source for the side that does not run: it is empty and says so.
  assert.deepEqual(topK.branches[1], { when: '`top_k is not None` is false', runs: 'nothing: flow.py:7-11 is skipped (no else branch)', source_ref_ids: [], no_op: true });
  assert.equal(g.evidence.find(e => e.source_ref_id === 'S4').excerpt, '    if top_k is not None:\n        y = clip(y, top_k)');
});

test('a named target inside an if without else carries the condition', () => {
  const g = groundTarget(resolveLearnerTurn({ message: '/motion explain clip' }), flow);
  assert.equal(g.status, 'grounded');
  assert.deepEqual(refsOf(g), [['7-8', ['K1']], ['9-10', ['K1', 'K2']], ['11-11', ['K1']]]);
  assert.deepEqual(sides(g, 'top_k is not None'), ['K1', [['S1', 'S2', 'S3'], 'no_op']]);
});

test('Demo B: top_k in GPT.generate is a condition with no else; the crop expression is not', () => {
  const g = selectRange(source, 'model.py', 305, 330);
  assert.deepEqual(refsOf(g), [['305-319', []], ['320-322', ['K1']], ['323-330', []]]);
  assert.deepEqual(sides(g, 'top_k is not None'), ['K1', [['S2'], 'no_op']]);
  // ponytail: line 314's `idx if ... else idx[...]` is an expression, not a statement condition.
  assert.equal(g.implementation_conditions.length, 1);
});

test('a range starting on a decorator resolves to the decorated symbol, with the exact range kept', () => {
  const at = (src, path, start, end) => { const g = selectRange(src, path, start, end); return [g.chosen.symbol, g.resolved_target.repository_context.range, g.source_refs[0].start_line]; };
  // decorated method
  assert.deepEqual(at(source, 'model.py', 305, 330), ['GPT.generate', { path: 'model.py', start: 305, end: 330 }, 305]);
  assert.equal(selectRange(source, 'model.py', 305, 330).resolved_target.label, 'model.py:305-330 (GPT.generate, model.py:305-330)');
  // the def line itself, and @classmethod
  assert.equal(at(source, 'model.py', 306, 312)[0], 'GPT.generate');
  assert.equal(at(source, 'model.py', 206, 210)[0], 'GPT.from_pretrained');
  // decorated top-level function, decorated class
  assert.equal(at(source, 'train.py', 215, 220)[0], 'estimate_loss');
  assert.equal(at(source, 'model.py', 108, 112)[0], 'GPTConfig');
  // stacked decorators, one with multi-line arguments
  const cache = synthetic({ 'cache.py': ['class Cache:', '    @staticmethod', '    @functools.lru_cache(', '        maxsize=8,', '    )', '    def lookup(key):', '        return key'].join('\n') });
  assert.deepEqual(at(cache, 'cache.py', 2, 7), ['Cache.lookup', { path: 'cache.py', start: 2, end: 7 }, 2]);
  // a body line still belongs to its function
  assert.equal(at(source, 'model.py', 324, 324)[0], 'GPT.generate');
});
