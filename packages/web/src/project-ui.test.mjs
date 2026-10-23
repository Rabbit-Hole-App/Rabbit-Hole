// The project UI pass (owner, 2026-10-04; since 2026-10-15 a repository is only its canvas, repo-canvas-graph.md): a project was Map or Learn, the canvas carries no tab pill, Tutor or
// Practice buttons (the composer is the Tutor), the Map hides its details, layers and panel until asked, answers
// list their cited files in a Sources dropdown, and the main composer has a / commands sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { citedSources } from './source-references.js';
import { SLASH } from './agent/slash.js';
import { OVERVIEW_TAB } from './inspector.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = read('RepositoryPage.jsx'), wired = read('repository-canvas.jsx'), loader = read('use-repository.js'), inspector = read('MapInspector.jsx'), learn = read('LearnPage.jsx'), tutor = read('LearnTutor.jsx'), bar = read('agent/AgentBar.jsx'), md = read('ask.jsx'), renderer = read('Md.jsx');

// repo-canvas-graph.md (owner, 2026-10-15, correction to decision 2): a repository is its canvas. No Files | Graph | Learn
// switcher, no Map page, no file browser or graph landing; Files and Graph open beside Chat, the badge goes to GitHub.
test('a repository opens on its canvas: no Files | Graph | Learn page; the badge, status and details live in the canvas header', () => {
  assert.doesNotMatch(page, /TabsList|TabsTrigger|data-project-tabs|<RepositoryGraph|<MapInspector|ExpandedPageFrame|Search repository/);
  // The Main canvas and every project canvas alike: the switcher, the project and the repository's canvas props.
  assert.match(page, /\{picked\?<CanvasLearn key=\{picked\.name\} app=\{picked\} project=\{live\} switcher=\{switcher\} canvasProps=\{props\}\/>/);
  assert.match(page, /:<LearnPage app=\{live\} project=\{live\} switcher=\{switcher\} \{\.\.\.props\}\/>\}/);
  // An old ?tab= link opens its viewer once and leaves the plain URL (routes.js repositoryView).
  assert.match(page, /const \[openViewer,setOpenViewer\]=useState\(\(\)=>repositoryView\(window\.location\.search\)\);/);
  assert.match(page, /params\.delete\('tab'\);\n\s+if\(params\.has\('canvas'\)\)params\.set\('tab','learn'\);[^\n]*\n\s+const rest=params\.toString\(\);\n\s+window\.history\.replaceState\(window\.history\.state,'',`\/apps\/\$\{app\.name\}\$\{rest\?`\?\$\{rest\}`:''\}`\);/);
  // ...on arrival only: a canvas switched to later opens as it is (review 2026-10-15 #8).
  assert.match(page, /useEffect\(\(\)=>\{if\(arrived\.current!==picked\?\.name\)setOpenViewer\(null\);\},\[picked\?\.name\]\);/);
  // In a project the canvas selector IS the canvas name (owner brief 2026-10-16 item 2), carrying the canvas's Rabbit Holes as
  // a group (owner r35), its title and its rename; no project, the editable title and its own holes chevron.
  assert.match(learn, /\{switcher \? cloneElement\(switcher, \{ holes: dive\.titleHoles, title: canvasTitle \|\| fallbackTitle, onRename: renameTitle \}\) : <><input/);
  assert.match(learn, /<TitleHoles \{\.\.\.dive\.titleHoles\} \/><\/>\}/);
  // In the selector, the holes are a group under the current canvas, its own row left out (it is that canvas).
  assert.match(page, /\{e\.current&&holes\?\.rows\.length>1&&<div data-switcher-holes>[^\n]*<HoleRows rows=\{holes\.rows\.slice\(1\)\} onPick=\{row=>\{m\.close\(\);holes\.onPick\(row\);\}\}\/>/);
  // No Map icon on the canvas any more. The repository is ONE named dropdown in the provenance group (owner brief item 1;
  // provenance-group.test.mjs) holding branch, commit, status and Refresh branch; the indexing status stays beside it.
  assert.doesNotMatch(learn, /data-learn-map/);
  assert.match(learn, /<ProvenanceRow provenance=\{provenance\} repository=\{repository\} end=\{false\}>\{repository && <RepositoryBadge repository=\{repository\} \/>\}<\/ProvenanceRow>/);
  assert.doesNotMatch(wired, /data-repo-badge(?!-)|data-repo-info|data-repo-details/, 'one repository control in the header: the dropdown');
  // A repository with no snapshot opens its canvas too: its status shows in the header and its viewers, never a separate page.
  assert.match(wired, /data-repo-status=\{status\} role="status"/);
  assert.match(wired, /<RepositoryState repository=\{repository\} what="files" \/>/);
  // Files opens in the companion column beside Chat (lane A), mounted on its first show.
  assert.match(learn, /\{files && shown\.current\.has\('files'\) && <div role="tabpanel" aria-label="Repository files" data-learn-files className=\{`\$\{companionView === 'files' \? 'flex' : 'hidden'\}[^`]*`\}>\{files\}<\/div>\}/);
});

// Code review 2026-10-15 (C:/s/spec/repo-graph-review.md): each fix pinned where its rule lives.
test('repository canvas review fixes: graph keys stay in the column, Retry refetches, Show on graph, one-time viewers, Main-only code cards', () => {
  const canvas = read('AdaptiveCanvas.jsx'), ask = read('ask.jsx'), app = read('App.jsx');
  // #1 a focused graph node's Delete, arrows and Esc never act on canvas cards (the canvas listens on window in capture).
  // A graph card's own controls are guarded the same way (repo graph R2, graph-card.test.mjs).
  assert.match(canvas, /if \(document\.activeElement\?\.closest\?\.\('\[data-canvas-doc\]'\)\) return;\n(?:\s*\/\/[^\n]*\n){1,4}\s+if \(document\.activeElement\?\.closest\?\.\('\[data-companion\],\[data-graph-card\]'\)\) return;/);
  // #3 Retry after a failed snapshot read reads it again.
  assert.match(loader, /\}, \[root, commit, reload\]\);/);
  // #4 closing the column on a wide layout, or leaving the canvas, clears the temporary selection; pinned chips stay.
  assert.match(learn, /useEffect\(\(\) => \{ if \(!viewerShown && window\.matchMedia\('\(min-width: 64rem\)'\)\.matches\) clearSelection\(heldRepository\.current\); \}, \[viewerShown\]\);/);
  assert.match(learn, /const viewerShown = companion\.open, heldRepository/, 'Hide right panel hides Chat too and restores both: it keeps the selection');
  assert.match(wired, /lazyFeature\(\(\) => import\('\.\/GraphPanel\.jsx'\), 'The graph'\)/, 'a missing chunk shows Retry in the column (lazy-feature.jsx)');
  assert.match(learn, /useEffect\(\(\) => \(\) => clearSelection\(heldRepository\.current\), \[\]\);/);
  // #5 an answer's Show on graph opens the Graph view with that answer's graph.
  assert.match(wired, /onGraph: view => \{ repository\.setAnswerView\(\{ \.\.\.view, requestId: crypto\.randomUUID\(\) \}\); window\.dispatchEvent\(new CustomEvent\('small:open-graph'\)\); \},/);
  assert.match(wired, /<GraphPanel repository=\{repository\} onOpenSource=\{showFile\} answerView=\{repository\.answerView\} \/>/);
  // #6 a new chat asks at the repository's current commit.
  assert.match(ask, /commit: sourceRange\?\.commit \|\| \(codebase && \(codebase\.snapshot\?\.commit \|\| codebase\.commit\)\) \|\| repositoryCommit/);
  // #11 Ask in chat's Code card stays on the Main canvas (code cards elsewhere are Release 2).
  assert.match(wired, /if \(codeCards\) codeCard\(range\);/);
  assert.match(page, /useRepositoryCanvas\(app,\{codeCards:!picked\}\)/);
  // Lane E findings: a pressed node takes focus (Escape reaches the graph), a retracted column is inert, and a ready repository
  // whose snapshot read failed shows Retry rather than Loading forever.
  assert.match(read('RepositoryGraph.jsx'), /\.setPointerCapture\(e\.pointerId\);target\?\.focus\(\{preventScroll:true\}\);/);
  // A right press takes no default focus (its scroll closed the node menu the contextmenu opened, Home's check on 44b97be1).
  assert.match(read('RepositoryGraph.jsx'), /if\(e\.button!==0\)\{e\.preventDefault\(\);e\.target\.closest\('\[data-graph-node\]'\)\?\.focus\(\{preventScroll:true\}\);return;\}/);
  assert.match(read('ResizableSidePanel.jsx'), /<aside \{\.\.\.props\} ref=\{panel\} inert=\{collapsed \|\| undefined\}/);
  assert.match(wired, /const failed = status === 'failed' \|\| \(status === 'ready' && !!error\);/);
  // The canvas header (owner brief 2026-10-16 item 2, the approved centred-menubar mockup): Home alone at the far left, after
  // it ONE centred group - the crumbs, the menubar, the actions and the provenance row last - wrapping when it does not fit
  // (centred only while it fits), with the right panel open or closed alike: no separate column layout any more.
  // Equal side padding (owner header correction, 2026-10-16): Home's room on the left is balanced on the right, so the group
  // centres on the canvas area itself.
  // Owner, 2026-10-22: over the lesson canvas the header floats (absolute, the pointer through but its controls), else in flow.
  // Its classes are CanvasLoading.jsx's constants, shared with the canvas loading skeleton (owner brief 2026-10-23).
  const shellConstants = read('CanvasLoading.jsx');
  assert.match(learn, /<div data-canvas-header className=\{`\$\{headerOver \? OWNER_HEADER_OVER : 'relative shrink-0'\} \$\{OWNER_HEADER\}`\}>/);
  assert.match(shellConstants, /export const OWNER_HEADER_OVER = 'pointer-events-none absolute inset-x-0 top-0 z-40 \[&>\*\]:pointer-events-auto';/);
  assert.match(shellConstants, /export const OWNER_HEADER = 'flex items-center justify-center-safe px-12 [^']*';/);
  assert.match(learn, /<div data-header-group className=\{OWNER_HEADER_GROUP\}>/);
  assert.match(shellConstants, /export const OWNER_HEADER_GROUP = 'flex max-w-full min-w-0 flex-wrap items-center justify-center-safe gap-1 gap-y-0\.5';/);
  assert.doesNotMatch(learn, /TITLE_CENTRED|data-header-left|data-header-right/);
  assert.match(learn, /<div data-title-crumbs className="flex max-w-full min-w-0 items-center">/);
  assert.match(learn, /<\/div>\n\s*<CanvasMenubar menus=\{canvasMenus\} \/>/, 'the menubar right after the crumbs');
  assert.match(learn, /<ProvenanceRow provenance=\{provenance\} repository=\{repository\} end=\{false\}>\{repository && <RepositoryBadge repository=\{repository\} \/>\}<\/ProvenanceRow>\s*<\/div>\s*<\/div>\}/, 'the provenance row ends the group');
  // #12 an ordinary open forces no viewer.
  assert.match(app, /a\.kind === 'repository' \? navigate\(`\/apps\/\$\{a\.name\}`\)/);
});

test('the canvas has no Tutor or Practice button: the composer is the Tutor on the NanoGPT course and its Rabbit Holes', () => {
  assert.doesNotMatch(learn, /data-learn-tutor|data-learn-practice|experience/);
  // A live learning journey also makes the composer the Tutor (LP1 Task 12).
  // Task 0 (owner, 2026-10-06): the NanoGPT course, its slice board and their holes are one registry entry
  // (learn-tutor-domains.js); LearnPage and useTutor ask the resolver, never the course name.
  assert.match(learn, /useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, courseCanvas: learnPreview && !board, journey, canvasVersion, repository: repoAttached && canvasRepository\(app\), describe: describeBlock, canvasContext, coaching, startExplain: explainLatest }\)/);
  assert.match(learn, /const suppliedCourse = learnPreview && !!registeredCourse\(\{ app \}\)\?\.capabilities\?\.suppliedCourse;/);
  assert.match(read('learn-tutor-domains.js'), /\{ id: 'nanogpt-attention', match: \{ repo: 'karpathy\/nanoGPT', board: TUTOR_BOARD \}, domain: NANOGPT, capabilities: \{ tutor: true, evidence: 'session', suppliedCourse: true \} \},/);
  // A hole opened from a journey section, once its parent journey is read (LP1 Task 14), too: the resolver's order.
  assert.match(tutor, /const context = tutorContext\(\{ \.\.\.where, journey \}\), capabilities = context\?\.capabilities;\n  const active = capabilities\?\.tutor === true, hookTurns = active \|\| capabilities\?\.hook_turns === true;/);
  assert.match(read('learn-tutor-domains.js'), /if \(journey\?\.journey\) return[^\n]*\n  if \(parentJourney && record\?\.journey\) \{[\s\S]*?const entry = registeredCourse\(\{ app, board, root \}, registry\);/);
  // ?board= stays review-only.
  assert.match(learn, /const named = hole \|\| !reviewTools \? null : new URLSearchParams\(window\.location\.search\)\.get\('board'\);/);
});

test('the inspector: underline tabs only for a source, no outline (owner, 2026-10-06)', () => {
  // Overview | Source | Chat (owner, 2026-10-08), the same restrained underline; Source only for code the main pane is not showing.
  // Overview is hidden for now (owner, 2026-10-08: "so we have only chat"): Source | Chat, or Chat alone.
  assert.equal(OVERVIEW_TAB, false);
  assert.match(inspector, /data-map-panel-close aria-label="Close the inspector"/);
  assert.match(inspector, /\{!record && <TabsList className="-mx-4 mt-2 px-4">\{OVERVIEW_TAB && <TabsTrigger value="overview" className=\{TAB\}>Overview<\/TabsTrigger>\}\{tabs && <TabsTrigger value="source" className=\{TAB\}>Source<\/TabsTrigger>\}<TabsTrigger value="chat" data-inspector-chat-tab className=\{TAB\}>Chat\{chatted > 0 && <span className="ml-1 tabular-nums text-ink-3">\{chatted\}<\/span>\}<\/TabsTrigger><\/TabsList>\}/);
  assert.doesNotMatch(inspector, /TabsList pill className="mb-3|value="selected"|value="conversation"|ring-2 ring-accent/);
});

test('an answer lists every cited file once, in order, including line lists written one per line', () => {
  const text = 'See configurator.py:1-20 and train.py:120.\n`data/shakespeare_char/prepare.py:4\n51`\n`model.py:29\n78\n94` (line anchors). Again model.py:29, 31\n2 more things';
  assert.deepEqual(citedSources(text).map(c => `${c.path}:${c.start}-${c.end}`), [
    'configurator.py:1-20', 'train.py:120-120', 'data/shakespeare_char/prepare.py:4-4', 'data/shakespeare_char/prepare.py:51-51',
    'model.py:29-29', 'model.py:78-78', 'model.py:94-94', 'model.py:31-31']);
  assert.deepEqual(citedSources('No files here, just 3 numbers: 1, 2.'), []);
  // Md shows them in a Sources dropdown wherever opening a file is wired.
  // Inside a repository context only a file of its snapshot is listed (repository-browser.md "Code references").
  assert.match(renderer, /const cited = onFile \? citedSources\(text\)\.filter\(c => linkable\(c, has\)\) : \[\];/);
  assert.match(renderer, /<details key="cited" data-cited-sources[^>]*><summary[^>]*>Sources \(\{cited\.length\}\)<\/summary>/);
});

// Owner, 2026-10-20: the main composer (Home, Library, Project) has no slash commands left, so it has no Auto picker, no mode
// pill and no / commands sheet; a typed /word says it is unavailable (AgentBar.jsx submit).
test('the main composer offers no slash command: no picker, no pill, no / commands sheet', () => {
  assert.doesNotMatch(bar, /BarCommandsSheet|data-bar-slash-help|aria-haspopup="listbox"/);
  assert.match(bar, /unavailableCommand\(r\.name, \{ listed: false \}\)/);
  const BAR = ['home', 'project'];
  assert.deepEqual(SLASH.filter(c => c.places.some(place => BAR.includes(place))), []);
});

test('the Files selection carried into Learn ("Asking about") has an x, as the Map chip did', () => {
  assert.match(wired, /onClearRepository: context \? \(\) => setContext\(null\) : null,/);
  assert.match(learn, /: repositoryContext\} onClearRepository=\{onClearRepository\} conversation="learn"/);
  assert.match(md, /\{onClearRepository && <button type="button" className="shrink-0 rounded p-0\.5 hover:bg-green-100" aria-label="Clear repository selection"/);
});

test('the main composer\'s + menu has no dead "Attach a file / not available on this preview" item (owner, 2026-10-04)', () => {
  assert.doesNotMatch(bar, /Attach a file|Attachments aren't available|Paperclip/);
});

test('the window over the main composer: no History or New chat, a clear icon, and a reopen icon beside + when closed', () => {
  const sheet = read('agent/ResultSheet.jsx');
  assert.match(sheet, /<ResultList scopeKey=\{key\} tools=\{false\} \/>/);
  assert.match(sheet, /\{path && tools && \(/);
  assert.match(sheet, /data-result-clear aria-label="Clear the conversation"[\s\S]*?onClick=\{\(\) => \{ resetThread\(key\); onClose\(\); \}\}/);
  assert.doesNotMatch(bar, /data-result-line/);
  assert.match(bar, /\{!sheet && line && !panelHosts\(surface, line\.scope\) && <button type="button" data-result-open aria-label="Open the conversation"/);
});

test('the Map side panel shows no "Answers from the bar below land here." hint (owner, 2026-10-04)', () => {
  assert.doesNotMatch(page, /Answers from the bar below land here/);
});

test('no History or New chat anywhere: the Learn chat sheet and side panel each have one clear icon; the Map inspector hosts no chat (owner, 2026-10-04, 2026-10-06)', () => {
  assert.doesNotMatch(page + inspector, /data-map-panel-clear|resetThread/);
  assert.equal((md.match(/data-chat-clear aria-label="Clear the conversation"[^\n]*onClick=\{newChat\}/g) || []).length, 2);
  assert.doesNotMatch(md, /> New chat|>New chat/);
  assert.doesNotMatch(page, /New chat<\/|>New chat/);
});

test('the canvas corner button goes Back: to the previous in-app page, or Home when opened directly (owner, 2026-10-04)', () => {
  const api = read('api.js');
  assert.match(api, /window\.history\.pushState\(\{ depth: \(window\.history\.state\?\.depth \|\| 0\) \+ 1 \}, '', to\);/);
  assert.match(api, /if \(window\.history\.state\?\.depth > 0\) window\.history\.back\(\); else navigate\(fallback\);/);
  assert.match(learn, /data-learn-home aria-label="Back" title="Back"\s+onClick=\{\(\) => goBack\('\/apps'\)\}/);
});

// repository-browser.md: one canonical selection. The Files reader's file, symbol and range picks go through one attach, and
// Learn carries the wire shape (repository-canvas.jsx, the reader beside Chat on every repository-attached canvas).
test('one selection: the Files reader picks and Ask or Learn on a range attach the same context Learn sends', () => {
  const reader = read('CodeReader.jsx');
  assert.match(wired, /<CodeReader app=\{app\} snapshot=\{snapshot\} open=\{files\.open\} context=\{context\}[^>]*\n\s*onFile=\{p => attach\(fileObject\(snapshot\.graph, p\)\)\} onSymbol=\{n => attach\(objectOf\(snapshot\.graph, n\)\)\}/);
  // Ask in chat also puts the lines on the canvas as a selected Code card (repository-browser.md "Files in Learn").
  assert.match(wired, /onRange=\{\(kind, range\) => \{ attach\(range\); if \(kind === 'learn'\) learnThis\(range\); else \{ askAbout\(range\); if \(codeCards\) codeCard\(range\); \} \}\}/);
  assert.equal(wired.match(/<CodeReader /g).length, 1, 'one reader');
  assert.match(wired, /repositoryContext: context \? wireContext\(context\) : \{ commit: repository\.commit \},/);
  // Selecting text only offers [Ask] [Learn]; the context changes on a click, never on a selection.
  assert.match(reader, /<SourceSelectionContext\.Provider value=\{\{ value: pending, set: setPending \}\}>/);
  assert.doesNotMatch(reader, /setContext|small:ask-focus|learnAction/);
});

// Owner, 2026-10-08, from the stable preview (pallets/itsdangerous); repo-canvas-graph.md decision 4.
test('a click on the graph\'s white space clears the selection; Shift on a node toggles it', () => {
  // RepositoryGraph reports an unmoved press on empty space as onSelect(null) (Shift held: nothing), and on a node as that
  // node, toggled when Shift is held (repo-canvas-graph.md decision 4).
  assert.match(read('RepositoryGraph.jsx'), /onPointerUp=\{e=>\{const active=drag\.current;release\(e\);if\(!active\|\|active\.moved\)return;if\(active\.node\)onSelect\(scene\.positions\.get\(active\.node\.id\),\{toggle:e\.shiftKey\}\);else if\(!e\.shiftKey\)onSelect\(null,\{toggle:false\}\);\}\}/);
});

test('Files: the inspector does not repeat the code the reader shows - no preview, no Source tab', () => {
  const inspector = read('MapInspector.jsx');
  assert.match(inspector, /const file = object\.path, source = !record && !!file, tabs = source && !codeInView;/);
  assert.match(inspector, /\{file && !codeInView && <Preview /);
  assert.match(inspector, /\{tabs && <TabsContent value="source"/);
  // With Overview hidden, a view the inspector cannot show (Overview, or Source while the reader shows the code) is Chat.
  assert.match(inspector, /const shown = record \? 'overview' : view === 'source' && tabs \? 'source' : view === 'chat' \|\| !OVERVIEW_TAB \? 'chat' : 'overview';\n\s+return <Tabs value=\{shown\}/);
  assert.match(inspector, /\{\(record \|\| OVERVIEW_TAB\) && <TabsContent value="overview"/);
  assert.match(inspector, /const href = source && repositoryUrl\(/, 'Open source on GitHub stays: it is a link, not the code');
});

test('every Files Ask writes a ready question and pins its object; nothing sends', () => {
  assert.match(wired, /const askAbout = object => \{ setContext\(ground\(object\)\); setTimeout\(\(\) => askDraft\(askQuestion\(object\)\), 0\); \};/);
  assert.doesNotMatch(wired + read('MapMemory.jsx') + read('MapInspector.jsx'), /small:bar-ask/, 'no page action sends through the bar');
  assert.match(read('MapMemory.jsx'), /import \{ askDraft as askBar \} from '\.\/agent\/scope\.js';/, 'starters and prior questions write, never send');
});

test('the composers write an Ask action\'s question and focus; the learner\'s own words stay; nothing is sent', () => {
  // The Mothership: the page's scope, an untouched earlier question replaced, a typed draft carried to the new context.
  assert.match(bar, /const mine = draft\.trim\(\) && draft !== prefilled\.current;/);
  assert.match(bar, /if \(text && !mine\) \{\n\s+setDrafts\(\(d\) => \{ const next = new Map\(d\); if \(draft\) next\.delete\(targetKey\); return next\.set\(scopeKey\(live\), text\); \}\);/);
  assert.match(bar, /\} else if \(text && targetKey !== scopeKey\(live\)\) switchTo\(live, false\);/);
  assert.match(bar, /askFocus\.current = \(text\) => \{\n\s+if \(hidden\) return;/, 'a hidden bar (a canvas) leaves it to the canvas composer');
  assert.doesNotMatch(bar, /small:bar-ask|submitRef/, 'no event sends from the bar');
  // The breadcrumb row: only on the project's own page.
  assert.match(bar, /const chips = crumbsShown\(target, live\) \? chipsFor\(target\) : \[\];/);
  // The canvas composer (ask.jsx AskPanel).
  assert.match(md, /if \(text && \(!typed\.current\.trim\(\) \|\| typed\.current === prefilled\.current\)\) \{ prefilled\.current = text; setInput\(text\); \}/);
  // Canvas Add to chat (owner 2026-10-13: it replaces Ask in chat; the bar, the menu's row and Ctrl/Cmd+L) writes no question: with no
  // text askDraft only reveals and focuses the composer, so the learner's own words stay (card-selection.test.mjs).
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /\} else armCollection\(ids\);\n\s+askDraft\(\);/);
  assert.doesNotMatch(canvas, /askDraft\(cardQuestion|askDraft\(GROUP_QUESTION|askDraft\(TEXT_QUESTION|askDraft\(IMAGE_QUESTION|askDraft\(EQUATION_QUESTION/);
  assert.doesNotMatch(canvas, /new Event\('small:ask-focus'\)/);
});

// Owner decision 3 (2026-10-08): Purpose and Why it matters stay on demand. Opening or selecting an object reads files and
// the snapshot only; no ask route is called until the learner presses Send (Learn this runs only from its own button).
test('opening or selecting makes no AI request: the repository loader and readers read the row, snapshot and files only', () => {
  const calls = (code) => [...code.matchAll(/api\(`([^`]*)`/g)].map((m) => m[1]);
  // The inspector reads a file's lines and the object's saved conversation (a GET of stored messages), never an ask route.
  assert.deepEqual(calls(inspector), ['/api/repositories/${app}/file', '/api/repositories/${app.name}/threads?node=${encodeURIComponent(object.id)}&commit=${snapshot.commit}']);
  // The Sources pane reads code by repository and commit (card-source, a stored-file read) on a project canvas.
  assert.deepEqual(calls(read('RepositorySource.jsx')), ['/api/repositories/card-source?repo=${encodeURIComponent(repo)}&commit=${encodeURIComponent(commit)}&path=${encodeURIComponent(path)}', '/api/repositories/${appName}/file']);
  assert.deepEqual(calls(loader), ['${root}/snapshot', '${root}/refresh']);
  for (const code of [page, wired, loader, inspector, read('RepositoryGraph.jsx'), read('CodeReader.jsx'), read('inspector.js')]) assert.doesNotMatch(code, /fetch\(|streamAsk|\/ask\b|learn\/ask/);
  assert.equal(wired.match(/learnAction\(/g).length, 1, 'only Learn this, from its button');
  assert.match(wired, /const attach = object => \{ setContext\(ground\(object\)\); if \(object\.path\) files\.setOpen\(object\.path\); \};/, 'a pick only grounds and opens its file');
});

// Owner, 2026-10-08: the inspector is the object's conversation surface - Overview | Source | Chat.
test('a question about a selected object streams into its Chat, bound to the object at Send; errors and status go to the window', () => {
  // The key is taken from the scope frozen at Send, before any await, and every update of that answer uses it.
  assert.match(bar, /const node = nodeKey\(scope\), key = node \|\| resultsKey\(scope\);/);
  assert.match(bar, /text: `The answer about \$\{scope\.selected\.label\} is in its Chat on \$\{nameOf\(scope\)\}\.`/, 'sent from elsewhere: the window says where, never shows it');
  assert.match(bar, /add\(scope, \{ kind: 'user', text \}, key\);\n\s+const id = add\(scope, \{ kind: 'answer', text: '' \}, key\);\n\s+clearDraft\(from, raw\);\n\s+land\(\);/);
  assert.match(bar, /if \(node\) \{ add\(scope, \{ kind: 'note', text: `✗ \$\{failed\}`, error: true \}\); showResults\(scope\); \}/, 'a failure is said in the window too');
  assert.match(bar, /updateTurn\(key, id, \(t\) => applyEvent\(t, type, data\)\);/);
  // The Chat tab reads the object's own key and its saved conversation; Overview no longer carries a Conversation row.
  assert.match(inspector, /const chatKey = object && !object\.record \? nodeTurnsKey\(conversationKey, object\.id\) : null;/);
  assert.match(inspector, /\{!record && <TabsContent value="chat" className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-2">\{chat\}<\/TabsContent>\}/);
  assert.doesNotMatch(inspector, /data-inspector-section="conversation"|name="conversation"/);
  // The composer marks the object being asked about.
  assert.match(bar, /chip\.key === 'selected' \? 'bg-accent\/10 ring-1 ring-accent\/40' : 'bg-hover'/);
});

// Owner, 2026-10-08: "in the right side panel we have a "Ask abiyt this" and "Learn this" button. remove them. Learn this button
// should be at the top right of the right side panel. next to the title of the node sleected".
test('the inspector has one action, Learn this, in its header beside the title; no Ask about this or Learn this footer', () => {
  assert.match(inspector, /<h2 data-inspector-title className="min-w-16 flex-1 truncate[^\n]*title=\{title\}>\{title\}<\/h2>\n(\s+\{\/\*[\s\S]*?\*\/\}\n)?\s+\{!record && <Button data-inspector-learn size="sm" variant="primary" onClick=\{onLearn\} className="shrink-0">Learn this<\/Button>\}/);
  assert.doesNotMatch(inspector, /data-inspector-actions|<footer/);
  // A narrow panel keeps the title: Open source shows only its icon there (a container query), and the title keeps 4rem.
  assert.match(inspector, /<header data-inspector-header className=\{`@container /);
  assert.match(inspector, /aria-label="Open source"[^\n]*<span className="@max-\[24rem\]:hidden">Open source<\/span><ArrowUpRight/);
  assert.equal(inspector.match(/>Learn this</g).length, 1, 'one Learn this');
  const chat = inspector.slice(inspector.indexOf('const chat = '), inspector.indexOf('// Overview hidden'));
  assert.doesNotMatch(chat, /Ask about this/, 'the Chat tab asks through the composer');
});

// Owner r35: "when we open a project and we create a second canvas, we should still keep the original project name ... like
// a bread crumb: pallets/itsdangerous > canvas 2". In a project the title is [project] › [canvas selector] on one line, the
// Main canvas included; the project part is the card's own title (cardModel), plain text since the owner brief of
// 2026-10-16 item 2 (no link, no menu: project management is in Home and the Library), and shrinks first.
test('in a project the title is a one-line breadcrumb: the project as plain text (its card title), then the canvas selector', () => {
  assert.match(learn, /<div data-title-crumbs className="flex max-w-full min-w-0 items-center">\n\s*\{project && <>\n\s*<span data-project-crumb title=\{cardModel\(project\)\.title\}\n\s*className="block h-8 max-w-60 min-w-12 shrink-\[50\] truncate [^"]*">\{cardModel\(project\)\.title\}<\/span>/);
  assert.doesNotMatch(learn, /data-project-crumb[^\n]*onClick/);
  // Outside a project the canvas title stays the renamable input with the Rabbit Holes chevron.
  assert.match(learn, /: <><input aria-label="Canvas title"[\s\S]*?<TitleHoles \{\.\.\.dive\.titleHoles\} \/><\/>\}\n\s*<\/div>/);
  // The Main canvas is named so, the project name being the crumb before it.
  assert.match(learn, /: project \? 'Main canvas' : app\.repo \|\| app\.name\)/);
  // RepositoryPage names the project on the Main canvas and on every project canvas; CanvasPage keeps its own row.
  assert.match(page, /project=\{live\} switcher=\{switcher\} \{\.\.\.props\}\/>\}/);
  assert.match(read('CanvasPage.jsx'), /<LearnPage app=\{app\} switcher=\{switcher\} project=\{switcher \? project : null\} \{\.\.\.canvasProps\} \/>/);
  // The selector: one button naming the canvas with a chevron; its menu lists the project's canvases (the open one checked),
  // New canvas and Rename canvas (Save and Cancel), and stays inside the window (useMenuButton + the portaled Menu).
  assert.match(page, /<button type="button" data-canvas-switcher \{\.\.\.m\.buttonProps\} aria-label=\{`Canvas: \$\{title\}`\}/);
  assert.match(page, /<Menu portal anchor=\{m\.button\.current\} open=\{m\.open\} onClose=\{m\.onClose\} style=\{m\.style\}/);
  assert.match(page, /role="menuitemradio" aria-checked=\{e\.current\} data-canvas-option/);
  assert.match(page, /data-new-canvas[^\n]*>New canvas<\/MenuItem>/);
  assert.match(page, /data-rename-canvas[^\n]*>Rename canvas<\/MenuItem>/);
  assert.match(page, /<ConfirmDialog title="Rename canvas" confirmLabel="Save"/);
});
