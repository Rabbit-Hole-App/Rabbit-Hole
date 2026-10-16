// The ? sheet lists the canvas's chords among its keys, beside the rows that were already there: Ctrl/Cmd+K (the inline AI
// editor, docs/features/inline-ai-editor.md §2), and - owner brief 2026-10-13 - its new name Quick Edit, Add to chat on
// Ctrl/Cmd+L, and Search on Ctrl/Cmd+Shift+F (it was Ctrl/Cmd+K). Failed on 5b3552a5 (no row) and on 5afffefa (the old name).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sheet = readFileSync(new URL('./ShortcutsSheet.jsx', import.meta.url), 'utf8');
const canvas = sheet.slice(sheet.indexOf("['Canvas', ["), sheet.indexOf("['Tools', ["));

test('the shortcuts sheet lists Quick Edit, Add to chat and Search in the canvas keys, and keeps the rows around them', () => {
  assert.match(canvas, /\['Quick Edit the selection \(Cmd on a Mac\)', \['Ctrl', 'K'\]\],/);
  assert.match(canvas, /\['Add the selection to chat \(Cmd on a Mac\)', \['Ctrl', 'L'\]\],/);
  assert.match(canvas, /\['Search the app \(Cmd on a Mac\)', \['Ctrl', 'Shift', 'F'\]\],/);
  assert.doesNotMatch(sheet, /Explain or edit the selection with AI/);
  for (const row of [/\['Find on this canvas', \['\/'\]\]/, /\['Comment on the selection/, /\['Undo', \['Ctrl', 'Z'\]\]/, /\['Group', \['Ctrl', 'G'\]\]/, /\['Lock or unlock', \['Ctrl', 'Shift', 'L'\]\]/]) assert.match(sheet, row);
  assert.equal((sheet.match(/'K'\]/g) || []).length, 1, 'one row names K');
  assert.equal((sheet.match(/'L']/g) || []).length, 3, 'the Line tool, Ctrl+L adding to chat, and Ctrl+Shift+L still locking');
});
