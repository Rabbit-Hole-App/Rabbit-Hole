import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendOpening, askIntake, flowMessages, intakeMessage, learnOpen, openingKey } from './rehearsal-flow.js';
import { learnOf, learnReply, optionRows } from './learn-intake.js';
import { SENTENCES } from './tutor-rehearsal-text.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Intake v2, Run or Learn (owner 2026-11-15, intake-run-or-learn-spec.md): a document the spec's example reads from; every word the Tutor says about it is the document's own.
const doc = {
  repo: 'acme/widgets', hardware: 'cpu', summary: 'A small widget library.',
  routes: [
    { routeId: 'a', practical: true, recommended: true, title: 'Build a demo widget', effort: 'Quick — just Python', stepsSketch: [] },
    { routeId: 'b', practical: true, title: 'Time the render step', effort: 'Quick — just Python', stepsSketch: [] },
  ],
  learn: {
    options: [
      { id: 'render', label: 'How a widget is drawn', what: 'how the render loop turns a widget tree into pixels', anchors: ['src/render.py'], kind: 'structure' },
      { id: 'layout', label: 'How sizes are worked out', what: 'how the layout pass measures every widget', anchors: ['src/layout.py'], kind: 'domain' },
    ],
    cannot: [{ kind: 'testing', thing: 'tests', why: 'there are no tests in the repository' }],
  },
};
const base = { intakeDone: false, get: { indexing: 'ready', catalogue: { status: 'ready' } }, doc, use: null, mode: null, learn: null, learnIntro: null, goalChosen: false, elsewhere: false, log: [], routeId: null };
// The question asked once (intake-once-spec.md): the state after askIntake, Run it off.
// askIntake starts the opening; learn_open (or its fallback) comes back as one message appended to the thread.
const opened = (state, run = false) => ({ ...state, ...appendOpening(state, intakeMessage(state.doc, { key: openingKey(state), run })) });
const asked = opened({ ...base, ...askIntake(base, { run: false }) });
const flow = (state, run = false) => flowMessages({ ...asked, ...state }, { repo: 'acme/widgets', run });

test('the intake (Run it off): one message, the fact, the question and the options as its first rows; typing replies to them; no route list', () => {
  const out = flow({});
  assert.deepEqual(out.map(m => m.key), ['intake']);
  assert.equal(out[0].text, `**widgets**: A small widget library.\n\n${SENTENCES.intake}`);
  assert.deepEqual(out[0].choices.map(c => [c.id, c.label, !!c.disabled]), [['learn:render', 'How a widget is drawn', false], ['learn:layout', 'How sizes are worked out', false]]);
  assert.equal(out.some(m => m.key === 'route-question'), false);
  assert.equal(learnOpen(asked), true, 'typing goes to the Learn options');
});

test('asked once per open: a second ask adds nothing; codebase-options asks again with live rows', () => {
  assert.equal(askIntake(asked, { run: false }), null, 'a second render adds nothing');
  const again = askIntake({ ...asked, learn: null }, { again: true, run: false });
  assert.deepEqual([again.asked, again.opening], [2, 'loading'], 'a fresh opening is on its way');
  assert.deepEqual(flowMessages({ ...asked, ...again }, { repo: 'acme/widgets', run: false }).map(m => m.key), ['intake', 'learn-open'], 'the shimmer while it is written');
  assert.deepEqual(opened({ ...asked, ...again }).log.map(m => m.key), ['intake', 'intake-2']);
  assert.equal(openingKey(asked), 'intake-2');
  assert.equal(askIntake({ ...base, doc: null }, { run: false }), null, 'nothing until the catalogue is in');
  assert.equal(askIntake({ ...base, doc: { ...doc, learn: undefined }, get: { ...base.get, learn: { status: 'queued' } } }, { run: false }), null, 'nor while its options are still being added');
  assert.deepEqual(intakeMessage(doc, { run: true }).choices.map(c => c.id), ['mode:run', 'learn:render', 'learn:layout'], 'Run it on: it leads the rows');
});

test('a chosen topic: the rows grey, the opening paragraph is pending, then said, or fails with Retry', () => {
  const option = doc.learn.options[0];
  let out = flow({ learn: option, learnIntro: { status: 'loading' } });
  assert.ok(out.find(m => m.key === 'intake').choices.every(c => c.disabled));
  assert.ok(out.at(-1).pending);
  out = flow({ learn: option, learnIntro: { status: 'done', text: 'It draws.' } });
  assert.deepEqual([out.at(-1).key, out.at(-1).text], ['learn-intro', 'It draws.']);
  out = flow({ learn: option, learnIntro: { status: 'failed' } });
  assert.deepEqual(out.at(-1).chips.map(c => c.id), ['retry:learn']);
});

test('typed replies: confirmed gives the option and one Start row, near gives 1-2 options and Something else, cannot is built from the document, none keeps the options', () => {
  const learn = { ...learnOf(doc), cannot: doc.learn.cannot }, [render, layout] = doc.learn.options;
  const confirmed = learnReply({ kind: 'confirmed', option: render }, learn);
  assert.equal(confirmed.text, '**How a widget is drawn**: how the render loop turns a widget tree into pixels.');
  assert.deepEqual(confirmed.choices, [{ id: 'learn:render', label: 'Start' }]);
  const near = learnReply({ kind: 'near', options: [render, layout, render] }, learn);
  assert.equal(near.text, SENTENCES.learnNear);
  assert.deepEqual(near.choices.map(c => c.id), ['learn:render', 'learn:layout', 'else']);
  const cannot = learnReply({ kind: 'cannot', cannot: doc.learn.cannot[0] }, learn);
  assert.equal(cannot.text, "This codebase doesn't have tests to learn from — there are no tests in the repository. I can teach:");
  assert.deepEqual(cannot.choices.map(c => c.id), ['learn:render', 'learn:layout']);
  const none = learnReply({ kind: 'none' }, learn);
  assert.equal(none.text, SENTENCES.notSure);
  assert.deepEqual(none.choices.map(c => c.id), ['learn:render', 'learn:layout']);
  const odd = learnReply({ kind: 'cannot', cannot: { kind: 'x', thing: 'tests', why: 'see src/tests/run.py' } }, learn);
  assert.equal(odd.text, SENTENCES.learnCannotPlain, 'a reason that shows a path never reaches the chat');
});

test('rows in a typed reply are live only while the Learn options are open', () => {
  const line = { key: 'l1', role: 'assistant', text: SENTENCES.learnNear, choices: optionRows(doc.learn.options), learnRows: true };
  assert.ok(flow({ mode: 'learn', log: [line] }).find(m => m.key === 'l1').choices.every(c => !c.disabled));
  assert.ok(flow({ mode: 'learn', learn: doc.learn.options[0], learnIntro: { status: 'loading' }, log: [line] }).find(m => m.key === 'l1').choices.every(c => c.disabled));
});

test('learnOf keeps 1-4 plain options and leaves out one that would show a path; a document without learn offers none', () => {
  const extra = ['a', 'b', 'c', 'd'].map(id => ({ id, label: `Topic ${id}`, what: 'w', anchors: [], kind: 'other' }));
  const many = { repo: 'acme/widgets', learn: { options: [...doc.learn.options, { id: 'x', label: 'Open src/render.py', what: 'w', anchors: [], kind: 'other' }, ...extra] } };
  assert.deepEqual(learnOf(many).options.map(o => o.id), ['render', 'layout', 'a', 'b']);
  assert.deepEqual(learnOf({ repo: 'acme/widgets' }), { options: [], cannot: [] });
  assert.ok(intakeMessage({ ...doc, learn: undefined }, { run: false }).text.endsWith(SENTENCES.learnNone), 'no options: the question says so');
});

test('Run it (flag on) is unchanged: the route list is the second step and the rehearsal follows', () => {
  const out = flow({ mode: 'run', use: 'use_codebase' }, true);
  assert.deepEqual(out.map(m => m.key), ['intake', 'route-question']);
  assert.deepEqual(out.at(-1).choices.map(c => c.id), ['route:a', 'route:b', 'else']);
});

test('wiring: the two rows, the option click, the typed reply and the opening paragraph; no repository word in the sources (the grep gate)', () => {
  const ui = read('TutorRehearsal.jsx');
  assert.match(ui, /id === 'mode:run'\) chooseUse\('use_codebase'\)/);
  assert.match(ui, /const ask = askIntake\(st\.current\);/, 'asked once, from the effect');
  assert.match(ui, /startGoal\(\{ chat, board, repository: repoRef\.current, goalId: 'learn_concept', text: '', learn: option \}\)/);
  assert.match(ui, /codebasePost\(chat, board, \{ action: 'learn_intro', learn: option \}\)/);
  assert.match(ui, /routeLearnText\(\{ post:/);
  assert.match(read('TutorCodebase.jsx'), /question: text, \.\.\.\(learn \? \{ learn \} : \{\}\)/, 'the option rides the existing goal path');
  for (const file of ['rehearsal-flow.js', 'codebase-use-route.js', 'tutor-rehearsal-text.js', 'learn-intake.js', 'ChoiceList.jsx', 'TutorRehearsal.jsx']) assert.doesNotMatch(read(file), /nanoGPT|datasette|shakespeare/i, file);
});

test('the miss path: one fit is a Start row and keeps the learner words as the focus; several fits are rows; no fit shows every option; a bad id is ignored', async () => {
  const { fitReply } = await import('./learn-intake.js');
  const learn = { ...learnOf(doc), cannot: doc.learn.cannot };
  const one = fitReply({ text: 'Yes: it lives in the render file.', fits: ['render'], focus: 'how the draw order works' }, learn);
  assert.equal(one.text, 'Yes: it lives in the render file.');
  assert.deepEqual(one.choices, [{ id: 'learn:render', label: 'Start' }]);
  assert.deepEqual(one.focus, { id: 'render', text: 'how the draw order works' });
  assert.equal(fitReply({ text: 't', fits: ['render'], focus: null }, learn).focus, null, 'no narrower words, no focus');
  assert.deepEqual(fitReply({ text: 't', fits: ['render', 'layout'], focus: 'x' }, learn).choices.map(c => c.id), ['learn:render', 'learn:layout']);
  assert.equal(fitReply({ text: 't', fits: ['render', 'layout'], focus: 'x' }, learn).focus, null, 'a focus belongs to exactly one option');
  assert.deepEqual(fitReply({ text: 'No: it has no tests.', fits: [] }, learn).choices.map(c => c.id), ['learn:render', 'learn:layout']);
  assert.deepEqual(fitReply({ text: 't', fits: ['nope'] }, learn).choices.map(c => c.id), ['learn:render', 'learn:layout'], 'an id the document does not hold is ignored');
  const ui = read('TutorRehearsal.jsx');
  assert.match(ui, /action: 'learn_fit', text, learn: \{ options: learn\.options/);
  assert.match(ui, /outcome\.kind === 'confirmed' \|\| outcome\.kind === 'cannot'\) reply = learnReply/, 'a hit is answered with no model turn');
  assert.match(ui, /\{ \.\.\.picked, focus: kept\.text \}/, 'the focus rides the chosen option into the goal and the opening paragraph');
});

test('before the catalogue has its learn section the Tutor says it is working it out (transient), then asks; a failure asks with no options', () => {
  const noLearn = { ...doc, learn: undefined };
  let out = flowMessages({ ...base, doc: noLearn, get: { ...base.get, learn: { status: 'queued' } } }, { repo: 'acme/widgets', run: false });
  assert.deepEqual(out.map(m => m.key), ['learn-wait']);
  assert.ok(out[0].pending);
  const failed = { ...base, doc: noLearn, get: { ...base.get, learn: { status: 'failed' } } };
  out = flowMessages(opened({ ...failed, ...askIntake(failed, { run: false }) }), { repo: 'acme/widgets', run: false });
  assert.deepEqual(out.map(m => m.key), ['intake'], 'nothing pinned once the question is asked');
  assert.ok(out[0].text.endsWith(SENTENCES.learnNone));
});

// Reviewer 2026-11-15 23:32: after a Learn topic is confirmed, how deep comes next (Brief / Standard / Detailed), before the goal, the opening paragraph and the plan.
test('the depth question: three rows after the topic, nothing else waits on screen until it is answered; Standard is the balanced depth', () => {
  const option = doc.learn.options[0];
  const out = flow({ learn: option, depthAsk: true });
  const ask = out.at(-1);
  assert.equal(ask.key, 'learn-depth');
  assert.equal(ask.text, 'How deep do you want to go?');
  assert.deepEqual(ask.choices.map(c => [c.id, c.label]), [['depth:brief', 'Brief'], ['depth:balanced', 'Standard'], ['depth:detailed', 'Detailed']]);
  assert.equal(out.some(m => m.key === 'learn-intro' || m.key === 'learn-plan'), false, 'the opening paragraph and the plan come after the answer');
  const after = flow({ learn: { ...option, depth: 'brief' }, depthAsk: false, learnIntro: { status: 'loading' } });
  assert.ok(after.at(-1).pending && after.every(m => m.key !== 'learn-depth'));
  const ui = read('TutorRehearsal.jsx');
  assert.match(ui, /chat\.settings\?\.set\?\.\(\{ depth \}\)/, 'saved for the board through the Chat\'s own Depth setting, which the composer menu and every tool read');
  assert.match(ui, /startGoal\(\{ chat, board, repository: repoRef\.current, goalId: 'learn_concept', text: '', learn: option \}\)/, 'and copied into the goal (learn.depth)');
  assert.match(ui, /action: 'learn_plan', depth: option\.depth/, 'the plan is drafted for that depth');
  assert.match(ui, /beginLearn\(st\.current\.learn, depthOf\(chatRef\.current\.settings\?\.depth\) \|\| 'balanced'\)/, 'a question left alone uses the board\'s current depth');
});
