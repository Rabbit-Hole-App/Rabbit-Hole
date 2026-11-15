// The code-explain handler (src/learn-code-explain.js) against a stubbed model: no real model call anywhere in this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_EXPLAIN_MAX_CARDS, validateCodeExplain, validateMessageMeta } from '../src/code-explain-contract.js';
import { CODE_EXPLAIN_LIMITS, CODE_EXPLAIN_MODEL, CODE_EXPLAIN_TOOL, UNANCHORED_LINE, SENTENCE_BREAK, answerText, codeExplainTurn, estimateTokens, figureFor, gatherCode, placeFiles, relationshipLines, runCodeExplain, sentencesOf, settleOutput } from '../src/learn-code-explain.js';
import { composeTutorPrompt } from '../src/tutor-prompt.js';

const SHA = 'a'.repeat(40);
const MODEL_PY = [
  'import torch', '', 'class CausalSelfAttention(torch.nn.Module):', '    def __init__(self, config):', '        super().__init__()', '        self.block_size = config.block_size',
  '        self.register_buffer("bias", torch.tril(torch.ones(config.block_size, config.block_size)))', '', '    def forward(self, x):', '        B, T, C = x.size()',
  '        att = (q @ k.transpose(-2, -1))', '        att = att.masked_fill(self.bias[:, :, :T, :T] == 0, float("-inf"))', '        att = F.softmax(att, dim=-1)', '        return att @ v', '', 'def helper():', '    return 1',
].join('\n');
const filler = n => Array.from({ length: n }, (_, i) => `line ${i + 1} = ${i + 1}`).join('\n');
const snapshotOf = (extra = {}) => ({
  repo: 'acme/lab', commit: SHA, skipped: [],
  files: { 'model.py': MODEL_PY, 'config.py': filler(30), 'train.py': filler(60), ...extra },
  graph: {
    nodes: [
      { id: 'model', label: 'model.py', path: 'model.py', line: 1 }, { id: 'cls', label: 'CausalSelfAttention', path: 'model.py', line: 3 }, { id: 'fwd', label: '.forward()', path: 'model.py', line: 9 },
      { id: 'cfg', label: 'block_size', path: 'config.py', line: 18 }, { id: 'main', label: 'main()', path: 'train.py', line: 40 },
    ],
    edges: [
      { source: 'cls', target: 'fwd', relation: 'method', confidence: 'EXTRACTED' }, { source: 'fwd', target: 'cfg', relation: 'reads', confidence: 'EXTRACTED' },
      { source: 'main', target: 'fwd', relation: 'calls', confidence: 'INFERRED' },
    ],
  },
});
const ref = (path, start, end, extra = {}) => ({ sourceId: `code:acme/lab@${SHA}:${path}`, kind: 'code', name: path, version: SHA, range: { path, start, end }, ...extra });
const QUESTION = 'how does attention hide later tokens?';

// A valid model output for snapshotOf(): two ranges in model.py (inside the widened lines 4-14) and a mention of config.py.
const output = (over = {}) => ({
  type: 'codeExplain', title: 'How attention hides later tokens', question: QUESTION, repo: 'acme/lab', commit: SHA,
  files: [{ path: 'model.py', ranges: [{ id: 'r1', start: 7, end: 7 }, { id: 'r2', start: 12, end: 13 }] }],
  mentioned: [{ id: 'm1', path: 'config.py', start: 18, end: 18 }],
  depth: 'standard',
  depths: {
    brief: { prose: 'It blanks out every later word. So a word only sees what came before.', anchors: [] },
    standard: { prose: 'The layer stores a lower triangle of ones. Later positions are filled with negative infinity. The size comes from the config.', anchors: [{ sentence: 0, target: 'r1' }, { sentence: 1, target: 'r2' }, { sentence: 2, target: 'm1' }] },
    detailed: { prose: 'The triangle is a buffer, not a parameter. Softmax turns negative infinity into zero.', anchors: [{ sentence: 0, target: 'r1' }, { sentence: 1, target: 'r2' }], trace: { input: 'T = 4', steps: ['bias[:4,:4] = rows 1000 / 1100 / 1110 / 1111', 'row 0 after fill = [s00, -inf, -inf, -inf]'] } },
  },
  suggestions: ['Why is the mask applied before the softmax?', 'Where does block_size get its value?', 'What if the triangle kept the upper half?'],
  evidence: { model: CODE_EXPLAIN_MODEL, sources: [], createdAt: 'x' },
  ...over,
});
const message = (input, usage = { input_tokens: 9000, output_tokens: 1500 }, extra = {}) => ({ model: CODE_EXPLAIN_MODEL, stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: `tu-${Math.random()}`, name: 'code_explain', input }], ...extra });
// A stubbed transport: answers with the queued messages in order and keeps every request.
const stub = (...queue) => { const calls = []; return { calls, callModel: async (env, body, model, org) => { calls.push({ body: structuredClone(body), model, org }); return Response.json(queue.shift()); } }; };
const quiet = async fn => { const log = console.log, lines = []; console.log = line => lines.push(String(line)); try { return [await fn(), lines]; } finally { console.log = log; } };
const run = (model, over = {}) => quiet(() => runCodeExplain({ snapshot: snapshotOf(), question: QUESTION, refs: [ref('model.py', 7, 13)], callModel: model.callModel, now: () => '2026-11-15T00:00:00.000Z', ...over }));
const lines = snapshot => path => (Object.hasOwn(snapshot.files, path) ? snapshot.files[path].split('\n').length : undefined);

test('happy path: one call, the payload validates, the answer is the Standard prose plus the closing line, the figure is null on a miss', async () => {
  const model = stub(message(output()));
  const [result, logs] = await run(model);
  assert.equal(model.calls.length, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.firstTry, true);
  const card = result.codeExplain;
  assert.deepEqual(validateCodeExplain(card, { mode: 'server', lines: lines(snapshotOf()) }), []);
  assert.deepEqual(validateMessageMeta({ route: 'code-explain', codeExplain: card }, { lines: lines(snapshotOf()) }), []);
  assert.equal(card.figure, null);
  assert.equal(card.depth, 'standard');
  assert.deepEqual(card.evidence, { model: CODE_EXPLAIN_MODEL, sources: ['model.py:7', 'model.py:12-13', 'config.py:18'], createdAt: '2026-11-15T00:00:00.000Z' });
  assert.equal(result.answer, `${card.depths.standard.prose}\n\nAlso touched: config.py:18.`);
  // The request: Sonnet 5.5, the composed prompt, one tool on auto, the output cap.
  const { body, model: sent, org } = model.calls[0];
  assert.equal(sent, 'claude-sonnet-5-5');
  assert.equal(org, null);
  assert.equal(body.max_tokens, 4000);
  assert.deepEqual(body.tool_choice, { type: 'auto' });
  assert.deepEqual(body.tools.map(t => t.name), ['code_explain']);
  assert.equal(body.system[0].text, composeTutorPrompt({ task: 'code-explain' }).text);
  // The section 1c record and the operator's line (dollars only there).
  assert.deepEqual(Object.keys(result.tutor).sort(), ['layers', 'model', 'route', 'task', 'usage', 'use']);
  assert.equal(result.tutor.task, 'code-explain');
  assert.equal(result.tutor.model, 'claude-sonnet-5-5');
  assert.equal(result.tutor.layers.task, composeTutorPrompt({ task: 'code-explain' }).layers.task);
  const operator = logs.map(l => JSON.parse(l));
  assert.ok(operator.some(l => l.event === 'tutor_call' && l.task === 'code-explain'));
  assert.ok(operator.some(l => l.event === 'code_explain_call' && l.usd > 0 && l.outcome === 'card'));
});

test('the user message is the prompts file 5b template: the question, the cited code widened to whole functions with numbered lines, relationships, file names, the schema', async () => {
  const model = stub(message(output()));
  await run(model);
  const text = model.calls[0].body.messages[0].content;
  assert.ok(text.startsWith(`QUESTION\n${QUESTION}\n\n\nCODE THE LEARNER ADDED\n### model.py  lines 4-14   (commit aaaaaaa)\n4:     def __init__(self, config):`));
  assert.ok(text.includes('\n9:     def forward(self, x):\n'), 'the range 7-13 cut two functions: both are whole');
  assert.ok(!text.includes('\n16: def helper'), 'nothing beyond the functions the range touched');
  assert.ok(text.includes('RELATIONSHIPS (one hop, from the repository graph; EXTRACTED unless marked INFERRED)\n.forward() defined model.py:9 → reads block_size config.py:18; called by main() train.py:40 (INFERRED)'));
  assert.ok(!text.includes('CausalSelfAttention defined'), 'only symbols inside the shown lines, and structural edges are not relationships');
  assert.ok(text.includes('REPOSITORY FILES (names only; you cannot read these unless they appear above)\nmodel.py, config.py, train.py\n'));
  assert.ok(/OUTPUT SCHEMA\n\{"type":"object"/.test(text));
  assert.ok(!/use_codebase|Use the codebase/.test(text), 'the use case is the system prompt\'s overlay, never in the user message');
});

test('the goal is the overlay layer of the system prompt, not the message', async () => {
  const model = stub(message(output()));
  const [result] = await run(model, { use: 'use_codebase' });
  assert.ok(model.calls[0].body.system[0].text.includes(composeTutorPrompt({ task: 'code-explain', use: 'use_codebase' }).text));
  assert.equal(result.tutor.use, 'use_codebase');
  assert.ok(result.tutor.layers.use);
});

test('caps: the cited code is at most 400 lines, a read is at most 120 lines, the output is 4k tokens, the input stays under 30k tokens', async () => {
  const big = { 'big.py': filler(900) }, snapshot = snapshotOf(big);
  const code = gatherCode(snapshot, [ref('big.py', 1, 900)]);
  assert.equal(code.shown.reduce((n, s) => n + s.end - s.start + 1, 0), CODE_EXPLAIN_LIMITS.codeLines);
  assert.equal(code.text.split('\n').filter(l => /^\d+: /.test(l)).length, 400);
  assert.equal(CODE_EXPLAIN_LIMITS.readLines, 120);
  assert.equal(CODE_EXPLAIN_LIMITS.outputTokens, 4000);
  assert.equal(CODE_EXPLAIN_LIMITS.inputTokens, 30000);
  assert.equal(CODE_EXPLAIN_LIMITS.usd, 0.5);
  // A repository with a huge file list: the names shrink until the whole input fits.
  const names = Object.fromEntries(Array.from({ length: 4000 }, (_, i) => [`src/pkg${i}/very/long/module/path/name${i}.py`, 'x']));
  const model = stub(message(output()));
  await run(model, { snapshot: snapshotOf(names) });
  const body = model.calls[0].body;
  assert.ok(estimateTokens(body.system[0].text, body.messages[0].content, JSON.stringify(body.tools)) <= 30000);
  assert.equal(body.max_tokens, 4000);
});

test('a code ref that is another commit or repository is skipped; a symbol ref reads the symbol whole; whole-file selections stop at the budget', () => {
  const snapshot = snapshotOf();
  const code = gatherCode(snapshot, [
    { sourceId: `code:acme/lab@${'b'.repeat(40)}:model.py`, kind: 'code', name: 'x', range: { path: 'model.py', start: 1, end: 3 } },
    { sourceId: `code:other/repo@${SHA}:model.py`, kind: 'code', name: 'y' },
    { sourceId: `code:acme/lab@${SHA}:model.py#fwd`, kind: 'code', name: '.forward()' },
  ]);
  assert.equal(code.skipped, 2);
  assert.deepEqual(code.shown, [{ path: 'model.py', start: 9, end: 14 }]);
});

test('relationships: only symbols defined inside the shown lines, one line each', () => {
  const lines = relationshipLines(snapshotOf(), [{ path: 'train.py', start: 30, end: 50 }]);
  assert.deepEqual(lines, ['main() defined train.py:40 → calls .forward() model.py:9 (INFERRED)']);
  assert.deepEqual(relationshipLines(snapshotOf(), [{ path: 'config.py', start: 1, end: 3 }]), []);
});

test('ranking and the cap: six cited files give four cards in walk order, the rest become mentions under their own ids, and the closing line names them', async () => {
  const files = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map(n => [`${n}.py`, filler(20)]));
  const snapshot = snapshotOf(files), refs = Object.keys(files).map(p => ref(p, 1, 10));
  const rng = (id, p) => ({ path: p, ranges: [{ id, start: 2, end: 3 }] });
  const input = output({
    files: [rng('ra', 'a.py'), rng('rb', 'b.py'), rng('rc', 'c.py'), rng('rd', 'd.py'), rng('re', 'e.py'), rng('rf', 'f.py')],
    mentioned: [],
    depths: {
      brief: { prose: 'One. Two.', anchors: [] },
      // sentence counts per file: f 3, c 2, a 1, b 1, d 1, e 0; first anchors: f 0, c 1, a 2, b 3...
      standard: { prose: 'S0. S1. S2. S3. S4. S5. S6.', anchors: [{ sentence: 0, target: 'rf' }, { sentence: 1, target: 'rc' }, { sentence: 2, target: 'ra' }, { sentence: 3, target: 'rb' }, { sentence: 4, target: 'rf' }, { sentence: 5, target: 'rd' }, { sentence: 6, target: 'rc' }, { sentence: 6, target: 'rf' }] },
      detailed: { prose: 'D0. D1.', anchors: [{ sentence: 0, target: 'rd' }, { sentence: 1, target: 're' }] },
    },
  });
  const model = stub(message(input));
  const [result] = await run(model, { snapshot, refs });
  const card = result.codeExplain;
  assert.equal(CODE_EXPLAIN_MAX_CARDS, 4);
  assert.deepEqual(card.files.map(f => f.path), ['f.py', 'c.py', 'a.py', 'b.py'], 'most Standard sentences first, ties by first anchor, then walk order');
  assert.deepEqual(card.mentioned.map(m => [m.id, m.path]), [['rd', 'd.py'], ['re', 'e.py']], 'a dropped file keeps its range ids as mentions');
  assert.deepEqual(validateCodeExplain(card, { mode: 'server', lines: lines(snapshot) }), []);
  assert.ok(card.evidence.sources.includes('d.py:2-3') && card.evidence.sources.includes('e.py:2-3'));
  assert.ok(result.answer.endsWith('\n\nAlso touched: d.py:2-3, e.py:2-3.'));
  assert.equal(model.calls.length, 1, 'ranking is the server\'s, not a re-ask');
});

test('placeFiles: ties keep the model\'s order; files without Standard anchors rank last', () => {
  const f = (path, id) => ({ path, ranges: [{ id, start: 1, end: 1 }] });
  const placed = placeFiles([f('x', 'rx'), f('y', 'ry'), f('z', 'rz')], [], [{ sentence: 0, target: 'rz' }], 2);
  assert.deepEqual(placed.files.map(file => file.path), ['z', 'x']);
  assert.deepEqual(placed.mentioned.map(m => m.path), ['y']);
});

test('re-ask once with the errors: the second call carries the tool result with every error, and its usage joins the cost', async () => {
  const bad = output({ depths: { ...output().depths, standard: { prose: 'A sentence. Another.', anchors: [{ sentence: 0, target: 'nowhere' }] } } });
  const model = stub(message(bad, { input_tokens: 9000, output_tokens: 1500 }), message(output(), { input_tokens: 11000, output_tokens: 1500 }));
  const [result] = await run(model);
  assert.equal(model.calls.length, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.firstTry, false);
  assert.ok(result.codeExplain);
  const [assistant, toolResult] = model.calls[1].body.messages.slice(1);
  assert.equal(assistant.role, 'assistant');
  assert.equal(toolResult.content[0].type, 'tool_result');
  assert.equal(toolResult.content[0].is_error, true);
  assert.match(toolResult.content[0].content, /target "nowhere" is not a range or mention id/);
  assert.equal(result.usage.input, 20000);
  assert.equal(result.usage.output, 3000);
});

test('failing validation twice: no card, a reason, the last Standard prose as the answer, and the chat appends the one line', async () => {
  const bad = output({ suggestions: ['not a question', 'Why?', 'What if?'] });
  const model = stub(message(bad), message(bad));
  const [result] = await run(model);
  assert.equal(model.calls.length, 2, 'one re-ask, never more');
  assert.equal(result.codeExplain, null);
  assert.match(result.reason, /did not validate after one retry: suggestions\[0\] must be a question ending in "\?"/);
  assert.equal(result.answer, bad.depths.standard.prose);
  const turn = codeExplainTurn({ env: {}, question: QUESTION, refs: [ref('model.py', 7, 13)], snapshot: async () => snapshotOf(), callModel: stub(message(bad), message(bad)).callModel });
  const handled = await quiet(() => turn.answer());
  assert.equal(handled[0].answer, bad.depths.standard.prose);
  assert.equal(turn.close(handled[0].answer), `${bad.depths.standard.prose}\n\n${UNANCHORED_LINE}`);
  assert.equal(UNANCHORED_LINE, 'I couldn\'t anchor this to the code well enough to make a card; the answer is above.');
  assert.deepEqual(validateMessageMeta({ route: 'code-explain', ...turn.meta() }, { lines: lines(snapshotOf()) }), []);
  assert.equal(turn.meta().codeExplain, null);
});

test('the handler\'s own rules: Brief at most two sentences, a range only inside the shown lines, a title of at most 60 characters, no markdown', () => {
  const ctx = { question: QUESTION, snapshot: snapshotOf(), shown: [{ path: 'model.py', start: 4, end: 14 }] };
  const errorsOf = over => settleOutput(output(over), ctx).errors.join('\n');
  assert.equal(errorsOf({}), '');
  assert.match(errorsOf({ depths: { ...output().depths, brief: { prose: 'One. Two. Three.', anchors: [] } } }), /depths\.brief has 3 sentences; at most 2/);
  assert.match(errorsOf({ files: [{ path: 'model.py', ranges: [{ id: 'r1', start: 1, end: 3 }, { id: 'r2', start: 12, end: 13 }] }] }), /model\.py:1-3 is outside the lines you were shown \(4-14\)/);
  assert.match(errorsOf({ files: [{ path: 'train.py', ranges: [{ id: 'r1', start: 1, end: 3 }, { id: 'r2', start: 4, end: 5 }] }] }), /train\.py was not given to you; list it in mentioned/);
  assert.match(errorsOf({ title: 'x'.repeat(61) }), /title must be at most 60 characters/);
  assert.match(errorsOf({ title: 'Ends with a period.' }), /no trailing period/);
  assert.match(errorsOf({ depths: { ...output().depths, detailed: { ...output().depths.detailed, prose: '- a bullet. And more.' } } }), /plain sentences/);
  assert.match(errorsOf({ depths: { ...output().depths, standard: { ...output().depths.standard, anchors: [{ sentence: 9, target: 'r1' }] } } }), /anchor sentence 9 does not exist/);
  // A range past the end of the file at the commit is the contract's own error.
  assert.match(settleOutput(output({ mentioned: [{ id: 'm1', path: 'config.py', start: 99, end: 99 }] }), ctx).errors.join('\n'), /past the 30 lines of config\.py/);
});

test('the server\'s facts are the server\'s: type, question, repo, commit and evidence do not come from the model', () => {
  const { card } = settleOutput(output({ question: 'something else', repo: 'x/y', commit: 'b'.repeat(40), type: 'whatever', depth: 'brief' }), { question: QUESTION, snapshot: snapshotOf(), shown: [{ path: 'model.py', start: 4, end: 14 }], now: () => 'T' });
  assert.deepEqual([card.type, card.question, card.repo, card.commit, card.depth, card.evidence.createdAt], ['codeExplain', QUESTION, 'acme/lab', SHA, 'standard', 'T']);
});

test('figure: a worked /explain reference hit is attached as { referenceId, spec }; a miss is null (never a shape example)', async () => {
  const hit = figureFor('how does the decoder use a causal mask?', 'The mask hides later tokens. Softmax then gives them zero weight.');
  assert.equal(hit.referenceId, 'ml-transformer-causal-mask');
  assert.deepEqual(Object.keys(hit.spec), ['version', 'diagram']);
  assert.equal(figureFor('what does configurator.py exec do?', 'It reads the config file. Then it rewrites globals.'), null);
  assert.equal(figureFor('q', 'p', () => { throw new Error('selector down'); }), null);
  const model = stub(message(output({ question: 'x', depths: { ...output().depths, standard: { ...output().depths.standard, prose: 'The decoder uses a causal mask. Later positions get negative infinity. The size comes from the config.' } } })));
  const [result] = await run(model, { question: 'how does the decoder use a causal mask?' });
  assert.equal(result.codeExplain.figure.referenceId, 'ml-transformer-causal-mask');
  assert.deepEqual(validateCodeExplain(result.codeExplain, { mode: 'server', lines: lines(snapshotOf()) }), []);
});

test('the cost cap: a first try that already cost more than a second could allow is not retried', async () => {
  const bad = output({ suggestions: ['not a question', 'Why?', 'What if?'] });
  // 240k input tokens at USD 2 per million plus 4k output at 10 per million is above US$0.50 with another call.
  const model = stub(message(bad, { input_tokens: 240000, output_tokens: 4000 }), message(output()));
  const [result] = await run(model);
  assert.equal(model.calls.length, 1);
  assert.equal(result.codeExplain, null);
  assert.match(result.reason, /cost limit for one card/);
  assert.equal(result.answer, bad.depths.standard.prose);
});

test('credits only for users: the record in the meta has tokens and credits, no dollar field; dollars are only in the operator log', async () => {
  const model = stub(message(output(), { input_tokens: 10000, output_tokens: 2000 }));
  const [result, logs] = await run(model);
  // 10k in at 2 plus 2k out at 10 per million = USD 0.04 = 4 credits.
  assert.deepEqual(result.tutor.usage, { inputTokens: 10000, outputTokens: 2000, credits: 4 });
  assert.ok(!/usd|dollar|\$/i.test(JSON.stringify({ tutor: result.tutor, meta: result.codeExplain })));
  assert.ok(logs.some(line => JSON.parse(line).usd === 0.04));
});

test('no usable result falls back to ordinary chat: no snapshot, no readable code, a failed call, a missing or cut-off tool call', async () => {
  const none = await runCodeExplain({ snapshot: null, question: QUESTION, refs: [] });
  assert.equal(none.answer, null);
  assert.equal(none.codeExplain, null);
  assert.match(none.reason, /snapshot/);
  const unread = await runCodeExplain({ snapshot: snapshotOf(), question: QUESTION, refs: [ref('missing.py', 1, 2)] });
  assert.deepEqual([unread.answer, unread.codeExplain], [null, null]);
  assert.match(unread.reason, /None of the selected code/);
  const failed = await quiet(() => runCodeExplain({ snapshot: snapshotOf(), question: QUESTION, refs: [ref('model.py', 7, 13)], callModel: async () => new Response('{}', { status: 529 }) }));
  assert.deepEqual([failed[0].answer, failed[0].codeExplain], [null, null]);
  assert.match(failed[0].reason, /could not be generated/);
  const text = stub({ model: CODE_EXPLAIN_MODEL, stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'prose' }] }, { model: CODE_EXPLAIN_MODEL, stop_reason: 'max_tokens', usage: {}, content: [] });
  const [cut] = await run(text);
  assert.equal(text.calls.length, 2);
  assert.equal(text.calls[1].body.messages.at(-1).content.startsWith('Not accepted:\ncall code_explain exactly once (got 0)'), true);
  assert.equal(cut.codeExplain, null);
  assert.equal(cut.answer, null, 'no prose was ever produced: ordinary chat answers');
  // The turn seam: a fall back appends the line to the ordinary answer and still records why.
  let chatLogged = 0;
  const turn = codeExplainTurn({ env: {}, question: QUESTION, refs: [], snapshot: async () => snapshotOf(), logChat: () => { chatLogged++; } });
  assert.equal(await turn.answer(), null);
  assert.equal(chatLogged, 1);
  assert.equal(turn.close('Ordinary answer.'), `Ordinary answer.\n\n${UNANCHORED_LINE}`);
  assert.equal(turn.tutor(), null, 'the ordinary chat\'s own record stands');
  assert.match(turn.meta().reason, /None of the selected code/);
});

test('a turn that never ran the handler adds nothing: close is the identity and the meta is empty', () => {
  const turn = codeExplainTurn({ env: {}, question: QUESTION, refs: [], snapshot: async () => null });
  assert.equal(turn.close('x'), 'x');
  assert.deepEqual(turn.meta(), {});
  assert.equal(turn.tutor(), null);
});

test('the tool is the contract\'s model output schema with no $ref left, and the sentence split is the renderer\'s', async () => {
  assert.ok(!JSON.stringify(CODE_EXPLAIN_TOOL).includes('$ref'));
  assert.equal(CODE_EXPLAIN_TOOL.input_schema.type, 'object');
  assert.deepEqual(CODE_EXPLAIN_TOOL.input_schema.required.includes('files'), true);
  assert.deepEqual(sentencesOf('One. Two? Three! `x.y` is fine. T = 4.'), ['One.', 'Two?', 'Three!', '`x.y` is fine.', 'T = 4.']);
  // The web's rule exactly (packages/web/src/code-explain.js splitSentences): closing quotes, brackets and backticks stay with their sentence; a "." inside model.py never splits; "e.g. " does.
  assert.deepEqual(sentencesOf('It reads model.py first. Then `x.` is set. (See it.) She said "go." Done, e.g. now.'), ['It reads model.py first.', 'Then `x.`', 'is set.', '(See it.)', 'She said "go."', 'Done, e.g.', 'now.']);
  assert.deepEqual(sentencesOf('  '), []);
  // The web's own function gives the same split, so an anchor index means the same sentence on both sides.
  const { splitSentences } = await import('../../web/src/code-explain.js');
  for (const prose of ['It reads model.py first. Then `x.` is set. (See it.) She said "go." Done, e.g. now.', 'One. Two? Three!', '', '  ']) assert.deepEqual(sentencesOf(prose), splitSentences(prose), prose);
  assert.equal(SENTENCE_BREAK.source, '(?<=[.!?]["\')\\]`]*)\\s+');
  assert.equal(answerText({ depths: { standard: { prose: ' Only. ' } }, mentioned: [] }), 'Only.');
});

// The stream's answer_meta carries the outcome, so the browser has the payload (or the reason) without reloading the thread; an ordinary answer's answer_meta is unchanged.
test('recordAnswer: answer_meta carries route, codeExplain and reason only for a code-explain turn', async t => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFileSync } = await import('node:fs');
  const { recordAnswer } = await import('../src/chat-modes.js');
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL('../repository-schema.sql', import.meta.url), 'utf8'));
  const db = { prepare: sql => ({ bind: (...params) => ({ first: async () => sqlite.prepare(sql).get(...params) || null, all: async () => ({ results: sqlite.prepare(sql).all(...params) }), run: async () => ({ meta: sqlite.prepare(sql).run(...params) }) }) }) };
  sqlite.exec("INSERT INTO threads(id,org,user,scope_ref,commit_sha,title) VALUES('t1','o','u','s','','x')");
  const record = proposalMeta => recordAnswer(db, { threadId: 't1', userMessageId: 1, content: 'a', raw: null, stopped: false, chat: { contextRefs: [] }, resolved: { mode: 'auto' }, turn: null, prior: null, long: false, validate: () => ({ actions: [], followUps: [] }), proposalMeta });
  const withCard = await record({ route: 'code-explain', codeExplain: null, reason: 'why not' });
  assert.deepEqual([withCard.answerMeta.route, withCard.answerMeta.codeExplain, withCard.answerMeta.reason], ['code-explain', null, 'why not']);
  const plain = await record({ route: 'answer' });
  assert.deepEqual(['route' in plain.answerMeta, 'codeExplain' in plain.answerMeta, 'reason' in plain.answerMeta], [false, false, false]);
});
