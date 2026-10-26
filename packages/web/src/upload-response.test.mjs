import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUpload } from '../e2e/upload-response.mjs';

const NO_LENGTH = { status: 411, error: 'Send this file with its Content-Length.' };
const JSON_TYPE = 'application/json';
const lost = code => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('socket'), { code }) });

test('the expected JSON 411 passes and keeps its body', () => {
  const r = classifyUpload({ status: 411, contentType: JSON_TYPE, text: JSON.stringify({ error: NO_LENGTH.error }) }, NO_LENGTH);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.body.error, NO_LENGTH.error);
});

test('a RegExp error matches the 413 text', () => {
  const text = JSON.stringify({ error: 'This file is over 50 MiB, so it was not saved to your account and stays in your browser.' });
  assert.equal(classifyUpload({ status: 413, contentType: JSON_TYPE, text }, { status: 413, error: /over 50 MiB/ }).outcome, 'pass');
});

test('recognized interruptions are transport-limited, never pass', () => {
  for (const input of [
    { error: lost('ECONNRESET') },
    { error: lost('UND_ERR_SOCKET') },
    { status: 411, contentType: JSON_TYPE, error: lost('UND_ERR_SOCKET') },
    { status: 500, contentType: 'text/plain;charset=UTF-8', text: 'Error: Network connection lost.' },
    { status: 500, contentType: 'text/plain;charset=UTF-8', text: 'Error: Network connection lost.\n    at ProxyWorker' },
    { status: 411, contentType: JSON_TYPE, text: '' },
  ]) assert.equal(classifyUpload(input, NO_LENGTH).outcome, 'transport-limited', JSON.stringify(input));
});

test('an unknown fetch rejection fails', () => {
  assert.equal(classifyUpload({ error: lost('EPIPE') }, NO_LENGTH).outcome, 'fail');
  assert.equal(classifyUpload({ error: new TypeError('fetch failed') }, NO_LENGTH).outcome, 'fail');
});

test('unexpected non-JSON text fails, including near-misses of the proxy signature', () => {
  for (const input of [
    { status: 500, contentType: 'text/plain;charset=UTF-8', text: 'Internal Server Error' },
    { status: 500, contentType: 'text/plain;charset=UTF-8', text: 'Worker threw: Error: Network connection lost.' },
    { status: 502, contentType: 'text/plain', text: 'Error: Network connection lost.' },
    { status: 500, contentType: 'text/html', text: 'Error: Network connection lost.' },
    { status: 411, contentType: 'text/plain', text: 'length required' },
  ]) {
    const r = classifyUpload(input, NO_LENGTH);
    assert.equal(r.outcome, 'fail', JSON.stringify(input));
    assert.match(r.detail, new RegExp(`^${input.status} `));
  }
});

test('an HTML page fails with its status, content type and a bounded excerpt', () => {
  const html = `<!doctype html><title>502 Bad Gateway</title>${'x'.repeat(1000)}`;
  const r = classifyUpload({ status: 502, contentType: 'text/html', text: html }, NO_LENGTH);
  assert.equal(r.outcome, 'fail');
  assert.match(r.detail, /^502 text\/html body is not JSON: "<!doctype html>/);
  assert.ok(r.detail.length < 400, String(r.detail.length));
});

test('malformed JSON fails, even with the expected status', () => {
  assert.equal(classifyUpload({ status: 411, contentType: JSON_TYPE, text: '{"error":"Send this' }, NO_LENGTH).outcome, 'fail');
});

test('an unexpected 2xx success fails', () => {
  const r = classifyUpload({ status: 200, contentType: JSON_TYPE, text: JSON.stringify({ size: 52428801 }) }, NO_LENGTH);
  assert.equal(r.outcome, 'fail');
  assert.match(r.detail, /^200 application\/json expected 411/);
});

test('an unexpected status or error text fails', () => {
  assert.equal(classifyUpload({ status: 413, contentType: JSON_TYPE, text: JSON.stringify({ error: 'too big' }) }, NO_LENGTH).outcome, 'fail');
  assert.equal(classifyUpload({ status: 411, contentType: JSON_TYPE, text: JSON.stringify({ error: 'other' }) }, NO_LENGTH).outcome, 'fail');
  assert.equal(classifyUpload({ status: 500, contentType: JSON_TYPE, text: JSON.stringify({ error: 'boom' }) }, NO_LENGTH).outcome, 'fail');
  assert.equal(classifyUpload({ status: 200, contentType: JSON_TYPE, text: '' }, NO_LENGTH).outcome, 'fail', 'an empty body with another status');
});
