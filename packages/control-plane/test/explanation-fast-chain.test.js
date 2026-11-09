// The fast chain of the written /explain (explanation-fast-chain.js, owner 2026-11-08): a fireworks-* profile falls back to Gemini only (Cerebras is never a
// fallback step, owner 2026-11-08); a cerebras-* profile, chosen on its own, falls back to Fireworks then Gemini. EXPLANATION_FALLBACK=off for benchmarks. Offline: global fetch is a provider double, and the spend ledger is the real
// one on node:sqlite (the credits-provider-failure.test.js wrapper). No provider is contacted, nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { EXPLANATION_PROFILE_SETTING, EXPLANATION_REGISTRY, explanationProfileBinding, explanationProfileFor, resolveExplanationProfile } from '../src/explanation-models.js';
import { CHAIN_ENDPOINTS, FALLBACK_SETTING, forGemini, stepRequest, withoutBounds } from '../src/explanation-fast-chain.js';
import { ARTIFACT_SYSTEM, generateArtifact, prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { explanationSystem } from '../src/agents/learn-artifact.js';
import { CORE_KINDS } from '../src/explanation-references.js';
import { MATH_FORMAT } from '../src/agents/math-format.js';
import { EXPLANATION_GUIDANCE, artifactBlock, explanationProblem, settleExplanationBody } from '../src/learn-primitives.js';
import { explanationTarget } from '../src/chat-depth.js';
import { INTERACTION_GUIDANCE, INTERACTIONS_SETTING } from '../src/explanation-interactions.js';
import { requestSpendBound } from '../src/learn-spend.js';
import { noteUsageIdentity, toMicros, withUsage } from '../src/learn-usage.js';
import { withVisual } from './explanation-layout-fixture.js';

const URL_OF = { fireworks: CHAIN_ENDPOINTS.fireworks.url, cerebras: CHAIN_ENDPOINTS.cerebras.url, google: CHAIN_ENDPOINTS.google.url };
const FW = 'accounts/fireworks/models/gpt-oss-120b';
const KEYS = { FIREWORKS_API_KEY: 'fw-synthetic', CEREBRAS_API_KEY: 'csk-synthetic', GEMINI_API_KEY: 'gm-synthetic' };
const card = { title: 'Why coffee cools', body: withVisual('A hot cup loses heat faster because the gap to the room is larger.', { after: 'As the coffee nears room temperature the gap shrinks and cooling slows.' }) };
const long = { title: 'Why coffee cools', body: 'Heat leaves the cup. '.repeat(120).trim() };
const ok = (content, { model = null, usage = { prompt_tokens: 1000, completion_tokens: 2000 }, finish = 'stop' } = {}) => ({ ok: true, content, model, usage, finish });
const status = code => ({ status: code });
const hang = { hang: true };
// Replaces global fetch for one test: every call is recorded with its provider; answers are given in order (the last one repeats).
function providers(t, ...answers) {
  const sent = [], original = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    const provider = Object.keys(URL_OF).find(k => URL_OF[k] === url) ?? url;
    const body = JSON.parse(init.body);
    sent.push({ provider, url, init, body });
    const a = answers[Math.min(sent.length, answers.length) - 1];
    if (a.hang) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    if (!a.ok) return Promise.resolve(Response.json({ message: 'synthetic failure' }, { status: a.status }));
    return Promise.resolve(Response.json({ model: a.model ?? body.model, choices: [{ finish_reason: a.finish, message: { role: 'assistant', content: typeof a.content === 'string' ? a.content : JSON.stringify(a.content) } }], usage: a.usage }));
  };
  t.after(() => { globalThis.fetch = original; });
  return sent;
}
const quiet = t => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; t.after(() => { console.log = log; console.warn = warn; }); };
const offline = (profile, extra = {}) => ({ SMALL_ENV: 'test', [EXPLANATION_PROFILE_SETTING]: profile, ...KEYS, ANTHROPIC_API_KEY: 'sk-ant-must-not-be-used', ...extra });
const ask = (env, args = 'Why does coffee cool faster at first?', extra = {}) => generateArtifact(env, { command: 'explanation', args, ...extra });
const steps = out => out.attempts.map(a => [a.provider, a.outcome]);

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
function d1(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql']) sqlite.exec(sql(file));
  const turn = () => new Promise(resolve => setImmediate(resolve));
  const LEARN_DB = {
    prepare(text) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        first: async () => { await turn(); return sqlite.prepare(text).get(...args) || null; },
        all: async () => { await turn(); return { results: sqlite.prepare(text).all(...args) }; },
        run: async () => { await turn(); return { meta: { changes: sqlite.prepare(text).run(...args).changes } }; },
        now: () => ({ meta: { changes: sqlite.prepare(text).run(...args).changes } }),
      };
    },
    async batch(statements) {
      await turn(); sqlite.exec('BEGIN');
      try { const out = statements.map(statement => statement.now()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { sqlite, LEARN_DB };
}
const metered = (LEARN_DB, profile) => {
  const env = withUsage({ ...offline(profile), SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '1000', AI_MONTHLY_ALLOWANCE_USD: '25' }, { feature: 'learn', now: Math.floor(Date.parse('2026-11-08T12:00:00Z') / 1000) });
  noteUsageIdentity(env, { userId: 'u-fast', email: 'u-fast@example.test' });
  return env;
};
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));

test('profiles: fireworks-* chains Gemini only, cerebras-* chains Fireworks then Gemini; plan-default stays the default', async () => {
  assert.equal(EXPLANATION_REGISTRY.defaultProfile, 'plan-default');
  assert.equal(explanationProfileFor({}).id, 'plan-default', 'production is unchanged until the setting names another profile');
  const hashes = new Set();
  for (const [primary, model, fallbacks] of [['fireworks', FW, ['google']], ['cerebras', 'gpt-oss-120b', ['fireworks', 'google']]]) for (const effort of ['low', 'medium', 'high']) {
    const p = explanationProfileFor({ [EXPLANATION_PROFILE_SETTING]: `${primary}-${effort}`, ...KEYS });
    const a = p.roles.author;
    assert.deepEqual([a.adapter, a.provider, a.model, a.settings.reasoning_effort], ['fast-chain', primary, model, effort]);
    assert.deepEqual(a.fallbacks.map(s => s.provider), fallbacks, 'no fireworks-* step calls Cerebras');
    assert.deepEqual(a.fallbacks.map(s => s.credentialRef), fallbacks.map(p => ({ fireworks: 'FIREWORKS_API_KEY', google: 'GEMINI_API_KEY' })[p]));
    assert.equal(a.maxOutputTokens, { low: 3000, medium: 5000, high: 8000 }[effort], 'a tight output cap per effort');
    assert.deepEqual({ ...p.roles.repair, role: 'author' }, a, 'each step repairs on itself');
    hashes.add((await explanationProfileBinding(p)).hash);
  }
  assert.equal(hashes.size, 6, 'each provider and effort is its own binding');
  assert.throws(() => resolveExplanationProfile('fireworks-max'), e => e.code === 'unknown_profile');
  const author = EXPLANATION_REGISTRY.profiles['fireworks-low'].roles.author;
  const registry = (roles) => ({ ...EXPLANATION_REGISTRY, profiles: { ...EXPLANATION_REGISTRY.profiles, x: { version: 1, roles } } });
  for (const extra of [{ settings: { reasoning_effort: 'none' } }, { endpoint: 'https://evil.example/v1' }, { fallbacks: [{ ...author.fallbacks[0], url: 'https://evil.example' }] }, { fallbacks: [{ provider: 'openai', model: 'gpt', credentialRef: 'OPENAI_API_KEY' }] }])
    assert.throws(() => resolveExplanationProfile('x', registry({ author: { ...author, ...extra } })), e => e.code === 'invalid_profile', JSON.stringify(extra));
  assert.throws(() => resolveExplanationProfile('x', registry({ author, repair: EXPLANATION_REGISTRY.profiles['plan-default'].roles.author })), e => e.code === 'invalid_profile', 'no other repair role');
});

test('credentials: a chain with no step credential is refused before anything is sent; a missing step credential is skipped', async t => {
  quiet(t);
  const sent = providers(t, ok(card));
  const none = { FIREWORKS_API_KEY: '', CEREBRAS_API_KEY: '', GEMINI_API_KEY: '' };
  assert.throws(() => explanationProfileFor({ [EXPLANATION_PROFILE_SETTING]: 'fireworks-low' }), e => e.code === 'credential_missing' && !/API_KEY/.test(e.message));
  const refused = await ask(offline('fireworks-low', none));
  assert.equal(refused.result, 'unsupported');
  assert.match(refused.message, /not set up/);
  assert.equal(sent.length, 0);
  // FIREWORKS_API_KEY not set: the fireworks-* profile goes straight to Gemini.
  const out = await ask(offline('fireworks-low', { FIREWORKS_API_KEY: '' }));
  assert.equal(out.result, 'artifact');
  assert.deepEqual(steps(out), [['fireworks', 'skipped'], ['google', 'artifact']]);
  assert.deepEqual(sent.map(s => s.provider), ['google']);
  assert.deepEqual(out.block.authoredBy, { provider: 'google', model: 'gemini-3.5-flash-lite' });
});

test('the request: provider endpoint and key, model, reasoning_effort, strict json_schema of the make_explanation input, and the same guidance, request, Depth and required visuals', async t => {
  const sent = providers(t, ok(card));
  const input = { depth: 'detailed', visualRequirements: { items: [{ id: 'v1', kind: 'diagram', diagramKind: 'flow', purpose: 'show the cooling' }] } };
  await generateArtifact(offline('fireworks-high'), { command: 'explanation', args: 'Draw a diagram of why coffee cools', ...input }, { repairs: 0 }).catch(() => null); // validity is not under test here
  const [{ provider, init, body }] = sent;
  assert.equal(provider, 'fireworks');
  assert.equal(init.headers.Authorization, `Bearer ${KEYS.FIREWORKS_API_KEY}`);
  assert.deepEqual([body.model, body.reasoning_effort, body.stream, body.max_tokens], [FW, 'high', true, 8000], 'streamed by default (fix 3)');
  assert.equal(body.stream_options, undefined, 'Fireworks sends its usage chunk by default');
  assert.deepEqual([body.response_format.type, body.response_format.json_schema.strict, body.response_format.json_schema.name], ['json_schema', true, 'make_explanation']);
  const schema = body.response_format.json_schema.schema;
  assert.deepEqual(schema.required, ['title', 'visuals', 'body']);
  assert.deepEqual(Object.keys(schema.properties), ['title', 'visuals', 'body'], 'visuals before body, so pictures can start while the body streams');
  assert.ok(!JSON.stringify(schema).includes('"oneOf"'), 'every exclusive oneOf (the visual kinds, the diagram kinds) is sent as anyOf');
  assert.deepEqual(schema.properties.visuals.items.anyOf.map(b => b.properties.k.const), ['diagram', 'picture']);
  const [system, user] = body.messages;
  for (const text of [EXPLANATION_GUIDANCE, explanationTarget('detailed')]) assert.ok(system.content.includes(text), 'the tool description is sent verbatim');
  assert.ok(!system.content.includes(INTERACTION_GUIDANCE), 'interactions off: no interaction guidance');
  const asked = JSON.parse(user.content);
  assert.deepEqual([asked.learnerText, asked.depth, asked.requiredVisuals[0].id], ['Draw a diagram of why coffee cools', 'detailed', 'v1']);
  assert.ok(!('tools' in body) && !('tool_choice' in body), 'json_schema mode, no tool call');
  // Interactions on: the guidance and the questions/terms fields ride in the same one call; a Cerebras profile sends to Cerebras with its key.
  const on = providers(t, ok(card));
  await generateArtifact(offline('cerebras-low', { [INTERACTIONS_SETTING]: 'true' }), { command: 'explanation', args: 'q' }, { repairs: 0 }).catch(() => null);
  assert.deepEqual([on[0].provider, on[0].init.headers.Authorization, on[0].body.model, on[0].body.reasoning_effort], ['cerebras', `Bearer ${KEYS.CEREBRAS_API_KEY}`, 'gpt-oss-120b', 'low']);
  assert.ok(on[0].body.messages[0].content.includes(INTERACTION_GUIDANCE));
  assert.ok(on[0].body.response_format.json_schema.schema.required.includes('questions'));
});

// Owner 2026-11-08 (A1-A3): "\frac" in a plain JS string was a form feed, so the model read "$rac{a}{b}$"; the json_schema chain has no tools, so it gets no
// tool paragraph and no line asking for fences in the body. Built offline as it would be sent; nothing is sent.
test('the system prompt as sent: LaTeX spelled out, no control character but newline, no tool paragraph on the fast chain, the tool paragraph kept on the tool route', () => {
  const args = { command: 'explanation', args: 'Why does the sky look blue?' }; // an unmatched question: the attention question selects a reference, and the tool route is then not ARTIFACT_SYSTEM alone
  const fast = prepareArtifactAuthorRequest(offline('fireworks-low', { [INTERACTIONS_SETTING]: 'true' }), args);
  const sent = stepRequest({ provider: 'fireworks', model: FW }, 'low', fast.body).messages[0].content;
  const tools = prepareArtifactAuthorRequest({}, args).body;
  const toolText = `${tools.system}\n${tools.tools.map(t => t.description).join('\n')}`;
  for (const text of [MATH_FORMAT, sent, toolText]) {
    assert.ok(text.includes(String.raw`$\frac{a}{b}$`), 'the LaTeX example is spelled out');
    assert.equal(/[\x00-\x09\x0b-\x1f]/.test(text), false, 'no control character other than a newline');
  }
  const TOOL_PARAGRAPH = ['Call exactly one tool', 'make_animation', 'ask_clarifying_question', 'Choose the primitive'];
  for (const s of TOOL_PARAGRAPH) {
    assert.equal(sent.includes(s), false, `fast chain: ${s}`);
    assert.ok(tools.system.includes(s), `tool route: ${s}`);
  }
  assert.equal(sent.includes('fenced block'), false, 'no fence request (visuals are schema fields)');
  assert.ok(sent.includes('reply with exactly one JSON object, the make_explanation input described above, matching the response schema.'));
  const google = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', fast.body).messages[0].content;
  assert.equal(google, sent, 'the Gemini step sends the same system text');
  assert.equal(tools.system, explanationSystem('tools'), 'the tool route: the Explanation system head (no maths or number rule: they sit in the tool description)');
});

test('an exclusive oneOf is sent as anyOf; a non-exclusive one is refused, not weakened; text documents are inlined, images and PDFs refused', () => {
  const step = { provider: 'cerebras', model: 'gpt-oss-120b', credentialRef: 'CEREBRAS_API_KEY' };
  const branch = kind => ({ type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: kind } } });
  const body = schema => ({ max_tokens: 100, system: 's', messages: [{ role: 'user', content: 'q' }], tools: [{ name: 'make_explanation', description: 'd', input_schema: { type: 'object', properties: { v: schema } } }] });
  const sentSchema = stepRequest(step, 'low', body({ oneOf: [branch('a'), branch('b')] })).response_format.json_schema.schema;
  assert.deepEqual(sentSchema.properties.v, { anyOf: [branch('a'), branch('b')] });
  assert.throws(() => stepRequest(step, 'low', body({ oneOf: [{ type: 'string' }, { type: 'number' }] })), e => e.code === 'schema_not_exclusive');
  const withPart = part => ({ ...body({ type: 'string' }), messages: [{ role: 'user', content: [part, { type: 'text', text: 'q' }] }] });
  assert.match(stepRequest(step, 'low', withPart({ type: 'document', title: 'notes.txt', source: { type: 'text', media_type: 'text/plain', data: 'Heat flows.' } })).messages[1].content, /<document title="notes.txt">\nHeat flows.\n<\/document>/);
  for (const part of [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'AA' } }])
    assert.throws(() => stepRequest(step, 'low', withPart(part)), e => e.final && /text only/.test(e.message));
});

// Gemini stand-in. Bisected against the real endpoint 2026-11-08: the fallback request was refused with HTTP 400 INVALID_ARGUMENT ("Request contains an
// invalid argument.") while its response schema held any maxItems (Gemini's state-machine limit, https://aistudio.google.com/docs/structured-output), and
// accepted once they were dropped. The stand-in refuses that shape the way Gemini did, so the fallback path runs in CI.
const hasMaxItems = o => (Array.isArray(o) ? o.some(hasMaxItems) : !!o && typeof o === 'object' && Object.entries(o).some(([k, v]) => (k === 'maxItems' && typeof v === 'number') || hasMaxItems(v)));
// Phase 02 (2026-11-08, real calls): Gemini also refused the schema by its structure, accepted at 362 properties and refused at 368, so the stand-in refuses past 362.
const propertyCount = o => (Array.isArray(o) ? o.reduce((n, s) => n + propertyCount(s), 0) : o && typeof o === 'object'
  ? Object.entries(o).reduce((n, [k, v]) => n + (k === 'properties' && v && typeof v === 'object' ? Object.keys(v).length + Object.values(v).reduce((m, s) => m + propertyCount(s), 0) : propertyCount(v)), 0) : 0);
const geminiRefuses = body => body.model !== 'gemini-3.5-flash-lite' || body.response_format?.type !== 'json_schema' || hasMaxItems(body.response_format.json_schema?.schema) || propertyCount(body.response_format.json_schema?.schema) > 362;
const diagramOf = body => body.response_format.json_schema.schema.properties.visuals.items.anyOf.find(v => v.properties.spec).properties.spec.properties.diagram;
const GEMINI_400 = { error: { code: 400, message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } };
const GEMINI_FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/explanation-gemini-request.json', import.meta.url), 'utf8'));
const shapeOf = ({ messages, ...rest }) => rest;

test('the Gemini step request: array and numeric bounds dropped from its schema only (pinned against the request Gemini refused on 2026-11-08); Fireworks keeps them', async t => {
  assert.ok(geminiRefuses(GEMINI_FIXTURE.rejected), 'the stand-in refuses the request Gemini refused');
  assert.ok(!geminiRefuses(GEMINI_FIXTURE.sent), 'and accepts the one Gemini accepted');
  assert.deepEqual(withoutBounds(GEMINI_FIXTURE.rejected.response_format), GEMINI_FIXTURE.sent.response_format, 'the transform turns the refused schema into the accepted one');
  const sent = providers(t, ok(card));
  quiet(t);
  await ask(offline('fireworks-low', { FIREWORKS_API_KEY: '' }), 'how does the human heart pump blood?', {}).catch(() => null);
  await ask(offline('fireworks-low', { GEMINI_API_KEY: '' }), 'how does the human heart pump blood?', {}).catch(() => null);
  const [gemini, fireworks] = sent.map(s => s.body);
  assert.deepEqual(sent.map(s => s.provider), ['google', 'fireworks']);
  // Keep the recorded request intact. Phase 02 (2026-11-08) replaced the diagram union, so it is compared with the reduction below; the rest keeps the recorded shape.
  const expected = structuredClone(GEMINI_FIXTURE.sent), actual = structuredClone(shapeOf(gemini));
  delete diagramOf(expected).anyOf; delete diagramOf(actual).anyOf;
  delete expected.temperature; // owner 2026-11-08: the Gemini author call takes the provider default temperature (no temperature, no seed sent)
  assert.deepEqual(actual, expected, 'outside the diagram union the Gemini request must match the recorded shape plus the author temperature');
  assert.ok(hasMaxItems(fireworks.response_format.json_schema.schema), 'the Fireworks step still sends the bounded schema');
  // Owner A1 (2026-11-08): a fast-chain request with no steering carries the CORE bundle, list forms only.
  const kindsOf = body => diagramOf(body).anyOf.map(branch => branch.properties.kind.const).sort();
  assert.deepEqual(kindsOf(fireworks), [...CORE_KINDS].sort());
  assert.ok(!JSON.stringify(fireworks.response_format).includes('"panels"'));
  assert.deepEqual(forGemini(withoutBounds(fireworks.response_format)), gemini.response_format, 'bounds are the only difference for the core bundle');
  // The largest bundle (every flag) is the whole schema: refused by Gemini without forGemini, accepted with it.
  const full = prepareArtifactAuthorRequest({ SMALL_ENV: 'test' }, { command: 'explanation', args: 'x' }).body.tools.find(t => t.name === 'make_explanation').input_schema;
  const whole = stepRequest({ provider: 'fireworks', model: FW }, 'low', { max_tokens: 10, tools: [{ name: 'make_explanation', description: '', input_schema: full }], messages: [{ role: 'user', content: '{}' }] });
  assert.equal(kindsOf(whole).length, 24);
  assert.ok(geminiRefuses({ ...gemini, response_format: withoutBounds(whole.response_format) }), 'the whole Phase 02 schema without bounds is the one Gemini refused');
  const plain = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', { max_tokens: 10, tools: [{ name: 'make_explanation', description: '', input_schema: full }], messages: [{ role: 'user', content: '{}' }] });
  assert.equal(kindsOf(plain).length, 17, 'the unsteered full schema reduces to the legacy Gemini bundle');
  assert.ok(!JSON.stringify(plain.response_format).includes('"panels"') && diagramOf(plain).anyOf.find(b => b.properties.kind.const === 'tree').properties.highlightPath && !geminiRefuses(plain));
  // A request that names a new kind keeps it, list forms still.
  const named = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', { max_tokens: 10, tools: [{ name: 'make_explanation', description: '', input_schema: full }],
    messages: [{ role: 'user', content: JSON.stringify({ request: 'x', requiredVisuals: [{ id: 'vr-1', kind: 'diagram', diagramKind: 'heatmap', purpose: 'x' }] }) }] });
  assert.deepEqual(kindsOf(named).filter(k => !kindsOf(plain).includes(k)), ['heatmap']);
  assert.ok(!geminiRefuses(named));
  const stacks = stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', { max_tokens: 10, tools: [{ name: 'make_explanation', description: '', input_schema: full }],
    messages: [{ role: 'user', content: JSON.stringify({ request: 'x', requiredVisuals: [{ id: 'vr-1', kind: 'diagram', diagramKind: 'block-stack', purpose: 'x' }] }) }] });
  assert.deepEqual(kindsOf(stacks).filter(k => !kindsOf(plain).includes(k)), ['block-stack']);
  assert.ok(!geminiRefuses(stacks));
  // A property NAMED like a bound is a field, not a keyword: it is kept.
  assert.deepEqual(withoutBounds({ type: 'object', properties: { maxItems: { type: 'number', maximum: 3 } }, minItems: 1 }), { type: 'object', properties: { maxItems: { type: 'number' } } });
});

test('the fallback path end to end: Fireworks fails, the Gemini step request passes the stand-in, and its card is delivered, priced and settled', async t => {
  quiet(t);
  const { sqlite, LEARN_DB } = d1(t);
  const sent = [], original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body), provider = Object.keys(URL_OF).find(k => URL_OF[k] === url);
    sent.push({ provider, body });
    if (provider === 'fireworks') return Response.json({ message: 'synthetic failure' }, { status: 503 });
    if (geminiRefuses(body)) return Response.json([GEMINI_400], { status: 400 });
    return Response.json({ model: body.model, choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(card) } }], usage: { prompt_tokens: 1000, completion_tokens: 2000 } });
  };
  t.after(() => { globalThis.fetch = original; });
  const out = await ask(metered(LEARN_DB, 'fireworks-low'));
  assert.equal(out.result, 'artifact');
  assert.deepEqual(steps(out), [['fireworks', 'provider_error'], ['google', 'artifact']]);
  assert.deepEqual(out.block.authoredBy, { provider: 'google', model: 'gemini-3.5-flash-lite' });
  assert.deepEqual(out.block.title, card.title);
  // 1,000 input at $0.30/M + 2,000 output at $2.50/M = $0.0053, from the provider's own counts.
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.provider, a.status, a.cost_micros]), [['fireworks', 'failed', null], ['google', 'settled', 5300]], 'the failed Fireworks call settles with no cost recorded, as any 5xx');
});

test('end to end on the real ledger: the card records who wrote it, and the call is reserved and settled at that provider\'s price', async t => {
  quiet(t);
  const { sqlite, LEARN_DB } = d1(t);
  const sent = providers(t, ok(card, { model: 'accounts/fireworks/models/gpt-oss-120b' }));
  const out = await ask(metered(LEARN_DB, 'fireworks-medium'));
  assert.equal(out.result, 'artifact');
  assert.deepEqual([out.block.title, out.block.body, out.repaired, out.profile.id], [card.title, card.body, false, 'fireworks-medium']);
  assert.deepEqual(out.block.authoredBy, { provider: 'fireworks', model: FW }, 'saved on the card for the benchmark');
  assert.deepEqual(steps(out), [['fireworks', 'artifact']]);
  const [attempt] = rows(sqlite, 'usage_attempts');
  // 1,000 input at $0.15/M + 2,000 output at $0.60/M = $0.00135, from the provider's own counts.
  assert.deepEqual([attempt.provider, attempt.model, attempt.status, attempt.cost_micros], ['fireworks', FW, 'settled', 1350]);
  assert.equal(attempt.reserved_micros, toMicros(requestSpendBound(sent[0].body, FW, 'fireworks')), 'the bound is the request actually sent');
});

test('the one repair runs on the same step with the validator\'s exact problem and the previous answer', async t => {
  quiet(t);
  const problem = explanationProblem({ ...artifactBlock('explanation', long), body: settleExplanationBody(long.body) }); // the server trims the prose first (fix 1a)
  assert.ok(problem, 'the first answer is invalid');
  const sent = providers(t, ok(long), ok(card));
  const out = await ask(offline('cerebras-low'));
  assert.deepEqual([out.result, out.repaired], ['artifact', true]);
  assert.deepEqual(sent.map(s => s.provider), ['cerebras', 'cerebras']);
  const repair = sent[1].body;
  assert.deepEqual([repair.model, repair.reasoning_effort], ['gpt-oss-120b', 'low']);
  assert.deepEqual(repair.messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  assert.deepEqual(JSON.parse(repair.messages[2].content), long, 'the previous answer goes back as it came');
  assert.ok(repair.messages[3].content.startsWith(`Validation failed: ${problem}.`), 'the validator\'s exact words');
});

test('fallback transitions: 429, 5xx, an answer still invalid after its repair, each moves to the next step; the busy step is settled at zero', async t => {
  quiet(t);
  const { sqlite, LEARN_DB } = d1(t);
  let sent = providers(t, status(429), ok(card));
  let out = await ask(metered(LEARN_DB, 'cerebras-low'));
  assert.deepEqual(steps(out), [['cerebras', 'provider_busy'], ['fireworks', 'artifact']]);
  assert.deepEqual(sent.map(s => s.provider), ['cerebras', 'fireworks']);
  assert.deepEqual(out.block.authoredBy, { provider: 'fireworks', model: FW });
  assert.deepEqual(rows(sqlite, 'usage_attempts').map(a => [a.provider, a.status, a.cost_micros]), [['cerebras', 'failed', 0], ['fireworks', 'settled', 1350]], 'every step admitted and settled; Fireworks $0.15/$0.60');

  sent = providers(t, status(503), ok(card));
  out = await ask(offline('cerebras-medium'));
  assert.deepEqual(steps(out), [['cerebras', 'provider_error'], ['fireworks', 'artifact']]);
  assert.deepEqual(sent.map(s => s.provider), ['cerebras', 'fireworks']);

  sent = providers(t, ok(long), ok(long), ok(card));
  out = await ask(offline('fireworks-medium'));
  assert.deepEqual(steps(out), [['fireworks', 'validation_error'], ['google', 'artifact']]);
  assert.deepEqual(sent.map(s => s.provider), ['fireworks', 'fireworks', 'google'], 'the step\'s own repair first, then the next step');
  assert.equal(out.repaired, false, 'the delivered step answered first time');
});

test('fallback transitions: a timeout moves on to Gemini; on a cerebras-* profile both gpt-oss steps failing reach Gemini, which writes the card', async t => {
  quiet(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent = providers(t, hang, ok(card));
  const pending = ask(offline('fireworks-low'));
  while (sent.length < 1) await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(CHAIN_ENDPOINTS.fireworks.deadlineMs);
  const out = await pending;
  assert.deepEqual(steps(out), [['fireworks', 'provider_timeout'], ['google', 'artifact']]);
  t.mock.timers.reset();

  const third = providers(t, status(429), status(500), ok(card, { model: 'gemini-3.5-flash-lite' }));
  const last = await ask(offline('cerebras-high'));
  assert.deepEqual(steps(last), [['cerebras', 'provider_busy'], ['fireworks', 'provider_error'], ['google', 'artifact']]);
  assert.deepEqual(third.map(s => [s.provider, s.init.headers.Authorization, s.body.model, s.body.reasoning_effort]), [
    ['cerebras', `Bearer ${KEYS.CEREBRAS_API_KEY}`, 'gpt-oss-120b', 'high'], ['fireworks', `Bearer ${KEYS.FIREWORKS_API_KEY}`, FW, 'high'], ['google', `Bearer ${KEYS.GEMINI_API_KEY}`, 'gemini-3.5-flash-lite', 'high']]);
  assert.deepEqual(last.block.authoredBy, { provider: 'google', model: 'gemini-3.5-flash-lite' });
});

test('every step failing is a failure with its reason and steps, never Opus; an image stops the chain before anything is sent', async t => {
  quiet(t);
  const sent = providers(t, status(429));
  await assert.rejects(ask(offline('fireworks-low')), e => e.code === 'provider_busy' && e.retryable === true && /busy right now/.test(e.message)
    && JSON.stringify(e.attempts.map(a => [a.provider, a.outcome])) === JSON.stringify([['fireworks', 'provider_busy'], ['google', 'provider_busy']]));
  assert.deepEqual(sent.map(s => s.url), [URL_OF.fireworks, URL_OF.google], 'an Anthropic key and a Cerebras key are set, and never used');
  const invalid = providers(t, ok(long));
  const out = await ask(offline('cerebras-low'));
  assert.deepEqual([out.result, out.reason], ['validation_error', 'validation_error']);
  assert.deepEqual(steps(out), [['cerebras', 'validation_error'], ['fireworks', 'validation_error'], ['google', 'validation_error']]);
  assert.equal(invalid.length, 6, 'each step: its call and its one repair');
  const none = providers(t, ok(card));
  const pdf = { type: 'document', title: 'scan', source: { type: 'base64', media_type: 'application/pdf', data: 'AA' } };
  await assert.rejects(ask(offline('fireworks-low'), 'q', { documents: [pdf] }), e => e.code === 'input_unsupported' && e.attempts.length === 1);
  assert.equal(none.length, 0);
});

test('EXPLANATION_FALLBACK=off: only the profile\'s own provider, and its failure is reported as one with its reason', async t => {
  quiet(t);
  const off = profile => offline(profile, { [FALLBACK_SETTING]: 'off' });
  let sent = providers(t, status(429), ok(card));
  await assert.rejects(ask(off('fireworks-low')), e => e.code === 'provider_busy' && e.attempts.length === 1 && e.attempts[0].provider === 'fireworks');
  assert.deepEqual(sent.map(s => s.provider), ['fireworks']);
  sent = providers(t, ok(long));
  const out = await ask(off('cerebras-low'));
  assert.deepEqual([out.result, out.reason, steps(out)], ['validation_error', 'validation_error', [['cerebras', 'validation_error']]]);
  assert.deepEqual(sent.map(s => s.provider), ['cerebras', 'cerebras'], 'its call and its one repair, nothing else');
  sent = providers(t, ok(card));
  const good = await ask(off('cerebras-low'));
  assert.deepEqual([good.result, good.block.authoredBy.provider, steps(good)], ['artifact', 'cerebras', [['cerebras', 'artifact']]]);
  // Off with the profile's own credential missing: nothing runs, and that is the reason.
  sent = providers(t, ok(card));
  const skipped = await ask(offline('fireworks-low', { [FALLBACK_SETTING]: 'off', FIREWORKS_API_KEY: '' }));
  assert.deepEqual([skipped.result, skipped.reason, steps(skipped)], ['unsupported', 'credential_missing', [['fireworks', 'skipped']]]);
  assert.equal(sent.length, 0);
  // On (the default): the same 429 is followed by the next step.
  sent = providers(t, status(429), ok(card));
  assert.equal((await ask(offline('fireworks-low'))).result, 'artifact');
  assert.deepEqual(sent.map(s => s.provider), ['fireworks', 'google']);
});
