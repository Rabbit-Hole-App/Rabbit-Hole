import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subscriptionEnvironment, subscriptionIdentity, subscriptionMessage, createSubscriptionBridge, prepareMessages, runWithDeadline } from '../../../scripts/learn-subscription-bridge.mjs';
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

test('invoke decoding: a look-alike tag such as <invokes> is refused cleanly by the start rule, and a long parameter name is cut in the error', async () => {
  const { decodeInvoke } = await import('../../../scripts/learn-subscription-bridge.mjs');
  const tools = [{ name: 't', input_schema: { properties: { a: { type: 'string' } } } }];
  assert.throws(() => decodeInvoke('<invokes>x</invoke>', tools), /does not start with <invoke>/);
  const long = 'k'.repeat(200);
  assert.throws(() => decodeInvoke(`<invoke name="t"><parameter name="${long}">x</parameter></invoke>`, tools),
    e => e.message.includes('k'.repeat(80)) && !e.message.includes('k'.repeat(81)));
});

test('inline image bytes reach the CLI as image blocks, never as text; long runs opt into a deadline and an output cap', async () => {
  const png = Buffer.from('fake-png').toString('base64');
  const blocks = await prepareMessages([{ role: 'user', content: [{ type: 'text', text: 'frame 0' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }] }]);
  assert.equal(blocks[0].type, 'text');
  assert.ok(!blocks[0].text.includes(png), 'the bytes are not inlined into the JSON text');
  assert.deepEqual(blocks.slice(1), [{ type: 'text', text: 'Asset 1: inline image' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }]);
  await assert.rejects(prepareMessages([{ type: 'image', source: { type: 'base64', media_type: 'text/html', data: png } }]), /Invalid inline asset/);
  const seen = [];
  const run = async (args, input, timeout, extraEnv) => { seen.push([timeout, extraEnv]); return { result: '{"type":"text","text":"ok"}' }; };
  await subscriptionMessage({ messages: [{ role: 'user', content: 'x' }] }, { identify: async () => ({}), prepare: async () => [], run });
  await subscriptionMessage({ messages: [{ role: 'user', content: 'x' }] }, { identify: async () => ({}), prepare: async () => [], run, timeout: 900000, maxOutputTokens: 64000 });
  assert.deepEqual(seen, [[180000, {}], [900000, { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000' }]], 'Learn keeps its defaults');
  let prompt = '';
  await subscriptionMessage({ system: [{ type: 'text', text: 'You are the Motion Director.', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'x' }] }, { identify: async () => ({}), prepare: async () => [], run: async args => { prompt = args[args.indexOf('--system-prompt') + 1]; return { result: '{"type":"text","text":"ok"}' }; } });
  assert.ok(prompt.startsWith('You are the Motion Director.'), 'block system prompts arrive as text, not [object Object]');
});

// kill(pid, 0) also succeeds for an unreaped Linux zombie. Such a process cannot run;
// distinguish that state without hiding permission errors or a broken /proc probe.
function processRunning(pid, { platform = process.platform, signal = process.kill, readStat = readFileSync } = {}) {
  try { signal(pid, 0); } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  if (platform !== 'linux') return true;
  let stat;
  try { stat = readStat(`/proc/${pid}/stat`, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  // comm is parenthesized and may itself contain spaces and parentheses.
  const match = stat.match(/^\d+ \(.*\) ([A-Z]) /s);
  if (!match) throw new Error(`Invalid process state for pid ${pid}`);
  return match[1] !== 'Z' && match[1] !== 'X';
}

test('deadline liveness distinguishes Linux zombies from running descendants and fails on probe errors', () => {
  const probe = state => ({ platform: 'linux', signal: () => {}, readStat: () => `123 (node (child)) ${state} 1 2 3` });
  assert.equal(processRunning(123, probe('S')), true);
  assert.equal(processRunning(123, probe('R')), true);
  assert.equal(processRunning(123, probe('Z')), false, 'a zombie exists but cannot execute');
  assert.equal(processRunning(123, probe('X')), false);
  const error = code => Object.assign(new Error(code), { code });
  assert.equal(processRunning(123, { ...probe('S'), signal: () => { throw error('ESRCH'); } }), false);
  assert.equal(processRunning(123, { ...probe('S'), readStat: () => { throw error('ENOENT'); } }), false);
  assert.throws(() => processRunning(123, { ...probe('S'), signal: () => { throw error('EPERM'); } }), /EPERM/);
  assert.throws(() => processRunning(123, { ...probe('S'), readStat: () => { throw error('EACCES'); } }), /EACCES/);
  assert.throws(() => processRunning(123, { ...probe('S'), readStat: () => 'invalid' }), /process state/);
  assert.equal(processRunning(123, { platform: 'win32', signal: () => {}, readStat: () => { throw error('unexpected'); } }), true);
});

// Motion M7A Run A (2026-10-06): a 15 min CLI deadline returned after 61.5 min on Windows. A kill of
// the parent alone leaves its descendants running (a detached one escapes Node's Windows job object; on
// POSIX any child outlives a SIGTERM to its parent). The deadline kills the tree and returns at once.
test('a deadline kills the whole process tree and returns at the deadline', { timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deadline-tree-'));
  const detached = process.platform === 'win32';
  const tree = pidFile => ['-e', `const { spawn } = require('node:child_process'); const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'inherit', detached: ${detached} }); require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setTimeout(() => {}, 20000);`];
  const alive = processRunning;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pidOf = async file => { for (let i = 0; i < 100 && !existsSync(file); i++) await sleep(50); return Number(readFileSync(file, 'utf8')); };

  // The deadline leaves a fresh node process time to start and spawn its child first: under a loaded make test-unit a
  // start took over 1 s, the 1000 ms kill landed before the pid file was written, and the test failed on ENOENT (2026-10-09).
  // The kill-latency and return bounds below are the same 500 ms and 1 s margins as before.
  const DEADLINE = 4000;
  // The old mechanism: execFile's own timeout kills the parent only; the grandchild keeps running.
  await new Promise(done => execFile(process.execPath, tree(join(dir, 'old.pid')), { timeout: DEADLINE, windowsHide: true }, () => done()));
  const orphan = await pidOf(join(dir, 'old.pid'));
  await sleep(300);
  assert.equal(alive(orphan), true, 'a parent-only kill leaves the grandchild running');
  process.kill(orphan);

  const t0 = Date.now();
  const error = await runWithDeadline(process.execPath, tree(join(dir, 'new.pid')), { timeout: DEADLINE }).then(() => null, e => e);
  const returned = Date.now() - t0;
  assert.equal(error?.code, 'ETIMEDOUT');
  assert.deepEqual([error.deadline_ms, error.reason], [DEADLINE, 'deadline: process tree killed']);
  assert.ok(error.elapsed_ms >= DEADLINE && error.elapsed_ms < DEADLINE + 500, `terminated after ${error.elapsed_ms} ms`);
  assert.ok(returned < DEADLINE + 1000, `returned after ${returned} ms, near the ${DEADLINE} ms deadline`);
  assert.match(error.message, new RegExp(`deadline ${DEADLINE} ms, process tree terminated after \\d+ ms`));
  const grandchild = await pidOf(join(dir, 'new.pid'));
  for (let i = 0; i < 100 && alive(grandchild); i++) await sleep(50);
  assert.equal(alive(grandchild), false, 'the grandchild died with the tree');
});
