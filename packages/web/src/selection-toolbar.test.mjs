// UX-1 (owner 2026-11-13): every selection toolbar is the same four buttons in the same order, nothing else: [Ctrl+K] - Add to chat - Highlight - Create note, built once (SelectionToolbar in selection-toolbar.jsx).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const shared = read('./selection-toolbar.jsx');
const body = shared.slice(shared.indexOf('export function SelectionToolbar'));

test('the shared toolbar renders the Ctrl+K pill, Add to chat, Highlight and Create note, in that order, and nothing else', () => {
  const order = [...body.matchAll(/data-quick-ask|<ToolButton label="([^"]+)"/g)].map(m => m[1] ?? 'Ctrl+K');
  assert.deepEqual(order, ['Ctrl+K', 'Add to chat', 'Highlight', 'Create note']);
  assert.match(body, /aria-keyshortcuts=\{ariaKey\(chordBinding\('quick-edit'\), mac\)\}/, 'the pill carries the quick-ask chord as its label and shortcut');
  assert.match(body, /<kbd aria-hidden="true"/, 'the pill is the explanation card\'s kbd button');
  assert.doesNotMatch(body, /Lightbulb|label="Explain"|label="Copy"|Add to canvas|Ask about selection/);
});

test('the explanation, Markdown and webpage cards render the shared toolbar with their own handlers, and each keeps a disabled state where a control cannot run', () => {
  const explanation = read('./ExplanationInteractions.jsx'), markdown = read('./FileDocMarkdown.jsx'), web = read('./WebpageCard.jsx');
  for (const [name, text] of [['explanation', explanation], ['markdown', markdown], ['webpage', web]]) {
    assert.match(text, /<SelectionToolbar /, `${name} renders SelectionToolbar`);
    assert.doesNotMatch(text, /Lightbulb/, `${name} has no bulb`);
    assert.doesNotMatch(text, /<ToolButton /, `${name} draws no toolbar button of its own`);
  }
  assert.match(explanation, /onQuickAsk=\{layer\.quickAsk\} quickDisabled=\{!host\?\.quickAsk\} onAddToChat=\{layer\.addToChat\} chatDisabled=\{!chat\?\.addToChat\}/);
  assert.match(explanation, /onHighlight=\{layer\.highlight\} highlightDisabled=\{!canEdit \|\| !bar\.segments\.length\} onNote=\{layer\.createNote\} noteDisabled=\{!canEdit \|\| !host\?\.note\}/);
  assert.match(web, /onQuickAsk=\{\(\) => quickAsk\(\)\} quickDisabled=\{!canvasHost\?\.quickAsk\} onAddToChat=\{\(\) => ask\(bar\.anchor\)\}/);
  assert.match(web, /onNote=\{\(\) => createNote\(bar\.anchor\)\} noteDisabled=\{!canvasHost\?\.note \|\| readOnly\}/);
  assert.match(markdown, /createNote = quote => \{[\s\S]*?host\.note\(\{ id: block\.id, quote: quote\.exact \}\)/);
});

test('the explanation card gains Add to chat: the selected words join the Chat composer as a card pill and nothing is sent', () => {
  const text = read('./ExplanationInteractions.jsx');
  const add = text.slice(text.indexOf('const addToChat'), text.indexOf('if (!enabled) return null;'));
  assert.match(add, /chat\.addToChat\(selectionRef\(/);
  assert.doesNotMatch(add, /putHighlight|generate|send|startExplain/);
});

test('no selection toolbar draws a Lightbulb (the card icon for explanation cards in card-icons.js is not a toolbar)', () => {
  for (const file of ['./selection-toolbar.jsx', './ExplanationInteractions.jsx', './FileDocMarkdown.jsx', './WebpageCard.jsx', './LearnPaper.jsx']) assert.doesNotMatch(read(file), /Lightbulb/, file);
});
