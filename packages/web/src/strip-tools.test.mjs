import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

// Owner 2026-11-15: the chat strip is one component everywhere. The pill (ChatComposer pill), and the tool button inside it (StripTool),
// are the same on the owner's canvas (ask.jsx) and on a shared canvas (SharedChat.jsx).
test('the strip tools are one component: ChatComposer exports StripTool, the owner canvas and the shared canvas both use it', () => {
  assert.match(read('ChatComposer.jsx'), /export function StripTool\(/);
  for (const file of ['ask.jsx', 'SharedChat.jsx']) assert.match(read(file), /import ChatComposer, \{[^}]*\bStripTool\b[^}]*\} from '\.\/ChatComposer\.jsx'/, file);
  assert.doesNotMatch(read('ask.jsx'), /data-curious-toggle aria-label=/, 'no second hand-made Curious button');
});

test('the shared canvas strip draws the same five tools: Add and Commands greyed, Curious, chat, and Minimize from the pill', () => {
  const shared = read('SharedChat.jsx');
  assert.match(shared, /<StripTool label="Add"[^>]*disabled>/);
  assert.match(shared, /<StripTool label="Commands"[^>]*disabled/);
  assert.match(shared, /data-curious-toggle/);
  assert.match(shared, /data-chat-window-toggle/);
  assert.match(shared, /onMinimize=\{stripHost \?/);
  assert.match(read('SharedBoardPage.jsx'), /curiousToggle=\{\{ min: curiousMin, set: setCuriousMin \}\}/);
});
