import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chapterCount, draftText, planList, planRows, planTree, storedLearn, acceptedPlan, stripFiles } from './learn-plan.js';
import { flowMessages } from './rehearsal-flow.js';
import { SENTENCES } from './tutor-rehearsal-text.js';
import { applyOutlineProposal } from './learn-outline-model.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// The Learn plan (learn-plan-toc-spec.md, owner 2026-11-15). Words below are invented for the test; the sources carry none of a repository's.
const ops = [
  { op: 'add', key: 'c1', text: 'How a request comes in', level: 1 },
  { op: 'add', key: 's11', text: 'The first handler', parent: 'c1', level: 2, description: 'where it starts [files: src/a.py]' },
  { op: 'add', key: 's12', text: 'Reading the options', parent: 'c1', level: 2, description: '(background)' },
  { op: 'add', key: 'c2', text: 'How an answer goes out', level: 1 },
  { op: 'add', key: 's21', text: 'Building the reply', parent: 'c2', level: 2, description: 'x [files: src/b.py]' },
  { op: 'add', key: 's22', text: 'Sending it', parent: 'c2', level: 2, description: 'y [files: src/c.py]' },
];
const doc = { repo: 'acme/widgets', learn: { options: [{ id: 'one', label: 'Topic one', what: 'w', anchors: [], kind: 'other' }, { id: 'two', label: 'Topic two', what: 'w', anchors: [], kind: 'other' }] } };

test('the draft is a numbered nested list of titles only; the files suffix and descriptions never show', () => {
  assert.equal(planList(ops), ['1. How a request comes in', '   1. The first handler', '   2. Reading the options (background)', '2. How an answer goes out', '   1. Building the reply', '   2. Sending it'].join('\n'));
  assert.equal(chapterCount(ops), 2);
  assert.equal(stripFiles('where it starts [files: src/a.py, src/b.py]'), 'where it starts');
  assert.deepEqual(planTree(ops).map(c => [c.title, c.sections.length]), [['How a request comes in', 2], ['How an answer goes out', 2]]);
  const text = draftText('A short book on requests\nIt follows the data. Nothing was left out.', ops);
  assert.match(text, /^\*\*A short book on requests\*\*\n\n1\. How a request comes in/);
  assert.match(text, /It follows the data\. Nothing was left out\.$/);
  assert.doesNotMatch(text, /files:|src\/|\.py/);
});

test('rows are the fixed set: unknown ids are dropped, a background row needs a key of the draft, a learn row an option of the document, the default is Accept and Change something', () => {
  const learn = doc.learn;
  assert.deepEqual(planRows(['accept', 'change', 'keep_previous', 'start_plain', 'try_again', 'bogus', 'background:nope'], { ops, learn }).map(r => [r.id, r.label]), [
    ['plan:accept', 'Accept'], ['plan:change', 'Change something'], ['plan:keep', 'Keep the previous draft'], ['plan:plain', 'Start without a plan'], ['plan:retry', 'Try again'],
  ]);
  assert.deepEqual(planRows([{ id: 'background:s12' }, 'learn:two', 'learn:zzz'], { ops, learn }).map(r => [r.id, r.label]), [['plan:background:s12', 'Add Reading the options as background'], ['learn:two', 'Topic two']]);
  assert.deepEqual(planRows([], { ops, learn }).map(r => r.id), ['plan:accept', 'plan:change']);
  assert.deepEqual(planRows(undefined).map(r => r.id), ['plan:accept', 'plan:change']);
});

test('the plan in the Tutor flow: pending, the draft with its rows, invalid with Try again and Start without a plan, accepted as a count; typed edits follow the plan', () => {
  const base = { intakeDone: false, get: { indexing: 'ready', catalogue: { status: 'ready' } }, doc: { ...doc, hardware: 'cpu', summary: 'A library.', routes: [{ routeId: 'a', practical: true, title: 'Run a', effort: 'Quick', stepsSketch: [] }, { routeId: 'b', practical: true, title: 'Run b', effort: 'Quick', stepsSketch: [] }] },
    use: null, mode: 'learn', learn: doc.learn.options[0], learnIntro: { status: 'done', text: 'Intro.' }, goalChosen: true, elsewhere: false, log: [], routeId: null, planLog: [] };
  const last = plan => flowMessages({ ...base, plan }, { repo: 'acme/widgets' }).at(-1);
  assert.ok(last({ status: 'loading' }).pending);
  const draft = last({ status: 'draft', text: 'A short book\nOne sentence.', ops, rows: planRows(['accept', 'change']) });
  assert.equal(draft.key, 'learn-plan');
  assert.match(draft.text, /1\. How a request comes in/);
  assert.deepEqual(draft.choices.map(c => [c.id, !!c.disabled]), [['plan:accept', false], ['plan:change', false]]);
  assert.ok(last({ status: 'draft', text: 't', ops, rows: planRows(['accept']), busy: true }).choices.every(c => c.disabled), 'rows wait while a new draft is made');
  const invalid = last({ status: 'invalid', rows: planRows(['try_again', 'start_plain']) });
  assert.equal(invalid.text, SENTENCES.planInvalid);
  assert.deepEqual(invalid.choices.map(c => c.id), ['plan:retry', 'plan:plain']);
  assert.equal(last({ status: 'accepted', count: 6 }).text, 'Plan accepted · 6 chapters');
  assert.equal(last({ status: 'accepted', count: 1 }).text, 'Plan accepted · 1 chapter');
  const typed = flowMessages({ ...base, plan: { status: 'draft', text: 't', ops, rows: planRows(['accept']) }, planLog: [{ key: 'p1', role: 'user', text: 'add a chapter' }] }, { repo: 'acme/widgets' });
  assert.deepEqual(typed.slice(-2).map(m => m.key), ['learn-plan', 'p1'], 'the typed line comes after the draft it changes');
});

test('the draft applies to an empty contents as keyed chapters and sections, up to 48 ops, and a stale base is refused', () => {
  const many = [];
  for (let c = 0; c < 8; c += 1) { many.push({ op: 'add', key: `c${c}`, text: `Chapter ${c}`, level: 1 }); for (let s = 0; s < 5; s += 1) many.push({ op: 'add', text: `Section ${c}.${s}`, parent: `c${c}`, level: 2 }); }
  assert.equal(many.length, 48);
  const applied = applyOutlineProposal([], many, { source: 'learn-plan' });
  assert.equal(applied.ok, true, applied.message);
  assert.equal(applyOutlineProposal([], [...many, { op: 'add', text: 'one more', level: 1 }], { source: 'learn-plan' }).ok, false, 'over 48 is refused');
  assert.equal(applyOutlineProposal([], many.slice(0, 30), { source: 'tutor' }).ok, false, 'a chat proposal keeps its 24');
  assert.equal(applyOutlineProposal([], many.slice(0, 6), { source: 'learn-plan', base: 'not-the-revision' }).ok, false, 'a moved base is stale');
});

test('the saved goal brings the plan back after a reload; an accepted plan is found by acceptedAt', () => {
  const state = { activeActivityId: 'a1', activities: [{ activityId: 'a1', checkpoint: { learn: { id: 'one', kind: 'other', focus: null, plan: { ops, revision: 'r1', acceptedAt: null, text: 't' } } } }] };
  assert.deepEqual(storedLearn(state).plan.ops, ops);
  assert.equal(acceptedPlan(state), null);
  state.activities[0].checkpoint.learn.plan.acceptedAt = '2026-11-15T22:00:00.000Z';
  assert.equal(acceptedPlan(state).revision, 'r1');
  assert.equal(storedLearn({ activeActivityId: 'a1', activities: [{ activityId: 'a1', checkpoint: {} }] }), null);
  assert.equal(storedLearn(null), null);
});

test('wiring: the contents go read-only with no composer after Accept; the draft reaches the contents panel through the one proposal path; no repository word in the plan sources', () => {
  const page = read('LearnPage.jsx'), flow = read('TutorRehearsal.jsx');
  assert.match(page, /readOnly=\{!canEditCanvas \|\| planDone\}/);
  assert.match(page, /\{!setupChat && !planDone && \(app\.hosting !== 'aws'/, 'no TocConversation after Accept');
  assert.match(page, /proposeOutline: proposal => setProposal\(proposal\)/);
  assert.match(page, /applyOutline\(ops, \{ base, source: 'learn-plan' \}\)/);
  assert.match(page, /const first = canvasOutline\.find\(entry => entry\.level >= 2\)/, 'section 1.1 is current on Accept');
  assert.match(flow, /action: 'learn_plan', depth: option\.depth, learn: \{ \.\.\.option, options: planOptions\(\) \}/);
  assert.match(flow, /action: 'learn_plan_save', plan/);
  assert.doesNotMatch(flow, /Change the plan/, 'an accepted plan is final: no edit path afterwards');
  assert.match(flow, /savePlan\(\{ ops: previous\.ops, revision: previous\.base, acceptedAt: null, text: previous\.text \}\)/, 'Keep the previous draft is saved too, so a reload shows the kept one');
  assert.match(flow, /\.\.\.\(extra\.length \? \{ choices: extra \} : \{\}\)/, 'an off-plan answer keeps its nearest-topic rows');
  for (const file of ['learn-plan.js', 'rehearsal-flow.js', 'TutorRehearsal.jsx']) assert.doesNotMatch(read(file), /nanoGPT|datasette|shakespeare|attention|tokens|word2vec/i, file);
});

test('a title that carries its own number is not numbered twice', async () => {
  const { cleanTitle, cleanOps } = await import('./learn-plan.js');
  assert.deepEqual(['1. The Big Picture', '2.1 Plugins', '3) Setup', 'Version 2 notes', '2024 in review'].map(cleanTitle), ['The Big Picture', 'Plugins', 'Setup', 'Version 2 notes', '2024 in review']);
  const numbered = [{ op: 'add', key: 'c', text: '1. The Big Picture', level: 1 }, { op: 'add', text: '1.1 One object', parent: 'c', level: 2 }];
  assert.equal(planList(numbered), '1. The Big Picture\n   1. One object');
  assert.deepEqual(cleanOps(numbered).map(op => op.text), ['The Big Picture', 'One object']);
  assert.match(read('TutorRehearsal.jsx'), /ops: cleanOps\(out\.proposal\.ops\)/, 'the contents get the clean titles too');
});
