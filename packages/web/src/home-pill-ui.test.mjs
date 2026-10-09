// The picked card's pill in the workspace dock (owner, 2026-10-09: "when i click on a card in Home/Explore, I do not see
// the pill in the chatcomposer of the selected Projects/Canvas"). Pinned in source; e2e/selected-pill-check.mjs clicks it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const card = read('home/LearningCard.jsx'), bar = read('agent/AgentBar.jsx'), css = read('index.css');

test('a click on the card body picks it; the title, Open, the menu and links still stop the click, so they never pick', () => {
  assert.match(card, /onClick=\{pick \? \(\) => pickCard\(pick\) : undefined\} data-card-selected=\{picked \? '' : undefined\}/);
  assert.match(card, /const picked = !!pick && pickedKey\(surface\) === `\$\{pick\.kind\}:\$\{pick\.slug\}`;/);
  assert.match(card, /<a data-card-title href=\{href\} onClick=\{\(e\) => \{ e\.stopPropagation\(\); if \(plain\(e\)\) \{ e\.preventDefault\(\); onOpen\(\); \} \}\}/, 'the title opens');
  assert.match(card, /data-card-open onClick=\{stop\(onOpen\)\}/, 'Open opens');
  assert.match(card, /onClick=\{stop\(onMore\)\}/);
  // It stays selected while it is the pill, not only while it holds focus.
  assert.match(css, /\.select-card:focus-within,\n\.select-card\[data-card-selected\] \{/);
});

test('Home, Library and Explore (a creator profile too) pass the pick: their own canvases and projects, a published canvas by its link', () => {
  assert.equal((read('Home.jsx').match(/pick=\{appPick\(/g) || []).length, 2, 'Continue and Recent');
  assert.match(read('LibraryViews.jsx'), /pick=\{appPick\(a, cardModel\(a\)\.title\)\}/);
  assert.match(read('home/PublicCards.jsx'), /pick=\{\{ kind: 'shared', slug: card\.url\.split\('\/'\)\.pop\(\), title: card\.title, type: 'canvas' \}\}/);
  assert.match(read('CreatorProfile.jsx'), /<PublicCards /);
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
