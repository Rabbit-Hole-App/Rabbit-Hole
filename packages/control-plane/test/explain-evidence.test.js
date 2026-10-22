// EXP-T14 repository and paper evidence adapters: permission, revision and coverage rules kept. No network, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arxivEvidence, codeRefEvidence, learnerCitation, repositoryEvidence, searchMatchEvidence, uploadedPaperEvidence, bindClaim } from '../src/explain-evidence.js';
import { resolveCodeRefs } from '../src/repository-context.js';
import { inlineRepositoryEvidence } from '../src/inline-evidence.js';

const commit = 'a'.repeat(40);
const snapshot = { repo: 'karpathy/nanoGPT', commit, skipped: [], graph: { nodes: [{ id: 'n1', label: 'CausalSelfAttention', path: 'model.py', line: 2 }], edges: [] },
  files: { 'model.py': 'import torch\nclass CausalSelfAttention(nn.Module):\n    def __init__(self, config):\n        self.n_head = config.n_head\n' } };

test('exact repository lines become a record bound to the commit; a stale revision or missing file is refused', async () => {
  const r = await repositoryEvidence(snapshot, { path: 'model.py', start: 2, end: 4, expectedCommit: commit });
  assert.equal(r.kind, 'repository');
  assert.equal(r.revision, commit);
  assert.deepEqual(r.lines, { start: 2, end: 4 });
  assert.match(r.excerpt, /^2: class CausalSelfAttention/);
  assert.equal(learnerCitation(r), 'model.py, lines 2-4');
  assert.doesNotMatch(learnerCitation(r), /code:|@/);
  await assert.rejects(repositoryEvidence(snapshot, { path: 'model.py', expectedCommit: 'b'.repeat(40) }), { code: 'stale_revision' });
  await assert.rejects(repositoryEvidence(snapshot, { path: 'train.py' }), { code: 'missing_file' });
  const past = await repositoryEvidence(snapshot, { path: 'model.py', start: 1, end: 40 });
  assert.ok(past.limitations.some(l => /past the end/.test(l)));
});

test('selected code refs: read ones are evidence, other-commit and graph-only selections are reported unread', async () => {
  const refs = [{ kind: 'code', name: 'attn', sourceId: `code:karpathy/nanoGPT@${commit}:model.py`, range: { path: 'model.py', start: 2, end: 3 } },
    { kind: 'code', name: 'old', sourceId: `code:karpathy/nanoGPT@${'c'.repeat(40)}:model.py` },
    { kind: 'code', name: 'other repo', sourceId: `code:someone/else@${commit}:x.py` }];
  const { records, unread } = await codeRefEvidence(snapshot, resolveCodeRefs(snapshot, refs));
  assert.equal(records.length, 1);
  assert.deepEqual(unread.map(u => u.status), ['other_commit', 'unavailable']);
});

test('inline search matches keep their pinned commit and one-line coverage; revoked access is refused', async () => {
  const req = new Request('https://x/api');
  const result = await inlineRepositoryEvidence(req, {}, { app: 'nanogpt', commit, query: 'n_head' }, { authorize: async () => ({ repo: 'karpathy/nanoGPT' }), load: async () => snapshot });
  const records = await searchMatchEvidence(result);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].lines, { start: 4, end: 4 });
  assert.match(records[0].limitations[0], /one line/);
  const refused = await inlineRepositoryEvidence(req, {}, { app: 'nanogpt', commit, query: 'n_head' }, { authorize: async () => Response.json({ error: 'Repository not found in this workspace' }, { status: 404 }), load: async () => snapshot });
  await assert.rejects(searchMatchEvidence(refused), { code: 'inaccessible' });
});

test('papers say what was read: arXiv metadata-only versus PDF bytes; an upload is owner-only', async () => {
  const paper = { id: '1706.03762v7', title: 'Attention Is All You Need', summary: 'The dominant sequence transduction models are based on recurrent networks.' };
  const meta = await arxivEvidence(paper);
  assert.match(meta.limitations[0], /metadata and abstract only/);
  assert.equal(meta.revision, '1706.03762v7');
  const full = await arxivEvidence(paper, { pdfBytes: new TextEncoder().encode('%PDF-1.5 ...') });
  assert.match(full.contentHash, /^sha256:/);
  assert.equal(learnerCitation(meta), 'Attention Is All You Need');
  const store = { 'owner@x.com': { bytes: new Uint8Array([37, 80, 68, 70]), title: 'My notes' } };
  const read = async (env, identity) => { if (!store[identity.email]) throw new Error('That PDF is no longer stored'); return store[identity.email]; };
  const mine = await uploadedPaperEvidence({}, { email: 'owner@x.com' }, 'upload:abcdef123456', { readUploadedPaper: read });
  assert.equal(mine.access, 'owner');
  assert.equal(learnerCitation(mine), 'My notes');
  await assert.rejects(uploadedPaperEvidence({}, { email: 'someone@else.com' }, 'upload:abcdef123456', { readUploadedPaper: read }), { code: 'inaccessible' });
});

test('a claim binds only to excerpts that contain it; repository grounding is never implied for an unrelated claim', async () => {
  const r = await repositoryEvidence(snapshot, { path: 'model.py', start: 1, end: 4 });
  assert.deepEqual(bindClaim('CausalSelfAttention sets n_head from config.n_head', [r], ['causalselfattention', 'n_head', 'config.n_head']), [r.id]);
  assert.deepEqual(bindClaim('photosynthesis converts light', [r]), []);
});
