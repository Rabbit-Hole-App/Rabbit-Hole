import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Owner 2026-11-15: one name and one icon per action, icons not text buttons, the same wording in the strips and the menus.
test('one vocabulary: each action has one name and a distinct icon', () => {
  const table = [...read('ActionIcons.jsx').matchAll(/^  (\w+): \{ label: '([^']+)', Icon: (\w+) \},$/gm)].map(m => [m[1], m[2], m[3]]);
  assert.deepEqual(table.map(r => [r[0], r[1]]), [['ask', 'Ask in chat'], ['chat', 'Add to chat'], ['canvas', 'Add to canvas'], ['graph', 'Add selection as graph'], ['repo', 'Open in repository'], ['copy', 'Copy'], ['close', 'Close all']]);
  assert.equal(new Set(table.map(r => r[2])).size, table.length, 'no two actions share an icon');
});

test('the Graph row, the Files strip and the viewer strip draw the shared group; no "Add in chat" or "Add code card" wording is left', () => {
  const graph = read('GraphPanel.jsx'), reader = read('CodeReader.jsx'), source = read('RepositorySource.jsx');
  assert.match(graph, /<ActionBar side="top" actions=\{\[[\s\S]*id: 'chat'[\s\S]*id: 'graph'[\s\S]*id: 'canvas'[\s\S]*id: 'close', label: 'Clear selection'[\s\S]*clearSelection\(repository\)/);
  assert.match(reader, /tail=\{panel && onCloseAll \? \[\{ id: 'close'/);
  assert.match(source, /<ActionBar actions=\{\[\.\.\.\(lead \|\| \[\]\), repo && commit && \{ id: 'repo'/);
  for (const [name, text] of [['GraphPanel', graph], ['CodeReader', reader], ['RepositorySource', source]]) assert.doesNotMatch(text, /Add in chat|Add code card|>Close all</, name);
});

test('a code card is tall enough to read (480, was 320)', async () => {
  const { CODE_CARD } = await import('./code-card.js');
  assert.deepEqual(CODE_CARD, { w: 480, h: 480 });
});

// Owner 2026-11-15: tooltips consistent. Every action icon shows the house Tip (name bold, description under it), not the browser's native title.
test('action icons draw the shared Tip, never a native title', () => {
  const bar = read('ActionIcons.jsx');
  assert.match(bar, /import \{ IconBtn, Tip \} from '\.\/ui\.jsx'/);
  assert.match(bar, /<Tip key=\{action\.id\} label=\{label\} info=\{info\(action\.title, label\)\} side=\{side\}>/);
  assert.doesNotMatch(bar, /\btitle=\{/, 'the name rides the Tip, so no native title is drawn');
  assert.match(read('GraphPanel.jsx'), /<ActionBar side="top" actions/, 'the Graph row sits at the panel bottom, so its tips open upward');
});
