// The right panel (docs/features/hide-right-panel.md): one open state and one tab; Context (the Sources experience) is a tab
// inside the panel, so Hide right panel hides it like any other tab. The rendered panel is e2e/hide-right-panel-check.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the companion column shares the right side\'s open state; Context, Files and Graph are its views, never Chat tabs', () => {
  const panels = read('./chat-panels.js');
  assert.match(panels, /const \[companionOpen, setCompanionOpen\] = useState\(false\), \[view, setView\] = useState\('context'\), \[previous, setPrevious\] = useState\(null\);/, 'closed, on Context, by default');
  assert.match(panels, /sourcesOpen: open && companionOpen && view === 'context'/, 'sourcesOpen is derived from the right side, the column and its view');
  assert.match(panels, /if \(reveal\) setOpen\(true\);\n\s+if \(!reveal && !open\) return;/, 'a late completion never reopens a hidden right side');
  assert.match(panels, /setPrevious\(open && companionOpen && view !== next \? view : null\);/, 'Back to the view a show() replaced');
  assert.match(panels, /companion: \{ open: companionOpen, view, previous, show, close, back \}/, 'Interface 1');
  assert.match(panels, /openSources: options => show\('context', options\)/);
  assert.match(panels, /closeSources: close,/, 'closing Sources closes the column, never Chat or the right side');
  assert.match(panels, /openChat: \(\) => \{ setOpen\(true\); setTab\('chat'\); if \(!wide\(\)\) close\(\); \}/, 'below lg Chat takes the viewer\'s place');
});

test('the page mounts the companion LEFT of Chat, every view mounted while hidden, and Hide right panel hides both', () => {
  const page = read('./LearnPage.jsx');
  const companion = page.indexOf('<ResizableSidePanel aria-label="Viewer" data-companion'), chat = page.indexOf('<ResizableSidePanel aria-label="Learn agent chat"');
  assert.ok(companion > 0 && companion < chat, 'canvas, companion, then Chat: side by side');
  assert.match(page, /defaultWidth=\{360\} storageKey="rh\.companion\.width" collapsed=\{!panelOpen \|\| !companion\.open\} reserve=\{panelOpen \? chatWidth : 0\}/, 'own width; hidden with the right side; leaves the canvas its room beside Chat');
  assert.match(page, /<ResizableSidePanel aria-label="Learn agent chat" [^\n]*collapsed=\{!panelOpen\} reserve=\{panelOpen && companion\.open \? companionWidth : 0\} narrowHidden=\{companion\.open\}/, 'Chat leaves the open companion\'s width out of its maximum; below lg one column at a time, Chat still mounted');
  assert.match(page, /reserve=\{panelOpen \? chatWidth : 0\} onWidth=\{setCompanionWidth\}/, 'and the companion leaves Chat\'s');
  // Review finding 2 (2026-10-15): the window listeners read the LATEST companion, or show() saw a stale view and previous stayed
  // null, so Back to graph never appeared after Open source or a citation.
  assert.match(page, /companionNow\.current = companion;/);
  assert.match(page, /const showFiles = \(\) => companionNow\.current\.show\('files'\), showGraph = \(\) => companionNow\.current\.show\('graph'\);/);
  assert.match(page, /<div role="tabpanel" aria-label="Context" data-context-panel className=\{`\$\{companionView === 'context' \? 'flex' : 'hidden'\}[^`]*`\}><SourcesPane \/><\/div>/);
  assert.match(page, /\{files && shown\.current\.has\('files'\) && <div role="tabpanel" aria-label="Repository files" data-learn-files className=\{`\$\{companionView === 'files' \? 'flex' : 'hidden'\}/, 'mounted on first show, then kept');
  assert.match(page, /\{graph && shown\.current\.has\('graph'\) && <div role="tabpanel" aria-label="Repository graph" data-learn-graph className=\{`\$\{companionView === 'graph' \? 'flex' : 'hidden'\}[^`]*`\}>\{graph\}<\/div>\}/);
  assert.match(page, /useEffect\(\(\) => \{ if \(openViewer\) companion\.show\(openViewer\); \}, \[\]\);/, 'an old ?tab= link opens its view once');
  assert.doesNotMatch(page, /data-learn-open-map/, 'no Map page to link to');
  assert.match(page, /if \(files\) window\.addEventListener\('small:open-files', showFiles\);\n\s+if \(graph\) window\.addEventListener\('small:open-graph', showGraph\);/);
  assert.match(read('./ask.jsx'), /data-chat-sources aria-label="Context" title="Open Context"[^\n]*onClick=\{\(\) => chat\.panels\.openSources\(\)\}[^\n]*<Files size=\{16\}/, 'the composer button opens Context with the same icon');
  const header = read('./PanelHeader.jsx');
  assert.match(header, /export const COMPANION_VIEWS = \[\n\s+\{ id: 'context', label: 'Context', Icon: Files \},\n\s+\{ id: 'files', label: 'Files', Icon: FolderTree \},\n\s+\{ id: 'graph', label: 'Graph', Icon: Network \},\n\];/);
  assert.match(header, /data-companion-back onClick=\{onClose\} aria-label="Back to chat"[^\n]*\n[^\n]*lg:hidden/, 'Back to chat below lg');
  assert.match(header, /data-companion-close onClick=\{onClose\} aria-label="Close viewer"[^\n]*\n[^\n]*max-lg:hidden/);
});
