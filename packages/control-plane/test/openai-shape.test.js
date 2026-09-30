// Anthropic <-> OpenAI translation for the Local provider. Run: node --test packages/control-plane/test/
import assert from 'node:assert';
import { test } from 'node:test';
import { fromOpenAI, toOpenAI } from '../src/ask.js';

test('toOpenAI: system, text turns, tool defs, tool_use/tool_result round-trip', () => {
  const o = toOpenAI({
    system: 'be brief',
    max_tokens: 100,
    tools: [{ name: 'read_source', description: 'read a file', input_schema: { type: 'object', properties: { path: { type: 'string' } } } }],
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'checking' }, { type: 'tool_use', id: 't1', name: 'read_source', input: { path: 'a.py' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'print(1)' }] },
    ],
  }, 'llama3.1');
  assert.equal(o.model, 'llama3.1');
  assert.equal(o.messages[0].role, 'system');
  assert.equal(o.messages[1].content, 'hi');
  const asst = o.messages[2];
  assert.equal(asst.content, 'checking');
  assert.equal(asst.tool_calls[0].function.name, 'read_source');
  assert.equal(JSON.parse(asst.tool_calls[0].function.arguments).path, 'a.py');
  assert.deepEqual(o.messages[3], { role: 'tool', tool_call_id: 't1', content: 'print(1)' });
  assert.equal(o.tools[0].function.name, 'read_source');
  assert.equal(o.tools[0].function.parameters.properties.path.type, 'string');
});

test('toOpenAI: image blocks become image_url data uris', () => {
  const o = toOpenAI({
    messages: [{ role: 'user', content: [{ type: 'image', source: { media_type: 'image/png', data: 'AAAA' } }, { type: 'text', text: 'what is this' }] }],
  }, 'm');
  const parts = o.messages[0].content;
  assert.equal(parts[0].type, 'image_url');
  assert.match(parts[0].image_url.url, /^data:image\/png;base64,AAAA$/);
  assert.equal(parts[1].text, 'what is this');
});

// models-18: a Pexels photo (inspectImage) is a url image; it must not become data:undefined.
test('toOpenAI: url image blocks keep their url', () => {
  const o = toOpenAI({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://images.pexels.com/photos/1/photo.jpeg' } }, { type: 'text', text: 'check' }] }] }, 'm');
  assert.equal(o.messages[0].content[0].image_url.url, 'https://images.pexels.com/photos/1/photo.jpeg');
});

test('fromOpenAI: text answer', () => {
  const m = fromOpenAI({ choices: [{ finish_reason: 'stop', message: { content: 'hello' } }], usage: { total_tokens: 3 } });
  assert.deepEqual(m.content, [{ type: 'text', text: 'hello' }]);
  assert.equal(m.stop_reason, 'end_turn');
});

test('fromOpenAI: tool calls map to tool_use with parsed args; bad json becomes {}', () => {
  const m = fromOpenAI({ choices: [{ message: { content: null, tool_calls: [
    { id: 'c1', function: { name: 'submit', arguments: '{"a":1}' } },
    { id: 'c2', function: { name: 'other', arguments: '{broken' } },
  ] } }] });
  assert.equal(m.stop_reason, 'tool_use');
  assert.deepEqual(m.content[0], { type: 'tool_use', id: 'c1', name: 'submit', input: { a: 1 } });
  assert.deepEqual(m.content[1].input, {});
});

test('fromOpenAI: length finish maps to max_tokens', () => {
  assert.equal(fromOpenAI({ choices: [{ finish_reason: 'length', message: { content: 'x' } }] }).stop_reason, 'max_tokens');
});

test('toOpenAI: a forced tool survives translation, so a planner call cannot come back as prose', () => {
  const forced = toOpenAI({
    max_tokens: 100,
    messages: [{ role: 'user', content: 'plan it' }],
    tools: [{ name: 'plan_explanation', description: 'plan', input_schema: { type: 'object', properties: {} } }],
    tool_choice: { type: 'tool', name: 'plan_explanation', disable_parallel_tool_use: true },
  }, 'gpt-4.1-mini');
  assert.deepEqual(forced.tool_choice, { type: 'function', function: { name: 'plan_explanation' } });
  assert.equal(forced.parallel_tool_calls, false);

  const any = toOpenAI({ messages: [], tools: [{ name: 't', input_schema: {} }], tool_choice: { type: 'any' } }, 'gpt-4.1-mini');
  assert.equal(any.tool_choice, 'required');
  const auto = toOpenAI({ messages: [], tools: [{ name: 't', input_schema: {} }], tool_choice: { type: 'auto' } }, 'gpt-4.1-mini');
  assert.equal(auto.tool_choice, 'auto');
  assert.equal('tool_choice' in toOpenAI({ messages: [] }, 'gpt-4.1-mini'), false);
});
