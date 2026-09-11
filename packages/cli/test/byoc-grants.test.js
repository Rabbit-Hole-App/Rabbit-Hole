'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { grants } = require('../lib/byoc-grants');
const { parse } = require('../lib/toml');

for (const account of ['123456789012', '234567890123']) test(`configured actions use customer ${account}, without a code-specific action list`, () => {
  const toml = `[aws]\ngrants = [{ action = "dynamodb:GetItem", resource = "arn:aws:dynamodb:us-east-1:${account}:table/orders" }]\n`;
  const input = parse(toml).aws.grants;
  const connection = { account_id: account, region: 'us-east-1', allowed_actions: ['dynamodb:GetItem'] };
  assert.deepEqual(grants(input, connection), input);
  assert.throws(() => grants(input, { ...connection, account_id: '999999999999' }), /account/);
  assert.throws(() => grants(input, { ...connection, allowed_actions: ['s3:GetObject'] }), /AppGrantActions/);
});

test('grants reject wildcard actions, role management and unscoped resources', () => {
  for (const [action, resource] of [['iam:PassRole', '*'], ['s3:*', 'arn:aws:s3:::company-data/*'],
    ['s3:GetObject', 'arn:aws:s3:::*/*'], ['s3:PutObject', 'arn:aws:s3:::company-data/jobs*'],
    ['lambda:InvokeFunction', 'arn:aws:lambda:us-east-1:123456789012:function:*'],
    ['dynamodb:GetItem', 'arn:aws:dynamodb:us-east-1:123456789012:table/orders/*'],
  ]) assert.throws(() => grants([{ action, resource }]));
});

test('file bytes use a checksummed customer S3 PUT, never the metadata API', async (t) => {
  const { uploadInputs } = await import('../lib/byoc-uploads.mjs');
  const data = new TextEncoder().encode('event-1\n');
  const calls = [];
  const file = { name: 'events.txt', size: data.byteLength, arrayBuffer: async () => data.buffer };
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return new Response(''); });
  const api = async (path, options) => {
    assert.equal(path, '/uploads');
    assert.equal(options.body.files.event_ids_file.filename, 'events.txt');
    assert.equal(JSON.stringify(options).includes('event-1'), false);
    const headers = { 'content-type': 'application/octet-stream', 'x-amz-checksum-sha256': options.body.files.event_ids_file.sha256 };
    return { upload_id: 'u-fixture', data_bucket: 'customer', files: { event_ids_file: {
      url: 'https://customer.s3.us-east-1.amazonaws.com/apps/job/uploads/fixture?signature=fixture', headers,
    } } };
  };
  const result = await uploadInputs(api, 'd-fixture', { event_ids_file: file }, 'customer');
  assert.equal(result, 'u-fixture');
  assert.deepEqual(new Uint8Array(calls[0].options.body), data);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  await assert.rejects(uploadInputs(api, 'd-fixture', { event_ids_file: file }, 'another-customer'), /another upload bucket/);
  assert.equal(calls.length, 1);
});
