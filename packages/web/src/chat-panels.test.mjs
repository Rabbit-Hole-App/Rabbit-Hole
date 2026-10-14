// The Chat workspace layout (owner brief 2026-10-13 section 2; sub-lane A1): canvas, Sources and Chat side by side
// while the canvas keeps CANVAS_MIN px, else one pane with a Chat/Sources switch. The rendered panes are Home's e2e.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CANVAS_MIN, layoutFor } from './chat-panels.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('both panes sit beside the canvas only while the canvas keeps at least canvasMin px', () => {
  assert.equal(CANVAS_MIN, 480);
  assert.equal(layoutFor({ available: 1440, chat: 420, sources: 400 }), 'both', '620 px of canvas');
  assert.equal(layoutFor({ available: 1300, chat: 420, sources: 400 }), 'both', 'exactly 480 px still fits');
  assert.equal(layoutFor({ available: 1299, chat: 420, sources: 400 }), 'switch', 'one px short switches');
  assert.equal(layoutFor({ available: 1440, chat: 600, sources: 500 }), 'switch', 'wider panes leave too little canvas');
  assert.equal(layoutFor({ available: 1000, chat: 320, sources: 320, canvasMin: 300 }), 'both', 'canvasMin is a parameter');
});

test('below lg a panel reports no room, so the stacked layout always switches', () => {
  assert.equal(layoutFor({ available: 0, chat: 320, sources: 320 }), 'switch');
  const panel = read('./ResizableSidePanel.jsx');
  assert.match(panel, /useEffect\(\(\) => \{ onWidth\?\.\(visible, wide \? available : 0\); \}, \[onWidth, visible, available, wide\]\);/);
});

test('the page lays out canvas, then Sources, then Chat, and switching hides a pane without unmounting it', () => {
  const page = read('./LearnPage.jsx');
  const canvas = page.indexOf('aria-label="Lesson canvas"'), sources = page.indexOf('<ResizableSidePanel aria-label="Sources"'), chat = page.indexOf('<ResizableSidePanel aria-label="Learn agent chat"');
  assert.ok(canvas > 0 && sources > canvas && chat > sources, 'canvas, Sources, Chat from left to right');
  assert.match(page, /<ResizableSidePanel aria-label="Sources" [^\n]*defaultWidth=\{400\} storageKey="rh\.sources\.width" collapsed=\{!panels\.sourcesOpen\} hidden=\{switched && panels\.view !== 'sources'\} onWidth=\{panels\.measure\.sources\}/);
  assert.match(page, /<ResizableSidePanel aria-label="Learn agent chat" [^\n]*defaultWidth=\{420\} storageKey="rh\.chat\.width" collapsed=\{!panelOpen\} hidden=\{switched && panels\.view !== 'chat'\} onWidth=\{panels\.measure\.chat\}/);
  assert.match(page, /const switched = panels\.layout === 'switch';/);
});
