import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  CONTRACT_LIMITS, ERROR_CODES, ERROR_MESSAGES, RuntimeError, RuntimeErrorSchema, canonicalBytes, canonicalJson, parseEvaluateResponse, parseFrame,
  parseGuestResult, parseManifest,
} from './contract.js';
import { normalizeFrame } from './frame.js';

// Owner corrections to the frozen contract: inert text, one output limit over the whole result, normalised errors.
// Hand-authored test data throughout.
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const manifest = (extra = {}) => ({
  title: 'T', summary: 'S', assumptions: [], description: 'D', inputs: [], readouts: [], capabilities: [], ...extra,
});

// ---- 1. text is inert data; executable FIELDS are forbidden ---------------------------------------------------------------

const LITERAL = [
  'A URL starts with https://', 'The HTML tag <div> groups content.', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>',
  'javascript:void(0)', 'data:text/html;base64,AAAA', 'when a < b and b > c', 'onclick="run()"',
];

test('literal text that looks like a URL or markup is valid data, everywhere text is accepted', () => {
  for (const text of LITERAL) {
    const parsed = parseFrame({ objects: [
      { kind: 'box', id: 'b', x: 0, y: 0, w: 10, h: 10, text },
      { kind: 'text', id: 't', x: 0, y: 0, text },
      { kind: 'text', id: 'r', x: 0, y: 0, runs: [{ kind: 'text', text }] },
      { kind: 'arrow', id: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, text },
    ] });
    assert.equal(parsed.ok, true, `${text}: ${parsed.issue}`);
    assert.equal(parsed.value.objects[0].text, text, 'the text arrives unchanged: not stripped, escaped or rewritten');
    assert.equal(parseManifest(manifest({ title: text, summary: text, description: text, assumptions: [text] })).ok, true, text);
    const drawn = normalizeFrame({ objects: [{ kind: 'text', id: 't', x: 0, y: 0, text }] });
    assert.equal(drawn.ok, true, `${text}: ${drawn.issue}`);
    assert.equal(drawn.state.objects[0].label, text, 'the renderer input holds the literal string');
  }
});

test('fields that would make the host load or run something are refused', () => {
  const box = extra => ({ objects: [{ kind: 'box', id: 'b', x: 0, y: 0, w: 10, h: 10, ...extra }] });
  const refused = [
    { onclick: 'run()' }, { onerror: 'x' }, { onClick: () => 1 }, { href: 'https://example.com' }, { src: '/a.png' }, { url: 'https://example.com' },
    { image: 'https://example.com/a.png' }, { link: 'javascript:alert(1)' }, { style: 'color:red' }, { className: 'x' }, { dangerouslySetInnerHTML: { __html: '<b>' } },
    { constructor: 'x' }, { text: () => 'x' }, { x: () => 1 }, { fn: () => 1 },
  ];
  for (const extra of refused) assert.equal(parseFrame(box(extra)).ok, false, Object.keys(extra).join());
  const proto = JSON.parse('{"__proto__":{"polluted":true}}');
  assert.equal(parseFrame({ objects: [{ kind: 'box', id: 'b', x: 0, y: 0, w: 10, h: 10, ...proto }, JSON.parse('{"__proto__":1}')] }).ok, false);
  assert.equal(parseFrame({ objects: [{ kind: 'image', id: 'i', src: 'https://example.com/a.png', x: 0, y: 0, w: 5, h: 5 }] }).ok, false, 'there is no image kind');
  assert.equal(parseFrame({ objects: [], onload: 'x' }).ok, false, 'nor a handler on the frame itself');
  assert.equal(parseGuestResult({ frame: { objects: [] }, quantities: {}, html: '<b>' }).ok, false);
  assert.equal(parseGuestResult({ frame: { objects: [] }, quantities: { v: () => 1 } }).ok, false, 'a function in output');
});

test('math runs stay on the hardened path: trust-requiring KaTeX commands are refused', () => {
  const math = tex => normalizeFrame({ objects: [{ kind: 'text', id: 'm', x: 0, y: 0, runs: [{ kind: 'math', tex }] }] });
  assert.equal(math('\\frac{a}{b}').ok, true);
  for (const tex of ['\\href{https://example.com}{x}', '\\url{https://example.com}', '\\includegraphics{a.png}', '\\htmlClass{x}{y}']) assert.equal(math(tex).ok, false, tex);
});

test('the renderer path draws program text through text nodes: the only HTML sinks are KaTeX output', () => {
  const renderer = read('../AnimatedScene.jsx');
  const sinks = [...renderer.matchAll(/dangerouslySetInnerHTML=\{\{ __html: ([^}]*) \}\}/g)].map(match => match[1]);
  assert.deepEqual(sinks.sort(), ['maths', 'typesetRun(run.tex)'], 'a new HTML sink in the shared Frame needs this test and a review');
  assert.match(renderer, /const typesetRun = expression => katex\.renderToString\(expression, \{[^}]*trust: false, maxSize: 10, maxExpand: 1000/s);
  assert.equal(renderer.includes('innerHTML ='), false);
  // Prose and labels are children or SVG text, not markup: the two places program text lands.
  assert.match(renderer, /<span key=\{index\} style=\{\{ whiteSpace: 'pre' \}\}>\{run\.text\}<\/span>/);
  assert.match(renderer, /fill: labelFill \}\}>\{shown\}<\/text>/);
  // The program card itself never sets HTML.
  const scene = read('./ProgramScene.jsx');
  for (const sink of ['dangerouslySetInnerHTML', 'innerHTML', 'eval(', 'new Function', 'document.write']) assert.equal(scene.includes(sink), false, `ProgramScene must not use ${sink}`);
  assert.equal(existsSync(new URL('./ProgramScene.jsx', import.meta.url)), true);
  assert.equal(read('./frame.js').includes('innerHTML'), false);
});

// ---- 2. one output limit over the whole result ----------------------------------------------------------------------------

const LONG = Number('0.1234567890123456');
const result = objects => ({ frame: { objects }, quantities: {} });
const series = (id, n) => ({ kind: 'polyline', id, points: Array.from({ length: n }, () => [LONG, LONG]) });
// A valid result whose canonical size is exactly `target` bytes: long polylines, then a text object sized to land on the byte.
function resultOfSize(target) {
  const objects = [];
  while (canonicalBytes(result([...objects, series(`p${objects.length}`, 2000)])) < target - 150) objects.push(series(`p${objects.length}`, 2000));
  let points = 0;
  while (canonicalBytes(result([...objects, series('q', points + 1)])) < target - 150) points += 1;
  if (points >= 2) objects.push(series('q', points));
  const filler = length => result([...objects, { kind: 'text', id: 'pad', x: 0, y: 0, text: 'x'.repeat(length) }]);
  const room = target - canonicalBytes(filler(1)) + 1;
  assert.ok(room >= 1 && room <= 200, `the filler text fits (${room})`);
  return filler(room);
}

test('the limit covers the whole result: at the limit passes, one byte over fails, a huge result fails', () => {
  const limit = CONTRACT_LIMITS.maxOutputBytes;
  assert.equal(limit, 262144);
  assert.equal('outputBytes' in CONTRACT_LIMITS, false, 'one authoritative constant, no second name');
  const at = resultOfSize(limit), over = resultOfSize(limit + 1);
  assert.equal(canonicalBytes(at), limit);
  assert.equal(canonicalBytes(over), limit + 1);
  assert.equal(parseGuestResult(at).ok, true, 'exactly at the limit');
  const refused = parseGuestResult(over);
  assert.equal(refused.ok, false, 'one byte over');
  assert.equal(refused.error.code, 'invalid_output');
  assert.doesNotMatch(refused.issue, /0\.1234/, 'no content is echoed');
  // The largest result the schema's own counts allow (10,000 points at 24 characters a number) is still far over the limit.
  const huge = result(Array.from({ length: 5 }, (_, i) => ({ kind: 'polyline', id: `h${i}`, points: Array.from({ length: 2000 }, (__, n) => [-1.2345678901234567e-300 * (n + 1), 7.654321098765432e-300 * (n + 1)]) })));
  assert.ok(canonicalBytes(huge) > 400000, `huge result is ${canonicalBytes(huge)} bytes`);
  assert.equal(parseGuestResult(huge).ok, false);
  assert.equal(parseGuestResult(huge).error.code, 'invalid_output');
  assert.match(parseGuestResult(huge).issue, /over 262144 bytes/);
  // The reported size: a result of exactly 879,529 canonical bytes is refused for its size before any schema rule is read.
  const pad = result([{ kind: 'text', id: 'pad', x: 0, y: 0, text: 'x' }]);
  pad.frame.objects[0].text = 'x'.repeat(879529 - canonicalBytes(pad) + 1);
  assert.equal(canonicalBytes(pad), 879529);
  const reported = parseGuestResult(pad);
  assert.equal(reported.ok, false);
  assert.equal(reported.error.code, 'invalid_output');
  assert.match(reported.issue, /over 262144 bytes/);
  assert.equal(parseFrame(huge.frame).ok, false, 'a frame alone over the limit is refused too');
});

test('the limit also counts a response id and metrics; depth, cycles and non-JSON never reach the schema', () => {
  const nearly = resultOfSize(CONTRACT_LIMITS.maxOutputBytes - 40);
  const response = { requestId: 'r1', ...nearly, metrics: { ms: 1.5 } };
  assert.equal(parseEvaluateResponse(response).ok, true);
  assert.equal(parseEvaluateResponse({ ...response, requestId: 'r'.repeat(64), metrics: { ms: 1.5, outputBytes: 123456789 } }).ok, false, 'over once the metadata is counted');
  const cycle = { frame: { objects: [] }, quantities: {} };
  cycle.self = cycle;
  assert.equal(parseGuestResult(cycle).ok, false);
  let deep = {};
  for (let i = 0; i < 100; i += 1) deep = { deeper: deep };
  assert.equal(parseGuestResult({ frame: { objects: [] }, quantities: deep }).error.code, 'invalid_output');
  assert.equal(parseGuestResult({ frame: { objects: [] }, quantities: { v: 10n } }).ok, false);
  const sample = { b: 'é', a: [1, null, true, { c: 'x' }], u: undefined };
  assert.equal(canonicalBytes(sample), new TextEncoder().encode(canonicalJson(sample)).length, 'the counter equals the canonical string length');
});

// ---- 3. error codes are normalised first; learner words are fixed ----------------------------------------------------------

test('an unknown, missing or non-string code becomes runtime_error with its own fixed, schema-valid message', () => {
  for (const code of ['made_up', undefined, null, 7, {}, [], ['runtime_limit'], Symbol.for('x'), '', 'RUNTIME_LIMIT']) {
    const error = new RuntimeError(code);
    assert.equal(error.code, 'runtime_error');
    assert.equal(error.message, ERROR_MESSAGES.runtime_error);
    assert.equal(RuntimeErrorSchema.safeParse(error.toJSON()).success, true);
  }
});

test('every stable code has a non-empty fixed message that passes RuntimeErrorSchema', () => {
  assert.deepEqual([...ERROR_CODES], ['invalid_program', 'unsupported_capability', 'runtime_limit', 'runtime_error', 'invalid_output', 'version_unavailable']);
  for (const code of ERROR_CODES) {
    const error = new RuntimeError(code);
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    assert.equal(error.message, ERROR_MESSAGES[code]);
    assert.equal(RuntimeErrorSchema.safeParse(error.toJSON()).success, true, code);
  }
});

test('diagnostics never reach the learner: not the message, not the serialized error, not enumerable fields', () => {
  const secrets = ['SOURCE_SECRET export function evaluate', 'at secretFunction (/internal/worker.js:12:3)', 'https://example.com/?token=ctx_9f2'];
  for (const secret of secrets) {
    const error = new RuntimeError('runtime_error', secret);
    assert.equal(error.diagnostic, secret, 'kept on the separate field for logs');
    assert.equal(error.message.includes(secret), false);
    assert.equal(JSON.stringify(error).includes(secret), false);
    assert.equal(JSON.stringify({ ...error }).includes(secret), false, 'a spread copy cannot carry it either');
    assert.equal(Object.keys(error).includes('diagnostic'), false);
    assert.deepEqual(Object.keys(error.toJSON()), ['code', 'message']);
    assert.equal(encodeURIComponent(error.message).includes('SOURCE_SECRET'), false);
  }
  assert.equal(new RuntimeError('runtime_error', 'x'.repeat(5000)).diagnostic.length, 500);
  assert.equal(new RuntimeError('runtime_error', { toString() { throw new Error('boom'); } }).diagnostic, undefined, 'only strings are kept');
  const failed = parseGuestResult({ frame: { objects: [{ kind: 'box', id: 'SECRET_ID', x: 'SECRET_X', y: 0, w: 1, h: 1 }] }, quantities: {} });
  assert.equal(failed.error.message, ERROR_MESSAGES.invalid_output);
  assert.equal(JSON.stringify(failed.error).includes('SECRET'), false);
});
