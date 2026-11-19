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
import { diagramFence, withVisual } from './explanation-layout-fixture.js';
import { artifactFetch } from '../src/learn-artifact.js';
import { OWNER } from './explain-fixture.js';
import { planFromAnswers } from '../src/explanation-planner.js';

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

test('Gemini retains compact samples for the regression demo and fits a mixed explicit schema without them', () => {
  const env = offline('fireworks-low');
  const request = (args, kinds = []) => {
    const { body } = prepareArtifactAuthorRequest(env, {
      command: 'explanation', args,
      visualRequirements: { items: kinds.map((diagramKind, index) => ({
        id: `vr-${index + 1}`, kind: 'diagram', diagramKind, purpose: `Show the ${diagramKind}`,
      })) },
    });
    return stepRequest({ provider: 'google', model: 'gemini-3.5-flash-lite' }, 'low', body);
  };
  const plotSeries = sent => diagramOf(sent).anyOf.find(branch => branch.properties.kind.const === 'coordinate-plot').properties.series.items;
  const mixed = request('Show the numeric summaries and their assembly', ['coordinate-plot', 'heatmap', 'block-stack']);
  assert.ok(plotSeries(mixed).required.includes('points'));
  assert.equal(plotSeries(mixed).properties.samples, undefined);
  assert.equal(geminiRefuses(mixed), false);

  const demo = request('how does a regression tree fit y = sin(x) with a step function at depth 2 versus depth 5?');
  assert.ok(plotSeries(demo).properties.samples);
  assert.equal(geminiRefuses(demo), false);
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

// Arithmetic issues (params.code 'arithmetic': a box-plot fence that is not Q1 - 1.5 IQR and Q3 + 1.5 IQR) are never dropped: the step repairs, then fails with explanation_bad_numbers.
// The same model gets a second repair only when the NEXT provider cannot write the kind (Gemini and a box-plot the learner did not name; or no next provider).
const boxCard = fences => ({ title: 'Fences from the quartiles', body: withVisual('The fences from the quartiles mark where an outlier begins.', { after: 'A reading beyond a fence is an outlier.', visual: diagramFence({ version: 1, diagram: { kind: 'box-plot', title: 'Fences from the quartiles', x: { label: 'Reading', min: 0, max: 20 }, boxes: [{ label: 'Trial', whiskerLow: 4, q1: 6, median: 9, q3: 12, whiskerHigh: 14, fences }] } }) }) });
const wrongFences = boxCard({ lower: 2, upper: 16 }), goodFences = boxCard({ lower: -3, upper: 21 });
const FENCE_ISSUE = 'Fences must be Q1 - 1.5 x IQR and Q3 + 1.5 x IQR: with Q1 6 and Q3 12 that is -3 and 21, not 2 and 16.';
const SENTENCE = 'Rewrite every sentence that states these numbers.';
const named = { visualRequirements: { items: [{ id: 'v1', kind: 'diagram', diagramKind: 'box-plot', purpose: 'the fences' }] } };

test('the box-plot answer is valid with true fences and an arithmetic problem with wrong ones', () => {
  assert.equal(explanationProblem({ ...artifactBlock('explanation', goodFences), body: goodFences.body }), null);
  assert.match(explanationProblem({ ...artifactBlock('explanation', wrongFences), body: wrongFences.body }), /^explanation_bad_numbers: .*Fences must be Q1 - 1.5 x IQR/);
});

test('arithmetic: the next provider cannot write box-plot, so the same model gets a second repair; success on repair 2 is recorded', async t => {
  quiet(t);
  const sent = providers(t, ok(wrongFences), ok(wrongFences), ok(goodFences));
  const out = await ask(offline('fireworks-low'), 'Explain the box plot fences');
  assert.deepEqual(sent.map(s => s.provider), ['fireworks', 'fireworks', 'fireworks'], 'Gemini would not get box-plot, so no hand-over');
  assert.deepEqual([out.result, out.repaired, out.repairs, out.repairedAt], ['artifact', true, 2, 2]);
  assert.deepEqual(out.attempts, [{ provider: 'fireworks', model: FW, outcome: 'artifact', repairs: 2, repairedAt: 2, failedOn: ['arithmetic', 'arithmetic'] }]);
  for (const call of [sent[1], sent[2]]) assert.ok(call.body.messages.at(-1).content.startsWith('Validation failed: explanation_bad_numbers: ') && call.body.messages.at(-1).content.includes(SENTENCE), 'the exact numbers, then the sentence');
  assert.ok(sent[1].body.messages.at(-1).content.includes(FENCE_ISSUE), 'the validator\'s first issue names the true fences');
});

test('arithmetic: success on the first repair stops there (no second repair)', async t => {
  quiet(t);
  const sent = providers(t, ok(wrongFences), ok(goodFences));
  const out = await ask(offline('fireworks-low'), 'Explain the box plot fences');
  assert.equal(sent.length, 2);
  assert.deepEqual(out.attempts, [{ provider: 'fireworks', model: FW, outcome: 'artifact', repairs: 1, repairedAt: 1, failedOn: ['arithmetic'] }]);
});

test('arithmetic: when the next provider CAN write the kind (it is named, or it is Fireworks) the old rule stands: one repair, the step fails, the next provider runs', async t => {
  quiet(t);
  let sent = providers(t, ok(wrongFences), ok(wrongFences), ok(goodFences));
  let out = await ask(offline('fireworks-low'), 'Draw a box plot of the fences', named); // Gemini gets box-plot when the learner names it
  assert.deepEqual(sent.map(s => s.provider), ['fireworks', 'fireworks', 'google']);
  assert.deepEqual(out.attempts.map(a => [a.provider, a.outcome, a.repairs]), [['fireworks', 'arithmetic', 1], ['google', 'artifact', 0]]);
  assert.deepEqual(out.attempts[0].issues, [FENCE_ISSUE]);
  sent = providers(t, ok(wrongFences), ok(wrongFences), ok(goodFences));
  out = await ask(offline('google-low'), 'Explain the box plot fences'); // Gemini first, Fireworks next writes everything
  assert.deepEqual(sent.map(s => s.provider), ['google', 'google', 'fireworks']);
  assert.deepEqual(out.attempts.map(a => [a.provider, a.outcome, a.repairs]), [['google', 'arithmetic', 1], ['fireworks', 'artifact', 0]]);
});

test('arithmetic: every step failing gives validation_error explanation_bad_numbers, nothing delivered and the diagram never dropped; each step keeps its issue', async t => {
  quiet(t);
  const sent = providers(t, ok(wrongFences));
  const out = await ask(offline('google-low'), 'Explain the box plot fences');
  assert.deepEqual(sent.map(s => s.provider), ['google', 'google', 'fireworks', 'fireworks', 'fireworks'], 'Gemini: call and one repair; Fireworks is last, so a second repair');
  assert.equal(out.result, 'validation_error');
  assert.match(out.error, /^explanation_bad_numbers: /);
  assert.equal(out.block, undefined);
  assert.deepEqual(out.attempts, [
    { provider: 'google', model: 'gemini-3.5-flash-lite', outcome: 'arithmetic', repairs: 1, failedOn: ['arithmetic', 'arithmetic'], issues: [FENCE_ISSUE] },
    { provider: 'fireworks', model: FW, outcome: 'arithmetic', repairs: 2, failedOn: ['arithmetic', 'arithmetic', 'arithmetic'], issues: [FENCE_ISSUE] }]);
});

// HEAT-1: a grid drawn blank (every numeric cell 0 at range 0 to 1) and a grid with every cell above the diagonal blocked and its diagonal blocked too are arithmetic issues like a wrong fence:
// repaired, then the step fails, never delivered. Heatmap is a NEW kind Gemini does not get unless named, so with no next provider that can write it the same model gets a second repair.
const heatCard = cell => ({ title: 'A grid of allowed cells', body: withVisual('Each row may use only the cells shown for it.', { after: 'A blocked cell is not used by that row.', visual: diagramFence({ version: 1, diagram: { kind: 'heatmap', title: 'A grid of allowed cells', rowLabel: 'Row', columnLabel: 'Column', columns: ['1', '2', '3'], rows: [0, 1, 2].map(i => ({ label: String(i + 1), cells: [0, 1, 2].map(j => cell(i, j)) })), range: { min: 0, max: 1 } } }) }) });
const blankGrid = heatCard((i, j) => (j < i ? 0 : null)), keptGrid = heatCard((i, j) => (j <= i ? 1 : null));

test('heatmap: the blank grid is an arithmetic problem, the 0 and 1 grid with its diagonal is valid', () => {
  assert.match(explanationProblem({ ...artifactBlock('explanation', blankGrid), body: blankGrid.body }), /^explanation_bad_numbers: .*Every numeric cell is 0, the value drawn with no fill/);
  assert.equal(explanationProblem({ ...artifactBlock('explanation', keptGrid), body: keptGrid.body }), null);
});

test('heatmap: the same model gets a second repair (no next provider can write a heatmap), success on repair 2 is recorded', async t => {
  quiet(t);
  const sent = providers(t, ok(blankGrid), ok(blankGrid), ok(keptGrid));
  const out = await ask(offline('fireworks-low'), 'Explain which cells each row may use');
  assert.deepEqual(sent.map(s => s.provider), ['fireworks', 'fireworks', 'fireworks']);
  assert.deepEqual([out.result, out.repaired, out.repairs, out.repairedAt], ['artifact', true, 2, 2]);
  assert.deepEqual(out.attempts[0].failedOn, ['arithmetic', 'arithmetic']);
  assert.ok(sent[1].body.messages.at(-1).content.startsWith('Validation failed: explanation_bad_numbers: ') && sent[1].body.messages.at(-1).content.includes(SENTENCE));
});

test('heatmap: every step keeping the blank grid fails with explanation_bad_numbers, nothing delivered and the diagram never dropped or simplified', async t => {
  quiet(t);
  providers(t, ok(blankGrid));
  const out = await ask(offline('fireworks-low'), 'Explain which cells each row may use');
  assert.equal(out.result, 'validation_error');
  assert.match(out.error, /^explanation_bad_numbers: /);
  assert.equal(out.block, undefined);
  assert.ok(out.attempts.every(a => a.outcome === 'arithmetic'), JSON.stringify(out.attempts.map(a => a.outcome)));
});

test('a non-arithmetic invalid answer never gets the second repair and keeps its own issue text per step', async t => {
  quiet(t);
  const sent = providers(t, ok(long));
  const out = await ask(offline('fireworks-low'), 'Explain the box plot fences');
  assert.deepEqual(sent.map(s => s.provider), ['fireworks', 'fireworks', 'google', 'google']);
  assert.deepEqual(out.attempts.map(a => [a.outcome, a.repairs]), [['validation_error', 1], ['validation_error', 1]]);
  assert.deepEqual(out.attempts.map(a => a.failedOn), [['validation_error', 'validation_error'], ['validation_error', 'validation_error']]);
  assert.match(out.attempts[0].issues[0], /^explanation_/);
  assert.ok(!sent[1].body.messages.at(-1).content.includes(SENTENCE), 'the sentence belongs to arithmetic issues only');
});

test('a step that failed a validation and then arithmetic records both in failedOn, in order; a clean first answer has no failedOn', async t => {
  quiet(t);
  providers(t, ok(long), ok(wrongFences));
  const out = await ask(offline('fireworks-low'), 'Explain the box plot fences');
  assert.deepEqual(out.attempts[0].failedOn, ['validation_error', 'arithmetic', 'arithmetic']);
  assert.equal(out.attempts[0].outcome, 'arithmetic');
  providers(t, ok(goodFences));
  const clean = await ask(offline('fireworks-low'), 'Explain the box plot fences');
  assert.ok(!('failedOn' in clean.attempts[0]));
});

test('a failed typed card is archived (AR-1) with its steps, outcomes, repairs and issue text, and the client gets the validation_error', async t => {
  quiet(t);
  providers(t, ok(wrongFences));
  const puts = [], LEARN_MEDIA = { async put(key, body) { puts.push(JSON.parse(body)); } };
  const env = { ...offline('google-low'), LEARN_MEDIA, RELEASE_SHA: 'abc123', CONTROL_PLANE: { fetch: async () => Response.json({ name: 'demo', org: OWNER.org, user_id: OWNER.userId, email: 'private@example.test' }) } };
  const res = await artifactFetch(new Request('https://dev.test/api/learn/artifact', { method: 'POST', body: JSON.stringify({ app: 'demo', command: 'explanation', args: 'Explain the box plot fences' }) }), env);
  const body = await res.json();
  assert.equal(body.result, 'validation_error');
  assert.equal(puts.length, 1);
  assert.equal(puts[0].outcome, 'validation_error');
  assert.match(puts[0].error, /^explanation_bad_numbers: /);
  assert.deepEqual(puts[0].steps.map(a => [a.provider, a.outcome, a.repairs, a.issues, a.failedOn]), [['google', 'arithmetic', 1, [FENCE_ISSUE], ['arithmetic', 'arithmetic']], ['fireworks', 'arithmetic', 2, [FENCE_ISSUE], ['arithmetic', 'arithmetic', 'arithmetic']]]);
  assert.ok(!JSON.stringify(puts[0]).includes('private@example.test'));
});

// SIMP-1 (Reviewer 2026-11-17): a diagram that cannot be rebuilt in its own kind (a matrix here, standing for the heatmap the prose points at) fails the step with explanation_missing_visual,
// so the next provider runs; it is never redrawn as a flow. When every step fails that way the failure is delivered as it is (learn-slash.js shows its plain failure line).
const maskCard = visual => ({ title: 'Causal mask', body: withVisual('The causal mask on decoder scores hides every later word from an earlier one.', { after: 'Each word then attends only to itself and the words before it.', visual: diagramFence(visual) }) });
// a matrix with one row stays invalid (two to six rows); object columns alone are coerced by the server (matrix_coerced)
const maskMatrix = rows => ({ version: 1, diagram: { kind: 'matrix', title: 'Causal mask on decoder scores', columns: ['the', 'cat'], rows } });
const row = (heading, cells) => ({ heading, cells }), badMask = maskCard(maskMatrix([row('cat', ['1', '1'])])), goodMask = maskCard(maskMatrix([row('the', ['1', '0']), row('cat', ['1', '1'])]));
const maskPlan = () => ({ planned: true, plan: planFromAnswers({
  visualType: { choice: 'diagram', confidence: 0.95, probabilities: {} }, kind: { choice: 'token-links', confidence: 0.7, probabilities: { 'token-links': 0.7, flow: 0.3 } },
  depthTreatment: { choice: 'mechanism' }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 }, secondVisual: { noul: 0.94 } }) });
const maskQuestion = 'How does the transformer decoder avoid looking ahead at later words?';

test('SIMP-1: an invalid matrix after the repair fails the step (explanation_missing_visual) and the next provider writes the card; no flow stands in', async t => {
  quiet(t);
  const sent = providers(t, ok(badMask), ok(badMask), ok(goodMask));
  const out = await ask(offline('fireworks-low'), maskQuestion, maskPlan());
  assert.deepEqual(sent.map(s => s.provider), ['fireworks', 'fireworks', 'google'], 'the step\'s call and its repair, then the next provider');
  assert.deepEqual(steps(out), [['fireworks', 'validation_error'], ['google', 'artifact']]);
  assert.match(out.attempts[0].issues[0], /^explanation_missing_visual/);
  assert.deepEqual(out.block.authoredBy, { provider: 'google', model: 'gemini-3.5-flash-lite' });
  assert.ok(!out.block.visualFallback);
  assert.match(out.block.body, /"kind":"matrix"/);
  assert.doesNotMatch(out.block.body, /"kind":"flow"/);
});

test('SIMP-1: every provider failing that way delivers the failure: explanation_missing_visual, no card, each step\'s issue kept', async t => {
  quiet(t);
  const sent = providers(t, ok(badMask));
  const out = await ask(offline('fireworks-low'), maskQuestion, maskPlan());
  assert.deepEqual(sent.map(s => s.provider), ['fireworks', 'fireworks', 'google', 'google']);
  assert.equal(out.result, 'validation_error');
  assert.match(out.error, /^explanation_missing_visual/);
  assert.equal(out.block, undefined);
  assert.deepEqual(steps(out), [['fireworks', 'validation_error'], ['google', 'validation_error']]);
  assert.ok(out.attempts.every(a => /^explanation_missing_visual/.test(a.issues[0])));
});
