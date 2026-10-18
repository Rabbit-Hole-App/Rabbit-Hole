import test from 'node:test';
import assert from 'node:assert/strict';
import { boardImageContext } from './learn-image-context.js';

const revision = 'a'.repeat(64);
const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
function fixture({ authorized = true, sha = revision, size = bytes.length } = {}) {
  const reads = [];
  const env = {
    LEARN_DB: { prepare(sql) { return { bind(...args) { return { async first() {
      if (sql.includes('file_sources')) return { id: 'source', sha256: sha, family: 'image', r2_key: 'trusted-key' };
      if (sql.includes('file_source_refs')) return authorized && args[1] === 'board' ? { 1: 1 } : null;
      throw Error('Unexpected query');
    } }; } }; } },
    LEARN_MEDIA: { async get(key) { reads.push(key); return { size, body: bytes, async arrayBuffer() { return bytes.buffer; } }; } },
  };
  return { env, reads, row: { id: 'board' }, block: { type: 'file', kind: 'image', assetKey: 'obsolete-legacy', fileRef: { source: { id: 'source', rev: revision } } } };
}

test('vision reads the saved authorized file revision instead of a retained original asset', async () => {
  const f = fixture();
  const result = await boardImageContext(f.env, f.row, f.block);
  assert.ok(result.blocks.some(block => block.type === 'image'));
  assert.deepEqual(f.reads, ['trusted-key']);
});

test('unauthorized and stale file references never fall back to legacy bytes', async () => {
  for (const options of [{ authorized: false }, { sha: 'b'.repeat(64) }]) {
    const f = fixture(options);
    const result = await boardImageContext(f.env, f.row, f.block);
    assert.equal(result.blocks.some(block => block.type === 'image'), false);
    assert.match(result.notice, /could not be read/);
    assert.deepEqual(f.reads, []);
  }
});

test('oversized originals are not forwarded as image content', async () => {
  const f = fixture({ size: 6 * 1024 * 1024 });
  const result = await boardImageContext(f.env, f.row, f.block);
  assert.equal(result.blocks.some(block => block.type === 'image'), false);
});

test('legacy images still resolve through their existing board asset path', async () => {
  const f = fixture();
  delete f.block.fileRef;
  const result = await boardImageContext(f.env, f.row, f.block);
  assert.ok(result.blocks.some(block => block.type === 'image'));
  assert.equal(f.reads.length, 1);
  assert.match(f.reads[0], /^learn-boards\/board\//);
});

test('malformed current revision cannot silently downgrade to retained legacy asset', async () => {
  const f = fixture();
  f.block.fileRef.source.rev = 'invalid';
  const result = await boardImageContext(f.env, f.row, f.block);
  assert.equal(result.blocks.some(block => block.type === 'image'), false);
  assert.deepEqual(f.reads, []);
});

test('a frozen request cannot read a newer accepted image revision', async () => {
  const f = fixture();
  const result = await boardImageContext(f.env, f.row, f.block, { id: 'source', rev: 'b'.repeat(64) });
  assert.equal(result.blocks.some(block => block.type === 'image'), false);
  assert.deepEqual(f.reads, []);
});

test('malformed explicit frozen sources cannot match absent legacy fields', async () => {
  for (const source of [{}, false, '', { id: 'source' }]) {
    const f = fixture();
    delete f.block.fileRef;
    const result = await boardImageContext(f.env, f.row, f.block, source);
    assert.equal(result.blocks.some(block => block.type === 'image'), false);
    assert.deepEqual(f.reads, []);
  }
});
