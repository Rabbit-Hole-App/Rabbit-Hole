import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasteKind } from './canvas-paste.js';

const marker = 'rabbit-hole:copied-cards';

test('an image from anywhere becomes an image card', () => {
  assert.equal(pasteKind({ images: 1, text: '', marker }), 'image');
  assert.equal(pasteKind({ images: 1, text: 'caption', marker, cards: 2 }), 'image');
});

test('text copied elsewhere becomes a text card, even after cards were copied on the canvas', () => {
  assert.equal(pasteKind({ text: 'Attention is all you need', marker }), 'text');
  assert.equal(pasteKind({ text: 'copied in another tab', marker, cards: 3 }), 'text');
});

test('the canvas\'s own copied cards paste while the clipboard holds their marker', () => {
  assert.equal(pasteKind({ text: marker, marker, cards: 2 }), 'cards');
  assert.equal(pasteKind({ images: 1, text: '', marker, copying: true, cards: 1 }), 'cards');
  assert.equal(pasteKind({ text: '', marker, cards: 1 }), 'cards');
});

test('nothing to paste: whitespace, or the marker with no cards', () => {
  assert.equal(pasteKind({ text: '   ', marker }), null);
  assert.equal(pasteKind({ text: marker, marker }), null);
});

test('one http(s) URL asks first (url kind) only where the canvas offers webpage cards', async () => {
  const { isWebUrl } = await import('./canvas-paste.js');
  assert.equal(pasteKind({ text: 'https://example.com/a?b=1', marker, url: true }), 'url');
  assert.equal(pasteKind({ text: '  http://example.com  ', marker, url: true }), 'url');
  // Without the canvas's offer, or for anything but one URL, the paste stays what it was.
  assert.equal(pasteKind({ text: 'https://example.com', marker }), 'text');
  assert.equal(pasteKind({ text: 'see https://example.com', marker, url: true }), 'text');
  assert.equal(pasteKind({ text: 'https://a.com\nhttps://b.com', marker, url: true }), 'text');
  assert.equal(pasteKind({ text: 'javascript:alert(1)', marker, url: true }), 'text');
  assert.equal(pasteKind({ text: 'file:///etc/passwd', marker, url: true }), 'text');
  // An image and the canvas's own cards still win.
  assert.equal(pasteKind({ images: 1, text: 'https://example.com', marker, url: true }), 'image');
  assert.equal(pasteKind({ text: marker, marker, cards: 1, url: true }), 'cards');
  assert.equal(isWebUrl('https://'), false);
  assert.equal(isWebUrl('ftp://example.com'), false);
});

test('the URL chooser sits behind the canvas paste guards: editors and the composer keep their paste, a view-only board never asks', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  const handler = src.slice(src.indexOf('const paste = event => {'), src.indexOf("window.addEventListener('paste', paste, true);"));
  assert.ok(handler.indexOf('if (typingIn(active)) return;') > -1 && handler.indexOf('if (typingIn(active)) return;') < handler.indexOf("kind === 'url'"), 'typing in a field returns before any choice');
  assert.match(handler, /url: !readOnlyRef\.current/);
  assert.match(handler, /if \(kind === 'url'\) \{ event\.preventDefault\(\); setUrlPaste\(/);
  // The two choices, by their words; Esc and a click elsewhere place nothing.
  assert.match(src, />Paste as text<\/button>/);
  assert.match(src, />Add webpage card<\/button>/);
  assert.match(src, /if \(event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); choosePaste\(null\); \}/);
});

// Owner 2026-11-14: copy a Mermaid diagram or an equation from a Markdown card and paste it on the canvas; a code block's Copy marks it as code;
// a link in a card asks Open in new tab or Add webpage card.
test('Mermaid source pastes as a Mermaid card, an equation as an equation card, only where the canvas is editable', async () => {
  const { mermaidOf, equationOf } = await import('./canvas-paste.js');
  assert.equal(mermaidOf('graph TD\n  A-->B'), 'graph TD\n  A-->B');
  assert.equal(mermaidOf('graph TD\r\n  A-->B \n'), 'graph TD\r\n  A-->B \n', 'the source is kept exactly as copied');
  assert.equal(mermaidOf('```mermaid\nflowchart LR\n  a-->b\n```'), 'flowchart LR\n  a-->b', 'a mermaid fence around it is dropped');
  assert.equal(mermaidOf('%% note\nsequenceDiagram\n  A->>B: hi'), '%% note\nsequenceDiagram\n  A->>B: hi');
  assert.equal(mermaidOf('Timeline of events\nand what came next'), null, 'prose that starts with a diagram word is not a diagram');
  assert.equal(mermaidOf('graph TD'), null, 'one line is not a diagram');
  assert.equal(equationOf('$$\nx^2 + y^2\n$$'), 'x^2 + y^2');
  assert.equal(equationOf('\\[ a = b \\]'), 'a = b');
  assert.equal(equationOf('$$a$$ and $$b$$'), null, 'two equations or text around one is text');
  assert.equal(equationOf('price is $5'), null);
  assert.equal(pasteKind({ text: 'graph TD\n A-->B', rich: true }), 'mermaid');
  assert.equal(pasteKind({ text: 'graph TD\n A-->B', rich: true, code: true }), 'mermaid', 'Mermaid wins over the code guess');
  assert.equal(pasteKind({ text: '$$\nx\n$$', rich: true }), 'equation');
  assert.equal(pasteKind({ text: 'graph TD\n A-->B' }), 'text', 'a view-only canvas places nothing rich');
  assert.equal(pasteKind({ text: 'hello world', rich: true }), 'text');
});

test('the Markdown card: a code block Copy marks the clipboard as code, an equation has a Copy button, a link asks first', async () => {
  const { readFile } = await import('node:fs/promises');
  const md = await readFile(new URL('./Md.jsx', import.meta.url), 'utf8'), canvas = await readFile(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(md, /rememberCodeCopy\(\(\) => sessionStorage, \{ text: lines\.join/, 'Copy marks the code, so a paste always asks Code card or notebook');
  assert.match(md, /data-math-copy data-explanation-ui aria-label=\{done \? 'Equation copied' : 'Copy equation'\}/);
  assert.match(md, /writeText\(`\$\$\\n\$\{expression\}\\n\$\$`\)/, 'it copies $$...$$, which pastes as an equation card');
  assert.match(md, /target="_blank" rel="noreferrer" data-web-link=""/);
  assert.match(canvas, /closest\?\.\('\[data-web-link\]'\)[\s\S]{0,200}metaKey \|\| event\.ctrlKey/, 'a modified click keeps the browser\'s own new tab');
  assert.match(canvas, /choice === 'tab'\) window\.open\(chosen\.text, '_blank', 'noopener,noreferrer'\)/);
  assert.match(canvas, /data-paste-url-choice="tab"[\s\S]{0,520}Open in new tab/);
  assert.match(canvas, /kind === 'mermaid' \|\| kind === 'equation'\) \{ event\.preventDefault\(\); pasteRichRef\.current\(kind, text\)/);
});

// Owner 2026-11-14: a paste lands where the pointer is, not at the top of the column.
test('every canvas paste is placed at the pointer when it is over the canvas', async () => {
  const { readFile } = await import('node:fs/promises');
  const canvas = await readFile(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8'), page = await readFile(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /const cursorAt = \(\) => \{[\s\S]{0,400}return local\(point\);/, 'the pointer in world coordinates, null when it is off the canvas');
  assert.match(canvas, /pasteTextRef\.current = \(text, at = null\) => \{[\s\S]{0,80}const center = at \|\| cursorAt\(\) \|\| viewCenter\(\)/, 'text');
  assert.match(canvas, /const at = cursorAt\(\);[\s\S]{0,200}insertAt\(block, at\)[\s\S]{0,400}newEquation\(at \|\| viewCenter\(\)\)/, 'Mermaid and equation');
  assert.match(canvas, /dropFilesRef\.current\(images, cursorAt\(\)\)/, 'an image');
  assert.match(canvas, /pasteCodeRef\.current\(text, cursorAt\(\)\)/, 'code');
  assert.match(canvas, /setUrlPaste\(\{ text: text\.trim\(\), back: active, at: cursorAt\(\) \}\)/, 'a pasted link');
  assert.match(canvas, /link: true, at: local\(event\) \}/, 'a clicked link places its card at the click');
  assert.match(canvas, /addWebpage\(chosen\.text, chosen\.at\)/);
  assert.match(page, /const pasteCode = \(text, at = null\) =>[\s\S]{0,400}kind: 'paste', at, copy/, 'the Code card or notebook dialog keeps the point');
  // Images, GIFs, SVG, audio and video go in at the point too (takeDrop passes `at` to every insertFile); a drop shares the path.
  assert.match(canvas, /insertFile: \(\{[^)]*at = null \}\) => \{[\s\S]{0,60}snapshot\(\);[\s\S]{0,40}return insertAt\(\{ id: crypto\.randomUUID\(\), type: 'file'[^\n]*, at\);/, 'insertFile takes a world point');
  assert.equal((page.match(/canvas\(\)\?\.insertFile\(/g) || []).length, (page.match(/canvas\(\)\?\.insertFile\([^\n]*\bat \}\)/g) || []).length, 'every insertFile in takeDrop passes the point');
});

test('a pasted chat card and a pasted cut card are measured and put on the pointer', async () => {
  const { readFile } = await import('node:fs/promises');
  const canvas = await readFile(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /bounds: Object\.fromEntries\(picked\.filter\(id => boundsRef\.current\[id\]\)/, 'copy keeps each box: a cut card has none left');
  assert.match(canvas, /const drawn = \{ \.\.\.\(saved\.bounds \|\| \{\}\), \.\.\.boundsRef\.current \};/, 'a live box wins over the kept one');
  assert.match(canvas, /bounds: drawn, index: flowIndexAt\(at\.y\)/);
  assert.match(canvas, /pendingAt\.current\.set\(copy\.id, \{ x: box\.x \+ target\.move\.x, y: box\.y \+ target\.move\.y \}\)/, 'a chat copy is put on the point once measured');
  assert.match(canvas, /if \(chat\) \{ onMove\(id, Math\.round\(at\.x - \(box\.x - \(chat\.dx \|\| 0\)\)\), Math\.round\(at\.y - \(box\.y - \(chat\.dy \|\| 0\)\)\)\); pendingAt\.current\.delete\(id\); continue; \}/);
});

test('pasteTarget: chat cards alone move by the distance from their corner to the pointer', async () => {
  const { pasteTarget } = await import('./canvas-paste.js');
  const got = pasteTarget({ at: { x: 400, y: 300 }, chats: [{ id: 'c' }], bounds: { c: { x: 100, y: 50, w: 380, h: 200 } }, list: [], index: 0 });
  assert.deepEqual(got.move, { x: 300, y: 250 });
  assert.equal(got.shift, null);
});

test('the canvas\'s own copied cards paste at the pointer too, keeping their layout; Duplicate and Alt-drag keep their step', async () => {
  const { readFile } = await import('node:fs/promises');
  const canvas = await readFile(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
  assert.match(canvas, /pasteIds\(clipboard\.current, 28, true, menuPoint\.current \|\| cursorAt\(\)\)\),/, 'the Paste command: where the menu was opened, else the pointer');
  assert.match(canvas, /if \(event\.key\.toLowerCase\(\) === 'x'\) \{ if \(keyActionRef\.current\('cut'\)\.ran\)/, 'Ctrl+X runs the menu Cut row (permission, locked objects)');
  assert.match(canvas, /if \(readOnlyRef\.current\) return; \/\/ a view-only board takes no paste/, 'Ctrl+V does nothing on a view-only board');
  assert.match(canvas, /pasteIdsRef\.current\(clipboard\.current, 28, true, cursorAt\(\)\)\) \{ event\.preventDefault/, 'Ctrl+V');
  assert.match(canvas, /const pasteIds = \(picked, step = 28, clip = false, at = null\) =>/);
  assert.match(canvas, /const target = clip && at \?/, 'only a clipboard paste with a pointer point is placed at it');
  assert.match(canvas, /duplicate: \(\) => !!pasteIds\(selectedRef\.current\),/, 'Duplicate keeps its step');
  assert.match(canvas, /made = pasteIds\(ids, 0\);/, 'Alt-drag keeps its own placement');
  assert.match(canvas, /x: item\.x \+ by\.x, y: item\.y \+ by\.y/, 'notes, text and equations move by the same distance');
});

test('pasteTarget: the copies\' top-left corner lands on the pointer, their layout kept', async () => {
  const { pasteTarget } = await import('./canvas-paste.js');
  // Two cards in a column, each 100 tall: A drawn at (0,0), B at (0,120) with a drag offset of (30, 10), so B's slot is (0,110).
  const list = [{ id: 'a', dx: 0, dy: 0 }, { id: 'b', dx: 30, dy: 10 }], bounds = { a: { x: 0, y: 0, w: 200, h: 100 }, b: { x: 30, y: 120, w: 200, h: 100 } };
  // Copy A, point at (500, 115): the slot at that height is index 1 (B's), at (0, 110); A's copy must be drawn at (500, 115): offset (500, 5).
  const one = pasteTarget({ at: { x: 500, y: 115 }, blocks: [list[0]], list, bounds, index: 1 });
  assert.deepEqual(one.shift, { x: 500, y: 5 });
  assert.equal(one.index, 1);
  // A note and a card copied together: the note sits 50 right and 40 below the card's corner; both move so the corner is on the point.
  const mix = pasteTarget({ at: { x: 500, y: 115 }, blocks: [list[0]], items: [{ x: 50, y: 40 }], list, bounds, index: 1 });
  assert.deepEqual(mix.move, { x: 500, y: 115 });
  assert.deepEqual(mix.shift, { x: 500, y: 5 });
  // Items alone move by the distance from their corner to the point; no card means no shift.
  const note = pasteTarget({ at: { x: 10, y: 20 }, items: [{ x: 100, y: 200 }], shapes: [{ x1: 300, y1: 50, x2: 150, y2: 400 }], list, bounds, index: 0 });
  assert.deepEqual(note.move, { x: -90, y: -30 });
  assert.equal(note.shift, null);
  // Past the last card: just below it (24 px gap).
  const end = pasteTarget({ at: { x: 0, y: 900 }, blocks: [list[1]], list, bounds, index: 2 });
  assert.deepEqual(end.shift, { x: -30, y: 900 - (120 + 100 - 10 + 24) - 10 });
  // A card not measured yet: the step stays (shift null); nothing with a position: null.
  assert.equal(pasteTarget({ at: { x: 1, y: 1 }, blocks: [{ id: 'z' }], list, bounds, index: 0 }), null);
  assert.equal(pasteTarget({ at: { x: 1, y: 1 }, blocks: [{ id: 'z' }], items: [{ x: 5, y: 5 }], list, bounds, index: 0 }).shift, null);
});
