import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentBlocks, readAskRequest, ATTACHMENT_LIMIT } from '../src/ask.js';

const file = (bytes, name, type) => new File([bytes], name, { type });

test('a chat attachment becomes model input: image and PDF as blocks, anything else as text', async () => {
  assert.equal((await attachmentBlocks(file(new Uint8Array([1, 2, 3]), 'a.png', 'image/png'))).blocks[0].source.media_type, 'image/png');
  assert.equal((await attachmentBlocks(file(new Uint8Array([37, 80, 68, 70]), 'paper.pdf', ''))).blocks[0].type, 'document');
  assert.match((await attachmentBlocks(file('x,y\n1,2', 'data.csv', 'text/csv'))).blocks[0].text, /Attached file data.csv:\nx,y/);
  await assert.rejects(attachmentBlocks({ size: ATTACHMENT_LIMIT + 1, name: 'big.bin' }), /4 MB/);
});

test('a chat request is JSON, or multipart with the JSON in body and one file', async () => {
  const json = await readAskRequest(new Request('https://x/api/learn/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) }));
  assert.deepEqual(json, { body: { message: 'hi' }, file: null });
  const form = new FormData();
  form.append('body', JSON.stringify({ message: 'see file', mentions: ['repo-a'] }));
  form.append('file', file('hello', 'n.txt', 'text/plain'));
  const multipart = await readAskRequest(new Request('https://x/api/learn/ask', { method: 'POST', body: form }));
  assert.deepEqual(multipart.body, { message: 'see file', mentions: ['repo-a'] });
  assert.equal(multipart.file.name, 'n.txt');
});

// duplication-13: the one encoder attachments, uploaded papers and dropped images share.
test('base64 matches Buffer for a buffer larger than one chunk', async () => {
  const { base64 } = await import('../src/token.js');
  const bytes = new Uint8Array(100000).map((_, i) => (i * 31) % 256);
  assert.equal(base64(bytes), Buffer.from(bytes).toString('base64'));
});
