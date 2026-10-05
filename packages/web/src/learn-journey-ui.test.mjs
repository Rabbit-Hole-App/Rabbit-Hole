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
      "export { TutorPromptTray, routeJourneyTurn, journeyStartsHere, journeyRequest, shownTray, liveJourneyTray } from './LearnJourney.jsx';",
      "export { createElement } from 'react';",
      "export { renderToStaticMarkup } from 'react-dom/server';",
    ].join('\n'),
    resolveDir: here,
    loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { TutorPromptTray, routeJourneyTurn, journeyStartsHere, journeyRequest, shownTray, liveJourneyTray, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(outfile);
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
  assert.deepEqual([lone.options, lone.error.message, lone.free_text], [[], 'The network dropped.', false]);
});

test('liveJourneyTray: a broad intent on a board with a live journey asks continue or start, never a second journey', () => {
  const tray = liveJourneyTray({ request: { topic: 'logistic regression' } }, 'I want to learn transformers');
  assert.equal(tray.mode, 'clarification');
  assert.deepEqual(tray.options, [{ id: 'continue', label: 'Continue logistic regression' }, { id: 'start_new', label: 'Start transformers' }]);
  assert.equal(tray.free_text, false);
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
  assert.match(page, /const journey = useJourney\(\{ app, board: boardName, access: askScope, canvasApi, enabled: learnPreview && !suppliedCourse \}\)/);
  assert.match(page, /journey=\{journey\} journeyStarter=\{journey\.journey \? null : journey\.start\} tray=\{journey\.trayProps\}/);
  assert.match(page, /const tutor = useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, on: suppliedCourse && !board \}\);/);
});
