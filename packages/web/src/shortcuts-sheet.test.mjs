// The ? sheet lists the inline AI editor's key (docs/features/inline-ai-editor.md §2) among the canvas keys, beside the
// rows that were already there. Failed on 5b3552a5 (no row).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sheet = readFileSync(new URL('./ShortcutsSheet.jsx', import.meta.url), 'utf8');
const canvas = sheet.slice(sheet.indexOf("['Canvas', ["), sheet.indexOf("['Tools', ["));

test('the shortcuts sheet lists Ctrl/Cmd+K in the canvas keys, and keeps the rows around it', () => {
  assert.match(canvas, /\['Explain or edit the selection with AI \(Cmd on a Mac\)', \['Ctrl', 'K'\]\],/);
  for (const row of [/\['Search', \['\/'\]\]/, /\['Comment on the selection/, /\['Undo', \['Ctrl', 'Z'\]\]/, /\['Group', \['Ctrl', 'G'\]\]/]) assert.match(sheet, row);
  assert.equal((sheet.match(/'K'\]/g) || []).length, 1, 'one row names K');
});
