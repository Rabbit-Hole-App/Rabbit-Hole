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
  assert.match(header, /<Icon size=\{16\} strokeWidth=\{1\.8\} aria-hidden \/>\n\s+<\/button>/, 'the icon is the tab\'s only child');
});

// Owner brief 2026-10-16 item 3 (the approved toc-upload-context mockup): a rounded pale purple with a purple icon, flipped in
// dark; hover is the neutral hover, never the selected purple.
test('exactly one tab is active: aria-selected, the soft purple with a purple icon, and the only one in the Tab order', () => {
  assert.match(header, /aria-selected=\{tab === id\}/);
  assert.match(header, /tabIndex=\{tab === id \? 0 : -1\}/);
  assert.match(header, /tab === id \? 'bg-\(--nav-selected-bg\) text-\(--nav-selected-fg\)' : disabled \? [^:]+ : 'text-ink-2 hover:bg-hover hover:text-ink'/);
  const css = read('./index.css');
  assert.match(css, /--nav-selected-bg: #eee5fc;\n\s+--nav-selected-fg: #6431a0;/, 'light: the mockup values');
  assert.match(css, /--nav-selected-bg: #453060;\n\s+--nav-selected-fg: #e1cff9;/, 'dark: the mockup values');
  assert.match(read('./chat-panels.js'), /const \[open, setOpen\] = useState\(true\), \[tab, setTab\] = useState\('chat'\);/, 'open on Chat by default');
  assert.match(page, /const \{ open: panelOpen, setOpen: setPanelOpen, tab: panelTab, setTab: setPanelTab \} = panels;/);
  assert.match(page, /<div role="tabpanel" aria-label="Table of contents" className=\{`\$\{panelTab === 'toc' \? 'flex' : 'hidden'\}/);
  assert.match(page, /<CanvasSearchPanel hidden=\{panelTab !== 'find'\}/);
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
  assert.match(header, /className=\{`relative flex h-8 w-\[30px\] shrink-0 items-center/, 'every tab keeps its size (30 x 32)');
  assert.match(header, /<div className="ml-4 flex shrink-0 items-center gap-0\.5">\n\s+\{companion && [\s\S]{0,900}?<button type="button" data-panel-pin/, 'the companion control, Pin and Close never shrink, set apart from the tabs');
  assert.match(page, /<LinksPanel hidden=\{panelTab !== 'links'\}/);
});

// Owner decision 1A, 2026-10-15: Context, Files and Graph are the companion column's views (chat-panels.test.mjs), not Chat tabs.
test('Chat\'s tabs hold no viewer: no Context or Files tab', () => {
  assert.doesNotMatch(header.slice(header.indexOf('export const PANEL_TABS'), header.indexOf('export const COMPANION_VIEWS')), /'context'|'files'|'graph'/);
  assert.doesNotMatch(page, /filesOn/);
  // Owner brief 2026-10-16 items 3-4: ONE control in Chat's header opens and closes the Context / Files / Graph column (a
  // pressed toggle, not a tab), in place of the separate Context and Repository files shortcuts.
  assert.match(header, /data-panel-companion aria-label=\{name\} title=\{name\} aria-pressed=\{companion\.open\} onClick=\{companion\.onToggle\}/);
  assert.doesNotMatch(header, /data-panel-viewer|Repository files/);
  assert.match(header, /export const companionLabel = views => \(views\.length > 1 \? `\$\{views\.slice\(0, -1\)\.map\(view => view\.label\)\.join\(', '\)\} and \$\{views\.at\(-1\)\.label\}` : views\[0\]\?\.label \|\| 'Context'\);/, 'its name lists the views it opens: Context, Files and Graph');
  assert.match(page, /companion=\{\{ views: companionViews, open: panelOpen && companion\.open, onToggle: companion\.toggle \}\}/);
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
  assert.match(page, /<ChatPane key=\{app\.name\} hidden=\{panelTab !== 'chat'\} chatAskProps/, 'Chat only in the Chat tab (owner brief 2026-10-16 item 7)');
});

// Owner brief 2026-10-16 item 7 (replaces R4 A3's docked Chat composer): the Table of contents has its own conversation, a
// separate thread (slot 'toc') that is always Tutor, below the contents. The rendered behaviour (drafts kept apart, no
// request on open, Send stays in TOC, scroll restored, a narrow panel) is e2e/panel-header-check.mjs and toc-tutor-check.mjs.
test('the Table of contents has its own conversation: a separate thread, always Tutor, below the contents; Chat stays in Chat', () => {
  const ask = read('./ask.jsx'), threads = read('./chat-threads.js'), workspace = read('./chat-workspace.jsx'), modes = read('./ModeSelector.jsx'), history = read('./ChatHistory.jsx'), conversation = read('./TocConversation.jsx');
  assert.doesNotMatch(page, /composerDocked|holdMode/, 'Chat\'s composer no longer docks under the contents');
  assert.match(workspace, /const tocThread = useChatThread\(canvas, \{ slot: 'toc' \}\);/);
  assert.match(workspace, /const tocComposer = useChatDraft\(`\$\{canvas\}\.toc`, tocThread\);/, 'its own draft key');
  assert.match(workspace, /useEffect\(\(\) => \{ holdTutor\('tutor'\); \}, \[holdTutor\]\);/, 'always Tutor, shown and not saved');
  assert.match(threads, /setModeState\(held\.current \|\| 'auto'\)/, 'a new TOC thread stays Tutor');
  assert.match(threads, /threads\?\.find\(thread => thread\.id !== toc\)/, 'Chat never falls back to the TOC\'s thread');
  assert.match(history, /\.filter\(row => row\.id !== tocThread\)/, 'History leaves the TOC\'s thread out');
  assert.match(modes, /if \(chat\.tocView\) return <span data-chat-mode="tutor"/, 'Tutor shown, no menu');
  assert.match(conversation, /<AskPanel \{\.\.\.askProps\} hideConversation=\{!open\} \/>/, 'collapsed, only the composer shows');
  assert.match(page, /<TocWorkspace key=\{app\.name\}><TocConversation /);
  assert.match(page, /placeholder="Describe your goal or refine the outline…"/);
  const toc = page.indexOf('<div role="tabpanel" aria-label="Table of contents"'), conv = page.indexOf('<TocWorkspace'), chatPane = page.indexOf('<ChatPane key={app.name}');
  assert.ok(toc > 0 && conv > toc && chatPane > conv, 'the conversation inside the contents tab, Chat after it');
  assert.equal(page.match(/<ChatPane\b/g).length, 1);
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

test('Search delegates target navigation to the live canvas and keeps matching local', () => {
  assert.match(page, /<CanvasSearchPanel hidden=\{panelTab !== 'find'\}/);
  assert.match(page, /\{\.\.\.canvasSearch\.panel\}/);
  const search = read('./use-canvas-search.jsx');
  assert.match(search, /canvasApi\.current\?\.focusSearchTarget\?\.\(result\.target\)/);
  assert.match(search, /subscribeSearch\(update\)/);
  assert.doesNotMatch(read('./canvas-search-index.js'), /\bapi\(|fetch\(/);
  assert.match(read('./CanvasSearchPanel.jsx'), /event\.key === 'Escape'[\s\S]*onQueryChange\(''\)/);
});
