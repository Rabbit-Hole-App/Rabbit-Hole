// Guards for e2e/learn-plan-check.mjs (written UNRUN, 2026-11-15): registered as a windows-only check, its step count matches `const total`, it stays on 127.0.0.1, and the message keys, row words
// and contents selectors it reads still exist in the source. Offline: reads files only, runs no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const check = read('../e2e/learn-plan-check.mjs');
const map = JSON.parse(read('../../../scripts/ci/check-map.json'));

test('registered in check-map as a windows-only local-stack check with a reason and a duration', () => {
  const row = map.checks['learn-plan-check.mjs'];
  assert.equal(row?.runner, 'windows-only');
  assert.ok(row.why?.length > 40 && row.seconds > 0);
  for (const file of ['packages/web/src/TutorRehearsal.jsx', 'packages/web/src/rehearsal-flow.js', 'packages/web/src/learn-plan.js', 'packages/control-plane/src/learn-plan.js'])
    assert.ok(map.mapped[file]?.includes('learn-plan-check.mjs'), `${file} lists the check`);
});

test('the step count is `const total`, the header says it is unrun, the base is loopback and nothing secret is printed', () => {
  assert.equal(check.match(/^\s*await step\(/gm).length, Number(check.match(/^const total = (\d+);/m)[1]));
  assert.match(check.split('\n').slice(0, 8).join('\n'), /UNRUN \(written 2026-11-15, not executed; the owner clicks the same steps on 8878\)/);
  assert.match(check, /\^http:\\\/\\\/127\\\.0\\\.0\\\.1/);
  assert.equal(/console\.log\([^)]*(secret|session|cookie)/i.test(check), false);
});

test('the final rules are asserted: read-only contents, no composer, no Change the plan, 1.1 current', () => {
  for (const needle of ["'Change the plan'", '[data-toc-composer]', 'Describe your goal or refine the outline', 'dataset.level', 'data-active', 'aria-current', 'draggable="true"']) assert.ok(check.includes(needle), needle);
});

test('every message key, row word and selector the check reads exists in the source', () => {
  const flow = read('./rehearsal-flow.js') + read('./TutorRehearsal.jsx'), text = read('./tutor-rehearsal-text.js'), toc = read('./TableOfContents.jsx'), page = read('./LearnPage.jsx'), chatComposer = read('./ChatComposer.jsx');
  const keys = new Set([...check.matchAll(/\b(?:msg|rows|rowOf|labelsOf|disabledOf|textOf)\('([a-z-]+)'/g)].map(m => m[1]));
  for (const key of keys) assert.ok(flow.includes(`'${key}'`), `message key ${key}`);
  for (const word of ['Accept', 'Change something', 'Keep the previous draft', 'Try again', 'Start without a plan', 'Drafting a plan']) assert.ok(text.includes(`'${word}'`), word);
  assert.ok(text.includes('Plan accepted · '), 'the accepted line');
  for (const attribute of ['data-toc-proposal', 'data-toc-entry', 'data-level', 'data-active', 'data-toc-delete', 'data-toc-more', 'data-toc-add-link', 'data-toc-editor', 'draggable', 'aria-current', 'cursor-grab', 'Proposed: ']) assert.ok(toc.includes(attribute), attribute);
  assert.ok(chatComposer.includes('data-toc-composer'));
  assert.ok(page.includes('Describe your goal or refine the outline'), 'TocConversation placeholder');
  assert.ok(page.includes('!planDone'), 'TocConversation is unmounted once the plan is done');
});
