import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionEnvironment, subscriptionIdentity, subscriptionMessage, createSubscriptionBridge, prepareMessages } from '../../../scripts/learn-subscription-bridge.mjs';
import { subscriptionTransport } from '../src/subscription-transport.js';
import { readFileSync as readText } from 'node:fs';
import { JOURNEY_TOOLS, pathOutput } from '../src/agents/learn-journey.js';

test('subscription environment strips API credentials and third-party providers', () => {
  assert.deepEqual(subscriptionEnvironment({ PATH: 'bin', ANTHROPIC_API_KEY: 'paid', ANTHROPIC_AUTH_TOKEN: 'paid', ANTHROPIC_BASE_URL: 'other', CLAUDE_CODE_OAUTH_TOKEN: 'override', CLAUDE_CODE_USE_BEDROCK: '1' }), { PATH: 'bin' });
});
test('API login fails before any model call; Max login is accepted', async () => {
  await assert.rejects(subscriptionIdentity(async () => ({ loggedIn: true, authMethod: 'api_key' })), /not accepted/);
  assert.equal((await subscriptionIdentity(async () => ({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'max', email: 'owner@example.test' }))).plan, 'max');
  let called = false;
  await assert.rejects(subscriptionMessage({}, { identify: async () => { throw new Error('No subscription'); }, run: async () => { called = true; } }), /No subscription/);
  assert.equal(called, false);
});
test('CLI output becomes only an allowed application tool; no native tools enabled', async () => {
  const body = { messages: [{ role: 'user', content: 'Read paper' }], tools: [{ name: 'read_arxiv_paper' }], tool_choice: { type: 'tool', name: 'read_arxiv_paper' } };
  const result = await subscriptionMessage(body, { identify: async () => ({}), prepare: async () => [], run: async args => {
    assert.equal(args[args.indexOf('--tools') + 1], '');
    return { result: JSON.stringify({ type: 'tool_use', name: 'read_arxiv_paper', input: { id: '1506.02640' } }) };
  } });
  assert.equal(result.billing, 'claude-subscription');
  await assert.rejects(subscriptionMessage(body, { identify: async () => ({}), prepare: async () => [], run: async () => ({ result: '{"type":"tool_use","name":"Bash","input":{}}' }) }), /Invalid subscription tool/);
});
test('the 5.5 model ids reach the CLI as their own family alias: opus and sonnet', async () => {
  const seen = [];
  for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5']) {
    await subscriptionMessage({ model, messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'journey_path' }] }, { identify: async () => ({}), prepare: async () => [], run: async args => {
      seen.push(args[args.indexOf('--model') + 1]);
      return { result: JSON.stringify({ type: 'tool_use', name: 'journey_path', input: {} }) };
    } });
  }
  assert.deepEqual(seen, ['opus', 'sonnet']);
});
test('offline or unverified subscription transport never reaches an API endpoint', async () => {
  let calls = 0; const original = globalThis.fetch;
  globalThis.fetch = async url => { calls++; assert.equal(url.hostname, 'bridge.example'); return Response.json({ content: [] }); };
  try {
    await assert.rejects(subscriptionTransport({ ANTHROPIC_API_KEY: 'exists-but-forbidden' }, {}, null), /fallback is disabled/);
    assert.equal(calls, 0);
    await assert.rejects(subscriptionTransport({ SUBSCRIPTION_BRIDGE_URL: 'https://bridge.example', SUBSCRIPTION_BRIDGE_TOKEN: 'test' }, {}, null), /Unverified/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('native PDF input contains verified bytes, rejects arbitrary asset hosts', async () => {
  const blocks = await prepareMessages([{ type: 'document', source: { type: 'url', url: 'https://arxiv.org/pdf/1506.02640' } }], async () => new Response('%PDF-test'));
  assert.equal(blocks.find(b => b.type === 'document').source.type, 'base64');
  await assert.rejects(prepareMessages([{ type: 'document', source: { type: 'url', url: 'https://evil.example/file' } }]), /Unsupported/);
});
test('bridge rejects unauthenticated requests without invoking Claude', async t => {
  let calls = 0;
  const server = createSubscriptionBridge({ token: 't'.repeat(40), generate: async () => { calls++; return {}; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/messages`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 401); assert.equal(calls, 0);
});
// A CLI reply that does not parse keeps its evidence: the 503 carries the diagnostic (raw text, parser error, the caller's
// stage), never the token; SMALL_SUBSCRIPTION_DIAG_FILE also gets the line.
test('an unparseable CLI reply answers 503 with a diagnostic and no credential; the diagnostic file gets one line', async t => {
  const token = 'k'.repeat(40), text = 'Here is the revised path you asked for, s3 is now skipped.';
  const run = async () => ({ type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: text });
  const stub = { identify: async () => ({}), prepare: async () => [], run };
  const server = createSubscriptionBridge({ token, generate: (body, options) => subscriptionMessage(body, { ...options, ...stub, diagFile: null }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/messages`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Corpus-Run': '2026-10-06T02-34-50-790Z', 'X-Corpus-Stage': 'adapt_edit', 'X-Corpus-Role': 'journey_adapt<script>' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', system: 'SYSTEM PROMPT', messages: [{ role: 'user', content: 'input = {}' }], tools: [{ name: 'journey_adapt' }] }) });
  const raw = await response.text(), body = JSON.parse(raw);
  assert.equal(response.status, 503);
  assert.equal(body.error, 'Invalid subscription model response');
  assert.equal(body.diagnostic.raw_text, text);
  assert.match(body.diagnostic.parser_error, /JSON/);
  assert.deepEqual([body.diagnostic.run_id, body.diagnostic.stage, body.diagnostic.role, body.diagnostic.model_alias], ['2026-10-06T02-34-50-790Z', 'adapt_edit', 'journey_adaptscript', 'sonnet']);
  assert.deepEqual(body.diagnostic.termination, { subtype: 'success', stop_reason: 'end_turn', is_error: false });
  assert.ok(!raw.includes(token) && !raw.includes('SYSTEM PROMPT') && !raw.includes('input = {}'), 'no token, system prompt or request body in the reply');
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'bridge-diag-')), file = join(dir, 'diag.jsonl'), saved = process.env.SMALL_SUBSCRIPTION_DIAG_FILE;
  t.after(() => { if (saved === undefined) delete process.env.SMALL_SUBSCRIPTION_DIAG_FILE; else process.env.SMALL_SUBSCRIPTION_DIAG_FILE = saved; rmSync(dir, { recursive: true, force: true }); });
  process.env.SMALL_SUBSCRIPTION_DIAG_FILE = file;
  await assert.rejects(subscriptionMessage({ messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'journey_adapt' }] }, stub), /Invalid subscription model response/);
  const lines = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].raw_text, text);
});

// Owner Option 1 (2026-10-06): a native-style <invoke> tool call, when the reply is not JSON, is decoded generically by
// the named tool's input_schema into the tool_use the JSON path would give; the usual checks and the product validators
// still decide. Every deviation is a 503 diagnostic naming the decoder rule.
const cliReply = text => ({ identify: async () => ({}), prepare: async () => [], diagFile: null, run: async () => ({ type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: text }) });
const askWith = (tools, text, tool_choice = { type: 'auto' }) => subscriptionMessage({ model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: 'x' }], tools, tool_choice }, cliReply(text));
const isObject = v => v != null && typeof v === 'object' && !Array.isArray(v);
const evidence = name => readText(new URL(`../../../docs/features/adaptive-learning-path-v1-evidence/live-corpus-2026-10-05/${name}`, import.meta.url), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const REVIEW = { name: 'schedule_review', description: 'A generic second tool.', input_schema: { type: 'object', properties: { title: { type: 'string' }, minutes: { type: 'integer' }, tags: { type: 'array' } }, required: ['title', 'minutes'] } };
const FLAG = { name: 'set_flag', input_schema: { type: 'object', properties: { config: { type: 'object' }, enabled: { type: 'boolean' } }, required: ['config', 'enabled'] } };
const invoke = (name, params) => `<invoke name="${name}">\n${params.map(([key, value]) => `<parameter name="${key}">${value}</parameter>`).join('\n')}\n</invoke>`;

test('the preserved journey_adapt invoke reply decodes into a tool_use and reaches the product validator, which accepts it', async () => {
  const [kept] = evidence('subscription-resume-bridge-diagnostic.jsonl');
  const reply = await askWith([JOURNEY_TOOLS.journey_adapt], kept.raw_text), call = reply.content[0];
  assert.deepEqual([call.type, call.name, reply.stop_reason, reply.billing], ['tool_use', 'journey_adapt', 'tool_use', 'claude-subscription']);
  assert.ok(isObject(call.input.path) && isObject(call.input.concepts_added));
  assert.equal(call.input.ambiguous, false);
  // The same prev and registry the corpus runner built for that stage (e2e/journey-corpus-run.mjs: the photosynthesis
  // diagnostic from the API rerun, the path from the subscription run, section 1 completed and section 2 current).
  const output = (file, stage) => evidence(file).filter(r => r.kind === 'step' && r.subject === 'photosynthesis' && r.step === stage && r.output).at(-1).output;
  const diagnostic = output('rerun-calls-and-stages.jsonl', 'diagnostic'), drafted = output('subscription-targeted-calls-and-stages.jsonl', 'path');
  const registry = { concepts: { ...drafted.concepts_added.concepts, ...diagnostic.registry.concepts }, claims: { ...drafted.concepts_added.claims, ...diagnostic.registry.claims } };
  const prev = { ...drafted.path, version: 2, current_section_id: drafted.path.sections[1].id, change: { source: 'learner_edit', reason: 'section 1 completed', evidence_refs: [], sections_changed: [] },
    sections: drafted.path.sections.map((s, i) => (i === 0 ? { ...s, status: 'completed', generation_state: 'generated', heading_block_id: 'corpus-s1-heading' } : i === 1 ? { ...s, status: 'current' } : s)) };
  const verdict = pathOutput(call.input, { prev, registry, source: 'learner_edit', evidence_refs: [] });
  assert.deepEqual(verdict.errors, undefined);
  assert.deepEqual(verdict.value.path.sections.map(s => `${s.id}:${s.status}`), ['s1:completed', 's2:current', 's3:upcoming', 's4:upcoming', 's6:upcoming']);
});

test('invoke decoding is generic: another tool with string, integer and array parameters; object and boolean keep their types', async () => {
  const review = (await askWith([REVIEW], invoke('schedule_review', [['title', '  Weekly recap  '], ['minutes', '25'], ['tags', '["a", "b"]']]))).content[0];
  assert.deepEqual([review.name, review.input], ['schedule_review', { title: 'Weekly recap', minutes: 25, tags: ['a', 'b'] }]);
  const flag = (await askWith([REVIEW, FLAG], `\n  ${invoke('set_flag', [['config', '{"depth": 2, "mode": "quick"}'], ['enabled', 'true']])}  \n`)).content[0];
  assert.deepEqual(flag.input, { config: { depth: 2, mode: 'quick' }, enabled: true });
  // A decoded call still goes through the existing checks: here the tool_choice names another tool.
  await assert.rejects(askWith([REVIEW, FLAG], invoke('set_flag', [['config', '{}'], ['enabled', 'false']]), { type: 'tool', name: 'schedule_review' }), /Invalid subscription tool choice/);
});

test('invoke decoding is strict: each deviation is refused with a diagnostic that keeps the raw reply and names the rule', async () => {
  const cases = [
    ['duplicate parameter', invoke('schedule_review', [['title', 'A'], ['title', 'B'], ['minutes', '5']]), /duplicate parameter title/],
    ['wrong tool name', invoke('drop_table', [['title', 'A'], ['minutes', '5']]), /unknown tool drop_table/],
    ['malformed parameter JSON', invoke('schedule_review', [['title', 'A'], ['minutes', '5'], ['tags', '["a",']]), /parameter tags: malformed JSON/],
    ['prose plus an invoke', `Sure, here is the call:\n${invoke('schedule_review', [['title', 'A'], ['minutes', '5']])}`, /does not start with <invoke>/],
    ['multiple invokes', `${invoke('schedule_review', [['title', 'A'], ['minutes', '5']])}\n${invoke('schedule_review', [['title', 'B'], ['minutes', '6']])}`, /more than one <invoke>/],
    ['missing required parameter', invoke('schedule_review', [['title', 'A']]), /missing required parameter minutes/],
    ['unclosed parameter', '<invoke name="schedule_review">\n<parameter name="title">A\n</invoke>', /parameter title is not closed/],
    ['nested invoke', '<invoke name="schedule_review"><invoke name="schedule_review"></invoke></invoke>', /nested <invoke>/],
    ['text between parameters', '<invoke name="schedule_review">\n<parameter name="title">A</parameter>\nand also\n<parameter name="minutes">5</parameter>\n</invoke>', /text outside a <parameter>/],
    ['missing invoke name', '<invoke>\n<parameter name="title">A</parameter>\n</invoke>', /has no name/],
    ['a code fence', `\`\`\`xml\n${invoke('schedule_review', [['title', 'A'], ['minutes', '5']])}\n\`\`\``, /does not start with <invoke>/],
    ['an integer that is not one', invoke('schedule_review', [['title', 'A'], ['minutes', '2.5']]), /minutes: not an integer/],
  ];
  for (const [label, text, rule] of cases) {
    const error = await askWith([REVIEW], text).then(() => null, e => e);
    assert.equal(error?.message, 'Invalid subscription model response', label);
    assert.equal(error.diagnostic.raw_text, text, label);
    assert.match(error.diagnostic.parser_error, rule, label);
  }
});

// models-3: every course action that calls a model is refused in subscription
// mode; revise_section used to fall through to live small-cp's paid API.
test('subscription mode refuses the course model actions, including revise_section, and the dev worker asks the helper', async () => {
  const { subscriptionCourseRefusal } = await import('../src/subscription-transport.js');
  for (const action of ['draft', 'generate', 'revise_section']) {
    const refused = subscriptionCourseRefusal({ SUBSCRIPTION_ONLY: 'true' }, action);
    assert.equal(refused?.status, 503, action);
    assert.equal(subscriptionCourseRefusal({ SUBSCRIPTION_ONLY: 'false' }, action), null, action);
  }
  for (const action of ['brief', 'save', 'approve', 'delete', undefined]) assert.equal(subscriptionCourseRefusal({ SUBSCRIPTION_ONLY: 'true' }, action), null, String(action));
  const { readFileSync } = await import('node:fs');
  const worker = readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8');
  const gate = worker.slice(worker.indexOf('(await req.clone().json()).action'));
  assert.ok(gate.indexOf('subscriptionCourseRefusal(env, action)') > 0 && gate.indexOf('subscriptionCourseRefusal(env, action)') < gate.indexOf("['/api/learn/ask', '/api/learn/selection']"));
});
