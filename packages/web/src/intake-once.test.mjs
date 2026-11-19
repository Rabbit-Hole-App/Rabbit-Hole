// Intake asked once (intake-once-spec.md, owner 2026-11-18 22:09): the wiring the pure tests (learn-intake, choice-list) do not reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the question is appended to the thread from one effect, once per open; codebase-options appends it again; Run it is a flag, off by default and never set for production', () => {
  const ui = read('TutorRehearsal.jsx');
  assert.match(ui, /const ask = askIntake\(st\.current\);\n\s+if \(ask\) patch\(ask\);/);
  assert.match(ui, /return \{ \.\.\.reset, \.\.\.\(askIntake\(reset, \{ again: true \}\) \|\| \{\}\) \};/, 'codebase-options asks again');
  assert.match(read('flags.js'), /export const runIt = import\.meta\.env\?\.VITE_RUN_IT === '1'/);
  assert.doesNotMatch(read('../../../scripts/prod-release.mjs'), /VITE_RUN_IT/, 'production never turns Run it on');
});
