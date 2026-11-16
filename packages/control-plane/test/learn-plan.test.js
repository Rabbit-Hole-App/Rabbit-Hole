// The learn plan's checks and rows (learn-plan.js; spec learn-plan-toc-spec.md sections 2 and 5): pure functions, no model, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_TOOL, planProblem, planRows, splitJsonLine } from '../src/learn-plan.js';
import { OUTLINE_TOOL, validateOutlineOps } from '../src/learn-outline-tool.js';

const FILES = { 'src/api.js': 'x', 'src/progress.js': 'x', 'server/store.js': 'x', 'README.md': 'x' };
const TITLES = ['Where the data starts', 'Moving it around', 'Keeping the state', 'Showing the result', 'Checking it works', 'Putting it together', 'Going further', 'Looking back'];
// chapters x sections, every section anchored to a file that exists
export const plan = (chapters = 4, sections = 2) => TITLES.slice(0, chapters).flatMap((title, c) => [
  { op: 'add', text: title, level: 1, key: `c${c}`, description: 'The big idea of this part.' },
  ...Array.from({ length: sections }, (_, s) => ({ op: 'add', text: `${title} part ${s + 1}`.replace(/\d/g, ['one', 'two', 'three', 'four', 'five'][s]), level: 2, parent: `c${c}`, key: `c${c}s${s}`, description: `What this step does. [files: ${['src/api.js', 'src/progress.js'][s % 2]}]` })),
]);
const checked = ops => validateOutlineOps(ops, [], { maxOps: 48 });

test('validateOutlineOps: an empty outline takes a keyed chapter and section set; maxOps is an option, 24 by default; a parent must be minted earlier', () => {
  assert.equal(validateOutlineOps(plan(4, 2), [], { maxOps: 48 }).length, 12);
  assert.throws(() => validateOutlineOps(Array.from({ length: 25 }, (_, i) => ({ op: 'add', text: `T${i}`, level: 1 })), []), /at most 24/);
  assert.equal(validateOutlineOps(Array.from({ length: 48 }, (_, i) => ({ op: 'add', text: `T${i}`, level: 1 })), [], { maxOps: 48 }).length, 48);
  assert.throws(() => validateOutlineOps(Array.from({ length: 49 }, (_, i) => ({ op: 'add', text: `T${i}`, level: 1 })), [], { maxOps: 48 }), /at most 48/);
  assert.throws(() => validateOutlineOps([{ op: 'add', text: 'Section', level: 2, parent: 'nope' }], []), /No section nope/);
  assert.throws(() => validateOutlineOps([{ op: 'add', text: 'Section', level: 2, parent: 'later' }, { op: 'add', text: 'Chapter', level: 1, key: 'later' }], []), /No section later/, 'minted earlier, not later');
});

test('the plan tool is the chat tool with room for 48 ops and a reply; the chat tool is unchanged', () => {
  assert.equal(OUTLINE_TOOL.input_schema.properties.ops.maxItems, 24);
  assert.equal(OUTLINE_TOOL.input_schema.properties.reply, undefined);
  assert.equal(PLAN_TOOL.name, 'propose_lesson_outline');
  assert.equal(PLAN_TOOL.input_schema.properties.ops.maxItems, 48);
  assert.deepEqual(PLAN_TOOL.input_schema.required, ['ops', 'reply']);
});

test('planProblem accepts a plan of 4-8 chapters with 2-5 sections anchored to existing files', () => {
  for (const [chapters, sections] of [[4, 2], [8, 5], [5, 3]]) {
    const out = planProblem(checked(plan(chapters, sections).slice(0, 48)), FILES);
    if (chapters * (sections + 1) <= 48) assert.ok(out.ops, `${chapters}x${sections}: ${out.error}`);
  }
  const out = planProblem(checked(plan(4, 2)), FILES);
  assert.equal(out.ops.length, 12);
  assert.match(out.ops[1].description, /\[files: src\/api\.js\]$/);
});

test('planProblem refuses each rule with the exact error', () => {
  const swap = (ops, i, patch) => ops.map((op, at) => (at === i ? { ...op, ...patch } : op));
  const base = plan(4, 2);
  assert.match(planProblem(checked([...base, { op: 'add', text: 'Deep part', level: 3, parent: 'c0s0', description: '[files: src/api.js]' }]), FILES).error, /level 3|deeper/);
  assert.equal(planProblem(checked([...base, { op: 'add', text: 'Deep part', level: 3, parent: 'c0s0' }]), FILES).level, true);
  assert.match(planProblem(checked(plan(3, 2)), FILES).error, /4 to 8 chapters; this one has 3/);
  assert.match(planProblem(checked(plan(4, 2).slice(0, 11).concat([])), FILES).error, /2 to 5/, 'a chapter with one section');
  assert.match(planProblem(checked([...plan(4, 2), { op: 'add', text: 'Empty chapter', level: 1, key: 'e' }, { op: 'add', text: 'Another empty', level: 1, key: 'f' }, { op: 'add', text: 'Third', level: 1, key: 'g' }, { op: 'add', text: 'Fourth', level: 1, key: 'h' }, { op: 'add', text: 'Fifth', level: 1, key: 'i' }]), FILES).error, /4 to 8 chapters; this one has 9|has 0 sections/);
  assert.match(planProblem(checked(plan(4, 6)), FILES).error, /has 6 sections; each chapter has 2 to 5/);
  for (const title of ['train.py', 'The --flag', 'Use `code`', 'notes.md walk', '12', '2.5', 'A ten minute tour', 'One sitting', 'Two hours in', 'a//b', '..hidden']) {
    assert.match(planProblem(checked(swap(base, 1, { text: title })), FILES).error ?? '', /plain words/, title);
  }
  for (const title of ['Self-contained parts', 'What a function returns', 'Reading the data']) assert.ok(planProblem(checked(swap(base, 1, { text: title })), FILES).ops, title);
  assert.match(planProblem(checked(swap(base, 1, { description: 'What it does.' })), FILES).error, /\[files: path, path\].*\(background\)/, 'a section with no files');
  assert.match(planProblem(checked(swap(base, 1, { description: 'Nothing here [files: ghost.py]' })), FILES).error, /\[files:/, 'files that do not exist are dropped, leaving none');
  const background = planProblem(checked(swap(base, 1, { description: 'A neighbour idea (background)' })), FILES);
  assert.equal(background.ops[1].description, 'A neighbour idea (background)');
  const dropped = planProblem(checked(swap(base, 1, { description: 'Mixed. [files: ghost.py, src/api.js]' })), FILES);
  assert.equal(dropped.ops[1].description, 'Mixed. [files: src/api.js]', 'only the paths that exist are kept');
  assert.match(planProblem([{ op: 'retitle', id: 'x', text: 'y' }], FILES).error, /added sections only/);
  assert.match(planProblem(checked(swap(base, 1, { parent: undefined })), FILES).error, /chapter/);
});

test('splitJsonLine strips the trailing line, defensively', () => {
  assert.deepEqual(splitJsonLine('Title\nWords here.\n{"rows": ["accept"], "off_plan": false}'), { text: 'Title\nWords here.', line: { rows: ['accept'], off_plan: false } });
  assert.deepEqual(splitJsonLine('W.\n```json\n{"rows": []}\n```').line, { rows: [] });
  for (const bad of ['Words only.', 'W.\n{"rows": [oops', 'W.\n[1]']) assert.deepEqual(splitJsonLine(bad), { text: bad, line: null }, bad);
});

test('planRows: the fixed set, background keys of the new draft, learn ids of the catalogue (at most 2), a default, and what cannot be taught', () => {
  const ctx = { keys: ['c0s0', 'c1s1'], catalogue: ['alpha', 'beta', 'gamma'], editing: true, current: 'alpha' };
  const ids = (line, over = {}) => planRows(line, { ...ctx, ...over }).map(row => row.id);
  assert.deepEqual(ids({ rows: ['accept', 'change', 'keep_previous', 'start_plain'] }), ['accept', 'change', 'keep_previous', 'start_plain']);
  assert.deepEqual(ids({ rows: ['accept', 'bogus', 'background:c0s0', 'background:ghost', 'learn:beta', 'learn:ghost', 'accept'] }), ['accept', 'background:c0s0', 'learn:beta'], 'unknown ids and missing keys dropped, once each');
  assert.deepEqual(ids({ rows: ['learn:alpha', 'learn:beta', 'learn:gamma'] }), ['learn:alpha', 'learn:beta'], 'at most two catalogue rows');
  assert.deepEqual(ids({ rows: ['keep_previous', 'accept'] }, { editing: false }), ['accept'], 'nothing to keep on a first draft');
  for (const line of [null, {}, { rows: 'accept' }, { rows: ['nonsense'] }, { rows: [] }]) assert.deepEqual(ids(line), ['accept', 'change'], JSON.stringify(line));
  assert.deepEqual(ids({ rows: ['accept', 'change'], cannot: true }), ['accept', 'change', 'learn:beta'], 'cannot with no background or learn row: the nearest other topic by catalogue order');
  assert.deepEqual(ids({ rows: ['accept', 'background:c1s1'], cannot: true }), ['accept', 'background:c1s1'], 'already offered');
  assert.deepEqual(ids({ rows: ['accept'], cannot: true }, { catalogue: ['alpha'] }), ['accept'], 'no other topic to offer');
});

// Depth (Reviewer 2026-11-15 23:32): the plan's shape follows the depth the learner chose after the topic.
test('planProblem enforces the shape of each depth: brief 4-5 chapters of 2-3 sections with no background; detailed 6-8 of 3-5; "Min-Max" is not a duration', () => {
  const shaped = (chapters, sections, background = false) => checked(plan(chapters, sections).map(op => (op.level === 2 && background ? { ...op, description: '(background)' } : op)));
  assert.ok(planProblem(shaped(4, 2), FILES, 'brief').ops, 'brief: 4 chapters of 2 sections');
  assert.match(planProblem(shaped(6, 2), FILES, 'brief').error, /4 to 5 chapters; this one has 6/);
  assert.match(planProblem(shaped(4, 4), FILES, 'brief').error, /has 4 sections; each chapter has 2 to 3/);
  assert.match(planProblem(shaped(4, 2, true), FILES, 'brief').error, /brief plan has no "\(background\)"/);
  assert.match(planProblem(shaped(5, 3), FILES, 'detailed').error, /6 to 8 chapters; this one has 5/);
  assert.match(planProblem(shaped(6, 2), FILES, 'detailed').error, /each chapter has 3 to 5/);
  assert.ok(planProblem(shaped(6, 3), FILES, 'detailed').ops);
  assert.ok(planProblem(shaped(5, 3), FILES).ops, 'no depth is balanced');
});
