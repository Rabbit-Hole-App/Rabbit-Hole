// Ctrl+K carries the same Depth control as the Chat composer (owner 2026-11-07): the same DepthMenu on the same board setting, shown while a
// command is chosen (a command's line is handed to Chat, which sends the board's Depth), hidden for a plain Explain or Edit. Source checks plus the
// request field; no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { depthField } from './learn-settings.js';

const read = name => readFileSync(new URL('./' + name, import.meta.url), 'utf8');
const editor = read('InlineAiEditor.jsx');

test('Ctrl+K mounts the shared DepthMenu on the Chat workspace settings, only while a command is chosen, and not while a request runs', () => {
  assert.match(editor, /import DepthMenu from '\.\/DepthMenu\.jsx'/);
  assert.match(editor, /const depthSettings = useChatWorkspace\(\)\?\.settings \?\? null;/);
  assert.match(editor, /\{command && depthSettings && <DepthMenu settings=\{depthSettings\} disabled=\{busy\(status\)\} \/>\}/);
  assert.ok(!/<DepthMenu[^>]*data-/.test(editor), 'the same component, no second design');
});

test('it is the same setting the Chat reads: one useLearnSettings in the workspace, the Chat menu and Ctrl+K get that object', () => {
  const workspace = read('chat-workspace.jsx');
  assert.equal((workspace.match(/useLearnSettings\(/g) || []).length, 1);
  assert.match(workspace, /const value = useMemo\(\(\) => \(\{[^}]*\bsettings,/);
  assert.match(read('ModeSelector.jsx'), /<DepthMenu settings=\{chat\.settings\}/);
});

test('a Ctrl+K command line reaches Chat send, which attaches the Depth chosen at that moment (omitted for Standard)', () => {
  assert.match(read('LearnPage.jsx'), /handoff: async \(line, about = \{\}\) => \{[^}]*live\.ask\(/);
  assert.match(read('ask.jsx'), /const depthSnapshot = depthField\(chat\?\.settings\);/);
  assert.deepEqual(depthField({ depth: 'standard' }), {});
  assert.deepEqual(depthField({ depth: 'overview' }), { depth: 'overview' });
  assert.deepEqual(depthField({ depth: 'deep' }), { depth: 'deep' });
});

test('Escape in the open Depth menu closes only that menu: the menu stops the key before the editor handler sees it', () => {
  const menu = read('DepthMenu.jsx');
  assert.match(menu, /event\.key === 'Escape'\) \{ event\.preventDefault\(\); event\.stopPropagation\(\); close\(\); \}/);
  assert.match(menu, /<div role="menu" aria-label="Depth" onKeyDown=\{keys\}/);
});
