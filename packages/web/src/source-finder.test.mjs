// Release B lane B3 (C:/s/spec/rel-b.md B3, B5; owner decisions 4A and 5A, 2026-10-16): the one source finder opener and the
// "/" shortcut's editable-field guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDITABLE, FINDER_SOURCES, openSourceFinder, returnFocus, setSourceFinderHost, slashOpensFind } from './source-finder.js';

test('openSourceFinder hands the host the source, the trimmed query and the origin, and settles { added } once it closes', async () => {
  const opened = [];
  let close;
  const off = setSourceFinderHost(seed => { opened.push(seed); return new Promise(resolve => { close = resolve; }); });
  const origin = { into: 'slot-1' };
  let settled = null;
  const finder = openSourceFinder({ source: 'arxiv', query: '  1706.03762 ', origin }).then(done => { settled = done; });
  await Promise.resolve();
  assert.deepEqual(opened, [{ source: 'arxiv', query: '1706.03762', origin }]);
  assert.equal(settled, null, 'open while the finder is open');
  close({ added: true, blockId: 'b1' });
  await finder;
  assert.deepEqual(settled, { added: true, blockId: 'b1' }, 'normalised to { added, blockId }: the added card, kept as a Chat command output (UI changes brief 5)');
  off();
});

test('an empty query reaches the host as empty (the finder waits); closed with nothing added is { added: false }', async () => {
  const opened = [];
  const off = setSourceFinderHost(seed => { opened.push(seed); return undefined; });
  assert.deepEqual(await openSourceFinder({ source: 'youtube' }), { added: false });
  assert.deepEqual(await openSourceFinder({ source: 'wikipedia', query: null }), { added: false });
  assert.deepEqual(opened.map(seed => seed.query), ['', '']);
  off();
});

test('no host (no page draws the finder): nothing opens and nothing is added; an unknown source is refused', async () => {
  assert.deepEqual(await openSourceFinder({ source: 'youtube', query: 'x' }), { added: false });
  await assert.rejects(openSourceFinder({ source: 'paper', query: 'x' }), /unknown finder source/);
  assert.deepEqual(FINDER_SOURCES, ['youtube', 'arxiv', 'wikipedia']);
});

test('an old host unregistering never removes a newer one', async () => {
  const offA = setSourceFinderHost(() => ({ added: false }));
  const offB = setSourceFinderHost(() => ({ added: true }));
  offA();
  assert.deepEqual(await openSourceFinder({ source: 'youtube', query: 'q' }), { added: true });
  offB();
});

test('focus goes back to origin.returnFocus, else to the element focused at opening, if it is still on the page', () => {
  const focused = [];
  const element = name => ({ isConnected: true, focus: () => focused.push(name) });
  returnFocus({ returnFocus: element('composer') }, element('menu'));
  returnFocus({}, element('menu'));
  returnFocus({ returnFocus: () => focused.push('fn') }, null);
  returnFocus({}, { isConnected: false, focus: () => focused.push('gone') });
  returnFocus(null, null);
  assert.deepEqual(focused, ['composer', 'menu', 'fn']);
});

// A stand-in element: closest() answers from the selectors it is inside.
const el = (inside = [], extra = {}) => ({ closest: selector => (selector.split(',').map(s => s.trim()).some(s => inside.includes(s)) ? {} : null), ...extra });
const doc = (modal = false) => ({ querySelector: selector => (modal && selector === '[aria-modal="true"]' ? {} : null) });

test('"/" opens Find outside editable fields, and keeps typing inside Chat, Ctrl+K, inputs, BlockNote and code editors', () => {
  assert.equal(slashOpensFind(null, doc()), true, 'nothing focused (the page body)');
  assert.equal(slashOpensFind(el(), doc()), true, 'a canvas button');
  assert.equal(slashOpensFind(el([], { isContentEditable: true }), doc()), false, 'contenteditable');
  for (const inside of ['input', 'textarea', 'select', 'math-field', '[contenteditable="true"]', '[role="textbox"]', '.cm-editor', '.monaco-editor', '.bn-editor', '[data-chat-composer]', '[data-inline-ai]'])
    assert.equal(slashOpensFind(el([inside]), doc()), false, inside);
  assert.equal(slashOpensFind(el(), doc(true)), false, 'a modal dialog is open');
  assert.match(EDITABLE, /\[data-chat-composer\]/);
});

test('LearnPage: "/" opens the right panel on Find and focuses it; the finder host and Chat\'s openSearch are the shared opener; no top-bar Search', () => {
  const page = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /Search YouTube, arXiv and Wikipedia/, 'the top-bar Search control is gone');
  assert.match(page, /slashOpensFind\(active\)/);
  assert.match(page, /setPanelOpen\(true\); setPanelTab\('find'\); setFindFocus\(n => n \+ 1\)/);
  assert.match(page, /setSourceFinderHost\(/);
  assert.match(page, /openSearch: seed => openSourceFinder\(/);
  assert.equal((page.match(/<SearchBar /g) || []).length, 1, 'one finder');
  // Owner brief 2026-10-22 item 3: one Search sources row opens the one finder; YouTube, arXiv and Wikipedia are choices inside it.
  assert.ok(page.includes('onSearchSources: () => openSourceFinder({})'), 'Insert > Search sources opens the finder');
  assert.doesNotMatch(page, /commandsFor\('insert'\)/, 'no per-source rows in Insert');
});

test('SearchBar adds only through the Add to canvas button: Enter searches a new query and only previews an answered one (lead ruling 2026-10-16)', () => {
  const bar = readFileSync(new URL('./SearchBar.jsx', import.meta.url), 'utf8');
  assert.equal((bar.match(/choose\(/g) || []).length, 1, 'choose is called in one place');
  assert.match(bar, /<button type="button" onClick=\{\(\) => choose\(results\[active\] \|\| results\[0\]\)\}[^>]*>\s*Add to canvas<\/button>/);
  const submit = bar.slice(bar.indexOf('onSubmit='), bar.indexOf('}}>', bar.indexOf('onSubmit=')));
  assert.match(submit, /if \(!current\) run\(\);/);
  assert.doesNotMatch(submit, /choose/);
  assert.match(bar, /data-finder-result=\{result\.key\} onClick=\{\(\) => setActive\(index\)\}/, 'a click previews');
});
