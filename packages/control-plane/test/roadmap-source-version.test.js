import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeReadSource, d1PublicRef } from '../src/roadmap/roadmap-source-read.js';
import { readRoadmapSource } from '../src/roadmap/roadmap-source.js';
import { buildIndex, scopeChoices, indexSource, withSourceEvidence, INDEX_LIMITS } from '../src/roadmap/roadmap-source-index.js';
import { summarizeIndex } from '../src/roadmap/roadmap-source-summary.js';
import { ROADMAP_LIMITS } from '../src/roadmap/roadmap-policy.js';
import { learnDb } from './learn-grade-fixture.js';
import { MIGRATION, me, other, readerFor, file, rev, longDoc } from './roadmap-source-fixture.js';

const REFS = readFileSync(new URL('../learn-migrations/0038-source-refs.sql', import.meta.url), 'utf8');
const ON = { ROADMAP_ENABLED: 'true', ROADMAP_LONG_MARKDOWN_ENABLED: 'true' };
function world(t, text = longDoc({ chapters: 40, para: 3000 }), flags = ON) {
  const { LEARN_DB, sqlite } = learnDb(t, MIGRATION + '\n' + REFS), files = { 'file:a': file(text, rev('a')) }, readSourceForActor = readerFor(files);
  const env = { ...flags, LEARN_DB };
  return { LEARN_DB, sqlite, files, env, readSourceForActor, read: makeReadSource(env, { readSourceForActor, resolveSourceRef: async () => null }) };
}
const create = (w, scope, who = me, revision = rev('a')) => w.read(who, { sourceId: 'file:a', revision, scope });

test('R4 behavior is unchanged with the switch off: the over-bound limitation has no coverage or choices, and a section scope is not a scope', async t => {
  const w = world(t, longDoc({ chapters: 40, para: 3000 }), { ROADMAP_ENABLED: 'true' });
  const out = await create(w, { kind: 'whole' });
  assert.equal(out.code, 'source_too_large');
  assert.deepEqual(Object.keys(out.limitation), ['code', 'message', 'readChars', 'sourceChars', 'offers']);
  assert.equal((await create(w, { kind: 'section', locationId: 's1' })).code, 'invalid_request');
  assert.equal((await w.LEARN_DB.prepare('SELECT COUNT(*) AS n FROM learn_source_indices').first()).n, 0, 'no index was written');
});

test('flag off, ROADMAP_ENABLED unset: not a single D1 statement from the R7a paths', async () => {
  const seen = [];
  const env = { LEARN_DB: { prepare: sql => { seen.push(sql); throw new Error('db used'); } } };
  const read = makeReadSource(env, { readSourceForActor: readerFor({ 'file:a': file('x'.repeat(50000), rev('a')) }), resolveSourceRef: async () => null });
  const out = await read(me, { sourceId: 'file:a', revision: rev('a'), scope: { kind: 'whole' } });
  assert.equal(out.code, 'source_too_large');
  assert.deepEqual(seen, []);
});

test('production today, ROADMAP_ENABLED true with the R7a switch unset: no D1 statement, no model call, no new field', async () => {
  const seen = [], calls = [];
  const env = { ROADMAP_ENABLED: 'true', LEARN_DB: { prepare: sql => { seen.push(sql); throw new Error('db used'); } } };
  const read = makeReadSource(env, { readSourceForActor: readerFor({ 'file:a': file('x'.repeat(50000), rev('a')) }), resolveSourceRef: async () => null });
  const out = await read(me, { sourceId: 'file:a', revision: rev('a'), scope: { kind: 'whole' } });
  assert.equal(out.code, 'source_too_large');
  assert.deepEqual(Object.keys(out.limitation), ['code', 'message', 'readChars', 'sourceChars', 'offers']);
  assert.equal((await read(me, { sourceId: 'file:a', revision: rev('a'), scope: { kind: 'section', locationId: 's1' } })).code, 'invalid_request');
  assert.equal((await summarizeIndex(env, me, 'idx_x', { callModel: async () => { calls.push(1); return {}; }, readSourceForActor: async () => ({}) })).reason, 'not_enabled');
  const caps = [{ name: 'x' }];
  assert.equal(withSourceEvidence(caps, env), caps);
  assert.deepEqual([seen.length, calls.length], [0, 0]);
});

test('on: an over-bound whole request reports coverage and choices instead of a prefix; a late chapter is explainable', async t => {
  const w = world(t);
  const out = await create(w, { kind: 'whole' });
  assert.equal(out.code, 'source_too_large');
  const { coverage, choices } = out.limitation;
  assert.equal(coverage.complete, true);
  assert.equal(coverage.indexedThrough, coverage.totalChars);
  assert.deepEqual(coverage.unread, []);
  assert.ok(choices.length > 1 && choices.at(-1).label.includes('Appendix'));
  const late = choices.at(-1), read = await create(w, { kind: 'section', locationId: late.locationId, part: late.part });
  assert.equal(read.rev, rev('a'));
  assert.equal(read.scope.kind, 'passage');
  assert.ok(read.scope.chars === late.chars && read.scope.chars <= ROADMAP_LIMITS.source.chars);
  assert.equal(read.scope.end, w.files['file:a'].text.length, 'the last section ends the document');
  assert.ok(read.scope.start > ROADMAP_LIMITS.source.chars, 'a section beyond the original bound');
  // the stored shape is the R4 passage scope, so planning re-reads it unchanged and the fingerprint matches
  const again = await readRoadmapSource(w.env, me, { ref: { key: 'file:a', rev: rev('a') }, scope: { kind: 'passage', start: read.scope.start, end: read.scope.end } }, { readSourceForActor: w.readSourceForActor });
  assert.equal(again.sourceFingerprint, read.scopeFingerprint);
  assert.ok(again.text.includes('Zebrafish'));
});

test('on: headingless text and an enormous single section are addressable by part, and every part is readable', async t => {
  const w = world(t, 'sentence one two three. '.repeat(40000));
  const out = await create(w, { kind: 'whole' });
  const { choices } = out.limitation;
  assert.ok(choices.length > 20 && choices.every(c => c.chars <= INDEX_LIMITS.partChars));
  assert.match(choices[0].label, /^The text, part 1 of /);
  const last = choices.at(-1), read = await create(w, { kind: 'section', locationId: last.locationId, part: last.part });
  assert.equal(read.scope.end, w.files['file:a'].text.length);
  assert.equal(read.scope.chars, last.chars);
});

test('on: a section that is not in the outline, or a malformed one, is refused with a one-line reason', async t => {
  const w = world(t);
  assert.equal((await create(w, { kind: 'section', locationId: 'nope', part: 1 })).code, 'needs_clarification');
  assert.equal((await create(w, { kind: 'section', locationId: 's1', part: 0 })).code, 'invalid_request');
  assert.equal((await create(w, { kind: 'section' })).code, 'invalid_request');
});

test('on: a source over the reader limit says so and offers nothing it cannot read', async t => {
  const w = world(t);
  w.files['file:a'] = file('', rev('a'), { complete: false });
  const out = await create(w, { kind: 'whole' });
  assert.equal(out.code, 'source_too_large');
  assert.match(out.limitation.message, /too large to index/);
  assert.equal(out.limitation.coverage.complete, false);
  assert.deepEqual(out.limitation.choices, []);
  assert.equal(out.limitation.coverage.unread[0].reason, 'source_over_read_limit');
});

test('on: access is enforced on every call; a cached index is no credential', async t => {
  const w = world(t);
  assert.equal((await create(w, { kind: 'whole' })).code, 'source_too_large'); // owner populates the cache
  const intruder = await create(w, { kind: 'section', locationId: 's1', part: 1 }, other);
  assert.equal(intruder.code, 'source_unavailable');
  const whole = await create(w, { kind: 'whole' }, other);
  assert.equal(whole.limitation?.coverage, undefined, 'no coverage or choices for a learner who cannot read the source');
});

test('source replacement: the old revision stops answering, the new one is indexed separately, delivered references keep their historical revision', async t => {
  const w = world(t);
  // a card delivered earlier carries an R3 reference to the old revision
  w.sqlite.prepare("INSERT INTO learn_source_refs (id, org, owner_email, kind, source_key, source_name, source_rev, anchor_json, anchor_hash, created_at) VALUES ('sref_000000000000000000000001', 'o', 'a@x.test', 'markdown', 'file:a', 'long.md', ?, '{\"quote\":{\"exact\":\"x\"}}', 'h', 1)").run(rev('a'));
  const before = w.sqlite.prepare('SELECT * FROM learn_source_refs').all().map(r => ({ ...r }));
  const first = await create(w, { kind: 'whole' });
  const oldChoice = first.limitation.choices[0];
  w.files['file:a'] = file(longDoc({ chapters: 45, para: 3000 }) + '\n# Added\n\nNew chapter.\n', rev('b'));
  const stale = await create(w, { kind: 'section', locationId: oldChoice.locationId, part: oldChoice.part }); // still holding the old revision
  assert.equal(stale.code, 'source_changed');
  assert.equal(stale.status, 409);
  const fresh = await create(w, { kind: 'whole' }, me, rev('b'));
  assert.ok(fresh.limitation.coverage.totalChars > first.limitation.coverage.totalChars);
  const rows = w.sqlite.prepare('SELECT source_rev, status FROM learn_source_indices ORDER BY source_rev').all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ source_rev: rev('a'), status: 'stale' }, { source_rev: rev('b'), status: 'ready' }]);
  assert.deepEqual(w.sqlite.prepare('SELECT * FROM learn_source_refs').all().map(r => ({ ...r })), before, 'R3 references are untouched');
  const ref = await d1PublicRef(w.env, me, 'sref_000000000000000000000001');
  assert.equal(ref.source.rev, rev('a'), 'the historical reference still names the revision it was minted against');
  // reverting to the old bytes revives the old deterministic index instead of rebuilding a different one
  w.files['file:a'] = file(longDoc({ chapters: 40, para: 3000 }), rev('a'));
  const back = await indexSource(w.env, me, { sourceKey: 'file:a', sourceRevision: rev('a') }, { readSourceForActor: w.readSourceForActor });
  assert.equal(back.index.status, 'ready');
});

test('an index from an older extractor version is not reused: a new version gets its own row and the old one stays', async t => {
  const w = world(t);
  const { index } = await indexSource(w.env, me, { sourceKey: 'file:a', sourceRevision: rev('a') }, { readSourceForActor: w.readSourceForActor });
  w.sqlite.prepare("UPDATE learn_source_indices SET id = 'idx_old', extractor_version = 'md-text-0'").run(); // pretend this row came from the previous extractor
  const rebuilt = await indexSource(w.env, me, { sourceKey: 'file:a', sourceRevision: rev('a') }, { readSourceForActor: w.readSourceForActor });
  assert.equal(rebuilt.reused, false);
  assert.equal(rebuilt.index.indexId, index.indexId);
  assert.equal(w.sqlite.prepare('SELECT COUNT(*) AS n FROM learn_source_indices').get().n, 2);
});

test('budget exhaustion is visible in the limitation: what is summarized, what is only outlined', async t => {
  const w = world(t);
  const idx = (await indexSource(w.env, me, { sourceKey: 'file:a', sourceRevision: rev('a') }, { readSourceForActor: w.readSourceForActor })).index;
  const callModel = async (_role, body) => ({ content: [{ type: 'tool_use', name: 'summarize_chunks', input: { summaries: [...body.messages[0].content.matchAll(/<chunk id="(c\d+)"/g)].map(m => ({ chunkId: m[1], summary: 'ok' })) } }] });
  const done = await summarizeIndex(w.env, me, idx.indexId, { readSourceForActor: w.readSourceForActor, callModel, limits: { ...INDEX_LIMITS.summary, maxCalls: 1 } });
  assert.equal(done.reason, 'budget_calls');
  const { limitation } = await create(w, { kind: 'whole' });
  assert.ok(limitation.coverage.summarizedChars > 0 && limitation.coverage.summarizedChars < limitation.coverage.totalChars);
  assert.equal(limitation.coverage.complete, true); // outline covers everything; summaries are partial and not presented as full coverage
});

test('the choice list stays bounded for the largest readable source (2 MiB) and still reaches the last character', () => {
  for (const text of ['x '.repeat(1048576), Array.from({ length: 70000 }, (_, i) => `# H${i}\nbody\n`).join('').slice(0, 2097152), Array.from({ length: 300 }, (_, i) => `# Chapter ${i}\n\n${'w '.repeat(3500)}\n`).join('')]) {
    const choices = scopeChoices(buildIndex(text));
    assert.ok(choices.length <= INDEX_LIMITS.maxChoices, `${choices.length} choices`);
    assert.equal(choices.at(-1).end, text.length);
    assert.equal(choices.reduce((n, c) => n + c.chars, 0), text.length);
  }
});
