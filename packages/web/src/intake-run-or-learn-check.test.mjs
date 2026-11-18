// Guards for e2e/intake-run-or-learn-check.mjs (written UNRUN, 2026-11-15): it is registered as a windows-only check, its step count matches `const total`, it stays on 127.0.0.1,
// and every message key and selector it reads from the DOM still exists in the flow's source. Offline: reads files only, runs no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const check = read('../e2e/intake-run-or-learn-check.mjs');
const map = JSON.parse(read('../../../scripts/ci/check-map.json'));

test('registered in check-map as a windows-only local-stack check with a reason and a duration', () => {
  const row = map.checks['intake-run-or-learn-check.mjs'];
  assert.equal(row?.runner, 'windows-only');
  assert.ok(row.why?.length > 40 && row.seconds > 0);
  for (const file of ['packages/web/src/rehearsal-flow.js', 'packages/web/src/TutorRehearsal.jsx', 'packages/web/src/codebase-use-route.js', 'packages/web/src/tutor-rehearsal-text.js', 'packages/web/src/learn-intake.js', 'packages/web/src/ChoiceList.jsx'])
    assert.ok(map.mapped[file]?.includes('intake-run-or-learn-check.mjs'), `${file} lists the check`);
});

test('the step count is `const total` and the header says it is unrun', () => {
  assert.equal(check.match(/^\s*await step\(/gm).length, Number(check.match(/^const total = (\d+);/m)[1]));
  assert.match(check.split('\n').slice(0, 8).join('\n'), /UNRUN \(written 2026-11-15, not executed; the owner clicks the same steps on 8878\)/);
});

test('it refuses a non-loopback or localhost base and never prints the secret or the cookie', () => {
  assert.match(check, /\^http:\\\/\\\/127\\\.0\\\.0\\\.1/);
  assert.equal(/console\.log\([^)]*(secret|session|cookie)/i.test(check), false);
});

test('every message key and selector the check reads exists in the flow source', () => {
  const flow = read('./rehearsal-flow.js') + read('./TutorRehearsal.jsx') + read('./ChoiceList.jsx');
  const keys = new Set([...check.matchAll(/\b(?:msg|rows|rowOf|labelsOf|disabledOf|textOf)\('([a-z-]+)'/g)].map(m => m[1]));
  assert.ok(keys.size >= 8, `keys found: ${[...keys]}`);
  for (const key of keys) assert.ok(flow.includes(`'${key}'`), `message key ${key} is in rehearsal-flow.js`);
  for (const attribute of ['data-rehearsal-message', 'data-choice-list', 'data-rehearsal-pending', 'data-rehearsal-chip']) assert.ok(flow.includes(attribute), attribute);
  assert.ok(flow.includes('`line-${'), 'typed lines are line-N');
  assert.ok(flow.includes('rh-intake-done:'), 'the asked-once memory key');
  for (const label of ['Run it', 'Learn from it']) assert.ok(read('./tutor-rehearsal-text.js').includes(`'${label}'`), label);
});
