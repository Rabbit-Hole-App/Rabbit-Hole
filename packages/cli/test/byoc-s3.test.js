'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { s3Read, accessMap } = require('../lib/byoc-s3');

test('S3 access names a literal folder and normalizes its trailing slash', () => {
  assert.equal(s3Read('s3://company-data/reports'), 's3://company-data/reports/');
  assert.equal(s3Read('s3://company-data/reports/'), 's3://company-data/reports/');
  assert.equal(s3Read(null), null);
  for (const scope of ['', true, [], 's3://company-data/', 's3://company-data/reports*',
    's3://company-data/${aws:username}/', 's3://company-data/reports?/','https://company-data/reports/',
    's3://company-data/../reports/', 's3://company-data/reports//', 's3://127.0.0.1/reports/']) {
    assert.throws(() => s3Read(scope), /S3/);
  }
});

test('approval metadata has canonical scopes, valid app names, and a bounded size', () => {
  assert.deepEqual(accessMap({ two: 's3://company-data/two', one: 's3://company-data/one/' }),
    { one: 's3://company-data/one/', two: 's3://company-data/two/' });
  for (const value of [null, [], { 'Bad app': 's3://company-data/reports/' }, { job: null }]) {
    assert.throws(() => accessMap(value));
  }
  assert.throws(() => accessMap(Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['job-' + i, 's3://company-data/reports/']))), /limit/);
});
