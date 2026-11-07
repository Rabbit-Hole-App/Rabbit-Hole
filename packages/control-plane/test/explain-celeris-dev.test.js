import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celerisExplainOn, celerisExplainRoute, ASKS_FOR_DIAGRAM } from '../src/explain-celeris-dev.js';
import { generateArtifact } from '../src/learn-artifact.js';

const ON = { SMALL_ENV: 'dev', EXPLAIN_CELERIS_DEV: 'true', CELERIS_API_KEY: 'k' };
const DIAGRAM = { version: 1, diagram: { kind: 'flow', title: 'Cache', nodes: [{ id: 'a', label: 'Read cache', role: 'process' }, { id: 'b', label: 'Return value', role: 'outcome' }], edges: [{ from: 'a', to: 'b' }] } };
const reply = card => Response.json({ model: 'celeris-1', choices: [{ finish_reason: 'stop', message: { content: typeof card === 'string' ? card : JSON.stringify(card) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
const withFetch = async (replies, run) => {
  const requests = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { requests.push({ url: String(url), body: JSON.parse(init.body) }); return replies.shift()(); };
  try { return await run(requests); } finally { globalThis.fetch = realFetch; }
};
const ask = (route, args) => generateArtifact({}, { command: 'explanation', args, selection: null, context: null }, route.options);

test('the dev Celeris route is off unless a dev or test Worker turns it on, for the written /explain (explanation) only', () => {
  assert.equal(celerisExplainOn(ON, 'explanation'), true);
  assert.equal(celerisExplainOn({ ...ON, SMALL_ENV: 'test' }, 'explanation'), true);
  assert.equal(celerisExplainOn({ ...ON, SMALL_ENV: 'production' }, 'explanation'), false, 'production never');
  assert.equal(celerisExplainOn({ ...ON, SMALL_ENV: undefined }, 'explanation'), false);
  assert.equal(celerisExplainOn({ ...ON, EXPLAIN_CELERIS_DEV: undefined }, 'explanation'), false);
  assert.equal(celerisExplainOn({ ...ON, CELERIS_API_KEY: '' }, 'explanation'), false);
  for (const command of ['explain', 'practice', 'quiz', 'table', 'interact', 'dive']) assert.equal(celerisExplainOn(ON, command), false, command);
  assert.equal(celerisExplainRoute({ SMALL_ENV: 'production', EXPLAIN_CELERIS_DEV: 'true', CELERIS_API_KEY: 'k' }, 'explanation'), null);
});

test('json_schema mode: title, body and a separate diagram object in one call; RH writes the fence; the guidance is the plan model\'s own; the served model and diagram status are reported', async () => {
  await withFetch([() => reply({ title: 'How a cache answers', body: 'A cache keeps recent answers so a repeat request skips the slow source.', diagram: DIAGRAM })], async requests => {
    const route = celerisExplainRoute(ON, 'explanation');
    const out = await ask(route, 'How does a cache work?');
    assert.equal(out.result, 'artifact');
    assert.match(out.block.body, /\n\n```rh-diagram\n\{"version":1/, 'RH wrote the fence');
    assert.equal(requests.length, 1, 'one call');
    assert.match(requests[0].url, /celeris\.ai.*\/chat\/completions$/);
    const sent = requests[0].body;
    assert.equal(sent.response_format.type, 'json_schema');
    assert.deepEqual(sent.response_format.json_schema.schema.required, ['title', 'body', 'diagram']);
    assert.ok(sent.response_format.json_schema.schema.properties.diagram.anyOf, 'optional when not asked for');
    assert.equal(sent.tools, undefined);
    assert.match(sent.messages[0].content, /Treat tables and diagrams as optional at every Depth/, 'the make_explanation guidance, unchanged');
    assert.match(sent.messages[0].content, /aim for 650 to 750/);
    assert.deepEqual(route.served(), { requested: 'celeris-1', models: ['celeris-1'], calls: 1, inTokens: 10, outTokens: 5, attempts: [{ required: false, diagram: 'valid', chars: out.block.title.length + out.block.body.indexOf('\n\n```rh-diagram') }] });
  });
});

test('no diagram (null) gives a text card; an unreadable answer is repaired once with the validator\'s words', async () => {
  await withFetch([() => reply('not json {'), () => reply({ title: 'DNS', body: 'A resolver asks servers in turn.', diagram: null })], async requests => {
    const route = celerisExplainRoute(ON, 'explanation');
    const out = await ask(route, 'How does DNS work?');
    assert.equal(out.result, 'artifact');
    assert.equal(out.repaired, true);
    assert.equal(out.block.body, 'A resolver asks servers in turn.');
    assert.equal(requests.length, 2);
    assert.match(requests[1].body.messages.at(-1).content, /Validation failed/);
    assert.deepEqual(route.served().attempts.map(a => a.diagram), ['omitted', 'omitted']);
  });
});

test('an explicit diagram request makes the field required; an invalid diagram that survives the one repair is dropped and the valid text is delivered', async () => {
  assert.ok(ASKS_FOR_DIAGRAM.test('Draw a diagram of DNS') && ASKS_FOR_DIAGRAM.test('flowchart of login') && !ASKS_FOR_DIAGRAM.test('How does DNS resolve a domain name?'));
  const bad = { version: 1, diagram: { kind: 'flow', title: 'x', nodes: [], edges: [] } };
  await withFetch([() => reply({ title: '', body: 'Short.', diagram: DIAGRAM }), () => reply({ title: 'DNS', body: 'A resolver asks servers in turn.', diagram: bad })], async requests => {
    const route = celerisExplainRoute(ON, 'explanation');
    const out = await ask(route, 'Draw a diagram of how DNS works');
    assert.equal(requests.length, 2, 'one call and one repair');
    assert.equal(requests[0].body.response_format.json_schema.schema.properties.diagram.anyOf, undefined, 'required when asked for');
    assert.match(requests[1].body.messages.at(-1).content, /Validation failed/);
    assert.equal(out.result, 'artifact');
    assert.equal(out.diagramsDropped, 1, 'the diagram that still failed is dropped');
    assert.doesNotMatch(out.block.body, /rh-diagram/);
    assert.equal(out.block.body, 'A resolver asks servers in turn.');
    assert.deepEqual(route.served().attempts.map(a => a.diagram), ['valid', 'invalid']);
  });
});
