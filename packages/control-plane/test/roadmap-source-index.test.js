import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, indexSource, scopeChoices, resolveChoice, coverageOf, INDEX_LIMITS, longMarkdownEnabled, loadIndexRow } from '../src/roadmap/roadmap-source-index.js';
import { ROADMAP_LIMITS } from '../src/roadmap/roadmap-policy.js';
import { dbFor, me, other, readerFor, file, rev, longDoc } from './roadmap-source-fixture.js';

const tiles = (items, length) => items.reduce((at, x) => { assert.equal(x.start, at, 'no gap or overlap'); return x.end; }, 0) === length;

test('chunks tile the whole text exactly, every chunk fits a step passage, nothing is dropped', () => {
  const text = longDoc();
  const { sections, chunks } = buildIndex(text);
  assert.ok(tiles(chunks, text.length) && tiles(sections, text.length));
  assert.equal(chunks.map(c => text.slice(c.start, c.end)).join(''), text);
  assert.ok(chunks.every(c => c.end - c.start <= INDEX_LIMITS.chunkChars && INDEX_LIMITS.chunkChars <= ROADMAP_LIMITS.source.passageChars));
  assert.ok(INDEX_LIMITS.partChars <= ROADMAP_LIMITS.source.chars);
});

test('identical bytes give identical chunks and ids', () => {
  assert.deepEqual(buildIndex(longDoc()), buildIndex(longDoc()));
});

test('repeated headings get distinct location ids and dup counts; fenced headings are not headings', () => {
  const { sections } = buildIndex(['# Notes', 'first', '# Notes', 'second', '## Notes', 'nested', '# Notes', 'third', ''].join('\n'));
  const notes = sections.filter(s => s.path === 'Notes');
  assert.equal(notes.length, 3);
  assert.equal(new Set(sections.map(s => s.id)).size, sections.length);
  assert.deepEqual(notes.map(s => s.dup), [0, 1, 2]);
  assert.equal(sections.find(s => s.path === 'Notes > Notes').dup, 0);
  const chapters = buildIndex(longDoc({ chapters: 3 })).sections;
  assert.deepEqual(chapters.filter(s => s.title === 'Exercises').map(s => s.path), ['Chapter 1 > Exercises', 'Chapter 2 > Exercises', 'Chapter 3 > Exercises']);
  const { sections: [first, ...rest] } = { sections: chapters };
  assert.ok(!chapters.some(s => /not a heading|also not/.test(s.title ?? '')));
  assert.equal(first.level, 0); // preamble before the first heading is its own section
  assert.ok(rest.length > 0);
});

test('headingless text and one giant section are split without loss and stay addressable', () => {
  const giant = 'word '.repeat(40000); // 200,000 characters, no heading, no blank line
  const { sections, chunks } = buildIndex(giant);
  assert.equal(sections.length, 1);
  assert.ok(chunks.length > 30 && tiles(chunks, giant.length));
  assert.ok(chunks.every(c => c.parts === chunks.length));
  const fenced = '# T\n\n```\n' + 'x = 1\n'.repeat(5000) + '```\n';
  const f = buildIndex(fenced);
  assert.equal(f.sections.length, 1);
  assert.ok(tiles(f.chunks, fenced.length));
});

test('Unicode: offsets are UTF-16 code units and a cut never splits a surrogate pair', () => {
  const text = '# Emoji\n\n' + '😀'.repeat(7000); // no newline to cut on: forced hard cuts
  const { chunks } = buildIndex(text);
  assert.ok(tiles(chunks, text.length));
  for (const c of chunks) { const s = text.slice(c.start, c.end); assert.ok(!/^[\udc00-\udfff]/.test(s) && !/[\ud800-\udbff]$/.test(s)); }
});

test('empty and whitespace-only text index to no chunks / one chunk without throwing', () => {
  assert.deepEqual(buildIndex('').chunks, []);
  assert.equal(buildIndex('   \n').chunks.length, 1);
});

test('more headings than the cap: the extra headings stay inside the last section, stated as a limitation, text still tiled', () => {
  const text = Array.from({ length: 60 }, (_, i) => `# H${i}\nx\n`).join('');
  const built = buildIndex(text, { maxSections: 10 });
  assert.ok(built.sections.length <= 10 && built.sections.length >= 9);
  assert.equal(built.limitations[0].code, 'headings_capped');
  assert.ok(tiles(built.chunks, text.length));
});

test('indexSource stores once per revision, reuses on the same version, and records the coverage manifest', async t => {
  const { LEARN_DB } = dbFor(t), env = { LEARN_DB }, files = { 'file:a': file(longDoc()) };
  const deps = { readSourceForActor: readerFor(files) };
  const first = await indexSource(env, me, { sourceKey: 'file:a', sourceRevision: files['file:a'].rev }, deps);
  assert.equal(first.status, 'ok');
  assert.equal(first.reused, false);
  const second = await indexSource(env, me, { sourceKey: 'file:a', sourceRevision: files['file:a'].rev }, deps);
  assert.equal(second.reused, true);
  assert.equal(second.index.indexId, first.index.indexId);
  const { coverage, source } = first.index;
  // Complete range accounting: one outlined range spanning the whole text, nothing unreadable, every chunk accounted for.
  assert.deepEqual(coverage.outlined, [{ start: 0, end: source.chars }]);
  assert.equal(coverage.complete, true);
  assert.deepEqual(coverage.unreadable, []);
  assert.equal(coverage.summarized.length, 0);
  assert.deepEqual(coverage.summaryGaps.map(g => g.reason), ['not_summarized']);
  assert.equal((await LEARN_DB.prepare('SELECT COUNT(*) AS n FROM learn_source_indices').first()).n, 1);
});

test('a source over the reader limit is persisted as unreadable coverage, with no chunks and a stated reason', async t => {
  const { LEARN_DB } = dbFor(t), files = { 'file:big': file('', rev('b'), { complete: false }) };
  const out = await indexSource({ LEARN_DB }, me, { sourceKey: 'file:big', sourceRevision: rev('b') }, { readSourceForActor: readerFor(files) });
  assert.equal(out.index.status, 'unreadable');
  assert.deepEqual(out.index.coverage.unreadable, [{ start: 0, end: null, reason: 'source_over_read_limit' }]);
  assert.equal(out.index.coverage.complete, false);
  assert.deepEqual(scopeChoices(out.index), []);
});

test('another learner cannot index or load a source that is not theirs; the row is invisible to them', async t => {
  const { LEARN_DB } = dbFor(t), env = { LEARN_DB }, files = { 'file:a': file(longDoc({ chapters: 2 })) };
  const deps = { readSourceForActor: readerFor(files) };
  const mine = await indexSource(env, me, { sourceKey: 'file:a', sourceRevision: files['file:a'].rev }, deps);
  const theirs = await indexSource(env, other, { sourceKey: 'file:a', sourceRevision: files['file:a'].rev }, deps);
  assert.equal(theirs.status, 'unavailable');
  assert.equal(await loadIndexRow(LEARN_DB, other, mine.index.indexId), null);
  assert.equal((await loadIndexRow(LEARN_DB, me, mine.index.indexId)).id, mine.index.indexId);
});

test('scope choices tile the text, each is readable by R4, a late chapter and a giant section are choices, labels disambiguate repeats', async t => {
  const { LEARN_DB } = dbFor(t), text = longDoc({ chapters: 40, para: 3000 }), files = { 'file:a': file(text) };
  const { index } = await indexSource({ LEARN_DB }, me, { sourceKey: 'file:a', sourceRevision: files['file:a'].rev }, { readSourceForActor: readerFor(files) });
  const choices = scopeChoices(index);
  assert.ok(choices.length > 1 && choices.length <= INDEX_LIMITS.maxChoices);
  assert.ok(choices.every(c => c.chars <= ROADMAP_LIMITS.source.chars && c.chars > 0));
  assert.ok(tiles(choices, text.length));
  assert.ok(choices.at(-1).label.includes('Appendix') && choices.at(-1).end === text.length, 'the last chapter is reachable');
  assert.ok(choices.some(c => c.label.includes(' to ')), 'small neighbouring sections are packed');
  assert.equal(new Set(choices.map(c => c.label)).size, choices.length, 'labels are unique');
  const giantText = '# Giant\n\n' + 'abc '.repeat(60000), huge = buildIndex(giantText);
  const parts = scopeChoices(huge);
  assert.ok(parts.length > 5 && parts.every(c => c.chars <= INDEX_LIMITS.partChars) && tiles(parts, giantText.length));
  assert.deepEqual(resolveChoice(huge, { locationId: parts[2].locationId, part: 3 }), parts[2]);
  assert.equal(resolveChoice(huge, { locationId: 'nope', part: 1 }), null);
});

test('the switch: unset means off, and the coverage function is pure', () => {
  assert.equal(longMarkdownEnabled({}), false);
  assert.equal(longMarkdownEnabled({ ROADMAP_LONG_MARKDOWN_ENABLED: 'true' }), false); // needs ROADMAP_ENABLED too
  assert.equal(longMarkdownEnabled({ ROADMAP_ENABLED: 'true' }), false);
  assert.equal(longMarkdownEnabled({ ROADMAP_ENABLED: 'true', ROADMAP_LONG_MARKDOWN_ENABLED: 'true' }), true);
  const idx = { source: { chars: 5 }, status: 'ready', stop: null, chunks: [{ ordinal: 0, start: 0, end: 5 }], limitations: [] };
  assert.equal(coverageOf(idx, [{ first_chunk: 0, last_chunk: 0, status: 'failed', reason: 'invalid_output' }]).summaryGaps[0].reason, 'invalid_output');
});
