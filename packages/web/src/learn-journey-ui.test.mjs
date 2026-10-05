// The journey UI (docs/features/adaptive-learning-path-v1-architecture.md §7, LP1 Task 8): the tray-path router, the
// Tutor Prompt Tray markup, the composer's journey-start check, the request's revision replay and the shown tray. Pure
// helpers and static markup only: no network, no Send. LearnJourney.jsx is bundled with esbuild and rendered with
// react-dom/server, as voice-ui.test.mjs does; ask.jsx and LearnPage.jsx are too large to mount, so their wiring is
// pinned in source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { trayFor } from './learn-journey.js';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const here = fileURLToPath(new URL('.', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'journey-ui-'));
const outfile = join(dir, 'journey.cjs');
await esbuild.build({
  stdin: {
    contents: [
      "export { TutorPromptTray, routeJourneyTurn, journeyStartsHere, journeyRequest, shownTray, liveJourneyTray, resolveBody, journeyController, inJourneySetup } from './LearnJourney.jsx';",
      "export { createElement } from 'react';",
      "export { renderToStaticMarkup } from 'react-dom/server';",
    ].join('\n'),
    resolveDir: here,
    loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { TutorPromptTray, routeJourneyTurn, journeyStartsHere, journeyRequest, shownTray, liveJourneyTray, resolveBody, journeyController, inJourneySetup, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const intake = (slots = {}) => ({ id: 'j1', state: 'intake', revision: 3, request: { topic: 'logistic regression', intent: { kind: 'learning_journey' } }, intake: { slots, source: {} }, pending: null, error: null });
const goalTray = trayFor(intake(), null);
const familiarityTray = trayFor(intake({ goal: 'intuition' }), null);
const previewTray = trayFor({ id: 'j1', state: 'path_review', path_version: 1, pending: null, error: null }, { version: 1, sections: [] });
const probeTray = trayFor({ id: 'j1', state: 'diagnostic', pending: null, error: null }, null, { probe: { id: 'p2', kind: 'mcq', prompt: 'Which output is a probability?', claims: ['sigmoid/range'], options: [{ id: 'a', label: '0.7' }, { id: 'b', label: '3.2' }] } });
const render = props => renderToStaticMarkup(createElement(TutorPromptTray, { onOption: () => {}, ...props }));
const count = (html, pattern) => (html.match(pattern) || []).length;

test('routeJourneyTurn: each deterministic rule gives its resolver kind', () => {
  assert.deepEqual(routeJourneyTurn('Seen it before', familiarityTray), { kind: 'tray_answer', option_id: 'seen' });
  assert.deepEqual(routeJourneyTurn('the second one', familiarityTray), { kind: 'tray_answer', option_id: 'seen' });
  assert.deepEqual(routeJourneyTurn('looks good', previewTray), { kind: 'tray_answer', option_id: 'start' });
  assert.deepEqual(routeJourneyTurn('skip', familiarityTray), { kind: 'cancel' });
  assert.deepEqual(routeJourneyTurn('Could we do Python first?', previewTray), { kind: 'path_edit', edit: 'Could we do Python first?' });
});

test('routeJourneyTurn: punctuation never decides - "Can we skip this?" is cancel, never a Tutor turn', () => {
  for (const tray of [familiarityTray, goalTray, probeTray, previewTray]) {
    assert.deepEqual(routeJourneyTurn('Can we skip this?', tray), { kind: 'cancel' }, tray.mode);
    assert.deepEqual(routeJourneyTurn('can we skip this', tray), routeJourneyTurn('Can we skip this?', tray));
  }
});

test('routeJourneyTurn: an open tray with no rule match needs the model; no tray means the normal responder', () => {
  assert.deepEqual(routeJourneyTurn('Why is this section here?', previewTray), { kind: 'needs_model' });
  assert.deepEqual(routeJourneyTurn('Something about odds, I think', goalTray), { kind: 'needs_model' });
  assert.deepEqual(routeJourneyTurn('What is a sigmoid?', probeTray), { kind: 'needs_model' });
  assert.deepEqual(routeJourneyTurn('What is a sigmoid?', null), { kind: 'unrelated_question' });
  assert.deepEqual(routeJourneyTurn('Can we skip this?', null), { kind: 'unrelated_question' }, 'nothing to cancel with no tray');
  assert.deepEqual(routeJourneyTurn('skip probability', null), { kind: 'path_edit', edit: 'skip probability' }, 'rule 4 still runs with no tray');
});

test('routeJourneyTurn: the rules are injectable (the shared resolver extension by default)', () => {
  assert.deepEqual(routeJourneyTurn('anything', previewTray, () => ({ kind: 'cancel' })), { kind: 'cancel' });
  assert.deepEqual(routeJourneyTurn('Start', previewTray, () => null), { kind: 'needs_model' });
  assert.deepEqual(routeJourneyTurn('Start', null, () => null), { kind: 'unrelated_question' });
});

test('TutorPromptTray: a group named by its prompt, one pill per option, never an input or textarea', () => {
  for (const tray of [goalTray, familiarityTray, previewTray, probeTray]) {
    const html = render({ tray });
    assert.doesNotMatch(html, /<input|<textarea/, tray.mode);
    assert.equal(count(html, /data-tray-option="/g), tray.options.length, tray.mode);
    for (const option of tray.options) assert.match(html, new RegExp(`data-tray-option="${option.id}"`));
    assert.match(html, new RegExp(`data-tutor-prompt-tray="" data-mode="${tray.mode}"`));
    assert.match(html, /role="group"/);
    assert.ok(html.includes(`aria-label="${tray.prompt.replace(/'/g, '&#x27;')}"`), tray.prompt);
    assert.doesNotMatch(html, /data-tray-busy|data-tray-error/);
    assert.match(html, /rounded-lg border border-\[#2383e2\]\/30 bg-\[#2383e2\]\/\[0\.07\] px-3 py-2 text-sm/, 'the data-slash-result box');
  }
});

test('TutorPromptTray: busy shows the busy line and holds the options; an error shows the line and a retry button', () => {
  const busy = render({ tray: { ...familiarityTray, busy: 'Working on it...' } });
  assert.match(busy, /data-tray-busy/);
  assert.match(busy, /Working on it\.\.\./);
  assert.equal(count(busy, /<button[^>]*data-tray-option="[^"]*"[^>]*disabled=""/g), familiarityTray.options.length);
  assert.doesNotMatch(busy, /<input|<textarea/);
  const failed = render({ tray: { ...familiarityTray, error: { message: 'The network dropped.' } } });
  assert.match(failed, /data-tray-error/);
  assert.match(failed, /The network dropped\./);
  assert.match(failed, /<button[^>]*data-tray-retry/);
  // The server's planner-failure tray: its one option is retry, shown once, as the error line's button.
  const server = trayFor({ ...intake(), error: { op: 'path', message: 'The planner failed.' } }, null);
  const html = render({ tray: server });
  assert.equal(count(html, /data-tray-retry/g), 1);
  assert.equal(count(html, /data-tray-option="/g), 0);
  assert.match(html, /The planner failed\./);
  assert.equal(render({ tray: null }), '');
});

test('journeyStartsHere: a broad learning intent with no Tutor starts a journey; a question or a Tutor canvas does not', () => {
  const journeyStarter = async () => {};
  assert.equal(journeyStartsHere('I want to learn logistic regression', { tutor: null, journeyStarter }), true);
  assert.equal(journeyStartsHere('What is logistic regression?', { tutor: null, journeyStarter }), false);
  assert.equal(journeyStartsHere('I want to learn logistic regression', { tutor: { ask: () => {} }, journeyStarter }), false);
  assert.equal(journeyStartsHere('I want to learn logistic regression', { tutor: null, journeyStarter: null }), false, 'a board with a live journey passes no starter');
  assert.equal(journeyStartsHere('Give me a 10-minute visual overview of logistic regression', { journeyStarter }), true);
});

test('journeyRequest: a revision conflict replays the action once with the re-read revision, never in a loop', async () => {
  const seen = [];
  const replies = [
    { status: 409, d: { error: 'revision', journey: { id: 'j1', revision: 7 }, path: null, tray: familiarityTray } },
    { status: 200, d: { journey: { id: 'j1', revision: 8 }, path: null, tray: null } },
  ];
  const out = await journeyRequest({ action: 'intake_answer', slot: 'familiarity', option_id: 'seen' }, 5, async body => { seen.push(body); return replies.shift(); });
  assert.deepEqual(seen.map(body => body.revision), [5, 7]);
  assert.deepEqual(seen.map(body => body.option_id), ['seen', 'seen'], 'the answer rides the replay');
  assert.equal(out.status, 200);
  assert.equal(out.reread.tray, familiarityTray, 'the re-read rides along with the replay');
  const twice = [];
  const conflict = { status: 409, d: { error: 'revision', journey: { id: 'j1', revision: 9 } } };
  const last = await journeyRequest({ action: 'accept' }, 8, async body => { twice.push(body); return conflict; });
  assert.equal(twice.length, 2);
  assert.equal(last.status, 409);
  const other = [];
  await journeyRequest({ action: 'accept' }, 8, async body => { other.push(body); return { status: 409, d: { error: 'accept is not legal in intake', journey: { revision: 9 } } }; });
  assert.equal(other.length, 1, 'only a revision conflict replays');
  const started = [];
  await journeyRequest({ action: 'start', text: 'I want to learn SQL' }, undefined, async body => { started.push(body); return { status: 200, d: {} }; });
  assert.equal('revision' in started[0], false, 'no journey, no revision');
});

test('shownTray: a reload shows the server tray as recomputed; local trays, busy and errors layer over it', () => {
  // Reload mid-intake: the server answers with the next open slot, the only tray shown (nothing asked twice).
  assert.equal(shownTray(familiarityTray, null, null, null), familiarityTray);
  assert.equal(shownTray(null, null, null, null), null);
  const local = liveJourneyTray({ request: { topic: 'logistic regression' } }, 'I want to learn transformers');
  assert.equal(shownTray(familiarityTray, local, null, null), local);
  assert.equal(shownTray(familiarityTray, null, 'Working on it...', null).busy, 'Working on it...');
  assert.equal(shownTray(familiarityTray, null, null, { message: 'x' }).error.message, 'x');
  // An error with no tray under it (a failed start) still has a place to show, with no options.
  const lone = shownTray(null, null, null, { message: 'The network dropped.' });
  assert.deepEqual([lone.options, lone.error.message, lone.free_text, lone.dismissible], [[], 'The network dropped.', false, true]);
  // That status tray can be dismissed; an error over a real tray (or the server's planner-failure tray) cannot.
  assert.match(render({ tray: lone }), /<button[^>]*data-tray-dismiss/);
  assert.doesNotMatch(render({ tray: shownTray(familiarityTray, null, null, { message: 'x' }) }), /data-tray-dismiss/);
  assert.doesNotMatch(render({ tray: trayFor({ ...intake(), error: { op: 'path', message: 'x' } }, null) }), /data-tray-dismiss/);
});

test('liveJourneyTray: a broad intent on a board with a live journey asks continue or start, never a second journey', () => {
  const tray = liveJourneyTray({ request: { topic: 'logistic regression' } }, 'I want to learn transformers');
  assert.equal(tray.mode, 'clarification');
  assert.deepEqual(tray.options, [{ id: 'continue', label: 'Continue logistic regression' }, { id: 'start_new', label: 'Start transformers' }]);
  assert.equal(tray.free_text, false);
});

test('resolveBody: rule 5 sends the open tray inside the route limits, and no other field', () => {
  const long = { id: 'clarification:x', mode: 'clarification', prompt: 'p'.repeat(400), free_text: true, dismissible: true, text: 'kept local',
    options: Array.from({ length: 8 }, (_, i) => ({ id: `${i}`.repeat(50), label: 'l'.repeat(200), value: 'x' })) };
  const body = resolveBody('w'.repeat(1200), long);
  assert.deepEqual(Object.keys(body), ['action', 'text', 'tray']);
  assert.equal(body.action, 'resolve');
  assert.equal(body.text.length, 1000);
  assert.deepEqual(Object.keys(body.tray), ['mode', 'prompt', 'options', 'free_text']);
  assert.equal(body.tray.free_text, true, 'rule 5 can only return a free-text answer when it knows the tray takes one');
  assert.equal(body.tray.prompt.length, 300);
  assert.equal(body.tray.options.length, 6);
  assert.ok(body.tray.options.every(o => Object.keys(o).join() === 'id,label' && o.id.length === 40 && o.label.length === 120));
  assert.deepEqual(resolveBody('hi', previewTray).tray, { mode: 'path_preview', prompt: previewTray.prompt, options: previewTray.options, free_text: false });
});

test('ask.jsx: the tray path runs before the Tutor and the Learn chat; a broad intent starts a journey; the tray sits in the LearnSlash slot', () => {
  const ask = read('ask.jsx');
  const journeyAt = ask.indexOf('journey.handleText(');
  const starterAt = ask.indexOf('journeyStartsHere(');
  assert.ok(journeyAt > 0 && starterAt > 0);
  assert.ok(journeyAt < ask.indexOf('if (tutor) { mirror(await tutor.ask('), 'before the Tutor branch');
  assert.ok(journeyAt < ask.indexOf("setMsgs((m) => [...m, { role: 'user'"), 'before any chat bubble, card or /api/learn/ask');
  assert.match(ask, /await journeyStarter\(/);
  assert.match(ask, /<TutorPromptTray tray=\{tray\.tray\}/);
  assert.ok(ask.indexOf('<TutorPromptTray') < ask.indexOf('<slash.Picker'), 'in the LearnSlash slot, above the composer');
  assert.match(ask, /tray\?\.tray\?\.free_text \? 'Type your answer, or ask anything'/);
});

test('LearnPage.jsx: useJourney off the nanoGPT course, its props on the dock composer, and useTutor untouched', () => {
  const page = read('LearnPage.jsx');
  // Canvases only (the route refuses repository apps, the nanoGPT course among them), and never a pending hole, which has
  // no canvas row yet.
  assert.match(page, /const journey = useJourney\(\{ app, board: boardName, access: askScope, canvasApi, enabled: learnPreview && isCanvas && !hole \}\)/);
  assert.match(page, /journey=\{journey\} journeyStarter=\{journey\.journey \? null : journey\.start\} journeySetup=\{inJourneySetup\(journey\.journey\)\} tray=\{journey\.trayProps\}/);
  assert.match(page, /const tutor = useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, on: suppliedCourse && !board \}\);/);
});

// ---- journeyController: the hook's behaviour, driven with a fake fetchJson (no network) ----
const APP = 'canvas-0a1b2c3d';
const journeyOf = (over = {}) => ({ id: 'j1', revision: 4, state: 'intake', request: { topic: 'logistic regression' }, pending: null, error: null, ...over });
const probes = [{ id: 'p2', kind: 'mcq', prompt: 'Which output is a probability?', claims: ['sigmoid/range'] }, { id: 'p3', kind: 'explain_back', prompt: 'Explain the sigmoid in your words.', claims: ['sigmoid/shape'] }];
const explainTray = trayFor({ id: 'j1', state: 'diagnostic', pending: null, error: null }, null, { probe: probes[1] });
const depthTray = trayFor(intake({ goal: 'intuition', familiarity: 'seen' }), null);
const ok = (journey, tray, path = null) => ({ status: 200, d: { journey, path, tray } });
const none = { status: 200, d: { journey: null, path: null, tray: null } };
// One reply per request, in order (a function gets (path, body)); a request with no reply left fails the test.
function harness(first, replies = []) {
  const calls = [], queue = [first, ...replies];
  const fetchJson = async (path, body) => {
    calls.push({ path, body });
    if (!queue.length) throw new Error(`unexpected request ${path} ${JSON.stringify(body)}`);
    const r = queue.shift();
    return typeof r === 'function' ? r(path, body) : r;
  };
  const ctl = journeyController({ where: { app: APP, board: 'main' }, fetchJson });
  return { ctl, calls, actions: () => calls.filter(c => c.body).map(c => c.body.action ?? c.path), refresh: () => ctl.refresh(), view: () => ctl.view() };
}

test('controller: an evaluate refusal (400, until Task 7) still advances the walker exactly once and never retries', async () => {
  const j = journeyOf({ state: 'diagnostic', diagnostic: { probes } });
  const h = harness(ok(j, probeTray), [{ status: 400, d: { error: 'bad evaluate body' } }, ok({ ...j, revision: 5 }, explainTray)]);
  await h.refresh();
  await h.view().answer('a');
  assert.deepEqual(h.calls.map(c => c.path), ['/api/learn/journey?app=canvas-0a1b2c3d&board=main', '/api/learn/tutor/evaluate', '/api/learn/journey']);
  assert.deepEqual(h.calls[1].body, { app: APP, board: 'main', journey_id: 'j1', probe_id: 'p2', option_id: 'a' });
  assert.deepEqual(h.calls[2].body, { app: APP, board: 'main', action: 'probe_advance', probe_id: 'p2', revision: 4 });
  assert.equal(h.view().tray.id, explainTray.id);
  assert.equal(h.view().tray.error, undefined, 'an evaluator error shows nothing: placement goes on');
});

test('controller: free text answers the goal slot with intake_answer, and a probe through evaluate then probe_advance', async () => {
  const goal = harness(ok(journeyOf(), goalTray), [{ status: 200, d: { kind: 'tray_answer' } }, ok(journeyOf({ revision: 5 }), familiarityTray)]);
  await goal.refresh();
  const long = 'Use it at work. '.repeat(30);
  assert.deepEqual(await goal.view().handleText(long), { handled: true });
  assert.deepEqual(goal.actions(), ['resolve', 'intake_answer']);
  assert.equal(goal.calls[1].body.tray.free_text, true);
  assert.deepEqual([goal.calls[2].body.slot, goal.calls[2].body.text], ['goal', long.slice(0, 300)], 'goal text is cut to the route limit');
  assert.equal('option_id' in goal.calls[2].body, false);

  const j = journeyOf({ state: 'diagnostic', diagnostic: { probes } });
  const probe = harness(ok(j, explainTray), [{ status: 200, d: { kind: 'tray_answer' } }, { status: 400, d: {} }, ok({ ...j, revision: 5 }, previewTray)]);
  await probe.refresh();
  assert.deepEqual(await probe.view().handleText('It squashes any number into 0 to 1'), { handled: true });
  assert.deepEqual(probe.actions(), ['resolve', '/api/learn/tutor/evaluate', 'probe_advance']);
  assert.deepEqual(probe.calls[2].body, { app: APP, board: 'main', journey_id: 'j1', claims: ['sigmoid/shape'], answering: true, question: 'Explain the sigmoid in your words.', message: 'It squashes any number into 0 to 1' });
});

test('controller: a cancel the journey cannot take (409 in path_review) dismisses the tray, with no error', async () => {
  const j = journeyOf({ state: 'path_review', path_version: 1 });
  const h = harness(ok(j, previewTray), [{ status: 409, d: { error: 'cancel is not legal in path_review', journey: j, path: null, tray: previewTray } }]);
  await h.refresh();
  assert.deepEqual(await h.view().handleText('Can we skip this?'), { handled: true });
  assert.deepEqual(h.actions(), ['cancel']);
  assert.equal(h.view().tray, null);
});

test('controller: live_journey offers continue or start; Start archives the live one, then starts the new topic', async () => {
  const old = journeyOf({ revision: 6 });
  const h = harness(none, [
    { status: 409, d: { error: 'live_journey', journey: old, path: null, tray: familiarityTray } },
    none,
    ok(journeyOf({ id: 'j2', revision: 1, request: { topic: 'transformers' } }), goalTray),
  ]);
  await h.refresh();
  assert.deepEqual(await h.view().start('I want to learn transformers'), { handled: true });
  assert.equal(h.view().tray.id, 'clarification:live');
  assert.deepEqual(h.view().tray.options.map(o => o.label), ['Continue logistic regression', 'Start transformers']);
  await h.view().answer('start_new');
  assert.deepEqual(h.actions(), ['start', 'archive', 'start']);
  assert.equal(h.calls[2].body.revision, 6, 'archive is revision-checked');
  assert.equal('revision' in h.calls[3].body, false);
  assert.equal(h.calls[3].body.text, 'I want to learn transformers');
  assert.equal(h.view().journey.id, 'j2');
});

test('controller: a broad intent typed on a live journey opens continue-or-start; Continue keeps a free-text answer', async () => {
  // On the goal question (free text), the words are an answer that reads like an intent: Continue submits them.
  const h = harness(ok(journeyOf(), goalTray), [ok(journeyOf({ revision: 5 }), familiarityTray)]);
  await h.refresh();
  assert.deepEqual(await h.view().handleText('I want to understand the intuition'), { handled: true });
  assert.equal(h.view().tray.id, 'clarification:live');
  assert.equal(h.calls.length, 1, 'no request: not a second journey, not the resolver');
  await h.view().answer('continue');
  assert.deepEqual(h.actions(), ['intake_answer']);
  assert.deepEqual([h.calls[1].body.slot, h.calls[1].body.text], ['goal', 'I want to understand the intuition']);
  // On an option-only question, or with no tray at all (an active journey), Continue just closes it.
  const active = harness(ok(journeyOf({ state: 'active' }), null));
  await active.refresh();
  assert.deepEqual(await active.view().handleText('Teach me transformers'), { handled: true });
  assert.equal(active.view().tray.id, 'clarification:live');
  await active.view().answer('continue');
  assert.equal(active.view().tray, null);
  assert.equal(active.calls.length, 1);
  // No tray and no start intent: the Learn chat's, except a rule-4 path edit.
  assert.deepEqual(await active.view().handleText('What is a sigmoid?'), { handled: false });
  assert.deepEqual(await active.view().handleText('Can we skip this?'), { handled: false });
  assert.equal(active.calls.length, 1);
});

test('controller: topic_required asks for the topic; the typed topic starts once, wrapped only when it is not already a request', async () => {
  const topicTray = { id: 'clarification:topic', mode: 'clarification', prompt: 'What do you want to learn?', options: [], free_text: true, dismissible: true };
  const h = harness(none, [{ status: 400, d: { error: 'topic_required', tray: topicTray } }, { status: 200, d: { kind: 'tray_answer' } }, ok(journeyOf({ request: { topic: 'sql' } }), null)]);
  await h.refresh();
  assert.deepEqual(await h.view().start('Skip setup and start'), { handled: true });
  assert.equal(h.view().tray.id, 'clarification:topic');
  assert.equal(h.view().tray.error, undefined);
  assert.deepEqual(await h.view().handleText('SQL'), { handled: true });
  assert.deepEqual(h.actions(), ['start', 'resolve', 'start']);
  assert.equal(h.calls[3].body.text, 'Teach me SQL. Skip setup and start');
  const again = harness(none, [{ status: 400, d: { error: 'topic_required', tray: topicTray } }, { status: 200, d: { kind: 'tray_answer' } }, ok(journeyOf(), null)]);
  await again.refresh();
  await again.view().start('Skip setup and start');
  await again.view().handleText('I want to learn SQL');
  assert.equal(again.calls[3].body.text, 'I want to learn SQL. Skip setup and start', 'already a request: not wrapped');
});

test('controller: a replay refused because the step moved (409 revision, then 400) shows the current tray and gives the words back', async () => {
  const h = harness(ok(journeyOf(), goalTray), [
    { status: 200, d: { kind: 'tray_answer' } },
    { status: 409, d: { error: 'revision', journey: journeyOf({ revision: 6 }), path: null, tray: familiarityTray } },
    { status: 400, d: { error: 'invalid_answer' } },
  ]);
  await h.refresh();
  assert.deepEqual(await h.view().handleText('To pass my exam next week'), { handled: true, failed: true });
  assert.deepEqual(h.actions(), ['resolve', 'intake_answer', 'intake_answer']);
  assert.equal(h.view().tray.id, familiarityTray.id, 'the re-read tray, not the stale goal question');
  assert.equal(h.view().tray.error, undefined, 'no retry for an answer to a step that has moved');
});

test('controller: a failed action keeps its words (failed), shows a retry that re-sends them, and the next turn clears the error', async () => {
  const h = harness(ok(journeyOf(), familiarityTray), [() => { throw new Error('offline'); }, ok(journeyOf({ revision: 5 }), depthTray)]);
  await h.refresh();
  assert.deepEqual(await h.view().handleText('Seen it before'), { handled: true, failed: true });
  assert.equal(h.view().tray.error.message, 'Rabbit Hole could not be reached.');
  await h.view().answer('retry');
  assert.deepEqual(h.calls.slice(1).map(c => c.body.option_id), ['seen', 'seen']);
  assert.equal(h.view().tray.id, depthTray.id);
  // A failed start: the status tray, dismissable, and cleared by the next turn too.
  const s = harness(none, [{ status: 500, d: { error: 'boom' } }]);
  await s.refresh();
  assert.deepEqual(await s.view().start('I want to learn SQL'), { handled: true, failed: true });
  assert.equal(s.view().tray.id, 'status');
  await s.view().answer('dismiss');
  assert.equal(s.view().tray, null);
  s.ctl.state.error = { message: 'stale' };
  assert.equal(s.view().tray.id, 'status');
  assert.deepEqual(await s.view().handleText('What is SQL?'), { handled: false });
  assert.equal(s.view().tray, null, 'the next turn clears the error');
});

test('inJourneySetup: intake, diagnostic and path review are setup (no permanent cards); active and none are not', () => {
  assert.deepEqual(['intake', 'diagnostic', 'path_review', 'active', 'completed'].map(state => inJourneySetup({ state })), [true, true, true, false, false]);
  assert.equal(inJourneySetup(null), false);
});

test('ask.jsx: on a journey in setup, the Learn chat answers in the sheet only - no placed card, no reserved slot, no auto-inserted reader', () => {
  const ask = read('ask.jsx');
  assert.match(ask, /journeySetup = false/);
  assert.match(ask, /const panelAsk = sheetMode && \(!canvasTarget \|\| journeySetup\);/);
  assert.match(ask, /const exchange = panelAsk \|\| journeySetup \? null : onExchange;/);
  assert.match(ask, /if \(d\.card && !slots\[d\.card\] && !journeySetup\)/);
  for (const kind of ['Paper', 'Wiki', 'Video']) assert.match(ask, new RegExp(`if \\(!journeySetup\\) boardContext\\?\\.onShow${kind}\\?\\.`));
  // Every turn on a board with a journey goes through handleText; a failed one gives the words back.
  assert.match(ask, /if \(\(journey\?\.journey \|\| journey\?\.tray\) && !skipJourney/);
  assert.match(ask, /if \(routed\.failed\) setInput\(current => current \|\| raw\);/);
  assert.match(ask, /if \(started\.failed\) setInput\(current => current \|\| raw\);/);
  // One copy of the start kinds: the resolver extension's.
  assert.doesNotMatch(read('LearnJourney.jsx'), /new Set\(\['learning_journey'/);
});
