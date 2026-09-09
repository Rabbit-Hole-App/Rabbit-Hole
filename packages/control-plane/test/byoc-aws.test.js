import test from 'node:test';
import assert from 'node:assert/strict';
import { awsCall } from '../src/byoc-aws.js';

test('signed AWS requests reject redirects without following them or exposing response details', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return new Response('<Error><Code>TemporaryRedirect</Code><Message>fixture-secret</Message></Error>', {
      status: 307, headers: { Location: 'https://unexpected.test/' },
    });
  });
  await assert.rejects(awsCall({ AccessKeyId: 'fixture-key', SecretAccessKey: 'fixture-secret' }, 'us-east-1', 's3', '/template.json', '{}'),
    (error) => error.status === 502 && error.message.includes('TemporaryRedirect') && !error.message.includes('fixture-secret'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(new URL(calls[0].url).hostname, 's3.us-east-1.amazonaws.com');
});
