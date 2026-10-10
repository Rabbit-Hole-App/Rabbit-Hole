// Canvas equations (docs/features/canvas-equations.md): the item, its palette, the LaTeX that survives save, copy and
// duplicate, Ask in chat, and the guard that keeps typing in an equation away from the canvas's keys. AdaptiveCanvas.jsx and
// LearnPage.jsx cannot run under node, so their wiring is pinned in source; e2e/equation-check.mjs drives the real thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import katex from 'katex';
import { EQUATION_LEVELS, EQUATION_PALETTE, EQUATION_SIZE, equationLevel, levelSize, newEquation, scaledSize, typingIn } from './canvas-equation.js';
import { TEXT_LEVELS } from './learn-style-panel.js';
import { canvasTargetField, describeCanvasObject, EQUATION_QUESTION } from './learn-ask-target.js';
import { boardText, persistBoard } from './canvas-persist.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FRACTION = '\\frac{a}{b}', SUBSCRIPT = 'x_{i}^{2}', MATRIX = '\\begin{pmatrix}1 & 0\\\\ 0 & 1\\end{pmatrix}';

test('a new equation is an editable item at the press, with no source yet', () => {
  const item = newEquation({ x: 120, y: -40 });
  assert.deepEqual({ ...item, id: 'id' }, { id: 'id', kind: 'equation', x: 120, y: -40, latex: '', size: EQUATION_SIZE, fresh: true });
  assert.notEqual(newEquation({ x: 0, y: 0 }).id, item.id);
});

test('the corner scales the type with the width dragged to, within readable bounds', () => {
  assert.equal(scaledSize(24, 100, 200), 48);
  assert.equal(scaledSize(24, 100, 50), 12);
  assert.equal(scaledSize(24, 100, 10), 12, 'never below 12');
  assert.equal(scaledSize(24, 100, 5000), 160, 'never above 160');
  assert.equal(scaledSize(24, 0, 10), 160, 'a zero width cannot divide by zero');
});

// r35 (owner: "For the equation do you think we need like the shapes has above them: H1, H2, H3, Text?"): a size ladder.
test('the size ladder: S, M, L match the text ladder\'s H3, H2, H1; M is today\'s size; XL is twice M; a custom size has no level', () => {
  const text = Object.fromEntries(TEXT_LEVELS.map(entry => [entry.id, entry.size]));
  assert.deepEqual(EQUATION_LEVELS.map(entry => [entry.label, entry.size]), [['S', text.h3], ['M', EQUATION_SIZE], ['L', text.h1], ['XL', 2 * EQUATION_SIZE]]);
  assert.equal(EQUATION_SIZE, text.h2, 'M is H2');
  assert.deepEqual(EQUATION_LEVELS.map(entry => equationLevel(entry.size)), ['s', 'm', 'l', 'xl']);
  assert.deepEqual(EQUATION_LEVELS.map(entry => levelSize(entry.id)), EQUATION_LEVELS.map(entry => entry.size));
  assert.equal(equationLevel(undefined), 'm', 'an equation saved before sizes is M');
  assert.equal(equationLevel(37), null, 'the corner handle left it between levels: custom, nothing pressed');
  assert.equal(equationLevel(scaledSize(24, 100, 200)), 'xl', 'a handle landing on a level shows it');
});

test('the ladder sits where the text ladder does, as the same pill, on a selected equation and never while it is edited', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  const equation = canvas.slice(canvas.indexOf('function EquationItem('), canvas.indexOf('// The lesson-block picker.'));
  assert.match(equation, /\{selected && !editing && tool === 'select' && \(\n\s+<LevelPill level=\{equationLevel\(size\)\} levels=\{EQUATION_LEVELS\} label="Equation size" fallback=\{null\} className="absolute bottom-full left-0 z-20 mb-2\.5"\n\s+onLevel=\{value => \{ onGesture\(\); onPatch\(item\.id, \{ size: levelSize\(value\) \}\); \}\} \/>/);
  // The text ladder's row also carries its Ask in chat (r35), on the cards' pill row (card-selection.test.mjs).
  assert.match(canvas, /<div className="absolute bottom-full left-0 z-20 mb-2\.5 flex min-w-full items-center gap-2">\n\s+\{ladder && <LevelPill level=\{item\.level\} onLevel=\{value => onLevel\(item\.id, value\)\} \/>\}/, 'the text ladder: same pill, same place');
  assert.equal((canvas.match(/function LevelPill\(/g) || []).length, 1, 'one ladder component');
});

test('the palette offers the five groups, and every button reads as KaTeX and inserts a MathLive template', () => {
  assert.deepEqual(EQUATION_PALETTE.map(group => group.name), ['Fractions, powers and subscripts', 'Square roots', 'Greek letters', 'Sums and integrals', 'Matrices and brackets']);
  for (const group of EQUATION_PALETTE) {
    assert.ok(group.items.length, group.name);
    for (const item of group.items) {
      assert.doesNotThrow(() => katex.renderToString(item.label, { throwOnError: true }), `${group.name}: ${item.title}`);
      // The template with its slots filled is LaTeX KaTeX renders, so the saved source renders too.
      assert.doesNotThrow(() => katex.renderToString(item.insert.replace(/#[@?]/g, 'x'), { throwOnError: true, displayMode: true }), item.insert);
    }
  }
  const matrices = EQUATION_PALETTE.find(group => group.id === 'matrix').items;
  assert.equal(matrices[0].insert, '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', 'a 2 by 2 matrix has four slots');
});

test('the equation is its LaTeX: saved, reloaded and compared by its source', async () => {
  const equation = { id: 'e1', kind: 'equation', x: 10, y: 20, latex: `${FRACTION}+${SUBSCRIPT}+${MATRIX}`, size: 30 };
  const stored = new Map(), pushed = [];
  const result = await persistBoard({
    state: { strokes: [], shapes: [], items: [equation], links: [], blocks: [], groups: [], areas: [] }, storageKey: 'k',
    storage: () => ({ setItem: (key, value) => stored.set(key, value) }), onSave: async state => { pushed.push(JSON.parse(JSON.stringify(state))); return 'ok'; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(stored.get('k')).items, [equation], 'this browser keeps the source as typed');
  assert.deepEqual(pushed[0].items, [equation], 'the server copy (learn_boards state_json) carries the same source');
  assert.notEqual(boardText({ items: [equation] }), boardText({ items: [{ ...equation, latex: FRACTION }] }), 'an edited source is a change to save');
});

test('copy and duplicate keep the source: an item copy is the whole item under a new id', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /const itemsCopy = pickedItems\.map\(item => \{ const id = crypto\.randomUUID\(\); fresh\.push\(id\); return \{ \.\.\.item, id, groupId: undefined, x: item\.x \+ step, y: item\.y \+ step, fresh: false \}; \}\);/);
  assert.match(canvas, /duplicate: \(\) => pasteIds\(selectedRef\.current\)/);
  // The same copy as the canvas makes, run here: latex and size ride.
  const item = { id: 'e1', kind: 'equation', x: 0, y: 0, latex: MATRIX, size: 40 };
  const copy = { ...item, id: 'e2', groupId: undefined, x: item.x + 28, y: item.y + 28, fresh: false };
  assert.equal(copy.latex, MATRIX);
  assert.equal(copy.size, 40);
});

test('undo covers an equation: placing snapshots, a changed source snapshots, an emptied one is deleted with its own step', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /tool === 'equation' && store\.equations\) \{[\s\S]{0,200}snapshot\(\);\s*store\.setItems\(previous => \[\.\.\.previous, newEquation\(store\.local\(event\)\)\]\);/);
  assert.match(canvas, /if \(!latex\) \{ if \(before\.fresh\) setItems\(previous => previous\.filter\(item => item\.id !== id\)\); else deleteItem\(id\); return; \}/);
  assert.match(canvas, /if \(!before\.fresh && before\.latex !== latex\) snapshot\(\);/);
});

test('Ask in chat: the pill shows the LaTeX, the request carries it, the prefilled question is plain words', () => {
  const described = describeCanvasObject({ id: 'e1', kind: 'equation', latex: ` ${MATRIX} ` });
  assert.deepEqual(described, { kind: 'Equation', title: MATRIX, text: `Equation on the canvas, in LaTeX: ${MATRIX}`, material: 'equation' });
  const field = canvasTargetField({ id: 'e1', ...described, card: true, context: { block_id: 'e1' } });
  assert.deepEqual(field, { id: 'e1', kind: 'Equation', title: MATRIX, text: `Equation on the canvas, in LaTeX: ${MATRIX}` });
  assert.equal(describeCanvasObject({ id: 'e2', kind: 'equation', latex: '' }).title, 'Empty equation');
  assert.equal(EQUATION_QUESTION, 'Can you explain this equation?');
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /if \(armTarget\(equation\)\) askDraft\(EQUATION_QUESTION\);/, 'the menu arms and prefills, it never sends');
});

test('typing in an equation is typing: the canvas keys stand down for its field', () => {
  assert.equal(typingIn({ tagName: 'MATH-FIELD', isContentEditable: false }), true, 'MathLive\'s field');
  for (const tagName of ['INPUT', 'TEXTAREA']) assert.equal(typingIn({ tagName, isContentEditable: false }), true, tagName);
  assert.equal(typingIn({ tagName: 'DIV', isContentEditable: true }), true, 'a text box');
  assert.equal(typingIn({ tagName: 'DIV', isContentEditable: false }), false);
  assert.equal(typingIn({ tagName: 'BUTTON', isContentEditable: false }), false);
  assert.equal(typingIn(null), false);
  // Every keyboard guard the canvas and the page own reads it: Delete, Ctrl+Z/Y/A/D/G, zoom, copy (the canvas's
  // `typing`), Ctrl+V (paste), C (comment), / and ? (the page), and the press that hands focus back.
  const canvas = read('./AdaptiveCanvas.jsx'), page = read('./LearnPage.jsx');
  assert.match(canvas, /const typing = typingIn\(active\);/);
  assert.match(canvas, /const paste = event => \{\s*const active = document\.activeElement;\s*if \(typingIn\(active\)\) return;/);
  assert.match(canvas, /\['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME'\]\.includes\(held\.tagName\) \|\| typingIn\(held\)/, 'C: the equation field too');
  assert.match(canvas, /const editable = typingIn\(active\);/);
  assert.match(page, /if \(typingIn\(active\) \|\| active\?\.tagName === 'SELECT'\) return;/);
  for (const [name, source] of [['AdaptiveCanvas.jsx', canvas], ['LearnPage.jsx', page]]) {
    assert.doesNotMatch(source, /active\.isContentEditable \|\| active\.tagName === 'INPUT'/, `${name} keeps no guard of its own that misses the equation field`);
  }
  // Esc finishes the edit from the field or its LaTeX source; the palette keeps the field's focus.
  assert.match(canvas, /focused\?\.closest\?\.\('\[data-equation-editor\]'\)\) && focused\.closest\(/);
  const editor = read('./EquationEditor.jsx');
  assert.match(editor, /data-equation-editor data-keep-focus/);
  assert.match(editor, /onBlur=\{event => \{ if \(!root\.current\.contains\(event\.relatedTarget\)\) finish\(\); \}\}/);
});

test('MathLive loads with the first equation edited, never with the canvas', () => {
  const canvas = read('./AdaptiveCanvas.jsx');
  assert.match(canvas, /const EquationEditor = lazy\(\(\) => import\('\.\/EquationEditor\.jsx'\)\);/);
  assert.doesNotMatch(canvas, /from 'mathlive'/);
  for (const file of ['./LearnPage.jsx', './canvas-equation.js', './MathText.jsx', './ask.jsx']) assert.doesNotMatch(read(file), /from 'mathlive'|import\('mathlive'\)/, file);
  const editor = read('./EquationEditor.jsx');
  assert.match(editor, /import \{ MathfieldElement \} from 'mathlive';/);
  assert.match(editor, /MathfieldElement\.fontsDirectory = null;/, 'KaTeX\'s stylesheet already declares the fonts');
  assert.match(editor, /MathfieldElement\.soundsDirectory = null;/);
});

test('the toolbar has the Equation tool right after Text', () => {
  assert.match(read('./AdaptiveCanvas.jsx'), /\['text', Type, 'Text'\],\n {2}\['equation', Sigma, 'Equation'\],/);
});
