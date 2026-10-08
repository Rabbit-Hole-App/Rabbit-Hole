// The project UI pass (owner, 2026-10-04): a project is Map or Learn, the canvas carries no tab pill, Tutor or
// Practice buttons (the composer is the Tutor), the Map hides its details, layers and panel until asked, answers
// list their cited files in a Sources dropdown, and the main composer has a / commands sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { citedSources } from './source-references.js';
import { exampleFor } from './agent/bar.js';
import { SLASH } from './agent/slash.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const page = read('RepositoryPage.jsx'), inspector = read('MapInspector.jsx'), learn = read('LearnPage.jsx'), tutor = read('LearnTutor.jsx'), bar = read('agent/AgentBar.jsx'), md = read('ask.jsx');

// repository-browser.md (owner, 2026-10-07): one navigation, Files · Graph · Learn, as restrained underline tabs, replacing
// both the Map | Learn pill and the Files | Graph buttons. Files and Graph are views of the page; Learn is the canvas.
test('a project is Files · Graph · Learn: no Overview, one restrained tab row, and the canvas has no Overview/Learn/Map pill', () => {
  assert.doesNotMatch(page, /Overview|value="overview"/);
  assert.match(page, /<TabsList data-project-tabs className="border-b-0!">\s*<TabsTrigger value="files">Files<\/TabsTrigger><TabsTrigger value="graph">Graph<\/TabsTrigger><TabsTrigger value="learn" disabled=\{!app\.commit_sha\}>Learn<\/TabsTrigger>/);
  assert.doesNotMatch(page, /TabsList pill|TabsTrigger pill|aria-pressed=\{mode===value\}|variant=\{mode===value\?'primary'/);
  // /apps/<repo> (and ?tab=map, ?tab=overview) lands on Graph, as the Map did; Learn keeps whichever view was open.
  assert.match(page, /\[mode,setMode\]=useState\('graph'\)/);
  assert.match(page, /<Tabs value=\{tab==='learn'\?'learn':mode\} onValueChange=\{v=>v==='learn'\?go\('learn'\):setMode\(v\)\}>/);
  // The Learn view renders no tabs: its canvas switcher sits in Learn's own header, on the Main canvas and on every
  // project canvas alike (docs/features/project-canvases.md).
  const learnView = page.slice(page.indexOf("if(tab==='learn')return"), page.indexOf('// A fixture record is only looked at'));
  assert.doesNotMatch(learnView, /\{tabs\}|<select/);
  assert.equal(learnView.match(/switcher=\{switcher\}/g).length, 2);
  assert.match(learn, /\[field-sizing:content\][^\n]*\/>\s*\{switcher\}/);
  // The canvas reaches the Map by one icon.
  assert.match(learnView, /onMap=\{\(\)=>go\('map'\)\}/);
  assert.match(learn, /\{onMap && <button type="button" data-learn-map title="Map: this repository's code graph" aria-label="Map" onClick=\{onMap\}/);
  // A repository with no snapshot shows its Map.
  assert.match(page, /tab=asked==='learn'&&!app\.commit_sha\?'map':asked/);
});

test('the canvas has no Tutor or Practice button: the composer is the Tutor on the NanoGPT course and its Rabbit Holes', () => {
  assert.doesNotMatch(learn, /data-learn-tutor|data-learn-practice|experience/);
  // A live learning journey also makes the composer the Tutor (LP1 Task 12).
  // Task 0 (owner, 2026-10-06): the NanoGPT course, its slice board and their holes are one registry entry
  // (learn-tutor-domains.js); LearnPage and useTutor ask the resolver, never the course name.
  assert.match(learn, /useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, courseCanvas: learnPreview && !board, journey, canvasVersion, repository: repoAttached && canvasRepository\(app\), describe: describeBlock \}\)/);
  assert.match(learn, /const suppliedCourse = learnPreview && !!registeredCourse\(\{ app \}\)\?\.capabilities\?\.suppliedCourse;/);
  assert.match(read('learn-tutor-domains.js'), /\{ id: 'nanogpt-attention', match: \{ repo: 'karpathy\/nanoGPT', board: TUTOR_BOARD \}, domain: NANOGPT, capabilities: \{ tutor: true, evidence: 'session', suppliedCourse: true \} \},/);
  // A hole opened from a journey section, once its parent journey is read (LP1 Task 14), too: the resolver's order.
  assert.match(tutor, /const context = tutorContext\(\{ \.\.\.where, journey \}\), capabilities = context\?\.capabilities;\n  const active = capabilities\?\.tutor === true, hookTurns = active \|\| capabilities\?\.hook_turns === true;/);
  assert.match(read('learn-tutor-domains.js'), /if \(journey\?\.journey\) return[^\n]*\n  if \(parentJourney && record\?\.journey\) \{[\s\S]*?const entry = registeredCourse\(\{ app, board, root \}, registry\);/);
  // ?board= stays review-only.
  assert.match(learn, /const named = hole \|\| !reviewTools \? null : new URLSearchParams\(window\.location\.search\)\.get\('board'\);/);
});

test('the Map: details and layers behind icons; the inspector closed until used, underline tabs only for a source, no outline (owner, 2026-10-06)', () => {
  assert.match(page, /data-repo-info aria-label="Repository details"/);
  assert.match(page, /<Menu open=\{infoOpen\}[\s\S]*?<SourceLink m=\{cardModel\(app\)\}\/>[\s\S]*?Refresh branch[\s\S]*?<\/Menu>/);
  // Layers is a labelled button in Graph (owner brief §3): icon, Layers, chevron; one search field for both views (§2). Its
  // panel opens beside the graph, which narrows: never a popover over the graph's nodes (repository-browser.md, Layers).
  assert.match(page, /\{mode==='graph'&&<Button size="sm" data-map-layers-open aria-controls="map-layers" aria-expanded=\{layersOpen\}[\s\S]*?><Layers size=\{15\}\/>Layers<ChevronDown/);
  assert.match(page, /<RepositoryGraph [^>]*\/>\s*\{layersOpen&&<aside id="map-layers" aria-label="Layers" className="w-60 shrink-0[^"]*"><LayersRow /);
  assert.doesNotMatch(page, /<Menu open=\{layersOpen\}/);
  assert.equal(page.match(/aria-label="Search repository"/g).length, 1);
  assert.match(page, /placeholder="Search files or symbols…"/);
  assert.equal(page.match(/<LayersRow /g).length, 1, 'the layers row lives only in its menu');
  assert.match(page, /const \[panelOpen,setPanelOpen\]=useState\(false\)/);
  assert.match(page, /collapsed=\{!panelOpen\}/);
  assert.match(inspector, /data-map-panel-close aria-label="Close the inspector"/);
  assert.match(page, /\{!panelOpen&&<IconBtn data-map-panel-open aria-label="Open the side panel"/);
  // Overview | Source as underline tabs, only when the object has a source; no pill tabs, no Selected or Conversation tab.
  // Overview | Source | Chat (owner, 2026-10-08), the same restrained underline; Source only for code the main pane is not showing.
  assert.match(inspector, /\{!record && <TabsList className="-mx-4 mt-2 px-4"><TabsTrigger value="overview" className=\{TAB\}>Overview<\/TabsTrigger>\{tabs && <TabsTrigger value="source" className=\{TAB\}>Source<\/TabsTrigger>\}<TabsTrigger value="chat" data-inspector-chat-tab className=\{TAB\}>Chat\{chatted > 0 && <span className="ml-1 tabular-nums text-ink-3">\{chatted\}<\/span>\}<\/TabsTrigger><\/TabsList>\}/);
  assert.doesNotMatch(page + inspector, /TabsList pill className="mb-3|value="selected"|value="conversation"|ring-2 ring-accent/);
  // A selection or a cited file opens it; answers land in the bar's own window, not here.
  assert.match(page, /const inspect=\(object,show='overview'\)=>\{.*setPanelOpen\(true\);\};/);
  assert.match(page, /function onFile\(filePath,line\)\{if\(snapshot\?\.files\.some\(f=>f\.path===filePath\)\)inspect\(fileObject\(snapshot\.graph,filePath,line\|\|1\),'source'\);\}/);
  assert.doesNotMatch(page, /resultsHost|ResultList/);
});

test('an answer lists every cited file once, in order, including line lists written one per line', () => {
  const text = 'See configurator.py:1-20 and train.py:120.\n`data/shakespeare_char/prepare.py:4\n51`\n`model.py:29\n78\n94` (line anchors). Again model.py:29, 31\n2 more things';
  assert.deepEqual(citedSources(text).map(c => `${c.path}:${c.start}-${c.end}`), [
    'configurator.py:1-20', 'train.py:120-120', 'data/shakespeare_char/prepare.py:4-4', 'data/shakespeare_char/prepare.py:51-51',
    'model.py:29-29', 'model.py:78-78', 'model.py:94-94', 'model.py:31-31']);
  assert.deepEqual(citedSources('No files here, just 3 numbers: 1, 2.'), []);
  // Md shows them in a Sources dropdown wherever opening a file is wired.
  assert.match(md, /const cited = onFile \? citedSources\(text\) : \[\];/);
  assert.match(md, /<details key="cited" data-cited-sources[^>]*><summary[^>]*>Sources \(\{cited\.length\}\)<\/summary>/);
});

test('the main composer: the Auto picker opens a / commands sheet with an example for every command it offers', () => {
  assert.match(bar, /data-bar-slash-help[\s\S]*?onClick=\{\(\) => \{ setPicker\(false\); setCommandsOpen\(true\); \}\}/);
  assert.match(bar, /\{commandsOpen && <BarCommandsSheet modes=\{modesFor\(target\)\} shortcuts=\{shortcutsFor\(target, surface\.catalog\)\}/);
  for (const command of SLASH.filter(c => c.places.some(place => place !== 'learn')))
    for (const place of command.places.filter(p => p !== 'learn')) {
      const example = exampleFor(command.name, place);
      assert.ok(example.startsWith(`/${command.name} `), `${command.name} in ${place}: ${example}`);
    }
});

test('the Map node carried into Learn ("Asking about") has an x, as the Map chip does', () => {
  assert.match(page, /<LearnPage app=\{app\} onGraph=\{showGraph\} onMap=\{\(\)=>go\('map'\)\} onClearRepository=\{context\?\(\)=>setContext\(null\):null\}/);
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

// repository-browser.md: one canonical selection. Files, Graph, the inspector, the dock chips and Learn read one context;
// the code reader's Ask and Learn go through the same attach as a file or a symbol click, and Learn carries the wire shape.
test('one selection: Files, Graph, the inspector and Learn read the same context; Ask and Learn on a range attach it like any pick', () => {
  const reader = read('CodeReader.jsx');
  assert.match(page, /<RepositoryGraph graph=\{shown\} selected=\{lit\}/);
  assert.match(page, /const lit=inspected\?\.record\?\{id:inspected\.id\}:context&&\(context\.nodeId\|\|context\.path\)\?\{id:context\.nodeId\|\|fileObject\(snapshot\.graph,context\.path\)\.nodeId\}:null;/);
  assert.match(page, /<CodeReader app=\{app\} snapshot=\{snapshot\} open=\{opened\} context=\{context\}[^>]*onFile=\{p=>attach\(fileObject\(snapshot\.graph,p\)\)\} onSymbol=\{n=>attach\(objectOf\(snapshot\.graph,n\)\)\}/);
  assert.match(page, /onRange=\{\(kind,range\)=>\{attach\(range\);if\(kind==='learn'\)learnThis\(range\);else askAbout\(range\);\}\}/);
  assert.match(page, /repositoryContext=\{context\?wireContext\(context\):\{commit:app\.commit_sha\}\}/);
  assert.match(page, /onLearn=\{\(\)=>learnThis\(inspected\)\}/);
  // Selecting text only offers [Ask] [Learn]; the context changes on a click, never on a selection.
  assert.match(reader, /<SourceSelectionContext\.Provider value=\{\{ value: pending, set: setPending \}\}>/);
  assert.doesNotMatch(reader, /setContext|small:ask-focus|learnAction/);
});

// Owner, 2026-10-08, from the stable preview (pallets/itsdangerous).
test('a click on the graph\'s white space deselects: no node lit, the inspector empty, the context cleared', () => {
  assert.match(page, /const deselect=\(\)=>\{setInspected\(null\);setTrail\(\[\]\);setContext\(null\);\};/);
  assert.match(page, /const choose=node=>\{if\(!node\)return deselect\(\);/);
  // RepositoryGraph reports a press on empty space as onSelect(null) (an unmoved press with no node).
  assert.match(read('RepositoryGraph.jsx'), /onPointerUp=\{e=>\{const active=drag\.current;release\(e\);if\(active&&!active\.moved\)onSelect\(active\.node\?scene\.positions\.get\(active\.node\.id\):null\);\}\}/);
});

test('Files: the inspector does not repeat the code the reader shows - no preview, no Source tab; the graph keeps both', () => {
  assert.match(page, /codeInView=\{mode==='files'&&!!inspected\?\.path&&opened===inspected\.path\}/);
  const inspector = read('MapInspector.jsx');
  assert.match(inspector, /const file = object\.path, source = !record && !!file, tabs = source && !codeInView;/);
  assert.match(inspector, /\{file && !codeInView && <Preview /);
  assert.match(inspector, /\{tabs && <TabsContent value="source"/);
  assert.match(inspector, /<Tabs value=\{record \? 'overview' : view === 'source' && !tabs \? 'overview' : view\}/);
  assert.match(inspector, /const href = source && repositoryUrl\(/, 'Open source on GitHub stays: it is a link, not the code');
});

test('every inspector Ask writes a ready question and pins its object; nothing sends', () => {
  assert.match(page, /const askAbout=\(object,question=askQuestion\)=>\{if\(!object\|\|object\.record\)return;setContext\(ground\(object\)\);setTimeout\(\(\)=>askDraft\(question\(object\)\),0\);\};/);
  assert.match(page, /const askWhy=object=>askAbout\(object,whyQuestion\);/);
  assert.match(page, /onAsk=\{\(\)=>askAbout\(inspected\)\} onWhy=\{\(\)=>askWhy\(inspected\)\}/);
  assert.doesNotMatch(page + read('MapMemory.jsx') + read('MapInspector.jsx'), /small:bar-ask/, 'no page action sends through the bar');
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
  // Canvas Ask in chat (card, slide, the menu's Ask about this) and a group's Ask in chat.
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /if \(armTarget\(block\)\) askDraft\(cardQuestion\(describeBlock\(block\)\?\.title\)\);/);
  assert.match(canvas, /text: groupTargetText\(entries\) \}\);\n\s+askDraft\(GROUP_QUESTION\);/);
  assert.doesNotMatch(canvas, /new Event\('small:ask-focus'\)/);
});

// Owner decision 3 (2026-10-08): Purpose and Why it matters stay on demand. Opening or selecting an object reads files and
// the snapshot only; no ask route is called until the learner presses Send (Learn this runs only from its own button).
test('opening or selecting a node makes no AI request: the select path reads files and the snapshot only', () => {
  const calls = (code) => [...code.matchAll(/api\(`([^`]*)`/g)].map((m) => m[1]);
  // The inspector reads a file's lines and the object's saved conversation (a GET of stored messages), never an ask route.
  assert.deepEqual(calls(inspector), ['/api/repositories/${app}/file', '/api/repositories/${app.name}/threads?node=${encodeURIComponent(object.id)}&commit=${snapshot.commit}']);
  assert.deepEqual(calls(read('RepositorySource.jsx')), ['/api/repositories/${appName}/file']);
  assert.deepEqual(calls(page), ['${root}/snapshot', '${root}/refresh']);
  for (const code of [page, inspector, read('RepositoryGraph.jsx'), read('CodeReader.jsx'), read('inspector.js')]) assert.doesNotMatch(code, /fetch\(|streamAsk|\/ask\b|learn\/ask/);
  assert.equal(page.match(/learnAction\(/g).length, 1, 'only Learn this, from its button');
  assert.match(page, /const learnThis=object=>\{setContext\(ground\(object\)\);learnAction\(/);
  assert.match(page, /const attach=object=>\{inspect\(object\);setContext\(ground\(object\)\);if\(object\.path\)setOpened\(object\.path\);\};/, 'a pick only inspects and grounds');
});

// Owner, 2026-10-08: the inspector is the object's conversation surface - Overview | Source | Chat.
test('a question about a selected object streams into its Chat, bound to the object at Send; errors and status go to the window', () => {
  // The key is taken from the scope frozen at Send, before any await, and every update of that answer uses it.
  assert.match(bar, /const node = nodeKey\(scope\), key = node \|\| resultsKey\(scope\);/);
  assert.match(bar, /if \(page\.resource\?\.slug === scope\.slug && page\.handlers\?\.onNodeAsk\) return page\.handlers\.onNodeAsk\(scope\.selected\);/);
  assert.match(bar, /text: `The answer about \$\{scope\.selected\.label\} is in its Chat on \$\{nameOf\(scope\)\}\.`/, 'sent from elsewhere: the window says where, never shows it');
  assert.match(bar, /add\(scope, \{ kind: 'user', text \}, key\);\n\s+const id = add\(scope, \{ kind: 'answer', text: '' \}, key\);\n\s+clearDraft\(from, raw\);\n\s+land\(\);/);
  assert.match(bar, /if \(node\) \{ add\(scope, \{ kind: 'note', text: `✗ \$\{failed\}`, error: true \}\); showResults\(scope\); \}/, 'a failure is said in the window too');
  assert.match(bar, /updateTurn\(key, id, \(t\) => applyEvent\(t, type, data\)\);/);
  // Send opens that object's Chat tab, found again by its id when another object is shown.
  assert.match(page, /onNodeAsk:s=>nodeAsk\.current\?\.\(s\)/);
  assert.match(page, /if\(inspected\?\.id===object\.id\)\{setView\('chat'\);setPanelOpen\(true\);\}else inspect\(object,'chat'\);/);
  // The Chat tab reads the object's own key and its saved conversation; Overview no longer carries a Conversation row.
  assert.match(inspector, /const chatKey = object && !object\.record \? nodeTurnsKey\(conversationKey, object\.id\) : null;/);
  assert.match(inspector, /\{!record && <TabsContent value="chat" className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-2">\{chat\}<\/TabsContent>\}/);
  assert.doesNotMatch(inspector, /data-inspector-section="conversation"|name="conversation"/);
  // The composer marks the object being asked about.
  assert.match(bar, /chip\.key === 'selected' \? 'bg-accent\/10 ring-1 ring-accent\/40' : 'bg-hover'/);
});
