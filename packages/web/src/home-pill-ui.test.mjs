// The picked card's pill in the workspace dock (owner, 2026-10-09: "when i click on a card in Home/Explore, I do not see
// the pill in the chatcomposer of the selected Projects/Canvas"). Pinned in source; e2e/selected-pill-check.mjs clicks it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const card = read('home/LearningCard.jsx'), bar = read('agent/AgentBar.jsx');

// Owner, 2026-10-22: "Remove the composer completely from Home, Library and Explore". With no dock there, a card's body click
// picks nothing (it replaces the two tests that pinned the pick: the card's onClick and the three pages' pick props).
test('a click on the card body picks nothing; the title, Open, the menu and links still open or act', () => {
  assert.doesNotMatch(card, /pickCard|pickedKey|data-card-selected|pick=|pick =/);
  assert.match(card, /<a data-card-title href=\{href\} onClick=\{\(e\) => \{ e\.stopPropagation\(\); if \(plain\(e\)\) \{ e\.preventDefault\(\); onOpen\(\); \} \}\}/, 'the title opens');
  assert.match(card, /data-card-open onClick=\{stop\(onOpen\)\}/, 'Open opens');
  assert.match(card, /onClick=\{stop\(onMore\)\}/);
  for (const file of ['Home.jsx', 'LibraryViews.jsx', 'home/PublicCards.jsx']) assert.doesNotMatch(read(file), /appPick|pick=/, file);
});

test('the dock shows the canvas composer\'s selected-card pill: the type icon, the title, x clears; Esc clears; the draft follows', () => {
  assert.match(bar, /const pill = surface\.picked && surface\.resource && scopeKey\(target\) === scopeKey\(live\) \? surface\.resource : null;/);
  assert.match(bar, /\{pill && <div data-home-pill data-selected-card=\{pill\.slug\} [^\n]*className="mb-1\.5 inline-flex max-w-full items-center gap-1\.5 rounded-full border border-line bg-hover py-1 pr-1\.5 pl-2\.5 text-xs text-ink-2">/);
  assert.match(bar, /\{pill\.type === 'repository' \? <FolderGit2 [^\n]*\/> : <Shapes [^\n]*\/>\}/);
  assert.match(bar, /aria-label="Remove selected card context" title="Remove selected card context" onClick=\{clearPick\}/);
  assert.match(bar, /const esc = \(e\) => \{ if \(e\.key === 'Escape' && !e\.defaultPrevented\) clearPick\(\); \};/);
  // Picking another card (or none) on the same page moves the draft to it; leaving the page keeps a held draft's scope.
  assert.match(bar, /if \(was\.key === pickKey \|\| was\.place !== surface\.place \|\| targetKey === scopeKey\(live\)\) return;\n\s+setDrafts\(\(d\) => carry\(d, target, live, false\)\);\n\s+setHeld\(live\);/);
  // The pill never sends: nothing in the pick path reaches a request.
  assert.doesNotMatch(read('agent/surface.js'), /fetch|api\(/);
});

test('a question about a published canvas carries its history from this list, built before the question joins it', () => {
  assert.match(bar, /const history = scope\.kind === 'shared' \? askHistory\(getTurns\(key\)[\s\S]*?\n\s+add\(scope, \{ kind: 'user', text \}, key\);/);
  assert.match(bar, /askBody\(\{ scope, message: text, threadId: threadIds\.get\(key\) \|\| null, history \}\)/);
});
