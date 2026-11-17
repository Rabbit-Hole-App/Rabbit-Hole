// The code-explain card contract (code-explain-card-spec.md section 2): the schema file, the cap constant and the validators. Offline, pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_EXPLAIN_MAX_CARDS, codeExplainSchema, validateCodeCardAdditions, validateCodeExplain, validateMessageMeta } from '../src/code-explain-contract.js';
import { validateToolInput } from '../src/learn-validation.js';

const LINES = { 'model.py': 330, 'configurator.py': 47, 'bench.py': 120 };
const lines = path => LINES[path];

// The spec's nanoGPT example (2a), with the elided text written out.
const golden = () => ({
  type: 'codeExplain',
  title: 'How attention hides later tokens',
  question: 'how does attention hide later tokens?',
  repo: 'karpathy/nanoGPT', commit: '3adf61e154c3fe3fca428ad6bc3818b27a3b8291',
  files: [
    { cardId: 'self', path: 'model.py', ranges: [{ id: 'r1', start: 52, end: 60 }, { id: 'r2', start: 67, end: 70 }] },
    { cardId: 'card-9f2', path: 'configurator.py', ranges: [{ id: 'r3', start: 30, end: 34 }] },
  ],
  mentioned: [{ id: 'm1', path: 'bench.py', start: 88, end: 88 }],
  depth: 'standard',
  depths: {
    brief: { prose: 'Attention sets the scores of later tokens to minus infinity. The softmax then gives them zero weight.', anchors: [{ sentence: 0, target: 'r2' }] },
    standard: {
      prose: 'The model builds a lower-triangular matrix of ones. Positions above the diagonal are zero. The mask is applied with masked_fill before the softmax. The softmax turns minus infinity into zero weight. The config can override the block size.',
      anchors: [{ sentence: 1, target: 'r1' }, { sentence: 2, target: 'r2' }, { sentence: 4, target: 'r3' }],
    },
    detailed: {
      prose: 'Take T equal to 4. The mask is tril of ones. Row zero keeps only its own score. The rest become minus infinity. After the softmax row zero is one and zeros. The same holds for every row. A benchmark exercises this path.',
      anchors: [{ sentence: 1, target: 'r1' }, { sentence: 6, target: 'm1' }],
      trace: { input: 'T = 4', steps: ['mask = tril(ones(4,4))', 'att[0] = [s, -inf, -inf, -inf]', 'softmax -> [1, 0, 0, 0]'] },
    },
  },
  figure: null,
  suggestions: ['Why is the mask added before the softmax?', 'What does -inf do to a probability?', 'What changes with flash attention?'],
  evidence: { model: 'claude-sonnet-5-5', sources: ['model.py:52-60', 'model.py:67-70', 'configurator.py:30-34', 'bench.py:88'], createdAt: '2026-11-15T19:20:00Z' },
});
const opts = { mode: 'client', lines, boardCardIds: ['card-9f2', 'card-other'] };
// The meta payload: the card minus files[*].cardId (figure may stay: the server attaches it after the model call).
const payload = () => { const c = golden(); c.files.forEach(f => delete f.cardId); return c; };
const modelOutput = () => { const c = payload(); delete c.figure; return c; };

// The schema, through the repo's own minimal checker (learn-validation.js validateToolInput: type, enum, required, additionalProperties,
// min/max items and length, minimum). No JSON Schema library is installed, so $ref is inlined, const becomes enum, and anyOf [X, null] widens X's type;
// patterns and the cross-field rules are the validators' job (tested below).
function inline(node, defs) {
  if (Array.isArray(node)) return node.map(n => inline(n, defs));
  if (!node || typeof node !== 'object') return node;
  if (node.$ref) return inline(defs[node.$ref.split('/').pop()], defs);
  if (node.anyOf) { const [x, nul] = node.anyOf; assert.equal(nul.type, 'null'); const t = inline(x, defs); return { ...t, type: [].concat(t.type, 'null') }; }
  const out = {};
  for (const [k, v] of Object.entries(node)) { if (k === 'const') out.enum = [v]; else if (k !== 'pattern' && k !== 'description') out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v).map(([p, s]) => [p, inline(s, defs)])) : inline(v, defs); }
  return out;
}
const checkSchema = (name, value) => { const s = codeExplainSchema(name); return validateToolInput(value, inline({ $ref: s.$ref }, s.$defs)); };
const schemaRejects = (name, value, fragment) => assert.throws(() => checkSchema(name, value), e => e.message.includes(fragment), fragment);

test('the cap is one constant and the schema agrees', () => {
  assert.equal(CODE_EXPLAIN_MAX_CARDS, 4);
  const s = codeExplainSchema('codeExplain');
  assert.equal(s.$defs.codeExplain.properties.files.maxItems, CODE_EXPLAIN_MAX_CARDS);
  assert.equal(s.$defs.codeExplainModelOutput.properties.files.maxItems, CODE_EXPLAIN_MAX_CARDS);
  assert.equal(s.$defs.codeExplainMetaPayload.properties.files.maxItems, CODE_EXPLAIN_MAX_CARDS);
});

test('golden example: the spec payload passes the schema and the client validator', () => {
  checkSchema('codeExplain', golden());
  assert.deepEqual(validateCodeExplain(golden(), opts), []);
});

test('schema: every object is closed and the required fields are enforced', () => {
  schemaRejects('codeExplain', { ...golden(), extra: 1 }, 'unexpected field');
  const noFigure = golden(); delete noFigure.figure;
  schemaRejects('codeExplain', noFigure, 'figure: required');
  const sixFiles = golden(); sixFiles.files = Array(5).fill(sixFiles.files[1]);
  schemaRejects('codeExplain', sixFiles, 'maximum 4 items');
  const oneSuggestion = golden(); oneSuggestion.suggestions = ['Why?'];
  schemaRejects('codeExplain', oneSuggestion, 'suggestions');
  const badDepth = golden(); badDepth.depth = 'long';
  schemaRejects('codeExplain', badDepth, 'expected one of brief, standard, detailed');
  const figure = golden(); figure.figure = { referenceId: 'attention-mask', spec: { kind: 'matrix' } };
  checkSchema('codeExplain', figure);
  figure.figure = { referenceId: 'attention-mask' };
  schemaRejects('codeExplain', figure, 'spec: required');
});

test('schema: model output has no cardId and no figure; the meta payload has no cardId and an optional figure', () => {
  checkSchema('codeExplainModelOutput', modelOutput());
  schemaRejects('codeExplainModelOutput', payload(), 'unexpected field; allowed fields: type, title');
  const withCardId = modelOutput(); withCardId.files[0].cardId = 'self';
  schemaRejects('codeExplainModelOutput', withCardId, 'files[0]: unexpected field; allowed fields: path, ranges');
  checkSchema('codeExplainMetaPayload', payload());
  checkSchema('codeExplainMetaPayload', modelOutput());
});

test('schema: message meta', () => {
  checkSchema('messageMeta', { route: 'code-explain', codeExplain: payload() });
  checkSchema('messageMeta', { route: 'answer', codeExplain: null });
  checkSchema('messageMeta', { route: 'code-explain', codeExplain: null, reason: 'failed validation twice' });
  schemaRejects('messageMeta', { route: 'chat', codeExplain: null }, 'expected one of code-explain, answer');
  schemaRejects('messageMeta', { route: 'answer' }, 'codeExplain: required');
  schemaRejects('messageMeta', { route: 'answer', codeExplain: null, why: 'x' }, 'unexpected field');
});

test('schema: satellite additions are ranges and from only', () => {
  checkSchema('codeCardAdditions', { ranges: [{ id: 'r3', start: 30, end: 34 }], from: 'codeExplain:card-1' });
  schemaRejects('codeCardAdditions', { ranges: [{ id: 'r3', start: 30, end: 34 }], ref: 'x' }, 'unexpected field');
  schemaRejects('codeCardAdditions', { ranges: [] }, 'at least 1 items');
});

// Each rule of section 2d: the golden passes (above); one failing case each.
const rejects = (mutate, fragment, o = opts) => {
  const card = golden(); mutate(card);
  const errors = validateCodeExplain(card, o);
  assert.ok(errors.some(e => e.includes(fragment)), `expected "${fragment}" in ${JSON.stringify(errors)}`);
};

test('2d files[0].cardId is "self"', () => {
  rejects(c => { c.files[0].cardId = 'card-9f2'; }, 'must be "self"');
  rejects(c => { c.files[1].cardId = 'self'; }, 'only for files[0]');
});

test('2d at most CODE_EXPLAIN_MAX_CARDS files', () => {
  assert.deepEqual(validateCodeExplain((() => { const c = golden(); c.files = [c.files[0], ...['a', 'b', 'c'].map((id, i) => ({ cardId: id, path: 'bench.py', ranges: [{ id: `x${i}`, start: 1, end: 2 }] }))]; c.mentioned = []; c.depths.detailed.anchors = []; c.depths.standard.anchors = []; c.depths.brief.anchors = []; c.evidence.sources = ['model.py:52-60', 'model.py:67-70', 'bench.py:1-2']; return c; })(), { ...opts, boardCardIds: ['a', 'b', 'c'] }), []);
  rejects(c => { c.files.push({ cardId: 'card-other', path: 'bench.py', ranges: [{ id: 'r9', start: 1, end: 2 }] }, { cardId: 'card-x', path: 'bench.py', ranges: [{ id: 'r10', start: 3, end: 4 }] }, { cardId: 'card-y', path: 'bench.py', ranges: [{ id: 'r11', start: 5, end: 6 }] }); }, 'at most 4', { ...opts, boardCardIds: ['card-9f2', 'card-other', 'card-x', 'card-y'] });
});

test('2d other cardIds name code cards on the board', () => {
  rejects(c => { c.files[1].cardId = 'card-gone'; }, 'is not a code card on the board');
});

test('2d anchor targets are range or mention ids; a deleted satellite card is not an error', () => {
  rejects(c => { c.depths.standard.anchors[0].target = 'r99'; }, 'target "r99" is not a range or mention id');
  // The satellite card left the board, its range stays in the saved card: the anchor still resolves (rendered as a file:line link).
  assert.deepEqual(validateCodeExplain(golden(), { ...opts, boardCardIds: [] }).filter(e => e.includes('target')), []);
});

test('2d ids are unique across ranges and mentions', () => {
  rejects(c => { c.mentioned[0].id = 'r1'; }, 'duplicate id r1');
});

test('2d ranges within the line count and start <= end', () => {
  rejects(c => { c.files[0].ranges[1].end = 331; }, 'is past the 330 lines of model.py');
  rejects(c => { c.files[0].ranges[0].start = 61; }, 'is after end');
  rejects(c => { c.mentioned[0].end = 121; c.evidence.sources[3] = 'bench.py:88-121'; }, 'past the 120 lines of bench.py');
  rejects(c => { c.files[0].path = 'ghost.py'; }, 'is not in the snapshot');
});

test('2d all three depths present; trace only on detailed', () => {
  rejects(c => { delete c.depths.brief; }, 'depths.brief is missing');
  rejects(c => { c.depths.standard.trace = { input: 'x', steps: ['y'] }; }, 'trace is only allowed on detailed');
  assert.deepEqual(validateCodeExplain((() => { const c = golden(); delete c.depths.detailed.trace; return c; })(), opts), []);
  rejects(c => { c.depths.detailed.trace = { input: 'x', steps: [] }; }, 'trace must be');
});

test('2d exactly three suggestions, each ending in ?', () => {
  rejects(c => { c.suggestions.pop(); }, 'exactly three');
  rejects(c => { c.suggestions[1] = 'What does -inf do.'; }, 'suggestions[1] must be a question');
});

test('2d figure is null or {referenceId, spec}', () => {
  assert.deepEqual(validateCodeExplain({ ...golden(), figure: { referenceId: 'attention-mask', spec: { kind: 'matrix' } } }, opts), []);
  rejects(c => { c.figure = { referenceId: 'attention-mask' }; }, 'figure must be null or');
  rejects(c => { delete c.figure; }, 'figure must be null or');
});

test('2d evidence.sources is the union of ranges and mentions', () => {
  rejects(c => { c.evidence.sources.pop(); }, 'evidence.sources is missing bench.py:88');
  rejects(c => { c.evidence.sources.push('model.py:1-2'); }, 'evidence.sources has model.py:1-2');
  assert.deepEqual(validateCodeExplain((() => { const c = golden(); c.evidence.sources = c.evidence.sources.reverse().map(s => s === 'bench.py:88' ? 'bench.py:88-88' : s); return c; })(), opts), []);
});

test('server mode validates the model output: no cardIds, no board, figure not yet attached', () => {
  const server = { mode: 'server', lines };
  assert.deepEqual(validateCodeExplain(modelOutput(), server), []);
  assert.deepEqual(validateCodeExplain(payload(), server), []);
  const withCardId = modelOutput(); withCardId.files[0].cardId = 'self';
  assert.ok(validateCodeExplain(withCardId, server).some(e => e.includes('assigned on insert')));
  const bad = modelOutput(); bad.depths.standard.anchors[0].target = 'r99';
  assert.ok(validateCodeExplain(bad, server).some(e => e.includes('r99')));
});

test('message meta: route, payload and reason', () => {
  assert.deepEqual(validateMessageMeta({ route: 'code-explain', codeExplain: payload() }, { lines }), []);
  assert.deepEqual(validateMessageMeta({ route: 'answer', codeExplain: null }), []);
  assert.deepEqual(validateMessageMeta({ route: 'code-explain', codeExplain: null, reason: 'validation failed twice' }), []);
  assert.ok(validateMessageMeta({ route: 'code-explain', codeExplain: null }).some(e => e.includes('needs a reason')));
  assert.ok(validateMessageMeta({ route: 'answer', codeExplain: payload() }, { lines }).some(e => e.includes('must have codeExplain null')));
  assert.ok(validateMessageMeta({ route: 'other', codeExplain: null }).some(e => e.includes('route must be')));
  const bad = payload(); bad.suggestions.pop();
  assert.ok(validateMessageMeta({ route: 'code-explain', codeExplain: bad }, { lines }).some(e => e.startsWith('codeExplain: suggestions')));
});

test('satellite additions: ranges within the file, from back-reference', () => {
  const ok = { ranges: [{ id: 'r3', start: 30, end: 34 }], from: 'codeExplain:card-1' };
  assert.deepEqual(validateCodeCardAdditions(ok, { lineCount: 47 }), []);
  assert.deepEqual(validateCodeCardAdditions({}), []);
  assert.ok(validateCodeCardAdditions({ ...ok, from: 'card-1' }).some(e => e.includes('from must be')));
  assert.ok(validateCodeCardAdditions(ok, { lineCount: 33 }).some(e => e.includes('past the 33 lines')));
  assert.ok(validateCodeCardAdditions({ ranges: [{ id: 'a', start: 5, end: 2 }] }).some(e => e.includes('is after end')));
  assert.ok(validateCodeCardAdditions({ ranges: [{ id: 'a', start: 1, end: 2 }, { id: 'a', start: 3, end: 4 }] }).some(e => e.includes('duplicate id')));
});
