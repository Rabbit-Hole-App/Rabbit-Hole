// The canvas's right panel header (owner, 2026-10-07; docs/features/panel-header.md): Find, Table of contents and
// Comments (live on a saved top-level canvas) as icon tabs, then Pin and Close; the find matching and the pin preference as pure code.
// The rendered header, a real find and the unpinned close are e2e/panel-header-check.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardWords, findMatches, readPanelPin, savePanelPin } from './canvas-find.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const header = read('./PanelHeader.jsx'), page = read('./LearnPage.jsx');

test('the tabs are Find, Table of contents, Comments in that order, then Pin and Close on the right', () => {
  const order = ["label: 'Find text on canvas'", "label: 'Table of contents'", "label: 'Comments'", 'aria-label="Keep sidebar open"', 'aria-label="Close sidebar"'].map(text => header.indexOf(text));
  assert.ok(order.every(at => at > 0), 'every label is there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the owner\'s order');
  assert.match(header, /\{ id: 'find', label: 'Find text on canvas', Icon: Search \}/);
  assert.match(header, /\{ id: 'toc', label: 'Table of contents', Icon: BookOpen \}/);
  assert.match(header, /\{ id: 'comments', label: 'Comments', Icon: MessageCircle \}/);
  assert.match(header, /data-panel-pin aria-label="Keep sidebar open" title="Keep sidebar open"[\s\S]{0,300}?<Pin /);
  assert.match(header, /data-panel-close aria-label="Close sidebar" title="Close sidebar"[\s\S]{0,300}?<X /);
});

test('icons only: a tooltip and an accessible name, no visible text, one tablist of tabs', () => {
  assert.match(header, /role="tablist"/);
  assert.match(header, /role="tab" data-panel-tab=\{id\} aria-label=\{label\} title=\{title\}/);
  assert.match(header, /<Icon size=\{15\} strokeWidth=\{1\.8\} aria-hidden \/>\n\s+<\/button>/, 'the icon is the tab\'s only child');
});

test('exactly one tab is active: aria-selected, the violet with a white icon, and the only one in the Tab order', () => {
  assert.match(header, /aria-selected=\{tab === id\}/);
  assert.match(header, /tabIndex=\{tab === id \? 0 : -1\}/);
  assert.match(header, /tab === id \? 'bg-\[#5b21b6\] text-white/, 'the /teach violet (--cmd-teach-fg)');
  assert.match(read('./index.css'), /--cmd-teach-fg: #5b21b6;/, 'the same value as the /teach pill');
  assert.match(page, /const \[panelTab, setPanelTab\] = useState\('toc'\);/, 'Table of contents by default');
  assert.match(page, /<div role="tabpanel" aria-label="Table of contents" className=\{`\$\{panelTab === 'toc' \? 'flex' : 'hidden'\}/);
  assert.match(page, /<CanvasFind hidden=\{panelTab !== 'find'\}/);
});

test('Comments selects only on a saved top-level canvas; elsewhere it is aria-disabled and skipped by the arrows', () => {
  assert.match(header, /const off = id => id === 'comments' && !commentsOn;/);
  assert.match(header, /aria-disabled=\{disabled \|\| undefined\}/);
  assert.match(header, /onClick=\{disabled \? undefined : \(\) => onTab\(id, true\)\}/);
  assert.match(header, /const ENABLED = TABS\.filter\(entry => !off\(entry\.id\)\)/);
  assert.match(header, /ENABLED\[\(ENABLED\.indexOf\(tab\) \+ \(event\.key === 'ArrowRight' \? 1 : ENABLED\.length - 1\)\) % ENABLED\.length\]/);
  assert.match(page, /<PanelHeader tab=\{panelTab\} commentsOn=\{comments\.active\}/, 'the page decides where Comments is live');
  assert.match(page, /if \(!comments\.active && panelTab === 'comments'\) setPanelTab\('toc'\);/, 'and never leaves it selected where it is not');
});

// Owner, 2026-10-08: the Main canvas's Map icon opens the repository's Files in the panel; elsewhere there is no Files tab.
test('a Files tab only where the canvas has repository files, after Comments', () => {
  assert.match(header, /\{ id: 'files', label: 'Repository files', Icon: FolderTree \},\n\];/);
  assert.match(header, /const TABS = PANEL_TABS\.filter\(entry => entry\.id !== 'files' \|\| filesOn\);/);
  assert.match(header, /\{TABS\.map\(\(\{ id, label, Icon \}\) =>/);
  assert.match(page, /filesOn=\{!!files\}/);
});

test('pinned by default, and the choice lasts in this browser; storage that throws keeps the default', () => {
  const store = new Map();
  const storage = () => ({ getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
  assert.equal(readPanelPin(storage), true, 'nothing stored: pinned');
  savePanelPin(storage, false);
  assert.equal(readPanelPin(storage), false);
  savePanelPin(storage, true);
  assert.equal(readPanelPin(storage), true);
  const blocked = () => { throw Error('SecurityError'); };
  assert.equal(readPanelPin(blocked), true);
  assert.doesNotThrow(() => savePanelPin(blocked, false));
  assert.match(page, /const \[panelPinned, setPanelPinned\] = useState\(\(\) => readPanelPin\(\(\) => localStorage\)\);/);
});

test('unpinned, a press on the canvas surface closes the panel; pinned, nothing listens', () => {
  assert.match(page, /if \(panelPinned \|\| !panelOpen \|\| !frame\) return undefined;\n\s+const close = event => \{ if \(event\.target\.closest\?\.\('\[data-canvas-surface\]'\)\) setPanelOpen\(false\); \};\n\s+frame\.addEventListener\('pointerdown', close\);/);
});

test('Close shuts the panel and touches nothing else', () => {
  assert.match(page, /onClose=\{\(\) => setPanelOpen\(false\)\}/);
  assert.match(header, /data-panel-close [^\n]*onClick=\{onClose\}/);
});

test('an opened reader brings the Table of contents tab forward, where it shows', () => {
  assert.match(page, /if \(wikiOpen \|\| paperOpen \|\| sourceOpen \|\| lessonSource\) setPanelTab\('toc'\);/);
});

test('find: case-insensitive over titles and bodies, one match per card, in canvas order', () => {
  const cards = [
    { id: 'h', type: 'heading', text: 'Phase changes' },
    { id: 'e', type: 'explanation', title: 'Why salt melts ice', body: 'Salt lowers the FREEZING point of water.', more: [{ label: 'Deeper', text: 'Freezing-point depression.' }] },
    { id: 'q', type: 'quiz', question: 'What does salt do?', options: [{ key: 'A', text: 'Lowers the freezing point', correct: true }] },
    { id: 'x', question: 'Is ice a solid?', answer: 'Yes, ice is water frozen solid.' },
    { id: 'n', type: 'notebook', cells: [{ source: 'freezing = True' }] },
  ];
  assert.deepEqual(findMatches(cards, 'freezing').map(match => match.id), ['e', 'q']);
  assert.deepEqual(findMatches(cards, '  ICE ').map(match => match.id), ['e', 'x'], 'trimmed, any case');
  assert.deepEqual(findMatches(cards, 'phase').map(match => match.label), ['Phase changes'], 'a heading is labelled by its text');
  const [hit] = findMatches(cards, 'freezing point');
  assert.deepEqual([hit.label, hit.hit], ['Why salt melts ice', 'FREEZING point'], 'the hit keeps the card\'s own case');
  assert.equal(hit.before, 'Why salt melts ice · Salt lowers the ', 'a field break reads as a dot');
  const [long] = findMatches([{ id: 'l', title: 'Long', body: `${'a'.repeat(80)} needle ${'b'.repeat(80)}` }], 'needle');
  assert.ok(long.before.startsWith('…') && long.after.endsWith('…'), 'a cut snippet says so');
  assert.equal(findMatches(cards, '').length, 0);
  assert.equal(findMatches(cards, 'a.b(').length, 0, 'the query is text, never a pattern');
  assert.equal(findMatches(cards, 'True').length, 0, 'notebooks are not searched');
  assert.equal(cardWords({ id: 'z', title: 'T', more: [null], options: [{}] }), 'T', 'a malformed card cannot throw');
});

test('a match frames and selects its card through the canvas\'s existing focusBlock; nothing leaves the browser', () => {
  assert.match(page, /onFocus=\{id => canvasApi\.current\?\.focusBlock\(id\)\}/);
  assert.match(page, /cards=\{\(\) => \[\.\.\.\(canvasApi\.current\?\.blocks\?\.\(\) \|\| \[\]\), \.\.\.exchanges\]\}/);
  assert.doesNotMatch(header + read('./canvas-find.js'), /\bapi\(|fetch\(/);
  assert.match(header, /if \(event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); setQuery\(''\); setAt\(-1\); \}/, 'Escape clears the find');
});
