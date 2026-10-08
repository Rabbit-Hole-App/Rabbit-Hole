// Code references in answers (owner, 2026-10-08; docs/features/repository-browser.md "Code references"): the forms answers
// write, the snapshot guard (only a file of the repository is a link) and the link's name; and where a click goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INLINE_PARTS, citedSources, linkable, referenceLabel, singleSourcePath, sourceReference } from './source-references.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const refs = text => text.split(INLINE_PARTS).filter((part, i) => i % 2).map(part => sourceReference(part)).filter(Boolean).map(r => `${r.path}:${r.start}-${r.end}`);

test('every common form of a reference parses to its path and lines, in prose, a list and inline code', () => {
  for (const [form, want] of [
    ['src/itsdangerous/signer.py:15-64', 'src/itsdangerous/signer.py:15-64'], ['src/itsdangerous/signer.py:15–64', 'src/itsdangerous/signer.py:15-64'],
    ['a/b.py:L15-L64', 'a/b.py:15-64'], ['a/b.py#L15-L64', 'a/b.py:15-64'], ['a/b.py:15', 'a/b.py:15-15'], ['a/b.py#L7', 'a/b.py:7-7'], ['`a/b.py:3-4`', 'a/b.py:3-4'],
  ]) { const r = sourceReference(form); assert.equal(r && `${r.path}:${r.start}-${r.end}`, want, form); }
  const answer = 'The signer lives in src/itsdangerous/signer.py:15-64 and the serializer in `src/itsdangerous/serializer.py:278-300`; see also a/b.py#L1-L2.';
  assert.deepEqual(refs(answer), ['src/itsdangerous/signer.py:15-64', 'src/itsdangerous/serializer.py:278-300', 'a/b.py:1-2']);
  assert.deepEqual(refs('- src/x.py:L3-L4 sets it up'), ['src/x.py:3-4']);
  assert.deepEqual(citedSources('see a/b.py#L15-L64, c.py:L2 and d.py:3-5, 9').map(c => `${c.path}:${c.start}-${c.end}`), ['a/b.py:15-64', 'c.py:2-2', 'd.py:3-5', 'd.py:9-9']);
  assert.equal(singleSourcePath('first a/b.py#L1-L2 then a/b.py:L9'), 'a/b.py');
  assert.equal(sourceReference('a/b.py:20-10'), null, 'an end before its start is no reference');
});

test('inside a repository context only a file of its snapshot is a link; outside one every reference with an opener is', () => {
  const has = new Set(['src/itsdangerous/signer.py']);
  assert.equal(linkable(sourceReference('src/itsdangerous/signer.py:15-64'), p => has.has(p)), true);
  assert.equal(linkable(sourceReference('src/itsdangerous/missing.py:1-2'), p => has.has(p)), false, 'no dead link');
  assert.equal(linkable(sourceReference('anything.py:1'), null), true);
  assert.equal(linkable(null, null), false);
  assert.equal(referenceLabel({ path: 'src/itsdangerous/signer.py', start: 15, end: 64 }), 'Open signer.py lines 15–64');
  assert.equal(referenceLabel({ path: 'model.py', start: 9, end: 9 }), 'Open model.py line 9');
});

test('a reference is a real button with that name, guarded in prose, Sources lines and the Sources list; a click opens the reader, asking nothing', () => {
  const ask = read('ask.jsx'), page = read('RepositoryPage.jsx'), source = read('RepositorySource.jsx'), learn = read('LearnPage.jsx');
  assert.match(ask, /if\(linkable\(reference,has\)\)return <EvidencePill key=\{i\} type="button" data-code-ref=\{`[^`]+`\} aria-label=\{referenceLabel\(reference\)\}/);
  assert.match(ask, /file = found && \(!has \|\| has\(found\[1\]\)\) \? found : null;/);
  assert.match(ask, /const cited = onFile \? citedSources\(text\)\.filter\(c => linkable\(c, has\)\) : \[\];/);
  assert.match(ask, /const onFile = given && refs \? refs\.open : given, has = given && refs \? refs\.has : null;/);
  // The page: the snapshot's paths, and open = the file in its reader with the range picked (no ask, no fetch).
  assert.match(page, /return \{has:p=>paths\.has\(p\),open:\(\.\.\.a\)=>openRef\.current\(\.\.\.a\)\};\},\[snapshot\]\);/);
  const open = page.slice(page.indexOf('openRef.current=(path,start,end)=>{'), page.indexOf('const codeRefs='));
  assert.match(open, /setOpened\(path\);setJump\(\{path,start,end,at:Date\.now\(\)\}\);/);
  assert.match(open, /if\(tab==='learn'&&!picked\)window\.dispatchEvent\(new CustomEvent\('small:open-files'\)\);else\{setMode\('files'\);if\(tab==='learn'\)go\('map'\);\}/);
  assert.doesNotMatch(open, /fetch\(|api\(|askDraft|learnAction/);
  assert.match(page, /pick=\{jump\}/);
  assert.match(learn, /const show = \(\) => \{ setPanelOpen\(true\); setPanelTab\('files'\); \};\n\s+window\.addEventListener\('small:open-files', show\);/);
  // The reader selects the range as a drag does (the selection Ask in chat and Copy act on), and scrolls it into view.
  assert.match(source, /select\(pick\.start,Math\.min\(pick\.end,last\)\);/);
  assert.match(source, /querySelector\(`\[data-source-line="\$\{pick\.start\}"\]`\)\?\.scrollIntoView\(\{block:'center'\}\)/);
  // The Map's node conversations and the window over the bar link the same way.
  assert.match(read('MapInspector.jsx'), /<Turn key=\{t\.id\} t=\{t\} onFile=\{refs\?\.open \|\| null\} \/>/);
  assert.match(read('agent/ResultSheet.jsx'), /<CodeRefs\.Provider value=\{refs\}>\{turns\.map/);
});
