import test from 'node:test';
import assert from 'node:assert/strict';
import { waitingText } from './waiting-text.js';

test('a waiting label ends in one ellipsis character, never the stage\'s dots plus another', () => {
  assert.equal(waitingText(null), 'Thinking…');
  assert.equal(waitingText('Thinking...'), 'Thinking…');
  assert.equal(waitingText('Preparing answer...'), 'Preparing answer…');
  assert.equal(waitingText('Opening Attention Is All You Need...'), 'Opening Attention Is All You Need…');
  assert.equal(waitingText('Opening the paper…'), 'Opening the paper…');
  assert.equal(waitingText('read source'), 'read source…');
});

test('the canvas chat card and the chat sheet use it', async () => {
  const { readFileSync } = await import('node:fs');
  const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
  assert.match(read('AdaptiveCanvas.jsx'), /: waitingText\(exchange\.status\)\}/);
  assert.doesNotMatch(read('AdaptiveCanvas.jsx'), /`\$\{exchange\.status\}…`/);
  assert.match(read('ask.jsx'), /<span className="shimmer">\{waitingText\(m\.status\)\}<\/span>/);
});
