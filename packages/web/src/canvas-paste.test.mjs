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
});
