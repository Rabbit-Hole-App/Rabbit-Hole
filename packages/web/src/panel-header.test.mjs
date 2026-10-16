// The canvas's right panel header (owner, 2026-10-07; docs/features/panel-header.md): Chat (permanent, owner brief
// 2026-10-13), Find, Table of contents and Comments (live on a saved top-level canvas) as icon tabs, then Pin and Close; the find matching and the pin preference as pure code.
// The rendered header, a real find and the unpinned close are e2e/panel-header-check.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardWords, findMatches, readPanelPin, savePanelPin } from './canvas-find.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const header = read('./PanelHeader.jsx'), page = read('./LearnPage.jsx');

test('the tabs are Chat, Find, Table of contents, Comments in that order, then Pin and Close on the right', () => {
  const order = ["label: 'Chat'", "label: 'Find text on canvas'", "label: 'Table of contents'", "label: 'Comments'", 'aria-label="Keep sidebar open"', 'aria-label="Close sidebar"'].map(text => header.indexOf(text));
  assert.ok(order.every(at => at > 0), 'every label is there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the owner\'s order');
  assert.match(header, /export const PANEL_TABS = \[\n\s+\{ id: 'chat', label: 'Chat', Icon: MessageSquareText \},/, 'Chat first, a non-brand icon');
  assert.match(header, /\{ id: 'find', label: 'Find text on canvas', Icon: Search \}/);
  assert.match(header, /\{ id: 'toc', label: 'Table of contents', Icon: BookOpen \}/);
  assert.match(header, /\{ id: 'comments', label: 'Comments', Icon: MessageCircle \}/);
  assert.match(header, /data-panel-pin aria-label="Keep sidebar open" title="Keep sidebar open"[\s\S]{0,300}?<Pin /);
  assert.match(header, /data-panel-close aria-label="Close sidebar" title="Close sidebar"[\s\S]{0,300}?<X /);
});

// Owner, 2026-10-13: "we do not need Card Conversation in right side panel ... remove it". A question about a selected card is
// answered where any chat answer goes (answer-destination.test.mjs); the panel keeps only its own tabs.
test('there is no Card conversation tab or panel, and nothing routes an answer to one', () => {
  assert.doesNotMatch(header, /conversation|MessagesSquare/i);
  assert.doesNotMatch(page, /data-card-conversation|conversationCard|cardConversations|showConversation|'conversation'|Card conversation|onConversation/);
  assert.doesNotMatch(read('./ask.jsx'), /onConversation|routed.to === 'conversation'/);
  assert.doesNotMatch(read('./answer-destination.js'), /'conversation'/);
});

test('icons only: a tooltip and an accessible name, no visible text, one tablist of tabs', () => {
  assert.match(header, /role="tablist"/);
  // The name is the label; a Table of contents tab with Tutor proposals waiting adds how many (R4, lead 2026-10-16), and
  // table-of-contents.test.mjs renders both names.
  assert.match(header, /role="tab" data-panel-tab=\{id\} aria-label=\{pending \? `\$\{label\}, \$\{tocPending\} proposal\$\{tocPending === 1 \? '' : 's'\} to review` : label\} title=\{title\}/);
  assert.match(header, /<Icon size=\{15\} strokeWidth=\{1\.8\} aria-hidden \/>\n\s+<\/button>/, 'the icon is the tab\'s only child');
});

test('exactly one tab is active: aria-selected, the violet with a white icon, and the only one in the Tab order', () => {
  assert.match(header, /aria-selected=\{tab === id\}/);
  assert.match(header, /tabIndex=\{tab === id \? 0 : -1\}/);
  assert.match(header, /tab === id \? 'bg-\[#5b21b6\] text-white/, 'the /teach violet (--cmd-teach-fg)');
  assert.match(read('./index.css'), /--cmd-teach-fg: #5b21b6;/, 'the same value as the /teach pill');
  assert.match(read('./chat-panels.js'), /const \[open, setOpen\] = useState\(true\), \[tab, setTab\] = useState\('chat'\);/, 'open on Chat by default');
  assert.match(page, /const \{ open: panelOpen, setOpen: setPanelOpen, tab: panelTab, setTab: setPanelTab \} = panels;/);
  assert.match(page, /<div role="tabpanel" aria-label="Table of contents" className=\{`\$\{panelTab === 'toc' \? 'flex' : 'hidden'\}/);
  assert.match(page, /<CanvasFind hidden=\{panelTab !== 'find'\}/);
});

test('Comments selects only on a saved top-level canvas; elsewhere it is aria-disabled and skipped by the arrows', () => {
  assert.match(header, /const off = id => id === 'comments' && !commentsOn;/);
  assert.match(header, /aria-disabled=\{disabled \|\| undefined\}/);
  assert.match(header, /onClick=\{disabled \? undefined : \(\) => onTab\(id, true\)\}/);
  assert.match(header, /const ENABLED = PANEL_TABS\.filter\(entry => !off\(entry\.id\)\)/);
  assert.match(header, /ENABLED\[\(ENABLED\.indexOf\(tab\) \+ \(event\.key === 'ArrowRight' \? 1 : ENABLED\.length - 1\)\) % ENABLED\.length\]/);
  assert.match(page, /<PanelHeader tab=\{panelTab\} commentsOn=\{comments\.active\}/, 'the page decides where Comments is live');
  assert.match(page, /if \(!comments\.active && panelTab === 'comments'\) setPanelTab\('chat'\);/, 'and never leaves it selected where it is not');
});

// Canvas references (owner, 2026-10-14 Q3): Links, a link icon, the label as the tooltip and the name. Context and Files moved
// to the companion column (owner decision 1A, 2026-10-15), so Links is fifth and last. A narrow panel scrolls the tab row.
test('Links is the last tab, and a narrow panel scrolls the tab row, never squeezing it', () => {
  assert.match(header, /\{ id: 'comments', label: 'Comments', Icon: MessageCircle \},\n\s+\/\/[^\n]*\n\s+\{ id: 'links', label: 'Links', Icon: Link2 \},\n\];/);
  assert.match(header, /role="tablist" aria-label="Panel views" onKeyDown=\{arrow\} className="flex min-w-0 items-center gap-0\.5 overflow-x-auto/);
  assert.match(header, /className=\{`relative flex h-7 w-8 shrink-0 items-center/, 'every tab keeps its size');
  assert.match(header, /<div className="flex shrink-0 items-center gap-0\.5">\n\s+\{viewers\.map\([\s\S]{0,900}?<button type="button" data-panel-pin/, 'the viewer toggles, Pin and Close never shrink');
  assert.match(page, /<LinksPanel hidden=\{panelTab !== 'links'\}/);
});

// Owner decision 1A, 2026-10-15: Context, Files and Graph are the companion column's views (chat-panels.test.mjs), not Chat tabs.
test('Chat\'s tabs hold no viewer: no Context or Files tab', () => {
  assert.doesNotMatch(header.slice(header.indexOf('export const PANEL_TABS'), header.indexOf('export const COMPANION_VIEWS')), /'context'|'files'|'graph'/);
  assert.doesNotMatch(page, /filesOn/);
  // One click from Chat's header opens a viewer (Context, and Repository files where there are files): a pressed toggle, not a tab.
  assert.match(header, /data-panel-viewer=\{id\} aria-label=\{name\} title=\{name\} aria-pressed=\{viewer === id\} onClick=\{\(\) => onViewer\(id\)\}/);
  assert.match(page, /viewers=\{companionViews\.filter\(entry => entry\.id !== 'graph'\)\}/, 'Graph opens from the composer (Explore codebase)');
  assert.match(page, /onViewer=\{id => \(panelOpen && companion\.open && companionView === id \? companion\.close\(\) : companion\.show\(id\)\)\}/);
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

test('unpinned, a press on the canvas surface closes the panel; pinned, on Chat or on Context, nothing listens', () => {
  assert.match(page, /if \(panelPinned \|\| !panelOpen \|\| panelTab === 'chat' \|\| panelTab === 'context' \|\| !frame\) return undefined;\n\s+const close = event => \{ if \(event\.target\.closest\?\.\('\[data-canvas-surface\]'\)\) setPanelOpen\(false\); \};\n\s+frame\.addEventListener\('pointerdown', close\);/);
});

test('Close shuts the panel and touches nothing else', () => {
  assert.match(page, /onClose=\{\(\) => setPanelOpen\(false\)\}/);
  assert.match(header, /data-panel-close [^\n]*onClick=\{onClose\}/);
});

// Owner brief 2026-10-13 13.8: readers open in the Sources pane beside Chat, so nothing forces another tab over Chat.
// Owner decision 5B (R4, 2026-10-15): the learner's click on 'Use as table of contents' opens the Apply/Discard flow, so a
// syllabus proposal is the one other thing that brings the Table of contents forward; a Tutor proposal never does.
test('an opened reader leaves the tab alone; only the course interview and a syllabus proposal bring the Table of contents forward', () => {
  assert.doesNotMatch(page, /if \(wikiOpen \|\| paperOpen[^\n]*setPanelTab/);
  assert.deepEqual(page.match(/setPanelTab\('toc'\)/g), ["setPanelTab('toc')", "setPanelTab('toc')"]);
  assert.match(page, /useEffect\(\(\) => \{ if \(setupChat\) setPanelTab\('toc'\); \}, \[setupChat\]\);/);
  assert.match(page, /if \(proposal\?\.source === 'syllabus'\) setPanelTab\('toc'\);/);
});

test('the Chat header: the thread title, History, New chat (icon only under 360 px), an overflow menu when the thread can act', () => {
  const pane = read('./ChatPane.jsx');
  assert.match(pane, /const title = chatTitle\(thread\);/, 'the thread title, New chat when empty - never while loading or failed (chat-threads.js chatTitle)');
  assert.match(pane, /data-chat-history aria-label="History" title="History" aria-pressed=\{thread\.historyOpen\} onClick=\{\(\) => thread\.setHistoryOpen\(!thread\.historyOpen\)\}/);
  assert.match(pane, /data-chat-new aria-label="New chat" title="New chat" onClick=\{\(\) => \{ thread\.newChat\(\); thread\.setHistoryOpen\(false\); \}\}/);
  assert.match(pane, /<Plus size=\{16\}[^>]*\/><span className="@max-\[360px\]:hidden">New chat<\/span>/);
  assert.match(pane, /thread\.rename && \['Rename'[^\]]*\], thread\.remove && \['Delete'/);
  assert.match(pane, /\{actions\.length > 0 && <span className="relative">/);
  assert.match(pane, /\{thread\.historyOpen && <div className=\{docked \? 'hidden' : 'contents'\}><ChatHistory \/><\/div>\}\n\s+<div className=\{`\$\{thread\.historyOpen && !docked \? 'hidden' : 'flex'\}/, 'History in place of the conversation, which stays mounted');
  assert.match(pane, /data-chat-pane/, 'e2e selects [data-chat-pane] [data-chat-composer]');
  assert.match(pane, /\{unavailable \|\| <AskPanel \{\.\.\.askProps\} \{\.\.\.chatAskProps\} hideConversation=\{docked\} \/>\}/, 'the dock\'s props (A3b) reach the Chat AskPanel');
  assert.doesNotMatch(pane, /Sparkles|AppIcon|contentPanel/);
  assert.match(page, /<ChatPane key=\{app\.name\} hidden=\{panelTab !== 'chat' && !composerDocked\} docked=\{composerDocked\}/);
});

// R4 A3 (C:/s/spec/toc-r4.md): the Table of contents keeps the Chat composer below it, Tutor selected on entry. The rendered
// behaviour (draft, attachments, no request on open, Send opens Chat, scroll restored, a narrow panel) is e2e/panel-header-check.mjs.
test('the Table of contents docks the same Chat pane under the contents: composer only, Tutor once per entry, Send opens Chat', () => {
  const pane = read('./ChatPane.jsx'), ask = read('./ask.jsx'), threads = read('./chat-threads.js');
  assert.match(page, /const composerDocked = panelTab === 'toc' && !setupChat;/, 'not under the course interview, which has its own composer');
  assert.match(page, /if \(!composerDocked\) return undefined;\n    chat\.thread\.holdMode\('tutor'\);\n    return \(\) => chat\.thread\.holdMode\(null\);\n  \}, \[composerDocked\]\);/, 'once per entry, not every render; held until the tab is left');
  assert.match(threads, /const holdMode = useCallback\(next => \{ held\.current = next; if \(next\) setModeState\(next\); \}, \[\]\);/, 'shown, not saved');
  assert.match(threads, /const setMode = useCallback\(next => \{ held\.current = null; setModeState\(next\); saveState\(\{ mode: next \}\); \}, \[saveState\]\);/, 'a pick is saved and ends the hold');
  assert.match(threads, /const mode = restoredMode\(held\.current, thread\.mode\);\n    select\(thread\.id\); setTitle\(thread\.title \|\| ''\); setModeState\(mode\);/, 'a late restore keeps the held mode');
  assert.match(page, /onSent=\{\(\) => setPanelTab\(tab => \(tab === 'toc' \? 'chat' : tab\)\)\}/, 'a turn sent there shows its answer in Chat');
  const toc = page.indexOf('<div role="tabpanel" aria-label="Table of contents"'), chatPane = page.indexOf('<ChatPane key={app.name}');
  assert.ok(toc > 0 && chatPane > toc && chatPane < page.indexOf('</ResizableSidePanel>', toc), 'one ChatPane, after the contents, in the same panel');
  assert.equal(page.match(/<ChatPane\b/g).length, 1, 'the same instance, never a second composer');
  assert.match(pane, /className=\{`\$\{hidden \? 'hidden' : 'flex'\} @container min-h-0 \$\{docked \? 'shrink-0' : 'flex-1'\} flex-col`\}/);
  assert.match(pane, /data-chat-header className=\{`mb-2 \$\{docked \? 'hidden' : 'flex'\}/);
  assert.match(ask, /\(contentPanel \|\| hideConversation \|\| \(composerOnly && !sheetMode\)\) && 'hidden'/, 'the conversation stays mounted, hidden');
  assert.match(page, /onScrollCapture=\{event => \{ if \(event\.target\.matches\?\.\('\[data-toc\]'\)\) tocScroll\.current = event\.target\.scrollTop; \}\}/);
  assert.match(page, /if \(list\) list\.scrollTop = tocScroll\.current;\n  \}, \[panelOpen, panelTab\]\);/, 'coming back restores the contents\' scroll');
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
