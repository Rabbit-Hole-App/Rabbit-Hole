// Bounded retry for the release scripts' network calls. Injected exec and sleep keep this instant.
//   node --test scripts/ci/net.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { retryable, run } from './net.mjs';

test('only transport errors are retried', () => {
  for (const s of ['Recv failure: Connection was reset', 'HTTP 502: Server Error', 'HTTP 504: timeout', 'Operation timed out']) assert.equal(retryable(s), true, s);
  for (const s of ['HTTP 401: Bad credentials', 'HTTP 403', '! [rejected] (non-fast-forward)', 'HTTP 422: Unprocessable', 'HTTP 404']) assert.equal(retryable(s), false, s);
});

const fail = stderr => Object.assign(new Error(stderr), { stderr });

// Each call consumes the next outcome: a string is stdout, an Error is thrown.
function scripted(...outcomes) {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, args]);
    const o = outcomes.shift();
    if (o instanceof Error) throw o;
    return o;
  };
  return { exec, calls };
}

test('success on the first try returns stdout, with no check and no sleep', () => {
  const { exec, calls } = scripted('ok\n');
  const waits = [];
  let checks = 0;
  assert.equal(run('git', ['push'], { check: () => { checks++; return false; }, exec, sleep: ms => waits.push(ms) }), 'ok\n');
  assert.equal(calls.length, 1);
  assert.equal(checks, 0);
  assert.deepEqual(waits, []);
});

test('a retryable error then success resends once after 5 s', () => {
  const { exec, calls } = scripted(fail('HTTP 503: Service Unavailable'), 'ok');
  const waits = [];
  assert.equal(run('git', ['push'], { check: () => false, exec, sleep: ms => waits.push(ms) }), 'ok');
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [5000]);
});

test('a retryable error where check() says the mutation landed returns without resending', () => {
  const { exec, calls } = scripted(fail('Recv failure: Connection was reset'));
  const waits = [];
  assert.equal(run('gh', ['api'], { check: () => true, exec, sleep: ms => waits.push(ms) }), null);
  assert.equal(calls.length, 1);
  assert.deepEqual(waits, []);
});

test('a non-retryable error is rethrown after one call, without check or sleep', () => {
  const { exec, calls } = scripted(fail('HTTP 401: Bad credentials'));
  const waits = [];
  let checks = 0;
  assert.throws(() => run('gh', ['api'], { check: () => { checks++; return false; }, exec, sleep: ms => waits.push(ms) }), { message: 'HTTP 401: Bad credentials' });
  assert.equal(calls.length, 1);
  assert.equal(checks, 0);
  assert.deepEqual(waits, []);
});

test('three retryable errors give up after 3 calls, with 5 s then 15 s backoff', () => {
  const { exec, calls } = scripted(fail('HTTP 503'), fail('HTTP 503'), fail('HTTP 503'));
  const waits = [];
  assert.throws(() => run('git', ['push'], { check: () => false, exec, sleep: ms => waits.push(ms) }), { message: 'HTTP 503' });
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [5000, 15000]);
});
