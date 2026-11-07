import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACEHOLDER, PLACEHOLDERS, cardTitleOf, customTitleOf, renameBlock, renamable, startTitleOf, titleKey, TITLE_MAX, DERIVED_MAX } from './card-rename.js';

const blocks = [{ id: 'a', type: 'video', title: 'Old', dx: 10, dy: 20, w: 300, videoId: 'v' }, { id: 'b', type: 'divider', label: 'Chapter 1' }];

test('save trims and keeps id, content and geometry', () => {
  const next = renameBlock(blocks, 'a', '  New name  ');
  assert.deepEqual(next[0], { ...blocks[0], title: 'New name' });
  assert.equal(next[1], blocks[1]);
});

test('empty, whitespace or unchanged keeps the old title and the same array', () => {
  for (const text of ['', '   ', 'Old', null]) assert.equal(renameBlock(blocks, 'a', text), blocks);
});

// Every card in the canvas model is a block with a type: the right-click Rename (canvas-actions.js, applies: renamable) is offered on all of them (owner 2026-11-07).
const TYPES = ['challenge', 'explanation', 'quiz', 'flashcards', 'table', 'snippet', 'code', 'graph', 'flow', 'mermaid', 'knowledge', 'paper', 'image', 'video', 'cad', 'animation3d', 'whiteboardVideo', 'model3d', 'scene', 'audio', 'wiki', 'webpage', 'file', 'divider', 'slide', 'pdf', 'notebook', 'repo-code', 'canvas-ref', 'heading', 'repo-graph', 'animation', 'whiteboard'];

test('every card type is renamable; a chat card (an exchange, no type) and nothing are not', () => {
  for (const type of TYPES) assert.equal(renamable({ id: 'x', type }), true, type);
  assert.equal(renamable({ id: 'e', question: 'why?', answer: 'because' }), false);
  assert.equal(renamable(null), false);
  assert.equal(renamable(undefined), false);
});

test('a card with its own string title writes that title; a heading writes its text; every other card writes customTitle', () => {
  assert.equal(titleKey({ type: 'explanation', title: 'Tides' }), 'title');
  assert.equal(titleKey({ type: 'video', title: 'Clip' }), 'title');
  assert.equal(titleKey({ type: 'heading', text: 'Intro' }), 'text');
  for (const type of ['quiz', 'flashcards', 'challenge', 'file', 'pdf', 'slide', 'divider', 'notebook', 'canvas-ref', 'repo-graph']) assert.equal(titleKey({ type }), 'customTitle', type);
  // A wiki article's or a webpage capture's title is what it loads: renaming never touches it.
  assert.equal(titleKey({ type: 'wiki', title: 'Gradient' }), 'customTitle');
  assert.equal(titleKey({ type: 'webpage', title: 'Docs' }), 'customTitle');
});

test('wiki and webpage keep their loading title; the new name is customTitle, and clearing it restores the original', () => {
  const cards = [{ id: 'w', type: 'wiki', title: 'Tide', section: 2 }, { id: 'p', type: 'webpage', title: 'Docs', url: 'https://a.test' }];
  for (const id of ['w', 'p']) {
    const named = renameBlock(cards, id, '  My notes  ');
    const card = named.find(block => block.id === id), before = cards.find(block => block.id === id);
    assert.equal(card.customTitle, 'My notes');
    assert.equal(card.title, before.title, 'the article or capture title is untouched');
    const cleared = renameBlock(named, id, '   ');
    assert.deepEqual(cleared.find(block => block.id === id), before, 'empty restores the original, no empty field left behind');
    assert.equal(renameBlock(named, id, 'My notes'), named, 'unchanged keeps the same array');
  }
});

test('cards without a title (quiz, file, pdf, slide, divider, notebook, canvas-ref, repo-graph, flashcards, practice) take a custom name', () => {
  for (const type of ['quiz', 'file', 'pdf', 'slide', 'divider', 'notebook', 'canvas-ref', 'repo-graph', 'flashcards', 'challenge']) {
    const card = { id: 'c', type, label: 'en.md', question: 'q', dx: 4, dy: 6 };
    const [named] = renameBlock([card], 'c', 'Chapter notes');
    assert.deepEqual(named, { ...card, customTitle: 'Chapter notes' }, type);
    assert.equal(named.label, 'en.md', 'a file name is never overwritten');
  }
});

test('a heading is renamed through its text, the one place the contents read', () => {
  const [named] = renameBlock([{ id: 'h', type: 'heading', text: 'Intro', level: 2 }], 'h', 'Overview');
  assert.deepEqual(named, { id: 'h', type: 'heading', text: 'Overview', level: 2 });
});

test('a card name is capped at TITLE_MAX (one line, owner 2026-11-07); a heading keeps its own 200', () => {
  const [named] = renameBlock([{ id: 'q', type: 'quiz' }], 'q', 'x'.repeat(500));
  assert.equal(named.customTitle.length, TITLE_MAX);
  const [titled] = renameBlock([{ id: 'e', type: 'explanation', title: 'Old' }], 'e', 'y'.repeat(500));
  assert.equal(titled.title.length, TITLE_MAX);
  const [heading] = renameBlock([{ id: 'h', type: 'heading', text: 'Old' }], 'h', 'z'.repeat(500));
  assert.equal(heading.text.length, 200, 'a section is document content with its own cap (learn-outline-model.js)');
});

test('the editor opens on the learner name, else the card title or text, else the derived name', () => {
  assert.equal(startTitleOf({ type: 'quiz', customTitle: 'Mine' }, 'What is x?'), 'Mine');
  assert.equal(startTitleOf({ type: 'video', title: 'Clip' }, 'derived'), 'Clip');
  assert.equal(startTitleOf({ type: 'heading', text: 'Intro' }), 'Intro');
  assert.equal(startTitleOf({ type: 'quiz' }, 'What is x?'), 'What is x?');
  assert.equal(startTitleOf({ type: 'notebook' }), '');
});

test('cardTitleOf: custom name, then the derived name, then a neutral type placeholder that is never stored', () => {
  assert.equal(cardTitleOf({ type: 'wiki', title: 'Gradient', customTitle: 'My notes' }), 'My notes');
  assert.equal(cardTitleOf({ type: 'wiki', title: 'Gradient' }), 'Gradient');
  assert.equal(cardTitleOf({ type: 'file', label: 'en.md' }), 'en.md');
  assert.equal(cardTitleOf({ type: 'heading', text: 'Intro' }), 'Intro');
  assert.equal(cardTitleOf({ type: 'quiz', question: '  What   is  x?  ' }), 'What is x?');
  assert.equal(cardTitleOf({ type: 'challenge', prompt: 'Explain tides' }), 'Explain tides');
  assert.equal(cardTitleOf({ type: 'notebook' }), 'Untitled notebook');
  assert.equal(cardTitleOf({ type: 'file' }), PLACEHOLDERS.file);
  assert.equal(cardTitleOf({ type: 'never-heard-of-it' }), PLACEHOLDER);
  assert.equal(cardTitleOf(null), PLACEHOLDER);
  assert.equal(cardTitleOf({ type: 'quiz', question: 'x'.repeat(200) }).length, DERIVED_MAX);
  const card = { id: 'n', type: 'notebook' };
  cardTitleOf(card);
  assert.deepEqual(card, { id: 'n', type: 'notebook' }, 'computing the placeholder writes nothing');
  assert.equal(customTitleOf(card), '');
});

test('the renamed title and the custom name survive a JSON round trip of the doc (the board is saved as one JSON blob)', () => {
  const saved = JSON.parse(JSON.stringify({ blocks: renameBlock(renameBlock(blocks, 'a', 'Kept'), 'b', 'Part one') }));
  assert.equal(saved.blocks[0].title, 'Kept');
  assert.equal(saved.blocks[1].customTitle, 'Part one');
  assert.equal(saved.blocks[1].label, 'Chapter 1');
});

test('a group editor opens on the shown name with the caret at its end', async () => {
  const { groupEditText } = await import('./card-rename.js');
  const text = groupEditText('');
  assert.equal(text, 'Group');
  // The caret is collapsed to the end, so typing appends: "Group" + "s".
  assert.equal(text.slice(0, text.length) + 's', 'Groups');
  assert.equal(groupEditText('Tides'), 'Tides');
});

test('a group name is trimmed, capped, and an empty one keeps the old name', async () => {
  const { groupLabelFrom } = await import('./card-rename.js');
  assert.equal(groupLabelFrom('Old', '  New  '), 'New');
  assert.equal(groupLabelFrom('Old', '   '), 'Old');
  assert.equal(groupLabelFrom('', ''), '');
  assert.equal(groupLabelFrom('Old', 'x'.repeat(80)).length, 60);
});
