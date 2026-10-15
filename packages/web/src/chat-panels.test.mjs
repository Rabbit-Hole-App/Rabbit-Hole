// The right panel (docs/features/hide-right-panel.md): one open state and one tab; Context (the Sources experience) is a tab
// inside the panel, so Hide right panel hides it like any other tab. The rendered panel is e2e/hide-right-panel-check.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('Sources is the Context tab of the one panel state, never its own visibility flag', () => {
  const panels = read('./chat-panels.js');
  assert.match(panels, /sourcesOpen: open && tab === 'context'/, 'sourcesOpen is derived from the panel and its tab');
  assert.doesNotMatch(panels, /setSourcesOpen|setView|layoutFor/, 'no second visibility state and no Chat | Sources switch');
  assert.match(panels, /openSources: \(\{ reveal = true \} = \{\}\) => \{ if \(reveal\) setOpen\(true\); if \(reveal \|\| open\) setTab\('context'\); \}/, 'a late completion never reopens a hidden panel');
  assert.match(panels, /closeSources: \(\) => setTab\('chat'\)/, 'closing Sources goes back to Chat, never hides the panel');
});

test('the page mounts Sources inside the panel as the Context tabpanel, and the switch is gone', () => {
  const page = read('./LearnPage.jsx');
  assert.doesNotMatch(page, /<ResizableSidePanel aria-label="Sources"/, 'no separate Sources pane beside the panel');
  assert.doesNotMatch(page, /PaneSwitch/, 'no Chat | Sources switch');
  assert.match(page, /<ResizableSidePanel aria-label="Learn agent chat" [^\n]*collapsed=\{!panelOpen\}/, 'the one panel follows the one open state');
  assert.match(page, /<div role="tabpanel" aria-label="Context" data-context-panel className=\{`\$\{panelTab === 'context' \? 'flex' : 'hidden'\}[^`]*`\}><SourcesPane \/><\/div>/, 'Context holds SourcesPane, hidden but mounted on other tabs');
  assert.match(read('./PanelHeader.jsx'), /\{ id: 'comments'[^\n]*\n[^\n]*\n  \{ id: 'context', label: 'Context', Icon: Files \},/, 'Context is the fifth tab, after Comments');
  assert.match(read('./ask.jsx'), /data-chat-sources aria-label="Context" title="Open Context"[^\n]*onClick=\{\(\) => chat\.panels\.openSources\(\)\}[^\n]*<Files size=\{16\}/, 'the composer button opens Context with the same icon');
});
