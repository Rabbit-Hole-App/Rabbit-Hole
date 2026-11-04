// FX-AN-059 (Gate 1 rerun gate1-sgd-2): in the failing first author calls the tool input was { kind: 'artifact', artifact: <a STRING that starts like an artifact> }. A string that is valid JSON
// is already turned into the object the schema says by normalizeToolInput (since the LP1 run of 2 Oct); these strings were not valid JSON, so they stayed strings and plain(input.artifact)
// failed. The real bytes are the committed fixture (first 3,000 characters only: the defect is beyond them). No machine-local path is read here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorTool } from '../src/agents/animation-author.js';
import { animationToolInput } from '../src/animation-policy.js';
import { normalizeToolInput } from '../src/tool-input.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/animation-stringified-artifact-head.json', import.meta.url), 'utf8'));
const tool = authorTool({ experience: 'experiment', parameters: [{ id: 'learningRate' }] });
const reply = (role, artifact) => animationToolInput(role, { content: [{ type: 'tool_use', name: tool.name, input: { kind: 'artifact', artifact } }] }, tool);

// The real prefix of the stringified artifact, decoded, cut after its description: a small complete JSON object made of real bytes.
function realObject() {
  const marker = '"artifact":"', body0 = fixture.head.slice(fixture.head.indexOf(marker) + marker.length);
  let body = body0;
  while (body.length) { try { JSON.parse(`"${body}"`); break; } catch { body = body.slice(0, -1); } }
  const inner = JSON.parse(`"${body}"`), at = inner.indexOf('","experience"'); // the end of title and description
  assert.ok(at > 0, 'the fixture holds the title and description');
  return inner.slice(0, at + 1) + '}';
}

test('the fixture is the real shape: kind artifact, an artifact that is a string', () => {
  assert.deepEqual([fixture.kind, fixture.keys, fixture.artifactType], ['artifact', ['kind', 'artifact'], 'string']);
  assert.ok(fixture.head.length === 3000 && fixture.chars > 9000);
  const object = JSON.parse(realObject());
  assert.deepEqual(Object.keys(object), ['title', 'description']);
  assert.match(object.title, /Stochastic Gradient Descent/);
});

test('FX-AN-059: a stringified artifact that is valid JSON is the object, for every role (it already was)', () => {
  const text = realObject();
  for (const role of ['author', 'repair', 'review']) assert.equal(typeof reply(role, text).artifact, 'object', role);
});

test('FX-AN-059: for the author and repair, a string that is nearly JSON is read once more after the two repairs that cannot change its meaning', () => {
  const text = realObject();
  // 1. a raw control character inside a string (a program source or description written with real line breaks and tabs).
  const raw = text.replace('Stochastic', 'Stochastic\n\tgradient'), parsedRaw = reply('author', raw).artifact;
  assert.equal(typeof parsedRaw, 'object');
  assert.equal(parsedRaw.title.startsWith('Stochastic\n\tgradient'), true, 'the line break and the tab are kept as characters');
  // 2. text after the complete value.
  assert.equal(typeof reply('repair', `${text}\nDone.`).artifact, 'object');
  assert.deepEqual(reply('author', `${text} `).artifact, JSON.parse(text));
  // Not for the review: a report is read as it came (valid JSON strings are still turned into objects, above).
  assert.equal(typeof reply('review', raw).artifact, 'string');
  // The shared normalizer is unchanged for everyone who does not ask.
  assert.equal(typeof normalizeToolInput(tool.input_schema, { kind: 'artifact', artifact: raw }).artifact, 'string');
});

test('FX-AN-059: what cannot be read stays a string, for the existing refusal and the one more ask', () => {
  const text = realObject();
  for (const bad of [text.slice(0, -1), text.replace('"title":"', 'title:"'), `[${text}`, 'just words', '"a string"', '123']) assert.equal(typeof reply('author', bad).artifact, 'string', bad.slice(0, 30));
  // A string that is valid but not an object is left alone too (the schema says object).
  assert.equal(reply('author', '[1,2]').artifact, '[1,2]');
});

test('FX-AN-059: an array property sent as a string is read the same way', () => {
  const schema = { type: 'object', properties: { list: { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } } } };
  assert.deepEqual(normalizeToolInput(schema, { list: '[{"a":"x\ty"}]' }, { lenient: true }), { list: [{ a: 'x\ty' }] });
  assert.equal(typeof normalizeToolInput(schema, { list: '[{"a":"x\ty"}]' }).list, 'string');
});
