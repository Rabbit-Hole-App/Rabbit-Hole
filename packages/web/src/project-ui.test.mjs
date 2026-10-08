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

test('a project is Map or Learn: no Overview, and the canvas has no Overview/Learn/Map pill', () => {
  assert.doesNotMatch(page, /Overview|value="overview"/);
  assert.match(page, /<TabsTrigger pill value="map">[\s\S]*<TabsTrigger pill value="learn"/);
  // The Learn view renders no tabs: only the canvas picker, and only when there are canvases.
  const learnView = page.slice(page.indexOf("if(tab==='learn')return"), page.indexOf('// A fixture record is only looked at'));
  assert.doesNotMatch(learnView, /\{tabs\}/);
  assert.match(learnView, /canvases\.length>0&&<div/);
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
  assert.match(page, /data-map-layers-open aria-label="Layers"[\s\S]*?<Menu open=\{layersOpen\}[\s\S]*?className="[^"]*"><LayersRow /);
  assert.equal(page.match(/<LayersRow /g).length, 1, 'the layers row lives only in its menu');
  assert.match(page, /const \[panelOpen,setPanelOpen\]=useState\(false\)/);
  assert.match(page, /collapsed=\{!panelOpen\}/);
  assert.match(inspector, /data-map-panel-close aria-label="Close the inspector"/);
  assert.match(page, /\{!panelOpen&&<IconBtn data-map-panel-open aria-label="Open the side panel"/);
  // Overview | Source as underline tabs, only when the object has a source; no pill tabs, no Selected or Conversation tab.
  assert.match(inspector, /\{source && <TabsList className="-mx-4 mt-2 px-4"><TabsTrigger value="overview"[^>]*>Overview<\/TabsTrigger><TabsTrigger value="source"[^>]*>Source<\/TabsTrigger><\/TabsList>\}/);
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
