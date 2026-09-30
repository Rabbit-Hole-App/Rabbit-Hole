import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { BOARDS } from './demo-scenes.js';
import { applyCheck, enterPractice, leavePractice, lockedInputNames, setActivityAnswer } from './scene-activity.js';
import { evaluateScene } from './scene-evaluate.js';

// Owner rules (2026-09-29, docs/features/learn-canvas-blocks.md "Practice and
// secondary text"), checked on the REAL components: SceneActivity.jsx and
// SceneControls.jsx are bundled with esbuild (Vite's own JSX transform, already
// installed) and rendered to static HTML with react-dom/server, for every card
// on every review board that has a practice.
//   - learner-facing feedback (pass, fail, not-ready) and the committed-attempt
//     count are 14px (text-sm), like the answer text;
//   - the lock line and INTERACT say what the task locked in the learner's
//     words ("block_size = 3"), never an internal index or a name said twice;
//   - a locked input is a read-only statement in INTERACT ("block_size = 3 ·
//     locked by practice"), its alternatives gone; Back to explore restores them;
//   - New attempt sits under the feedback, never in the answer row.

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'practice-panel-'));
const outfile = join(dir, 'panel.cjs');
await esbuild.build({
  stdin: {
    contents: [
      "export { default as SceneActivity } from './SceneActivity.jsx';",
      "export { default as SceneControls } from './SceneControls.jsx';",
      "export { createElement } from 'react';",
      "export { renderToStaticMarkup } from 'react-dom/server';",
    ].join('\n'),
    resolveDir: here,
    loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { SceneActivity, SceneControls, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const noop = () => {};
const renderActivity = block => renderToStaticMarkup(createElement(SceneActivity, { block, onChange: noop }));
const renderControls = (block, locked) => {
  const { declarations, inputs } = evaluateScene(block.scene, 0, block.inputs || {});
  return renderToStaticMarkup(createElement(SceneControls, { declarations, inputs, data: block.scene.exampleData, onInput: noop, onReset: noop, locked }));
};
const text = html => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
// The opening tag carrying `attribute`, and the text of the element it opens
// (these elements hold no nested element of their own tag name).
const element = (html, attribute) => {
  const start = html.indexOf(attribute);
  if (start < 0) return null;
  const open = html.lastIndexOf('<', start);
  const tag = html.slice(open + 1).match(/^[a-z]+/)[0];
  const close = html.indexOf(`</${tag}>`, start);
  return { tag: html.slice(open, html.indexOf('>', start) + 1), text: text(html.slice(html.indexOf('>', start) + 1, close)), at: open };
};
// The element whose own text matches `pattern` (a leaf: text straight inside it).
const elementWithText = (html, pattern) => {
  const hit = html.match(new RegExp(`>(${pattern.source})<`));
  if (!hit) return null;
  const open = html.lastIndexOf('<', hit.index);
  return { tag: html.slice(open, hit.index + 1), text: text(hit[1]), at: open };
};
const COUNT = /\d+ committed attempts?/;
const classOf = tag => tag.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];

const PRACTICE_CARDS = Object.entries(BOARDS).flatMap(([board, make]) => make()
  .filter(block => block.activity && block.scene)
  .map(block => ({ board, id: block.scene.id, block })));
const LOCKING_CARDS = PRACTICE_CARDS.filter(card => card.block.activity.fixedInputs);
// A pick every answer type accepts, so Check can commit an attempt.
const somePick = answer => ({ choice: answer.options?.[0]?.id, index: 0, indices: [0], bool: true })[answer.type];

test('the review boards carry practices, and some of them lock inputs', () => {
  assert.ok(PRACTICE_CARDS.length >= 10, `${PRACTICE_CARDS.length} practice cards - did the board scan break?`);
  assert.ok(LOCKING_CARDS.length >= 5, `${LOCKING_CARDS.length} cards with fixedInputs`);
});

test('learner-facing feedback and the committed-attempt count are 14px, like the answer', () => {
  const small = [];
  for (const { id, block } of PRACTICE_CARDS) {
    const practising = enterPractice(block);
    const notReady = element(renderActivity(practising), 'data-activity-feedback');
    if (notReady && !classOf(notReady.tag).includes('text-sm')) small.push(`${id} not-ready reason`);
    const submitted = applyCheck(setActivityAnswer(practising, somePick(block.activity.answer)));
    const html = renderActivity(submitted);
    const feedback = element(html, 'data-activity-result');
    assert.ok(feedback, `${id}: no graded feedback after Check`);
    if (!classOf(feedback.tag).includes('text-sm')) small.push(`${id} ${feedback.text.slice(0, 10)}…`);
    const counter = elementWithText(html, COUNT);
    assert.ok(counter, `${id}: no committed-attempt count after Check`);
    assert.match(counter.text, /^1 committed attempt$/);
    if (!classOf(counter.tag).includes('text-sm')) small.push(`${id} committed-attempt count`);
    const explore = elementWithText(renderActivity(leavePractice(submitted)), COUNT);
    if (!classOf(explore.tag).includes('text-sm')) small.push(`${id} committed-attempt count (explore)`);
  }
  assert.deepEqual(small, [], 'feedback drawn below 14px');
});

test('New attempt sits under the feedback, a secondary action - never a fifth answer chip', () => {
  for (const { id, block } of PRACTICE_CARDS) {
    const html = renderActivity(applyCheck(setActivityAnswer(enterPractice(block), somePick(block.activity.answer))));
    const again = element(html, 'data-activity-new');
    const feedback = element(html, 'data-activity-result');
    assert.ok(again && feedback, `${id}: New attempt and feedback both render after Check`);
    const lastAnswer = html.lastIndexOf('data-input-control="answer"');
    assert.ok(lastAnswer < feedback.at && feedback.at < again.at, `${id}: order must be answers, feedback, then New attempt`);
    // Its own row, with the count - not the answer row, and not chip-styled.
    assert.ok(elementWithText(html, COUNT).at < again.at, `${id}: the count leads the New attempt row`);
    assert.ok(!classOf(again.tag).includes('border'), `${id}: New attempt is drawn like an answer chip`);
  }
});

// The lock line and the INTERACT statement read the same, in the learner's words.
const lockLine = block => element(renderActivity(enterPractice(block)), 'data-practice-setup')?.text;
const LEAKS = [/\(index \d+\)/, /\(preset\)/];

test('the practice lock line names what the task locked in the learner\'s words - no index, no name said twice', () => {
  const lines = Object.fromEntries(LOCKING_CARDS.map(({ id, block }) => [id, lockLine(block)]));
  const bad = [];
  for (const [id, line] of Object.entries(lines)) {
    assert.match(line, /^Locked by this task — /, id);
    for (const clause of line.replace(/^Locked by this task — /, '').split(' · ')) {
      const [name, ...rest] = clause.split(' = ');
      const value = rest.join(' = ');
      const last = name.split(' ').pop();
      if (LEAKS.some(leak => leak.test(clause))) bad.push(`${id}: ${clause}`);
      else if (name.includes('(')) bad.push(`${id}: a control qualifier in "${name}"`);
      else if (new RegExp(`^${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(value)) bad.push(`${id}: "${last}" said twice in ${clause}`);
    }
  }
  assert.deepEqual(bad, [], 'lock lines leak internals');
  // The owner's own examples.
  assert.equal(lines['nanogpt-c23-context-window'], 'Locked by this task — block_size = 3');
  assert.equal(lines['nanogpt-c22-top-k'], 'Locked by this task — top_k = 2');
});

test('a locked input is a read-only statement in INTERACT, its alternatives hidden; Back to explore restores the controls', () => {
  for (const { id, block } of LOCKING_CARDS) {
    const practising = enterPractice(block);
    const locked = lockedInputNames(practising);
    const body = lockLine(block).replace(/^Locked by this task — /, '');
    const html = renderControls(practising, locked);
    assert.doesNotMatch(html, /<fieldset[^>]*disabled/, `${id}: a disabled widget still stands in for the lock`);
    for (const name of locked) {
      const statement = element(html, `data-input-locked="${name}"`);
      assert.ok(statement, `${id}: no read-only statement for ${name}`);
      assert.match(statement.text, / · locked by practice$/, id);
      assert.ok(body.includes(statement.text.replace(/ · locked by practice$/, '')), `${id}: "${statement.text}" does not match the lock line "${body}"`);
      assert.ok(!html.includes(`data-input-control="${name}"`) && !html.includes(`data-input-step="${name}:`), `${id}: ${name}'s alternatives are still on screen`);
    }
    const explore = renderControls(leavePractice(practising), lockedInputNames(leavePractice(practising)));
    for (const name of locked) {
      assert.ok(!explore.includes(`data-input-locked="${name}"`), `${id}: ${name} still locked after Back to explore`);
      assert.ok(explore.includes(`data-input-control="${name}"`), `${id}: ${name}'s control is not back after Back to explore`);
    }
  }
});

test('every input type locks to one statement, and none of its alternatives', () => {
  const block = {
    scene: {
      inputs: [
        { name: 'pick', type: 'index', label: 'Query character', of: 'letters', default: 1 },
        { name: 'slide', type: 'index', label: 'Window length T (preset)', of: 'windows', default: 2, presentation: 'slider' },
        { name: 'mask', type: 'bool', label: 'Causal mask (off = What-if)', default: true },
        { name: 'mode', type: 'choice', label: 'Mode', default: 'b', options: [{ id: 'a', label: 'Greedy' }, { id: 'b', label: 'Sampled' }] },
        { name: 'marks', type: 'indices', label: 'Marked', of: 'letters', default: [0, 2] },
      ],
      exampleData: { letters: ['a', 'b', 'c'], windows: ['T = 2', 'T = 4', 'T = 8'] },
      id: 'lock-types', title: 'Lock types', objects: [], timeline: [], width: 100, height: 100, duration: 1,
    },
  };
  const names = block.scene.inputs.map(input => input.name);
  const html = renderControls(block, names);
  const statements = names.map(name => element(html, `data-input-locked="${name}"`)?.text);
  assert.deepEqual(statements, [
    'Query character = b · locked by practice',
    'T = 8 · locked by practice',
    'Causal mask = On · locked by practice',
    'Mode = Sampled · locked by practice',
    'Marked = a, c · locked by practice',
  ]);
  for (const name of names) assert.ok(!html.includes(`data-input-control="${name}"`), `${name}: an alternative is still on screen`);
});
