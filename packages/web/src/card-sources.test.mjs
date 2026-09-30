import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupSources, repositoryUrl, sourceLabel, sourceProblems, sourceTarget, validSources } from './card-sources.js';

const REV = 'a'.repeat(40);
const code = { kind: 'code', repo: 'owner/name', revision: REV, path: 'pkg/mod.py', lines: [10, 12], note: 'the loop' };
const paper = { kind: 'paper', title: 'A paper', arxiv: '1706.03762', page: 3 };
const wiki = { kind: 'web', title: 'Softmax function', url: 'https://en.wikipedia.org/wiki/Softmax_function' };
const page = { kind: 'doc', title: 'Library docs', url: 'https://example.org/docs' };
const data = { kind: 'dataset', title: 'Corpus', url: 'https://example.org/data.txt', sha256: 'f'.repeat(64) };
const calc = { kind: 'calculation', status: 'Calculated toy example', title: 'Stored presets', note: 'Three logit vectors written by the generator.', reproduce: 'python gen.py --check' };

test('well-formed entries of every kind have no problems', () => {
  for (const source of [code, paper, wiki, page, data, calc]) assert.deepEqual(sourceProblems(source), [], source.kind);
});

test('malformed entries are named and never shown', () => {
  const bad = [
    { ...code, revision: 'abc1234' }, // a short sha is not an exact revision
    { ...code, lines: [12, 10] },
    { ...code, path: '/abs.py' },
    { ...paper, arxiv: undefined },
    { ...page, url: 'http://example.org' },
    { ...data, sha256: 'xyz' },
    { ...calc, status: 'Guess' },
    { ...calc, note: '' },
    { kind: 'tweet', title: 'x' },
    null,
  ];
  for (const source of bad) assert.ok(sourceProblems(source).length > 0, JSON.stringify(source));
  assert.deepEqual(validSources([code, ...bad, calc]), [code, calc]);
  assert.deepEqual(validSources(undefined), []);
});

test('labels: code reads path:start-end, everything else its title', () => {
  assert.equal(sourceLabel(code), 'pkg/mod.py:10-12');
  assert.equal(sourceLabel({ ...code, lines: [7, 7] }), 'pkg/mod.py:7');
  assert.equal(sourceLabel(paper), 'A paper');
});

test('targets route code to the inspector at its exact revision, papers and Wikipedia to readers', () => {
  assert.deepEqual(sourceTarget(code), { open: 'file', repo: 'owner/name', commit: REV, path: 'pkg/mod.py', line: 10, lineEnd: 12,
    href: `https://github.com/owner/name/blob/${REV}/pkg/mod.py#L10-L12` });
  assert.deepEqual(sourceTarget(paper), { open: 'link', href: 'https://arxiv.org/abs/1706.03762#page=3' });
  assert.deepEqual(sourceTarget(wiki), { open: 'wiki', title: 'Softmax_function', href: wiki.url });
  assert.deepEqual(sourceTarget(page), { open: 'link', href: page.url });
  assert.deepEqual(sourceTarget(data), { open: 'link', href: data.url });
  assert.deepEqual(sourceTarget(calc), { open: 'detail' });
  assert.equal(repositoryUrl({ repo: 'o/n', commit: REV, path: 'f.py', line: 4 }), `https://github.com/o/n/blob/${REV}/f.py#L4`);
});

test('groups keep the declared order within a group and drop empty groups', () => {
  const second = { ...code, path: 'b.py' };
  const groups = groupSources([calc, code, data, second]);
  assert.deepEqual(groups.map(group => group.id), ['code', 'data', 'example']);
  assert.deepEqual(groups[0].items, [code, second]);
  assert.deepEqual(groupSources([]), []);
});

test('the shared schema and disclosure name no card, lesson or repository', () => {
  for (const file of ['./card-sources.js', './SourcesDisclosure.jsx']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /nano|karpathy|shakespeare|model\.py|train\.py|\bc\d\d-/i, file);
  }
});
