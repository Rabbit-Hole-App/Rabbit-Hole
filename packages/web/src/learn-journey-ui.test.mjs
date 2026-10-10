// The journey UI (docs/features/adaptive-learning-path-v1-architecture.md §7, LP1 Task 8): the tray-path router, the
// Tutor Prompt Tray markup, the composer's journey-start check, the request's revision replay and the shown tray. Pure
// helpers and static markup only: no network, no Send. LearnJourney.jsx is bundled with esbuild and rendered with
// react-dom/server, as voice-ui.test.mjs does; ask.jsx and LearnPage.jsx are too large to mount, so their wiring is
// pinned in source. LP1 Task 12: useTutor (LearnTutor.jsx) is bundled too and rendered once on the server, so its typed
// and voice turns run over the journey controller with a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      "export { TutorPromptTray, routeJourneyTurn, journeyStartsHere, journeyRequest, shownTray, liveJourneyTray, resolveBody, journeyController, inJourneySetup, journeyDiveContext } from './LearnJourney.jsx';",
      "export { default as ContentsRail, PathList, flyoutRect, canvasEmpty } from './ContentsRail.jsx';",
      "export { useTutor, tutorStoreKey } from './LearnTutor.jsx';",
      "export { createElement } from 'react';",
      "export { renderToStaticMarkup } from 'react-dom/server';",
    ].join('\n'),
    resolveDir: here,
    loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const { TutorPromptTray, routeJourneyTurn, journeyStartsHere, journeyRequest, shownTray, liveJourneyTray, resolveBody, journeyController, inJourneySetup, journeyDiveContext, ContentsRail, PathList, flyoutRect, canvasEmpty, useTutor, tutorStoreKey, createElement, renderToStaticMarkup } = createRequire(import.meta.url)(outfile);
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

test('ask.jsx: on a journey canvas the Tutor is the one path; the composer calls handleText only with no Tutor (a journey being started); the tray sits in the LearnSlash slot', () => {
  const ask = read('ask.jsx');
  // LP1 Task 12: a live journey makes the Tutor active, and its turn() runs the resolver for typed and voice turns. The
  // composer's own call is left for a canvas with no Tutor, whose only trays belong to a journey being started.
  assert.equal(ask.split('journey.handleText(').length, 2, 'one handleText call in the composer');
  assert.match(ask, /if \(!tutor\) \{\n\s+setInput\(''\);\n\s+routed = await journey\.handleText\(raw\.trim\(\)\);/);
  const journeyAt = ask.indexOf('journey.handleText(');
  const starterAt = ask.indexOf('journeyStartsHere(');
  assert.ok(journeyAt > 0 && starterAt > 0);
  assert.ok(journeyAt < ask.indexOf("setMsgs((m) => [...m, { role: 'user'"), 'before any chat bubble, card or /api/learn/ask');
  // The Tutor draws the turn's bubbles and exchange itself (begin), only for a turn it answers: a turn the journey takes
  // has neither, and a failed one gives the words back. Ask the Tutor (skipJourney) goes straight to the planner.
  // A question about attached repository lines or a file (codeTurn) goes to the repository's reader instead (repository-browser.md).
  assert.match(ask, /if \(!tutor \|\| codeTurn \|\| isDemo\) begin\(\);/);
  assert.match(ask, /await tutor\.ask\(\{ raw: raw\.trim\(\), targetId: \(target \|\| canvasSeed\?\.target\)\?\.id \|\| null, opening, signal: flight\.signal, skipJourney, begin \}\)/);
  assert.match(ask, /if \(reply\?\.handled\) \{ if \(reply\.failed\) setInput\(current => current \|\| raw\); return; \}/);
  assert.match(ask, /await journeyStarter\(/);
  assert.match(ask, /<TutorPromptTray tray=\{tray\.tray\}/);
  assert.ok(ask.indexOf('<TutorPromptTray') < ask.indexOf('<slash.Picker'), 'in the LearnSlash slot, above the composer');
  assert.match(ask, /tray\?\.tray\?\.free_text \? 'Type your answer, or ask anything'/);
});

test('LearnPage.jsx: useJourney off the nanoGPT course, its props on the dock composer, and useTutor takes the journey', () => {
  const page = read('LearnPage.jsx');
  // Canvases only (the route refuses repository apps, the nanoGPT course among them), and never a pending hole, which has
  // no canvas row yet.
  assert.match(page, /const journey = useJourney\(\{ app, board: boardName, access: askScope, canvasApi, enabled: learnPreview && isCanvas && !hole \}\)/);
  assert.match(page, /journey=\{journey\} journeyStarter=\{journey\.journey \? null : journey\.start\} journeySetup=\{inJourneySetup\(journey\.journey\)\} tray=\{journey\.trayProps\}/);
  // LP1 Task 12: the journey reaches useTutor, so the dock's tutor prop is the Tutor on a journey canvas (D1).
  assert.match(page, /const journey = useJourney\([^\n]*\n[\s\S]*?const tutor = useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, courseCanvas: learnPreview && !board, journey, canvasVersion, repository: repoAttached && canvasRepository\(app\), describe: describeBlock \}\);/);
  assert.match(page, /tutor=\{tutor\.active \? tutor : null\} journey=\{journey\}/);
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
function harness(first, replies = [], board = 'main') {
  const calls = [], queue = [first, ...replies];
  const fetchJson = async (path, body) => {
    calls.push({ path, body });
    if (!queue.length) throw new Error(`unexpected request ${path} ${JSON.stringify(body)}`);
    const r = queue.shift();
    return typeof r === 'function' ? r(path, body) : r;
  };
  const ctl = journeyController({ where: { app: APP, board }, fetchJson });
  return { ctl, calls, actions: () => calls.filter(c => c.body).map(c => c.body.action ?? c.path), refresh: () => ctl.refresh(), view: () => ctl.view() };
}

test('controller: an evaluate refusal (400) still advances the walker exactly once and never retries', async () => {
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

test('final review A-m6: an mcq answer, then probe_advance on the revision the evaluate reply carries - no 409 and no replay', async () => {
  const j = journeyOf({ state: 'diagnostic', diagnostic: { probes } });
  // The server: probe_advance on a stale revision is a 409 with the re-read journey, as the route answers it.
  const advance = (_path, body) => (body.revision === 5 ? ok({ ...j, revision: 6 }, explainTray) : { status: 409, d: { error: 'revision', journey: { ...j, revision: 5 }, path: null, tray: probeTray } });
  const h = harness(ok(j, probeTray), [{ status: 200, d: { status: 'settled', evaluator: 'deterministic', events: [], journey: { events: [], seq: 1, revision: 5 } } }, advance, advance]);
  await h.refresh();
  await h.view().answer('a');
  assert.deepEqual(h.calls.map(c => c.body?.action ?? c.path), [GET, '/api/learn/tutor/evaluate', 'probe_advance']);
  assert.equal(h.calls[2].body.revision, 5);
  assert.equal(h.view().tray.id, explainTray.id);
});

test('controller: free text answers the goal slot with intake_answer, and a probe through the Tutor probe turn then probe_advance', async () => {
  const goal = harness(ok(journeyOf(), goalTray), [{ status: 200, d: { kind: 'tray_answer' } }, ok(journeyOf({ revision: 5 }), familiarityTray)]);
  await goal.refresh();
  const long = 'Use it at work. '.repeat(30);
  assert.deepEqual(await goal.view().handleText(long), { handled: true });
  assert.deepEqual(goal.actions(), ['resolve', 'intake_answer']);
  assert.equal(goal.calls[1].body.tray.free_text, true);
  assert.deepEqual([goal.calls[2].body.slot, goal.calls[2].body.text], ['goal', long.slice(0, 300)], 'goal text is cut to the route limit');
  assert.equal('option_id' in goal.calls[2].body, false);

  // LP1 Task 12: a free-text probe answer is the Tutor's turn (answerProbe: runTurn plan:false, LearnTutor.jsx), then
  // probe_advance. A failed answerer still advances: no evidence, the conservative path.
  const j = journeyOf({ state: 'diagnostic', diagnostic: { probes } });
  const probe = harness(ok(j, explainTray), [{ status: 200, d: { kind: 'tray_answer' } }, ok({ ...j, revision: 5 }, previewTray)]);
  await probe.refresh();
  const answered = [];
  const answerProbe = async (p, text) => { answered.push([p.id, p.claims, p.prompt, text]); throw new Error('evaluator down'); };
  assert.deepEqual(await probe.view().handleText('It squashes any number into 0 to 1', { answerProbe }), { handled: true });
  assert.deepEqual(probe.actions(), ['resolve', 'probe_advance']);
  assert.deepEqual(answered, [['p3', ['sigmoid/shape'], 'Explain the sigmoid in your words.', 'It squashes any number into 0 to 1']]);
  assert.deepEqual(probe.calls[2].body, { app: APP, board: 'main', action: 'probe_advance', probe_id: 'p3', revision: 4 });
  // An option-only probe (keyed: the route grades free text on a keyless probe only) stays open for a pick.
  const mcq = harness(ok(j, probeTray), [{ status: 200, d: { kind: 'tray_answer' } }]);
  await mcq.refresh();
  assert.deepEqual(await mcq.view().handleText('the one between zero and one', { answerProbe }), { handled: true });
  assert.deepEqual(mcq.actions(), ['resolve']);
  assert.equal(answered.length, 1);
});

test('controller: Answer the question on a clarification over a probe answers it with the Tutor probe turn its turn handed over', async () => {
  const j = journeyOf({ state: 'diagnostic', diagnostic: { probes } });
  const h = harness(ok(j, explainTray), [{ status: 200, d: { kind: 'clarification_needed' } }, ok({ ...j, revision: 5 }, previewTray)]);
  await h.refresh();
  const answered = [];
  assert.deepEqual(await h.view().handleText('maybe it bends', { answerProbe: async (p, text) => { answered.push([p.id, text]); } }), { handled: true });
  assert.equal(h.view().tray.id, 'clarification:turn');
  await h.view().answer('answer');
  assert.deepEqual(answered, [['p3', 'maybe it bends']]);
  assert.deepEqual(h.actions(), ['resolve', 'probe_advance']);
});

test('controller: a cancel the journey cannot take (409 in path_review) dismisses the tray, with no error', async () => {
  const j = journeyOf({ state: 'path_review', path_version: 1 });
  const h = harness(ok(j, previewTray), [{ status: 409, d: { error: 'cancel is not legal in path_review', journey: j, path: null, tray: previewTray } }]);
  await h.refresh();
  assert.deepEqual(await h.view().handleText('Can we skip this?'), { handled: true });
  assert.deepEqual(h.actions(), ['cancel']);
  assert.equal(h.view().tray, null);
});

test('final review B-I2: a cancel at path review hides the tray only until the next turn - typed start brings it back and accepts (D6)', async () => {
  for (const words of ['Can we skip this?', 'not now']) {
    const j = journeyOf({ state: 'path_review', path_version: 1 });
    const h = harness(ok(j, previewTray), [{ status: 409, d: { error: 'cancel is not legal in path_review', journey: j, path: null, tray: previewTray } }, ok(journeyOf({ state: 'active', revision: 5, path_version: 2 }), null)]);
    await h.refresh();
    await h.view().handleText(words);
    assert.equal(h.view().tray, null, `${words}: dismissed for now`);
    assert.deepEqual(await h.view().handleText('start'), { handled: true });
    assert.deepEqual(h.actions(), ['cancel', 'accept'], `${words}: the path tray is back and Start accepts`);
  }
});

// Owner 2026-10-07: Start is one start naming the journey it replaces (the route archives it in the insert's transaction),
// never an archive and then a start, so a start that fails keeps the current journey.
test('controller: live_journey offers continue or start; Start replaces the live one in one start', async () => {
  const old = journeyOf({ revision: 6 });
  const h = harness(none, [
    { status: 409, d: { error: 'live_journey', journey: old, path: null, tray: familiarityTray } },
    ok(journeyOf({ id: 'j2', revision: 1, request: { topic: 'transformers' } }), goalTray),
  ]);
  await h.refresh();
  assert.deepEqual(await h.view().start('I want to learn transformers'), { handled: true });
  assert.equal(h.view().tray.id, 'clarification:live');
  assert.deepEqual(h.view().tray.options.map(o => o.label), ['Continue logistic regression', 'Start transformers']);
  await h.view().answer('start_new');
  assert.deepEqual(h.actions(), ['start', 'start']);
  assert.deepEqual(h.calls[2].body, { app: APP, board: 'main', action: 'start', text: 'I want to learn transformers', replace: 'j1' }, 'no revision, the replaced journey named');
  assert.equal(h.view().journey.id, 'j2');
});

test('controller: Start after another tab replaced the journey meanwhile asks again, naming the journey now live', async () => {
  const h = harness(none, [
    { status: 409, d: { error: 'live_journey', journey: journeyOf({ revision: 6 }), path: null, tray: familiarityTray } },
    { status: 409, d: { error: 'live_journey', journey: journeyOf({ id: 'j3', revision: 1, request: { topic: 'graphs' } }), path: null, tray: goalTray } },
  ]);
  await h.refresh();
  await h.view().start('I want to learn transformers');
  await h.view().answer('start_new');
  assert.deepEqual(h.actions(), ['start', 'start']);
  assert.equal(h.view().journey.id, 'j3');
  assert.deepEqual([h.view().tray.id, h.view().tray.prompt, h.view().tray.replace], ['clarification:live', 'Continue graphs or start transformers?', 'j3']);
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
  // No tray and no start intent: the Tutor's (LP1 Task 12).
  assert.deepEqual(await active.view().handleText('What is a sigmoid?'), { handled: false });
  assert.deepEqual(await active.view().handleText('Can we skip this?'), { handled: false });
  assert.equal(active.calls.length, 1);
});

test('controller: a path edit on an active, paused or completed journey with no tray goes to the responder, never path_edit (LP2)', async () => {
  for (const state of ['active', 'paused', 'completed']) {
    const h = harness(ok(journeyOf({ state }), null));
    await h.refresh();
    assert.deepEqual(await h.view().handleText('Could we do Python first?'), { handled: false }, state);
    assert.deepEqual(await h.view().handleText('skip probability'), { handled: false }, state);
    assert.equal(h.calls.length, 1, `${state}: no request`);
  }
  // On the path preview the same words are a path edit (rule 4), posted as one.
  const j = journeyOf({ state: 'path_review', path_version: 1 });
  const review = harness(ok(j, previewTray), [ok({ ...j, revision: 5, pending: 'revise' }, null)]);
  await review.refresh();
  assert.deepEqual(await review.view().handleText('Could we do Python first?'), { handled: true });
  assert.deepEqual(review.calls[1].body, { app: APP, board: 'main', action: 'path_edit', text: 'Could we do Python first?', revision: 4 });
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
  // A card only selected (canvas-card-selection.md) is context, not an Ask in chat: it never moves the answer out of the sheet.
  assert.match(ask, /const panelAsk = sheetMode && \(!canvasTarget \|\| \(canvasTarget\.card && !canvasTarget\.asked\) \|\| journeySetup\);/);
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

// ---- Adaptive Contents Rail (§8, R2; LP1 Task 9): PathList and the rail's two shapes, as static markup ----
// Today's heading rail, rendered before Task 9 touched ContentsRail.jsx: canvases without a journey keep it byte for byte.
const OLD_ENTRIES = [{ n: 1, label: 'Intro', available: true, active: true }, { n: 2, label: 'Middle', available: true, active: false, section: 'h2' }, { n: 3, label: 'Later', available: false, active: false }];
const OLD_TICKS = '<div aria-hidden="true" class="flex flex-col items-end gap-1.5 rounded-full border border-line bg-white px-2 py-3 shadow-sm"><span class="h-0.5 rounded-full transition-all duration-150 w-6 bg-ink"></span><span class="h-0.5 rounded-full transition-all duration-150 w-4 bg-ink-2"></span><span class="h-0.5 rounded-full transition-all duration-150 w-4 bg-ink-3/50"></span></div>';
const OLD_LIST = '<ol class="space-y-1"><li><button type="button" aria-current="page" class="w-full rounded px-1 py-0.5 text-left text-sm hover:text-accent disabled:cursor-default disabled:text-ink-3 disabled:hover:text-ink-3 font-semibold text-accent">1. Intro</button></li><li><button type="button" class="w-full rounded px-1 py-0.5 text-left text-sm hover:text-accent disabled:cursor-default disabled:text-ink-3 disabled:hover:text-ink-3 text-ink">2. Middle</button></li><li><button type="button" disabled="" class="w-full rounded px-1 py-0.5 text-left text-sm hover:text-accent disabled:cursor-default disabled:text-ink-3 disabled:hover:text-ink-3 ">3. Later</button></li></ol>';
const OLD_RAIL = `<div data-contents-rail="true" class="absolute top-1/2 right-0 z-30 -translate-y-1/2 pr-2 pl-6 max-lg:hidden">${OLD_TICKS}<nav aria-label="Table of contents" hidden="" class="absolute top-1/2 right-full max-h-[80vh] w-64 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-white p-4 shadow-md"><h2 class="mb-2 text-xs font-semibold tracking-wider text-ink-2 uppercase">Contents</h2>${OLD_LIST}</nav></div>`;
const entry = (id, n, status, over = {}) => ({ id, n, title: `Section ${n}`, purpose: `Why section ${n} matters.`, status, changed: null, heading_block_id: null, ...over });
const PATH = [entry('s1', 1, 'current', { heading_block_id: 'h1' }), entry('s2', 2, 'upcoming', { changed: 'added' }), entry('s3', 3, 'optional')];
const list = (entries, expanded = true) => renderToStaticMarkup(createElement(PathList, { entries, onOpen: () => {}, expanded }));
const rail = props => renderToStaticMarkup(createElement(ContentsRail, { onOpen: () => {}, ...props }));
const entryHtml = (html, id) => html.match(new RegExp(`<li data-path-entry="${id}"[\\s\\S]*?</li>`))?.[0] || '';

test('PathList: an upcoming entry has its status and no way to generation; the current one is aria-current step', () => {
  const html = list(PATH);
  const upcoming = entryHtml(html, 's2');
  assert.match(upcoming, /<li data-path-entry="s2" data-status="upcoming">/);
  assert.doesNotMatch(upcoming, /href=|generat/i, 'an upcoming section never links to generation');
  assert.doesNotMatch(upcoming, /aria-current/);
  assert.match(entryHtml(html, 's1'), /aria-current="step"/);
  assert.equal(count(html, /aria-current=/g), 1);
  assert.match(upcoming, /data-path-changed="added"/);
  assert.equal(count(html, /data-path-changed=/g), 1);
  assert.equal(count(html, /data-path-entry="/g), 3, 'a 3-entry path renders 3 entries');
  assert.match(entryHtml(html, 's3'), /data-status="optional"[\s\S]*border-dashed/, 'optional is a dashed ring');
  // Glyphs: ✓ completed, ● current, ○ upcoming, ↺ needs review, a struck-through skipped section.
  const all = list([entry('a', 1, 'completed'), entry('b', 2, 'needs_review'), entry('c', 3, 'skipped')]);
  assert.match(entryHtml(all, 'a'), /✓/);
  assert.match(entryHtml(all, 'b'), /↺/);
  assert.match(entryHtml(all, 'c'), /line-through/);
  assert.match(entryHtml(html, 's1'), /●/);
  assert.match(upcoming, /○/);
});

test('PathList: a purpose shows inline only for the entry opened; collapsed it is a strip of glyphs, no titles', () => {
  assert.doesNotMatch(list(PATH), /data-path-purpose/);
  const open = list(PATH.map(e => (e.id === 's2' ? { ...e, open: true } : e)));
  assert.match(entryHtml(open, 's2'), /<p data-path-purpose="true"[^>]*>Why section 2 matters\.<\/p>/);
  assert.equal(count(open, /data-path-purpose/g), 1);
  const strip = list(PATH, false);
  assert.match(strip, /^<div aria-hidden="true" data-path-strip="true"/);
  assert.doesNotMatch(strip, /Section 1|data-path-entry|<button/);
  assert.equal(count(strip, /data-status="/g), 3);
});

test('ContentsRail: entries with no status (the heading rail) render exactly the markup of today', () => {
  assert.equal(rail({ entries: OLD_ENTRIES }), OLD_RAIL);
  assert.equal(list(OLD_ENTRIES, false), OLD_TICKS);
  assert.equal(list(OLD_ENTRIES, true), OLD_LIST);
  assert.equal(rail({ entries: [] }), '');
});


test('ContentsRail: a journey path in the canvas frame - glyph strip, a Path toggle for the keyboard, pinned open on review', () => {
  const html = rail({ entries: PATH, placement: 'canvas' });
  assert.match(html, /^<div data-contents-rail="true" data-placement="canvas" class="absolute top-1\/2 right-0 /);
  assert.match(html, /<button type="button" data-path-toggle="true" aria-expanded="false"[^>]*>Path<\/button>/);
  assert.match(html, /data-path-strip/);
  assert.match(html, /<nav aria-label="Learning path" hidden=""/);
  const pinned = rail({ entries: PATH, placement: 'canvas', pinned: true });
  assert.match(pinned, /<nav aria-label="Learning path" class=/, 'pinned: the list is shown');
  // Pinned, the toggle can change nothing: disabled, and honestly expanded.
  assert.match(pinned, /<button type="button" data-path-toggle="true" aria-expanded="true" disabled=""/);
  assert.equal(count(pinned, /data-path-entry="/g), 3);
  // Hover, the toggle and focus each hold it open on their own, so the toggle never hides a list hover opened.
  const src = read('ContentsRail.jsx');
  assert.match(src, /shown = pinnedOpen \|\| hover \|\| toggled \|\| focus/);
  assert.match(src, /onClick=\{\(\) => setToggled\(value => !value\)\}/);
  assert.match(src, /onFocus=\{path \? \(\) => setFocus\(true\) : undefined\}/);
  assert.match(src, /onBlur=\{path \? event => \{ if \(!event\.currentTarget\.contains\(event\.relatedTarget\)\) setFocus\(false\); \} : undefined\}/);
});

// docs/features/learn-canvas-blocks.md, "Canvas utilities never cover authored content": the open path list, pinned or
// opened, never meets the composer column, the tray, the chat sheet, the Rabbit Hole navigator, the minimap or the tools.
// Frame coordinates as measured on the keyless stack (task-11a J3: panel open, the sheet at 231-743) and derived for the
// others (DOCK_WIDTH 780 centred between the strip's side columns, the 84px tool and dive gutters, the strip's top as its
// tallest column: the composer with the tray).
const VIEWPORTS = {
  '1440x1000 panel open': { frame: { width: 960, height: 944 }, rail: { left: 903, top: 380, right: 947, bottom: 562 }, navigator: { left: 860, top: 2, right: 944, bottom: 46 }, tools: { left: 0, top: 0, right: 84, bottom: 742 },
    strip: { left: 0, top: 742, right: 960, bottom: 944 }, column: { left: 231, top: 742, right: 743, bottom: 928 }, sheet: { left: 231, top: 510, right: 743, bottom: 726 }, minimap: { left: 757, top: 800, right: 940, bottom: 924 } },
  '1440x1000 panel closed': { frame: { width: 1440, height: 944 }, rail: { left: 1383, top: 380, right: 1427, bottom: 562 }, navigator: { left: 1340, top: 2, right: 1424, bottom: 46 }, tools: { left: 0, top: 0, right: 84, bottom: 742 },
    strip: { left: 0, top: 742, right: 1440, bottom: 944 }, column: { left: 330, top: 742, right: 1110, bottom: 928 }, sheet: { left: 330, top: 480, right: 1110, bottom: 726 }, minimap: { left: 1237, top: 800, right: 1420, bottom: 924 } },
  '1720x1100': { frame: { width: 1720, height: 1044 }, rail: { left: 1663, top: 430, right: 1707, bottom: 612 }, navigator: { left: 1620, top: 2, right: 1704, bottom: 46 }, tools: { left: 0, top: 0, right: 84, bottom: 842 },
    strip: { left: 0, top: 842, right: 1720, bottom: 1044 }, column: { left: 470, top: 842, right: 1250, bottom: 1028 }, sheet: { left: 470, top: 560, right: 1250, bottom: 826 }, minimap: { left: 1517, top: 900, right: 1700, bottom: 1024 } },
};
const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const inputOf = (v, over = {}) => ({ gutter: v.rail, column: v.column, sheet: v.sheet, ceiling: v.navigator.bottom, floor: v.strip.top, toolsRight: v.tools.right, ...over });

test('flyoutRect: pinned or opened, the path list never meets the composer, tray, sheet, navigator, minimap or tools, at 1440 (panel open and closed) and 1720', () => {
  for (const [name, v] of Object.entries(VIEWPORTS)) {
    for (const [pinned, empty] of [[true, true], [true, false], [false, true]]) {
      const r = flyoutRect(inputOf(v, { pinned, empty })), at = `${name} ${pinned ? 'pinned' : 'opened'}${empty ? ' on an empty canvas' : ''}`;
      assert.ok(r, at);
      for (const [what, box] of Object.entries({ column: v.column, sheet: v.sheet, navigator: v.navigator, minimap: v.minimap, strip: v.strip, rail: v.rail, tools: v.tools })) assert.ok(!meets(r, box), `${at} meets the ${what}`);
      assert.ok(r.left >= 0 && r.top >= 0 && r.right <= v.rail.left && r.bottom <= v.frame.height, `${at} inside the frame, left of the rail`);
      assert.ok(r.right - r.left >= 128 && r.bottom - r.top >= 160, `${at} big enough to read`);
      if (pinned) assert.ok(r.left >= v.column.right || r.bottom <= Math.min(v.sheet.top, v.column.top), `${at} beside the composer column or above the sheet`);
    }
  }
  // 1440 with the panel open: the side room is 144px, so on the empty canvas of a path review the pinned list takes the free
  // canvas above the sheet, tray and composer - 320px wide, right-aligned to the rail - instead of wrapping a word per line.
  const v = VIEWPORTS['1440x1000 panel open'];
  const above = flyoutRect(inputOf(v, { pinned: true, empty: true }));
  assert.deepEqual(above, { left: 575, top: 54, right: 895, bottom: 502 });
  assert.ok(above.right - above.left >= 240);
  // No sheet open: it ends above the tray and composer instead.
  assert.deepEqual(flyoutRect(inputOf(v, { sheet: null, pinned: true, empty: true })), { left: 575, top: 54, right: 895, bottom: 734 });
  // Cards on the canvas, or too little height above a tall sheet: the side place, as before.
  assert.deepEqual(flyoutRect(inputOf(v, { pinned: true, empty: false })), { left: 751, top: 54, right: 895, bottom: 734 });
  assert.deepEqual(flyoutRect(inputOf(v, { sheet: { ...v.sheet, top: 200 }, pinned: true, empty: true })), { left: 751, top: 54, right: 895, bottom: 734 });
  // Never left of the tools: a narrow canvas gives the list what is between them and the rail.
  assert.deepEqual(flyoutRect(inputOf(v, { toolsRight: 640, pinned: true, empty: true })), { left: 648, top: 54, right: 895, bottom: 502 });
  // Room beside the column (1440 panel closed, 1720): the side place, unchanged, even on an empty canvas.
  assert.deepEqual(flyoutRect(inputOf(VIEWPORTS['1440x1000 panel closed'], { pinned: true, empty: true })), { left: 1119, top: 54, right: 1375, bottom: 734 });
  assert.deepEqual(flyoutRect(inputOf(VIEWPORTS['1720x1100'], { pinned: true, empty: true })), { left: 1399, top: 54, right: 1655, bottom: 834 });
  // Opened (hover, focus, the toggle) is unchanged: full width, ending above the sheet.
  assert.deepEqual(flyoutRect(inputOf(v, { pinned: false, empty: true })), { left: 639, top: 54, right: 895, bottom: 502 });
  // No room beside the column and cards on the canvas: nothing is pinned (the strip stays, hover opens it); opened, it still finds a place.
  const tight = inputOf(v, { column: { ...v.column, right: 820 } });
  assert.equal(flyoutRect({ ...tight, pinned: true }), null);
  assert.ok(flyoutRect({ ...tight, pinned: false }));
  // A tall sheet and no room beside: nothing opens rather than covering it.
  assert.equal(flyoutRect({ ...tight, sheet: { ...v.sheet, top: 150 }, pinned: false }), null);
});

test('canvasEmpty: only a canvas with no card, ink, shape, note, text, divider or placed chat lets the pinned list use the free canvas', () => {
  // `content` is what AdaptiveCanvas publishes through onState: strokes + shapes + items (notes, text, dividers) + blocks.
  assert.equal(canvasEmpty({ content: 0, cards: [] }, []), true);
  assert.equal(canvasEmpty({ content: 1, cards: [] }, []), false, 'one ink stroke, shape, note, text box or divider, and no card');
  assert.equal(canvasEmpty({ content: 1, cards: [['b1', null, null]] }, []), false, 'a card');
  assert.equal(canvasEmpty({ content: 0, cards: [] }, [{ id: 'chat-1' }]), false, 'a chat placed on the canvas (not in content)');
  // Before the canvas has reported, nothing is assumed empty: the list keeps the side place.
  assert.equal(canvasEmpty({ grid: false, outline: [] }, []), false);
  assert.equal(canvasEmpty(undefined, []), false);
});

test('ContentsRail.jsx: the flyout is placed from the live canvas (composer column, sheet, bottom strip, navigator, right-docked tools)', () => {
  const src = read('ContentsRail.jsx');
  for (const selector of ['[data-canvas-composer]', '[data-chat-sheet]', '[data-canvas-bottom]', '[data-dive-gutter] > *, [data-gutter-top] > *', '[data-tool-gutter]']) assert.ok(src.includes(`'${selector}'`), selector);
  assert.match(src, /new ResizeObserver\(measure\)/);
  // Pinned only when there is room; otherwise the toggle works and says it is collapsed.
  assert.match(src, /const pinnedOpen = pinned && place\?\.pin !== null/);
  assert.match(src, /disabled=\{pinnedOpen\}/);
});

test('LearnPage.jsx: the journey rail sits inside the canvas frame whatever the panel, the heading rail only without a path', () => {
  const page = read('LearnPage.jsx');
  const frame = page.indexOf('aria-label="Lesson canvas"'), at = page.indexOf('<ContentsRail placement="canvas"'), panel = page.indexOf('<ResizableSidePanel aria-label="Learn agent chat"');
  assert.ok(frame > 0 && at > frame && at < panel, 'inside the canvas frame div, before the Learn agent chat panel');
  assert.match(page, /\{journey\.path && <ContentsRail placement="canvas" entries=\{pathEntries\(journey\.path, journey\.prevPath\)/);
  assert.match(page, /pinned=\{journey\.journey\?\.state === 'path_review'\}/);
  // A pinned list may use the free canvas above the composer only while the canvas holds nothing at all (canvasEmpty).
  assert.match(page, /empty=\{canvasEmpty\(canvasState, exchanges\)\}/);
  assert.match(page, /edgeInset=\{journey\.path \? 52 : \(!panelOpen && canvasOutline\.length \? 52 : 0\)\}/);
  assert.match(page, /\{!panelOpen && !journey\.path && <ContentsRail entries=\{canvasOutline\.map\(/);
  // A materialized section frames its heading; any other entry opens its purpose, with no request.
  assert.match(page, /entry\.heading_block_id \? canvasApi\.current\?\.showSection\(entry\.heading_block_id\) : setOpenEntry\(/);
});

test('LearnPage.jsx: the materializer may read the canvas only once its board is restored (server copy, canvasEpoch) and it has reported', () => {
  const page = read('LearnPage.jsx');
  assert.match(page, /const \[restoredBoard, setRestoredBoard\] = useState\(null\);/);
  assert.match(page, /\.finally\(\(\) => \{ if \(live\) setRestoredBoard\(boardPath\); \}\);/);
  assert.match(page, /useEffect\(\(\) => \{ if \(restoredBoard === boardPath\) journey\.canvasReady\?\.\(\); \}, \[restoredBoard, boardPath, canvasState, journey\.canvasReady\]\);/);
});

// ---- The materialization trigger (§6.5, R5, ruling C-3): after the action that planned the current section, and on a
// load once the canvas is ready, never twice ----
// persist() (LP1 Task 15) records the flow ids it saved in `persisted` and answers the next of `saves` (a result, or a
// function giving one or a promise), else a saved board.
const fakeCanvas = (seed = [], { failReserve = 0, saves = [] } = {}) => {
  const calls = [], flow = seed.map(block => ({ ...block })), persisted = [];
  let n = 0, fails = failReserve;
  return {
    calls, flow, persisted,
    persist: async () => {
      persisted.push(flow.map(block => block.id));
      const next = saves.shift();
      return typeof next === 'function' ? next() : next ?? { ok: true, local: true, remote: 'skipped' };
    },
    inserts: () => calls.filter(c => c[0] === 'insert'),
    blocks: () => flow,
    reserve: () => { if (fails > 0) { fails -= 1; throw new Error('no canvas column'); } return 'slot:1'; },
    release: () => {},
    showSection: id => calls.push(['show', id]),
    insertBlock: (block, options) => {
      calls.push(['insert', block, options]);
      n += 1;
      const at = options?.after ? flow.findIndex(b => b.id === options.after) + 1 : flow.length;
      flow.splice(at || flow.length, 0, { ...block, id: `b${n}` });
      return `b${n}`;
    },
  };
};
const reviewPath = { version: 1, sections: [
  { id: 's1', title: 'Classification vs regression', purpose: 'p', status: 'upcoming' },
  { id: 's2', title: 'From a linear score to probability', purpose: 'p', status: 'upcoming' }] };
const activePath = { ...reviewPath, version: 2, current_section_id: 's1', sections: reviewPath.sections.map(s => (s.id === 's1' ? { ...s, status: 'current' } : s)) };
const textStep = id => ({ step_id: id, role: 'explanation', make: { text: `${id} text` }, claims: [] });
const graphStep = { step_id: 'graph', role: 'interactive_visual', make: { command: 'graph', request: 'the sigmoid' }, claims: [] };
const sectionPlan = { section_id: 's1', path_version: 2, teaching_sequence: ['frame', 'explain', 'predict'].map(textStep) };
const activeJourney = (over = {}) => journeyOf({ state: 'active', revision: 6, active_section_id: 's1', path_version: 2, section_plan: sectionPlan, ...over });
const recorded = (heading, over = {}) => ok(activeJourney({ revision: 7, ...over, section_plan: { ...(over.section_plan || sectionPlan), heading_block_id: heading } }), null, activePath);
const review = () => ok(journeyOf({ state: 'path_review', path_version: 1 }), previewTray, reviewPath);
const GET = '/api/learn/journey?app=canvas-0a1b2c3d&board=main';
// canvas() is a getter, so a test can bring the canvas up later; the controller reads it only after canvasReady().
const scripted = (canvas, replies) => {
  const calls = [];
  const ctl = journeyController({ where: { app: APP, board: 'main' }, canvas, fetchJson: async (path, body, options) => {
    calls.push({ path, body, options });
    if (!replies.length) throw new Error(`unexpected request ${path}`);
    const reply = replies.shift();
    return typeof reply === 'function' ? reply(path, body) : reply;
  } });
  return { ctl, calls, view: () => ctl.view(), steps: () => calls.map(c => c.body?.action ?? (c.path === GET ? 'GET' : c.path)) };
};

test('controller: accept materializes the current section once and posts section_materialized; a failed post retries it, never redraws', async () => {
  const canvas = fakeCanvas();
  const h = scripted(() => canvas, [
    review(),
    ok(activeJourney(), null, activePath),
    { status: 500, d: { error: 'boom' } }, // section_materialized fails once: its retry re-posts it, nothing is drawn twice
    recorded('b1'),
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  assert.equal(h.view().prevPath, null);
  await h.view().answer('start');
  assert.deepEqual(h.steps(), ['GET', 'accept', 'section_materialized']);
  assert.deepEqual(h.calls[2].body, { app: APP, board: 'main', action: 'section_materialized', journey_id: 'j1', section_id: 's1', heading_block_id: 'b1', revision: 6 });
  assert.deepEqual(canvas.inserts().map(c => c[1].type), ['heading', 'explanation', 'explanation', 'explanation']);
  assert.deepEqual(canvas.calls.at(-1), ['show', 'b1'], 'the camera goes to the section start');
  assert.equal(h.view().tray.error.message, 'That did not go through.');
  await h.view().answer('retry');
  assert.deepEqual(h.steps(), ['GET', 'accept', 'section_materialized', 'section_materialized']);
  assert.equal(canvas.inserts().length, 4, 'no second materialization');
  assert.equal(h.view().journey.section_plan.heading_block_id, 'b1');
  assert.equal(h.view().prevPath, reviewPath, 'the rail diffs the accepted version with the one reviewed');
  assert.equal('materialized' in h.view(), false);
});

// Owner 2026-10-08 (r29): nextSection posts next_section with the journey's revision and draws the new current section as
// accept does; a refusal (409, e.g. the last section) draws nothing.
test('controller: nextSection posts next_section and draws the next section once; a refusal draws nothing', async () => {
  const canvas = fakeCanvas();
  const s2Plan = { section_id: 's2', path_version: 3, teaching_sequence: ['frame', 'explain'].map(textStep) };
  const movedPath = { ...activePath, version: 3, current_section_id: 's2', sections: activePath.sections.map(s => ({ ...s, status: s.id === 's1' ? 'skipped' : 'current' })) };
  const moved = over => ok(activeJourney({ revision: 9, active_section_id: 's2', path_version: 3, section_plan: s2Plan, ...over }), null, movedPath);
  const h = scripted(() => canvas, [recorded('b1'), moved(), ok(activeJourney({ revision: 10, active_section_id: 's2', path_version: 3, section_plan: { ...s2Plan, heading_block_id: 'b5' } }), null, movedPath),
    { status: 409, d: { error: 'next_section has no next section', journey: activeJourney({ revision: 10, active_section_id: 's2', path_version: 3, section_plan: { ...s2Plan, heading_block_id: 'b5' } }), path: movedPath, tray: null } }]);
  await h.ctl.refresh();
  h.view().canvasReady();
  const drawn = canvas.inserts().length;
  await h.view().nextSection();
  assert.deepEqual(h.steps().slice(-2), ['next_section', 'section_materialized']);
  assert.equal(h.calls.at(-2).body.revision, 7, 'with the journey revision');
  assert.deepEqual(canvas.inserts().slice(drawn).map(c => c[1].type), ['heading', 'explanation', 'explanation'], 'section 2 drawn once');
  await h.view().nextSection();
  assert.equal(canvas.inserts().length, drawn + 3, 'a refusal draws nothing');
});

test('controller: a load with no recorded heading waits for the ready canvas, re-reads, then draws the section once', async () => {
  const canvas = fakeCanvas();
  let up = null;
  const h = scripted(() => up, [ok(activeJourney(), null, activePath), ok(activeJourney(), null, activePath), recorded('b1')]);
  await h.ctl.refresh();
  await h.view().canvasReady();
  assert.deepEqual(h.steps(), ['GET'], 'no canvas yet: nothing scanned, nothing drawn');
  up = canvas;
  await h.view().canvasReady();
  assert.deepEqual(h.steps(), ['GET', 'GET', 'section_materialized'], 're-read first, then draw and record');
  assert.deepEqual(canvas.inserts().map(c => c[1].type), ['heading', 'explanation', 'explanation', 'explanation']);
  await h.view().canvasReady();
  await h.ctl.refresh().catch(() => {});
  assert.equal(canvas.inserts().length, 4, 'never twice');
});

test('controller: on a load, a heading stamped by an earlier visit is reused and only the missing steps are drawn', async () => {
  const canvas = fakeCanvas([{ id: 'h-old', type: 'heading', journey_section_id: 's1', journey_id: 'j1' }, { id: 'f-old', type: 'explanation', journey: { journey_id: 'j1', section_id: 's1', step_id: 'frame', claims: [] } }]);
  const h = scripted(() => canvas, [ok(activeJourney(), null, activePath), ok(activeJourney(), null, activePath), recorded('h-old')]);
  h.view().canvasReady();
  await h.ctl.refresh();
  assert.deepEqual(h.steps(), ['GET', 'GET', 'section_materialized']);
  assert.deepEqual(canvas.inserts().map(c => [c[1].journey.step_id, c[2]]), [['explain', { after: 'f-old' }], ['predict', { after: 'b1' }]]);
  assert.equal(h.calls[2].body.heading_block_id, 'h-old');
});

test('controller: on a load, a re-read that finds the heading recorded draws nothing', async () => {
  const canvas = fakeCanvas();
  const h = scripted(() => canvas, [ok(activeJourney(), null, activePath), recorded('h-other-tab')]);
  h.view().canvasReady();
  await h.ctl.refresh();
  assert.deepEqual(h.steps(), ['GET', 'GET']);
  assert.deepEqual(canvas.calls, []);
});

test('controller: a 409 on section_materialized re-reads and posts once more with the same heading, then it is recorded', async () => {
  const canvas = fakeCanvas();
  const h = scripted(() => canvas, [
    review(),
    ok(activeJourney(), null, activePath),
    { status: 409, d: { error: 'path_version', journey: activeJourney({ revision: 7 }), path: activePath, tray: null } },
    ok(activeJourney({ revision: 8 }), null, activePath),
    recorded('b1', { revision: 9 }),
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.deepEqual(h.steps(), ['GET', 'accept', 'section_materialized', 'GET', 'section_materialized']);
  assert.deepEqual([h.calls[4].body.heading_block_id, h.calls[4].body.revision], ['b1', 8]);
  assert.equal(h.view().journey.section_plan.heading_block_id, 'b1');
  assert.equal(canvas.inserts().length, 4);
});

test('controller: a failed step shows the error line, and Try again picks up at that step from the canvas', async () => {
  const canvas = fakeCanvas();
  const plan = { ...sectionPlan, teaching_sequence: [textStep('frame'), graphStep] };
  const h = scripted(() => canvas, [
    review(),
    ok(activeJourney({ section_plan: plan }), null, activePath),
    { status: 502, d: { error: 'model down' } },
    { status: 200, d: { result: 'artifact', block: { type: 'graph', title: 'Sigmoid' } } },
    recorded('b1', { section_plan: plan }),
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.equal(h.calls[2].path, '/api/learn/artifact');
  assert.deepEqual(h.calls[2].body, { app: APP, board: 'main', command: 'graph', args: 'the sigmoid', context: 'Journey section: Classification vs regression' });
  assert.ok(h.calls[2].options.signal instanceof AbortSignal, 'the artifact request can time out');
  assert.equal(h.view().tray.error.message, 'Part of this section could not be made.');
  assert.equal(h.view().busy, false, 'the composer is free again');
  assert.equal(canvas.inserts().length, 2);
  await h.view().answer('retry');
  assert.deepEqual(canvas.inserts().map(c => [c[1].type, c[2]]), [['heading', { into: 'slot:1' }], ['explanation', { after: 'b1' }], ['graph', { after: 'b2' }]]);
  assert.equal(h.calls.at(-1).body.action, 'section_materialized');
  assert.equal(h.view().tray, null);
});

test('controller: a paid step surfaces as a generation_proposal tray; Generate inserts it confirmed under its predecessor, Not now dismisses', async () => {
  const canvas = fakeCanvas();
  const paid = (step_id, command) => ({ step_id, role: 'interactive_visual', make: { command, request: 'why it saturates' }, claims: ['c/x'] });
  const plan = { ...sectionPlan, teaching_sequence: [textStep('frame'), paid('animate', 'animate'), paid('clip', 'animate')] };
  const h = scripted(() => canvas, [
    review(),
    ok(activeJourney({ section_plan: plan }), null, activePath),
    { status: 200, d: { result: 'paid_proposal', primitive: 'maths_animation', message: 'Generate this animation? It uses credits.', block: { type: 'mathAnimation', title: 'Saturation' } } },
    { status: 200, d: { result: 'paid_proposal', primitive: 'video_generate', message: 'Generate this clip? It uses credits.', block: { type: 'videoGenerate', title: 'Clip' } } },
    recorded('b1', { section_plan: plan }),
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.equal(h.calls.at(-1).body.action, 'section_materialized', 'a declined paid step is optional: the section is recorded');
  assert.deepEqual(canvas.inserts().map(c => c[1].type), ['heading', 'explanation'], 'nothing paid is generated on its own');
  const tray = h.view().tray;
  assert.equal(tray.mode, 'generation_proposal');
  assert.equal(tray.prompt, 'Generate this animation? It uses credits.');
  assert.deepEqual(tray.options, [{ id: 'generate', label: 'Generate' }, { id: 'not_now', label: 'Not now' }]);
  assert.match(render({ tray }), /data-mode="generation_proposal"/);
  const before = h.calls.length;
  await h.view().answer('generate');
  const [, block, options] = canvas.inserts().at(-1);
  assert.deepEqual(block, { type: 'mathAnimation', title: 'Saturation', confirmedStart: true, journey: { journey_id: 'j1', section_id: 's1', step_id: 'animate', claims: ['c/x'] } });
  assert.deepEqual(options, { after: 'b2' }, 'right after the step before it');
  assert.equal(h.view().tray.prompt, 'Generate this clip? It uses credits.', 'the next proposal');
  await h.view().answer('not_now');
  assert.equal(h.view().tray, null);
  assert.equal(canvas.inserts().length, 3, 'Not now inserts nothing');
  assert.equal(h.calls.length, before, 'Generate and Not now are local: no request');
});

test('controller: a throw inside the materializer shows the error line, and Try again runs it again', async () => {
  const canvas = fakeCanvas([], { failReserve: 1 });
  const h = scripted(() => canvas, [review(), ok(activeJourney(), null, activePath), recorded('b1')]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.equal(h.view().tray.error.message, 'This section could not be prepared.');
  assert.equal(h.view().busy, false);
  assert.deepEqual(canvas.inserts(), []);
  await h.view().answer('retry');
  assert.deepEqual(canvas.inserts().map(c => c[1].type), ['heading', 'explanation', 'explanation', 'explanation']);
  assert.equal(h.calls.at(-1).body.action, 'section_materialized');
  assert.equal(h.view().tray, null);
});

test('final review B-I1: a failed step or a throw keeps its Try again through Dismiss and a typed turn, and the Retry still works', async () => {
  for (const [failure, message] of [['step', 'Part of this section could not be made.'], ['throw', 'This section could not be prepared.']]) {
    const canvas = fakeCanvas([], { failReserve: failure === 'throw' ? 1 : 0 });
    const plan = { ...sectionPlan, teaching_sequence: [textStep('frame'), graphStep] };
    const h = scripted(() => canvas, [
      review(),
      ok(activeJourney({ section_plan: plan }), null, activePath),
      ...(failure === 'step' ? [{ status: 502, d: { error: 'model down' } }] : []),
      { status: 200, d: { result: 'artifact', block: { type: 'graph', title: 'Sigmoid' } } },
      recorded('b1', { section_plan: plan }),
    ]);
    await h.ctl.refresh();
    h.view().canvasReady();
    await h.view().answer('start');
    assert.equal(h.view().tray.error.message, message);
    assert.doesNotMatch(render({ tray: h.view().tray }), /data-tray-dismiss/, `${failure}: no Dismiss on the line`);
    await h.view().answer('dismiss');
    assert.equal(h.view().tray?.error?.message, message, `${failure}: Dismiss leaves it`);
    assert.deepEqual(await h.view().handleText('What is a sigmoid?'), { handled: false }, 'a question still goes to the Tutor');
    assert.equal(h.view().tray?.error?.message, message, `${failure}: a typed turn leaves it`);
    await h.view().answer('retry');
    assert.equal(h.calls.at(-1).body.action, 'section_materialized', `${failure}: the Retry draws the rest and records it`);
    assert.deepEqual(canvas.inserts().map(c => c[1].type), ['heading', 'explanation', 'graph']);
    assert.equal(h.view().tray, null);
  }
});

test('final review B-I1: the kept line goes once the section it would retry is recorded elsewhere (a load finds the heading)', async () => {
  const canvas = fakeCanvas();
  const plan = { ...sectionPlan, teaching_sequence: [textStep('frame'), graphStep] };
  const h = scripted(() => canvas, [review(), ok(activeJourney({ section_plan: plan }), null, activePath), { status: 502, d: { error: 'model down' } }, recorded('h-other-tab', { section_plan: plan })]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.equal(h.view().tray.error.message, 'Part of this section could not be made.');
  await h.ctl.refresh();
  assert.equal(h.view().tray, null, 'no Retry for a section the server holds');
});

// ---- Save before commit (architecture §6.5.5, LP1 Task 15, owner blocker): artifacts, then a saved board, then
// section_materialized. A learner who leaves in between finds the section resumable, never falsely built, never made twice ----
const UNSAVED = 'This section is on the canvas but could not be saved yet.';
const artifactPosts = h => h.calls.filter(c => c.path === '/api/learn/artifact').length;

test('regression 1: leaving after the steps are drawn but before persist() resolves posts nothing; the reload draws the section exactly once', async () => {
  let entered;
  const inWindow = new Promise(resolve => { entered = resolve; });
  // The first visit: the save never resolves - the page unloads inside the window and the controller is dropped.
  const first = fakeCanvas([], { saves: [() => { entered(); return new Promise(() => {}); }] });
  const h = scripted(() => first, [review(), ok(activeJourney(), null, activePath)]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await Promise.race([inWindow, h.view().answer('start')]);
  assert.equal(first.inserts().length, 4, 'every step is on the canvas');
  assert.deepEqual(h.steps(), ['GET', 'accept'], 'section_materialized is never posted before the save resolves');
  const plan = h.view().journey.section_plan;
  assert.deepEqual([plan.heading_block_id, plan.generation_state], [undefined, undefined], 'the server holds no heading and no generated state');
  // The reload: a new controller over a canvas holding none of the blocks (nothing reached storage).
  const fresh = fakeCanvas();
  // The third reply answers the later load (review round 1): it reads the journey, reaches due() and draws nothing.
  const r = scripted(() => fresh, [ok(activeJourney(), null, activePath), ok(activeJourney(), null, activePath), recorded('b1'), recorded('b1')]);
  r.view().canvasReady();
  await r.ctl.refresh();
  assert.deepEqual(r.steps(), ['GET', 'GET', 'section_materialized']);
  assert.deepEqual(fresh.inserts().map(c => c[1].type), ['heading', 'explanation', 'explanation', 'explanation']);
  assert.deepEqual(fresh.persisted, [['b1', 'b2', 'b3', 'b4']], 'saved once, with every block, before the post');
  await r.view().canvasReady();
  await r.ctl.refresh();
  assert.deepEqual(r.steps(), ['GET', 'GET', 'section_materialized', 'GET'], 'the later load read the journey');
  assert.equal(fresh.inserts().length, 4, 'materialized exactly once');
  assert.equal(fresh.persisted.length, 1);
});

test('regression 2: blocks saved but section_materialized never posted - the reload reuses every stamped block, saves, then posts; nothing is made again', async () => {
  const plan = { ...sectionPlan, teaching_sequence: [textStep('frame'), graphStep, textStep('predict')] };
  const stamp = (id, step_id, type = 'explanation') => ({ id, type, journey: { journey_id: 'j1', section_id: 's1', step_id, claims: [] } });
  const canvas = fakeCanvas([{ id: 'h-old', type: 'heading', level: 1, journey_section_id: 's1', journey_id: 'j1' }, stamp('f-old', 'frame'), stamp('g-old', 'graph', 'graph'), stamp('p-old', 'predict')]);
  let savesAtPost = null;
  const h = scripted(() => canvas, [
    ok(activeJourney({ section_plan: plan }), null, activePath),
    ok(activeJourney({ section_plan: plan }), null, activePath),
    () => { savesAtPost = canvas.persisted.length; return recorded('h-old', { section_plan: plan }); },
  ]);
  h.view().canvasReady();
  await h.ctl.refresh();
  assert.deepEqual(canvas.inserts(), [], 'no step is drawn again');
  assert.equal(artifactPosts(h), 0, 'no artifact is made again');
  assert.deepEqual(h.steps(), ['GET', 'GET', 'section_materialized']);
  assert.equal(savesAtPost, 1, 'the board is saved before the post');
  assert.equal(h.calls[2].body.heading_block_id, 'h-old');
  assert.equal(h.view().journey.section_plan.heading_block_id, 'h-old');
  assert.equal(h.view().tray, null);
});

test('regression 3: a failed save posts nothing and shows the unsaved line; a load meanwhile only saves again; Retry saves and posts, making nothing again', async () => {
  const plan = { ...sectionPlan, teaching_sequence: [textStep('frame'), graphStep] };
  const failed = { ok: false, local: true, remote: 'failed' };
  const canvas = fakeCanvas([], { saves: [failed, failed] });
  const h = scripted(() => canvas, [
    review(),
    ok(activeJourney({ section_plan: plan }), null, activePath),
    { status: 200, d: { result: 'artifact', block: { type: 'graph', title: 'Sigmoid' } } },
    ok(activeJourney({ section_plan: plan }), null, activePath), // the load while the error waits
    recorded('b1', { section_plan: plan }),
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.deepEqual(h.steps(), ['GET', 'accept', '/api/learn/artifact'], 'nothing is posted after the failed save');
  assert.equal(h.view().tray.error.message, UNSAVED);
  assert.match(render({ tray: h.view().tray }), /data-tray-retry/);
  assert.equal(h.view().busy, false, 'the composer is free again');
  await h.ctl.refresh();
  assert.deepEqual(h.steps(), ['GET', 'accept', '/api/learn/artifact', 'GET'], 'a load does not run the section again');
  assert.equal(canvas.persisted.length, 2, 'the load saves again (and fails again): nothing drawn, nothing posted');
  assert.equal(canvas.inserts().length, 3);
  assert.equal(h.view().tray.error.message, UNSAVED);
  await h.view().answer('retry');
  assert.equal(canvas.persisted.length, 3, 'Retry saves again');
  assert.deepEqual(h.steps(), ['GET', 'accept', '/api/learn/artifact', 'GET', 'section_materialized']);
  assert.deepEqual(h.calls[4].body, { app: APP, board: 'main', action: 'section_materialized', journey_id: 'j1', section_id: 's1', heading_block_id: 'b1', revision: 6 });
  assert.equal(canvas.inserts().length, 3, 'nothing is drawn again');
  assert.equal(artifactPosts(h), 1, 'nothing is made again');
  assert.equal(h.view().journey.section_plan.heading_block_id, 'b1');
  assert.equal(h.view().tray, null);
});

test('review round 1: the unsaved line cannot be dismissed or typed away; a later load still saves and posts, making nothing again', async () => {
  const plan = { ...sectionPlan, teaching_sequence: [textStep('frame'), graphStep] };
  const canvas = fakeCanvas([], { saves: [{ ok: false, local: false, remote: 'skipped' }] });
  const h = scripted(() => canvas, [
    review(),
    ok(activeJourney({ section_plan: plan }), null, activePath),
    { status: 200, d: { result: 'artifact', block: { type: 'graph', title: 'Sigmoid' } } },
    ok(activeJourney({ section_plan: plan }), null, activePath), // the later load
    recorded('b1', { section_plan: plan }),
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  const html = render({ tray: h.view().tray });
  assert.match(html, /data-tray-retry/);
  assert.doesNotMatch(html, /data-tray-dismiss/, 'no Dismiss on the unsaved line');
  await h.view().answer('dismiss');
  assert.equal(h.view().tray.error.message, UNSAVED, 'Dismiss leaves it');
  assert.deepEqual(await h.view().handleText('What is a sigmoid?'), { handled: false }, 'a question still goes to the Tutor');
  assert.equal(h.view().tray.error.message, UNSAVED, 'a typed turn leaves it');
  await h.ctl.refresh();
  assert.deepEqual(h.steps(), ['GET', 'accept', '/api/learn/artifact', 'GET', 'section_materialized'], 'the load saves, then posts');
  assert.equal(canvas.persisted.length, 2);
  assert.equal(canvas.inserts().length, 3, 'nothing is drawn again');
  assert.equal(artifactPosts(h), 1, 'nothing is made again');
  assert.equal(h.view().journey.section_plan.heading_block_id, 'b1');
  assert.equal(h.view().tray, null, 'the line goes once the section is recorded');
});

// ---- Review round 3: section_materialized names its journey; a post for a journey that is gone records nothing ----
test('review round 3: another tab archives and starts a new journey before the post - the replay is refused as journey_changed and nothing is recorded or retried', async () => {
  const canvas = fakeCanvas();
  const j2 = journeyOf({ id: 'j2', revision: 1, state: 'intake' }); // the new journey another tab started
  const h = scripted(() => canvas, [
    review(),
    ok(activeJourney(), null, activePath),
    { status: 409, d: { error: 'revision', journey: j2, path: null, tray: goalTray } }, // moved on: journeyRequest replays once
    { status: 409, d: { error: 'journey_changed', journey: j2, path: null, tray: goalTray } }, // the replay names j1: refused
    ok(j2, goalTray), // a read, if one were made
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.deepEqual(h.steps(), ['GET', 'accept', 'section_materialized', 'section_materialized'], 'one replay, then nothing: no re-read, no third post');
  assert.deepEqual(h.calls.slice(2).map(c => [c.body.journey_id, c.body.heading_block_id, c.body.revision]), [['j1', 'b1', 6], ['j1', 'b1', 1]]);
  assert.equal(h.view().journey.id, 'j2');
  assert.equal(h.view().journey.section_plan, undefined, 'nothing of j1 is recorded on j2');
  assert.equal(h.view().tray.id, goalTray.id, 'the new journey asks its own question, with no error line');
  assert.equal(h.view().tray.error, undefined);
});

// ---- Review round 2: the unsaved state and the run guard are keyed by journey and section ----
test('review round 2: a failed save, then Start new with a journey whose first section reuses the id - a fresh section is drawn, the old heading is never posted, the old line goes', async () => {
  const canvas = fakeCanvas([], { saves: [{ ok: false, local: false, remote: 'skipped' }] });
  const h = scripted(() => canvas, [
    review(),
    ok(activeJourney(), null, activePath), // accept: j1's s1 is drawn (b1-b4), its save fails
    ok(activeJourney({ id: 'j2', revision: 1 }), null, activePath), // a fast start replacing j1: j2, its s1 current and planned
    recorded('b5', { id: 'j2', revision: 2 }),
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.equal(h.view().tray.error.message, UNSAVED);
  await h.view().handleText('I want to learn transformers');
  assert.equal(h.view().tray.id, 'clarification:live');
  await h.view().answer('start_new');
  assert.deepEqual(h.steps(), ['GET', 'accept', 'start', 'section_materialized']);
  assert.equal(h.calls[3].body.heading_block_id, 'b5', 'the new heading, never the b1 of j1');
  const inserts = canvas.inserts();
  assert.equal(inserts.length, 8, 'the section of j2 is drawn afresh: a heading and three steps');
  assert.deepEqual(inserts.slice(4).map(c => [c[1].type, c[1].journey_id ?? c[1].journey.journey_id]), [['heading', 'j2'], ['explanation', 'j2'], ['explanation', 'j2'], ['explanation', 'j2']]);
  assert.equal(canvas.persisted.length, 2, 'saved before the post');
  assert.equal(h.view().journey.section_plan.heading_block_id, 'b5');
  assert.equal(h.view().tray, null, 'the old unsaved line is gone');
});

test('review round 2: an unsaved section another tab records meanwhile drops the line, and nothing is posted again', async () => {
  const canvas = fakeCanvas([], { saves: [{ ok: false, local: false, remote: 'skipped' }] });
  const h = scripted(() => canvas, [review(), ok(activeJourney(), null, activePath), recorded('h-other-tab')]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.equal(h.view().tray.error.message, UNSAVED);
  await h.ctl.refresh();
  assert.deepEqual(h.steps(), ['GET', 'accept', 'GET']);
  assert.equal(h.view().tray, null, 'no unsaved line for a section the server holds');
  assert.equal(canvas.persisted.length, 1);
});

// ---- Final review B-C1: the learner leaves mid-section inside the app (Home, the sidebar, a Rabbit Hole remounting the
// page). The old canvas answers inserts without drawing them and saves its stale board ok (as AdaptiveCanvas did before
// its alive guard); useJourney's unmount disposes the controller. ----
const leavingCanvas = () => {
  const canvas = fakeCanvas(), draw = canvas.insertBlock;
  let alive = true, ghosts = 0;
  return Object.assign(canvas, { leave: () => { alive = false; }, insertBlock: (block, options) => (alive ? draw(block, options) : `ghost${++ghosts}`) });
};
test('final review B-C1: leaving mid-section stops before the next paid call and records nothing; a fresh controller resumes from the stored copy and records once', async () => {
  const shot = (step_id, request) => ({ step_id, role: 'interactive_visual', make: { command: 'graph', request }, claims: [] });
  const plan = { ...sectionPlan, teaching_sequence: [shot('one', 'first'), shot('two', 'second'), shot('three', 'third')] };
  const made = title => ({ status: 200, d: { result: 'artifact', block: { type: 'graph', title } } });
  const old = leavingCanvas();
  const h = scripted(() => old, [
    review(),
    ok(activeJourney({ section_plan: plan }), null, activePath),
    made('one'),
    () => { old.leave(); h.ctl.dispose?.(); return made('two'); }, // the learner clicks Home while step 2 is made
  ]);
  await h.ctl.refresh();
  h.view().canvasReady();
  await h.view().answer('start');
  assert.deepEqual(h.steps(), ['GET', 'accept', '/api/learn/artifact', '/api/learn/artifact'], 'no paid call for step 3, no section_materialized');
  assert.deepEqual(old.flow.map(b => b.type), ['heading', 'graph'], 'what reached the board (and the debounced save)');
  // The return: a fresh controller over the stored copy (ids renamed apart from the fake's counter).
  const fresh = fakeCanvas(old.flow.map(b => ({ ...b, id: `saved-${b.id}` })));
  const r = scripted(() => fresh, [
    ok(activeJourney({ section_plan: plan }), null, activePath),
    ok(activeJourney({ section_plan: plan }), null, activePath),
    made('two'), made('three'),
    recorded('saved-b1', { section_plan: plan }),
  ]);
  r.view().canvasReady();
  await r.ctl.refresh();
  assert.deepEqual(r.steps(), ['GET', 'GET', '/api/learn/artifact', '/api/learn/artifact', 'section_materialized']);
  assert.deepEqual(r.calls.filter(c => c.path === '/api/learn/artifact').map(c => c.body.args), ['second', 'third'], 'step 1 is not made again');
  assert.equal(r.calls.at(-1).body.heading_block_id, 'saved-b1');
  assert.deepEqual(fresh.inserts().map(c => c[1].journey.step_id), ['two', 'three']);
  assert.equal(r.view().journey.section_plan.heading_block_id, 'saved-b1');
});

test('final review B-C1: useJourney disposes its controller on unmount or a board change, and a later mount builds a fresh one', () => {
  const src = read('LearnJourney.jsx');
  assert.match(src, /useEffect\(\(\) => \{ ctl\?\.refresh\(\); return \(\) => \{ ctl\?\.dispose\(\); if \(ref\.current === ctl\) ref\.current = null; \}; \}, \[ctl\]\);/);
  assert.match(src, /const fetchJson = \(\.\.\.args\) => \(s\.dead \? Promise\.reject\(new Error\('This journey view has closed\.'\)\) : send\(\.\.\.args\)\);/);
});

// ---- useTutor on a journey canvas (LP1 Task 12; architecture §0 D1 and D6, §7.2, §12): the real hook, rendered once on
// the server (its effects never run), with ask and voiceTurn driven over the journey controller above. A fake fetch
// answers the Tutor routes and writes their requests into the same call log as the journey's, so the order shows. No
// network, no model, no Send. ----
const SIGMOID = {
  concepts: { sigmoid: { label: 'Sigmoid', names: ['sigmoid'], prerequisites: [] } },
  claims: Object.fromEntries(['range', 'shape'].map(id => [`sigmoid/${id}`, { concept: 'sigmoid', statement: `The sigmoid has its ${id}.`, ideas: [`its ${id}`], misconceptions: [], prerequisites: [], drawn: 'one S curve' }])),
};
const settled = (claim, seq) => ({ seq, concept: 'sigmoid', claim, result: 'pass', kind: 'demonstrated_here', settled: true, evaluator: 'jev', source: 'free_text', ref: {} });
const PLAN = { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'A sigmoid squashes any number into 0 to 1.' }] };
const diagnosing = (over = {}) => journeyOf({ state: 'diagnostic', diagnostic: { probes }, registry: SIGMOID, evidence: { seq: 0, events: [] }, ...over });
// h: a harness (its journey already read). evaluate: the evaluate route's reply; by default an evaluator error, which
// stores nothing. blocks: the canvas blocks (canvasApi.blocks and block(id)).
function tutorOn(h, { evaluate = { status: 'error', evaluator: 'jev', events: [] }, blocks = [], plan = PLAN, board = 'main' } = {}) {
  const storage = new Map(), began = [];
  const globals = {
    window: { dispatchEvent: () => true },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    localStorage: { getItem: () => null },
    fetch: async (path, options) => {
      h.calls.push({ path, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(path === '/api/learn/tutor/evaluate' ? evaluate : plan), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  let tutor = null;
  const journey = h.view();
  const Page = () => {
    tutor = useTutor({ app: { name: APP, org: 'o', email: 'e@x.com' }, board, access: { app: APP }, canvasApi: { current: { blocks: () => blocks, block: id => blocks.find(block => block.id === id) || null } }, canvasState: { card: null }, dive: { tree: null, suggestionCard: null }, journey });
    return null;
  };
  renderToStaticMarkup(createElement(Page));
  return {
    tutor, began,
    // ask.jsx's begin: where the composer draws the turn's bubbles and exchange, marked at its place in the call log.
    begin: () => began.push(h.calls.length),
    run: async fn => {
      const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
      for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
      try { return await fn(tutor); } finally {
        for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
      }
    },
    stored: () => JSON.parse(storage.get('small.tutor:o:e@x.com:journey:j1') ?? 'null'),
    storage,
  };
}
const tutorRoutes = h => h.calls.filter(c => c.path.startsWith('/api/learn/tutor/'));

// Task 11b (owner eleventh message 6-7): a blank canvas no longer keeps the Learn chat - natural typing there is Auto Tutor
// input with the plain-canvas Tutor (source canvas), and a journey is never a prerequisite; the journey Tutor runs only on a journey.
test('useTutor on a journey canvas: the journey Tutor is active there; a blank canvas gets the plain-canvas Auto Tutor', async () => {
  const h = harness(ok(journeyOf({ state: 'active', registry: SIGMOID }), null));
  await h.refresh();
  assert.equal(tutorOn(h).tutor.active, true);
  const blank = harness(none);
  await blank.refresh();
  // Which Tutor answers (journey or plain canvas) is asserted through the resolver in learn-tutor-domains.test.mjs and A-K.
  assert.equal(tutorOn(blank).tutor.active, true, 'a blank canvas: the plain-canvas Auto Tutor');
});

test('useTutor on a journey canvas: a free-text probe answer is runTurn({ plan: false }) - the evaluate body names the journey, board, probe and turn; no planner call - then the walker steps on', async () => {
  const j = diagnosing();
  const h = harness(ok(j, explainTray), [{ status: 200, d: { kind: 'tray_answer' } }, ok({ ...j, revision: 5 }, previewTray)]);
  await h.refresh();
  const t = tutorOn(h, { evaluate: { status: 'settled', evaluator: 'jev', events: [], journey: { events: [settled('sigmoid/shape', 1)], seq: 1 } } });
  const reply = await t.run(tutor => tutor.ask({ raw: 'It squashes any number into 0 to 1', begin: t.begin }));
  assert.equal(reply.handled, true);
  assert.deepEqual(h.actions(), ['resolve', '/api/learn/tutor/evaluate', 'probe_advance'], 'no /api/learn/tutor/plan: plan false');
  const { turn_id, ...body } = h.calls[2].body;
  assert.deepEqual(body, { app: APP, board: 'main', journey_id: 'j1', message: 'It squashes any number into 0 to 1', claims: ['sigmoid/shape'], answering: true, question: 'Explain the sigmoid in your words.', probe_id: 'p3' });
  assert.equal(typeof turn_id, 'string');
  assert.deepEqual(t.began, [], 'a turn the journey takes draws no bubble and no card');
  assert.equal(t.stored().open, null, 'the probe is closed in the journey store');
  assert.deepEqual(t.stored().events, [settled('sigmoid/shape', 1)], 'the server evidence, adopted');
});

test('useTutor on a journey canvas: with no tray, an unrelated question is a Tutor turn in the journey domain, drawn once; the store holds the journey evidence', async () => {
  const evidence = { seq: 2, events: [settled('sigmoid/range', 1), settled('sigmoid/shape', 2)] };
  const h = harness(ok(journeyOf({ state: 'active', registry: SIGMOID, evidence }), null));
  await h.refresh();
  const t = tutorOn(h);
  const reply = await t.run(tutor => tutor.ask({ raw: 'What is a sigmoid?', begin: t.begin }));
  assert.equal(reply, PLAN.actions[0].text);
  assert.deepEqual(h.actions(), ['/api/learn/tutor/plan'], 'no resolver call with no tray');
  assert.equal(h.calls[1].body.context.journey_context.phase, 'active', 'domain.kind journey: the journey context rides');
  assert.deepEqual(t.began, [1], 'drawn once, before the plan request');
  assert.deepEqual(t.stored().events, evidence.events, 'the journey store holds the server evidence');
  // Ask the Tutor (skipJourney, from a clarification) on an open tray: straight to the planner, in the setup phase.
  const setup = harness(ok(journeyOf({ registry: SIGMOID }), goalTray));
  await setup.refresh();
  const s = tutorOn(setup);
  await s.run(tutor => tutor.ask({ raw: 'What is a sigmoid?', skipJourney: true, begin: s.begin }));
  assert.deepEqual(setup.actions(), ['/api/learn/tutor/plan']);
  assert.equal(setup.calls[1].body.context.journey_context.phase, 'setup');
  assert.deepEqual(setup.calls[1].body.context.allowed_actions, ['respond_text', 'suggest_journey'], 'off_slice in setup: words only, no card; and the learning-path offer (owner 2026-10-07)');
});

test('useTutor on a journey canvas: a typed and a voice turn with the same words take the same route (D6, one resolver)', async () => {
  const cases = [
    ['a free-text probe answer', ok(diagnosing(), explainTray), [{ status: 200, d: { kind: 'tray_answer' } }, ok(diagnosing({ revision: 5 }), previewTray)], 'It squashes any number into 0 to 1', ['resolve', '/api/learn/tutor/evaluate', 'probe_advance']],
    ['an option label', ok(journeyOf({ registry: SIGMOID }), familiarityTray), [ok(journeyOf({ revision: 5 }), depthTray)], 'Seen it before', ['intake_answer']],
    ['an unrelated question over a tray', ok(journeyOf({ registry: SIGMOID }), goalTray), [{ status: 200, d: { kind: 'unrelated_question' } }], 'What is a sigmoid?', ['resolve', '/api/learn/tutor/plan']],
    ['a path edit on the preview', ok(journeyOf({ state: 'path_review', path_version: 1, registry: SIGMOID }), previewTray), [ok(journeyOf({ state: 'path_review', revision: 5, pending: 'revise' }), null)], 'Could we do Python first?', ['path_edit']],
  ];
  for (const [name, first, replies, raw, route] of cases) {
    const runs = [];
    for (const voice of [false, true]) {
      const h = harness(first, replies);
      await h.refresh();
      const t = tutorOn(h);
      const out = await t.run(tutor => (voice ? tutor.voiceTurn({ raw, turnId: 'turn-1' }) : tutor.ask({ raw, turnId: 'turn-1', begin: t.begin })));
      // The planner's context says which modality asked (learner_intent.input_modality); every other request is equal.
      runs.push({ actions: h.actions(), bodies: h.calls.slice(1).map(c => (c.path === '/api/learn/tutor/plan' ? 'plan' : c.body)), out });
    }
    const [typed, spoken] = runs;
    assert.deepEqual(typed.actions, route, name);
    assert.deepEqual(spoken.actions, typed.actions, `${name}: voice routes as typed`);
    assert.deepEqual(spoken.bodies, typed.bodies, `${name}: the same requests`);
    const planned = route.includes('/api/learn/tutor/plan');
    assert.equal(spoken.out.speech, planned ? PLAN.actions[0].text : '', `${name}: a turn the journey takes says nothing`);
    assert.equal(planned ? typed.out : typed.out.handled, planned ? PLAN.actions[0].text : true, name);
  }
});

test('useTutor on a journey canvas: "Can we skip this?" with a tray open is the journey cancel and never reaches runTurn, typed or spoken', async () => {
  for (const [first, tray] of [[journeyOf({ registry: SIGMOID }), goalTray], [diagnosing(), explainTray], [diagnosing(), probeTray]]) {
    for (const voice of [false, true]) {
      const h = harness(ok(first, tray), [ok({ ...first, revision: 5 }, null)]);
      await h.refresh();
      const t = tutorOn(h);
      const out = await t.run(tutor => (voice ? tutor.voiceTurn({ raw: 'Can we skip this?', turnId: 'turn-1' }) : tutor.ask({ raw: 'Can we skip this?', begin: t.begin })));
      assert.deepEqual(h.actions(), ['cancel'], tray.mode);
      assert.deepEqual(tutorRoutes(h), [], `${tray.mode}: no evaluate, no plan`);
      assert.equal(voice ? out.speech : out.handled, voice ? '' : true);
      assert.deepEqual(t.began, []);
    }
  }
});

// ---- Task 12 review round 1 ----

test('useTutor on a journey canvas: a voice turn while an action is in flight is refused - one intake_answer, never two', async () => {
  let land;
  const h = harness(ok(journeyOf({ registry: SIGMOID }), familiarityTray), [() => new Promise(resolve => { land = () => resolve(ok(journeyOf({ revision: 5 }), depthTray)); })]);
  await h.refresh();
  const t = tutorOn(h);
  const clicked = h.view().answer('seen'); // the option click, still posting
  assert.equal(h.view().busy, true);
  const spoken = await t.run(tutor => tutor.voiceTurn({ raw: 'Seen it before', turnId: 'turn-1' }));
  assert.equal(spoken.speech, '', 'a refused spoken turn says nothing');
  const typed = await t.run(tutor => tutor.ask({ raw: 'Seen it before', begin: t.begin }));
  assert.deepEqual([typed.handled, typed.failed], [true, true], 'a typed one gets its words back');
  land();
  await clicked;
  assert.deepEqual(h.actions(), ['intake_answer']);
  assert.deepEqual(tutorRoutes(h), []);
  assert.deepEqual(t.began, []);
});

test('useTutor: slash(null) drops a waiting /deeper, and a slash prompt is a Tutor turn even while the journey works', async () => {
  let land;
  const h = harness(ok(journeyOf({ registry: SIGMOID }), goalTray), [ok(journeyOf({ registry: SIGMOID, revision: 5 }), goalTray), () => new Promise(resolve => { land = () => resolve(ok(journeyOf({ revision: 6 }), goalTray)); })]);
  await h.refresh();
  const t = tutorOn(h);
  // The composer refused the prompt (busy) and cleared the command: the next turn is the learner's own words, and goes
  // through the journey's resolver like any other (a waiting slash would have skipped it).
  t.tutor.slash('deeper', '/deeper the old question');
  t.tutor.slash(null);
  const out = await t.run(tutor => tutor.ask({ raw: 'Can we skip this?', begin: t.begin }));
  assert.equal(out.handled, true);
  assert.deepEqual(h.actions(), ['cancel']);
  // While an action posts, the slash prompt (sent with skipJourney) still reaches the planner. Task 11b fix B5: a journey has no
  // depth ladder, so /deeper is an ordinary turn from the composer's words (until 11b it reached the planner as kind slash).
  const busy = h.view().retry();
  t.tutor.slash('deeper', '/deeper the sigmoid');
  await t.run(tutor => tutor.ask({ raw: 'Explain the sigmoid more deeply.', skipJourney: true, begin: t.begin }));
  assert.deepEqual(h.actions().filter(a => a !== '/api/learn/tutor/evaluate'), ['cancel', 'retry', '/api/learn/tutor/plan']);
  const intent = h.calls.at(-1).body.context.learner_intent;
  assert.deepEqual([intent.kind, intent.raw_user_message, 'slash' in intent], ['request', 'Explain the sigmoid more deeply.', false]);
  land();
  await busy;
});

test('useTutor on a journey canvas: a block follow-up asks about that block (its targetId)', async () => {
  const h = harness(ok(journeyOf({ state: 'active', registry: SIGMOID }), null));
  await h.refresh();
  const t = tutorOn(h, { blocks: [{ id: 'x1', type: 'explanation', title: 'Odds and log-odds', body: 'The logit is the log of the odds.' }] });
  await t.run(tutor => tutor.ask({ raw: 'Why take the log?', targetId: 'x1', begin: t.begin }));
  assert.deepEqual(h.actions(), ['/api/learn/tutor/plan']);
  assert.match(h.calls[1].body.context.target.description, /Odds and log-odds/);
  assert.equal(h.calls[1].body.context.journey_context.phase, 'active');
});

test('ask.jsx and LearnPage.jsx: the sheet opens only for a Tutor reply; slash prompts skip the journey and a refused turn clears the slash; block follow-ups on a journey canvas go to the Tutor', () => {
  const ask = read('ask.jsx'), page = read('LearnPage.jsx');
  // The sheet opens inside begin(): a turn the journey takes never reopens it.
  assert.equal(ask.split('if (panelAsk) { setSheetOpen(true); setSheetHistory(false); }').length, 2, 'once');
  assert.match(ask, /const begin = \(\) => \{\n\s+if \(begun\) return;\n\s+begun = true;\n\s+if \(panelAsk\) \{ setSheetOpen\(true\); setSheetHistory\(false\); \}/);
  assert.match(ask, /onPrompt=\{prompt => send\(prompt, undefined, \{ skipJourney: true \}\)\}/);
  assert.match(ask, /if \(journey\.busy\) \{ tutor\?\.slash\?\.\(null\); return; \}/);
  assert.match(ask, /if \(!message \|\| busy\) \{ tutor\?\.slash\?\.\(null\); return; \}/);
  assert.match(read('LearnTutor.jsx'), /slash: \(name, raw\) => \{ slashNext\.current = SLASHES\.includes\(name\) \? \{ name, raw \} : null; \}/);
  // A block's composer gets the Tutor only on a canvas with a live journey, or in a hole opened from a journey section once
  // its Tutor is active (LP1 Task 14 review round 1, D1); nanoGPT, blank canvases and other holes keep /api/learn/ask. It
  // asks about the block it sits in.
  assert.match(page, /renderBlockComposer=\{[^\n]*?canvasSeed=\{\{ question: exchange\.question, answer: exchange\.answer, target \}\} onExchange=\{onExchange\} tutor=\{tutor\.active \? tutor : null\}/);
  assert.match(ask, /targetId: \(target \|\| canvasSeed\?\.target\)\?\.id \|\| null/);
  // Final review C-I1: a hole's opening turn is sent once, from the dock - never again from each block's composer
  // (Continue convo), which gets the same Tutor in a journey hole.
  assert.match(ask, /if \(!dock \|\| !tutor\?\.opening \|\| openedHole\.current === tutor\.opening\.key \|\| busy\) return;/);
});

// ---- LP1 Task 14 (architecture §13): the minimal journey context a Rabbit Hole opened from a journey section carries.
// journeyDiveContext is pure; useDive, LearnPage and useTutor are pinned in source (effects never run here). ----
const DIVE_REGISTRY = {
  concepts: { odds: { label: 'Odds', names: ['odds'] }, sigmoid: { label: 'Sigmoid', names: ['sigmoid'] }, loss: { label: 'Loss', names: ['loss'] } },
  claims: { 'odds/ratio': { concept: 'odds' }, 'odds/log': { concept: 'odds' }, 'sigmoid/range': { concept: 'sigmoid' }, 'sigmoid/shape': { concept: 'sigmoid' }, 'loss/log': { concept: 'loss' } },
};
const divePath = { current_section_id: 's2', sections: [
  { id: 's1', status: 'completed', target_concepts: ['odds'], expected_evidence: [{ claim: 'odds/ratio' }] },
  { id: 's2', status: 'current', target_concepts: ['sigmoid', 'loss'], expected_evidence: [{ claim: 'sigmoid/range' }, { claim: 'gone/claim' }, { claim: 'sigmoid/shape' }] },
] };
const activeDive = (over = {}) => journeyOf({ state: 'active', active_section_id: 's2', registry: DIVE_REGISTRY, ...over });
const stampedBlock = (journey_id, section_id, claims) => ({ id: 'b7', type: 'explanation', title: 'Odds', journey: { journey_id, section_id, step_id: 'b7', claims } });

/// Final review C-m5, now the shared strict guard (e2e/keyless-guard.mjs, the same one next-steps-check.mjs uses): the J1-J8 harness runs
// only against the keyless stack - a vars file of the control plane or of the app worker that binds a model, voice or subscription key,
// in any dotenv form, is refused before any request (the origins here answer nothing, so a request would fail differently), and the
// refusal reports the file and line, never the value.
test('journey-check.mjs refuses a vars file with a model, voice or subscription key in any dotenv form, before any request', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'journey-check-'));
  const GOOD = 'SMALL_ENV=test\nTEST_BYPASS_SECRET=local\nMASTER_KEY=local\nOAUTH_MOCK=true\nJOURNEY_MODEL_STUB=fixtures\n';
  try {
    for (const folder of ['cp', 'app']) { mkdirSync(join(tmp, folder)); writeFileSync(join(tmp, folder, 'wrangler.jsonc'), '{ "name": "x", "vars": { "SMALL_ENV": "test" } }'); }
    const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('../e2e/journey-check.mjs', import.meta.url)), '--base', 'http://127.0.0.1:9', '--cp', 'http://127.0.0.1:9', '--vars', join(tmp, 'cp', '.dev.vars'), '--out', join(tmp, 'out')], {
      // A key in the test runner's own shell is the guard's business, not this test's: hand the child a filtered env.
      encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/_API_KEY|^ELEVENLABS_|^SUBSCRIPTION_/.test(name))),
    });
    for (const folder of ['cp', 'app']) for (const line of ['ANTHROPIC_API_KEY=not-a-key', 'ANTHROPIC_API_KEY: not-a-key', 'export ELEVENLABS_VOICE=not-a-voice', 'SUBSCRIPTION_BRIDGE_TOKEN=not-a-token']) {
      for (const other of ['cp', 'app']) writeFileSync(join(tmp, other, '.dev.vars'), other === folder ? `${GOOD}${line}\n` : GOOD);
      const result = run();
      assert.notEqual(result.status, 0, `${folder}: ${line.split(/[=:]/)[0]}`);
      assert.match(result.stderr, /journey-check runs only against the keyless stack/, `${folder}: ${line.split(/[=:]/)[0]}`);
      assert.match(result.stderr, new RegExp(`${folder}[\\\\/]\\.dev\\.vars: line 6 is not one of the stack's allowed lines \\(line 6 binds a model, voice or subscription key\\)`), `${folder}: ${line.split(/[=:]/)[0]}`);
      assert.doesNotMatch(result.stderr, /not-a-key|not-a-voice|not-a-token/, 'a refusal never prints a value');
    }
    // A missing .dev.vars is refused too (wrangler would fall back to .env files), and clean files pass the guard (the run then fails on the connection).
    writeFileSync(join(tmp, 'cp', '.dev.vars'), GOOD); rmSync(join(tmp, 'app', '.dev.vars'), { force: true });
    assert.match(run().stderr, /app[\\/]\.dev\.vars: missing/);
    writeFileSync(join(tmp, 'app', '.dev.vars'), GOOD);
    assert.doesNotMatch(run().stderr, /runs only against the keyless stack/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('journeyDiveContext: from a stamped section block - its claims (registry ids, at most 4) and its section; their concepts, then the section targets', () => {
  assert.deepEqual(journeyDiveContext(activeDive(), divePath, stampedBlock('j1', 's1', ['odds/log', 'gone/claim'])),
    { journey_id: 'j1', section_id: 's1', concept_ids: ['odds'], claim_ids: ['odds/log'] });
  const all = journeyDiveContext(activeDive(), divePath, stampedBlock('j1', 's2', ['loss/log', 'odds/ratio', 'odds/log', 'sigmoid/range', 'sigmoid/shape']));
  assert.deepEqual(all.claim_ids, ['loss/log', 'odds/ratio', 'odds/log', 'sigmoid/range']);
  assert.deepEqual(all.concept_ids, ['loss', 'odds', 'sigmoid'], 'deduped, at most 4');
});

test('journeyDiveContext: no stamped block (an anchor, a note, another journey\'s block) -> the current section\'s expected_evidence', () => {
  const section = { journey_id: 'j1', section_id: 's2', concept_ids: ['sigmoid', 'loss'], claim_ids: ['sigmoid/range', 'sigmoid/shape'] };
  assert.deepEqual(journeyDiveContext(activeDive(), divePath, { id: 'n1', type: 'note', text: 'mine' }), section);
  assert.deepEqual(journeyDiveContext(activeDive(), divePath, null), section);
  assert.deepEqual(journeyDiveContext(activeDive(), divePath, stampedBlock('j0', 's1', ['odds/log'])), section, 'an archived journey\'s block is ignored');
});

test('journeyDiveContext: null unless the journey is active', () => {
  for (const state of ['intake', 'diagnostic', 'path_review', 'paused', 'completed', 'archived']) assert.equal(journeyDiveContext(activeDive({ state }), divePath, stampedBlock('j1', 's2', ['odds/log'])), null, state);
  assert.equal(journeyDiveContext(null, null, null), null);
});

test('Task 14 wiring: LearnPage hands the live journey to useDive, the dive record carries it, and the hole Tutor reads its parent journey once', () => {
  assert.match(read('LearnPage.jsx'), /const dive = useDive\(\{[^\n]*journeyContext: block => journeyDiveContext\(journey\.journey, journey\.path, block\) \}\);/);
  const diveSource = read('Dive.jsx');
  assert.match(diveSource, /export function useDive\(\{[^}]*journeyContext = \(\) => null \}\)/);
  assert.match(diveSource, /diveRecord\(\{[^\n]*journey: journeyContext\(block\) \}\)/);
  const tutor = read('LearnTutor.jsx'), domains = read('learn-tutor-domains.js');
  // Active in a hole whose record carries a journey once the parent journey is read; a refusal (null) leaves it as it was.
  // Task 0: the resolver (learn-tutor-domains.js tutorContext) decides, over the parent journey and the record.
  assert.match(tutor, /const where = \{ app: courseCanvas \? app : null, board, root, parentJourney, record, title: liveTitle \};\n  \/\/ Ruling F4[^\n]*\n  \/\/ [^\n]*\n  const context = tutorContext\(\{ \.\.\.where, journey \}\), capabilities = context\?\.capabilities;\n  const active = capabilities\?\.tutor === true, hookTurns = active \|\| capabilities\?\.hook_turns === true;/);
  assert.match(tutor, /diveJourney\(record, path => api\(path\)\)/);
  // A hole reads its concept from the domain it runs in (anti-hardcoding audit F3), never the nanoGPT one by default.
  // Task 11 fix round: the opening lives in learn-next-steps.js holeOpening, handed this hole's domain.
  assert.match(tutor, /holeOpening\(\{[^\n]*domain: \(\) => domainOf\(canvasApi\.current\) \}\)/);
  assert.match(read('learn-next-steps.js'), /enterHole\(load\(\), record, domain\(\)\)/);
  assert.match(tutor, /const domainOf = \(canvas, selected = null\) => tutorContext\(\{ \.\.\.where, journey: journeyRef\.current, blocks: canvas\?\.blocks\?\.\(\) \|\| \[\], selected \}\)\?\.domain;/);
  assert.match(domains, /if \(parentJourney && record\?\.journey\) \{\n    return \{ domain: journeyDomain\(\{ journey: parentJourney\.journey, path: parentJourney\.path, blocks, dive: record\.journey \}\)/);
  // The parent's resolver and tray run only for a live journey on this board: the hole posts no journey action.
  assert.match(tutor, /if \(live && !slash && !opening && !skipJourney && !nextStep\)/);
});

// ---- LP1 Task 14 review round 1 ----
test('journeyDiveContext: a stamped step with no registry claims falls back to its section\'s expected_evidence', () => {
  const s1 = { journey_id: 'j1', section_id: 's1', concept_ids: ['odds'], claim_ids: ['odds/ratio'] };
  assert.deepEqual(journeyDiveContext(activeDive(), divePath, stampedBlock('j1', 's1', [])), s1);
  assert.deepEqual(journeyDiveContext(activeDive(), divePath, stampedBlock('j1', 's1', ['gone/claim'])), s1);
});

test('journeyDiveContext: a dive from this journey\'s section heading uses that heading\'s section; another journey\'s heading the current one', () => {
  const heading = (journey_id, journey_section_id) => ({ id: 'h1', type: 'heading', text: 'Odds', journey_section_id, journey_id });
  assert.deepEqual(journeyDiveContext(activeDive(), divePath, heading('j1', 's1')), { journey_id: 'j1', section_id: 's1', concept_ids: ['odds'], claim_ids: ['odds/ratio'] });
  assert.equal(journeyDiveContext(activeDive(), divePath, heading('j0', 's1')).section_id, 's2');
});

test('tutorStoreKey: a journey hole has its own store; nanoGPT, holes without a journey and journey canvases keep their keys', () => {
  const app = { name: 'canvas-0000hole', org: 'o', email: 'e@x.com' };
  assert.equal(tutorStoreKey(app, null, null), 'small.tutor:o:e@x.com');
  assert.equal(tutorStoreKey(app, null, { dive_id: 'canvas-0000hole', origin: {} }), 'small.tutor:o:e@x.com');
  assert.equal(tutorStoreKey(app, 'j1', null), 'small.tutor:o:e@x.com:journey:j1');
  assert.equal(tutorStoreKey(app, null, { dive_id: 'canvas-0000hole', journey: { journey_id: 'j1' } }), 'small.tutor:o:e@x.com:dive:j1');
  assert.equal(tutorStoreKey(app, 'j2', { dive_id: 'canvas-0000hole', journey: { journey_id: 'j1' } }), 'small.tutor:o:e@x.com:journey:j2', 'a live journey here wins');
  // Task 10: a canvas-domain store (a plain canvas or hole) is its own; a journey or a journey hole still wins.
  assert.equal(tutorStoreKey(app, null, { dive_id: 'canvas-0000hole', origin: {} }, 'canvas-0000hole|main'), 'small.tutor:o:e@x.com:canvas:canvas-0000hole|main');
  assert.equal(tutorStoreKey(app, 'j1', null, 'canvas-0000hole|main'), 'small.tutor:o:e@x.com:journey:j1');
  assert.equal(tutorStoreKey(app, null, { dive_id: 'canvas-0000hole', journey: { journey_id: 'j1' } }, 'canvas-0000hole|main'), 'small.tutor:o:e@x.com:dive:j1');
  assert.match(read('LearnTutor.jsx'), /const key = tutorStoreKey\(app, journeyId, record, context\?\.source === 'canvas' \? `\$\{app\.name\}\|\$\{board \|\| 'main'\}` : null\);/);
});

test('Task 14 known limits are marked: nested holes carry no journey; the hole Tutor waits for the parent read', () => {
  assert.match(read('LearnPage.jsx'), /ponytail: a hole inside a journey hole carries no journey/);
  // Professor Next Steps Task 14 C-M5: reworded - the hole is not inactive meanwhile, its typed turns run the canvas domain.
  assert.match(read('LearnTutor.jsx'), /ponytail: until the parent journey GET settles, a typed turn in a journey hole runs the canvas domain/);
});

// Task 11b fix round 2 item 1 (owner fourteenth message: routing is never keyword-based): on a live journey, a Tutor turn whose
// words read like a new learning intent is an Auto Tutor turn; the second-broad-intent word check (continue or start?) no
// longer intercepts it. Inside an open tray the v1 tray parsing still answers the question the interface just asked.
test('fix round 2: on a live journey with no tray, broad learning requests reach the planner, typed or spoken; with a tray open, a tray answer still resolves it', async () => {
  const REQUESTS = ['Walk me through the attention mask computation.', 'I want to understand why the mask is lower triangular.', 'Teach me how softmax works.', 'Help me learn the residual stream.'];
  for (const raw of REQUESTS) for (const voice of [false, true]) {
    const h = harness(ok(journeyOf({ state: 'active', registry: SIGMOID }), null));
    await h.refresh();
    const t = tutorOn(h);
    await t.run(tutor => (voice ? tutor.voiceTurn({ raw, turnId: 'turn-1' }) : tutor.ask({ raw, begin: t.begin })));
    const plan = h.calls.find(c => c.path === '/api/learn/tutor/plan');
    assert.ok(plan, `${raw}: reaches the planner`);
    assert.equal(plan.body.context.learner_intent.raw_user_message, raw, `${raw}: its words, never dropped`);
    assert.equal(h.view().tray?.id ?? null, null, `${raw}: no continue-or-start tray`);
    assert.equal(h.calls.some(c => c.body?.action === 'start'), false, `${raw}: nothing starts`);
  }
  // A tray open: a tray answer still resolves it (an option label, rules 1-4), and a broad request over it goes through the
  // tray parsing (rule 5, the model), never the continue-or-start check.
  const picked = harness(ok(journeyOf({ registry: SIGMOID }), familiarityTray), [ok(journeyOf({ revision: 5 }), depthTray)]);
  await picked.refresh();
  const p = tutorOn(picked);
  await p.run(tutor => tutor.ask({ raw: 'Seen it before', begin: p.begin }));
  assert.deepEqual(picked.actions(), ['intake_answer']);
  const over = harness(ok(journeyOf({ registry: SIGMOID }), goalTray), [{ status: 200, d: { kind: 'unrelated_question' } }]);
  await over.refresh();
  const o = tutorOn(over);
  await o.run(tutor => tutor.ask({ raw: 'Teach me how softmax works.', begin: o.begin }));
  assert.deepEqual(over.actions(), ['resolve', '/api/learn/tutor/plan']);
  // The controller called with no Tutor (the composer on a canvas with no Tutor) keeps LP1's check.
  const bare = harness(ok(journeyOf({ state: 'active' }), null));
  await bare.refresh();
  assert.deepEqual(await bare.view().handleText('Teach me transformers'), { handled: true });
  assert.equal(bare.view().tray.id, 'clarification:live');
});

// ---- Owner decisions 2026-10-07 (docs/features/professor-next-steps.md §4.5), through the Tutor's turn as the page runs it ----
// (a) a real answer to the open tray still advances it; (b) a side question gets a Tutor answer while the tray stays open,
// unchanged and answerable; (c)-(e) the Tutor-offered Start a learning path chip switches subject during setup, only through
// continue-or-start, which names both subjects; (f) typing alone never replaces the journey; (g) a review board is its own.
const OFFER = { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'SQL is how you ask a database for rows.' }, { type: 'suggest_journey', request: 'SQL' }] };
const buttonsOf = node => (!node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(buttonsOf) : [...(node.type === 'button' ? [node] : []), ...buttonsOf(node.props?.children)]);
const tick = () => new Promise(done => setTimeout(done, 5));
const HANDLED = { text: '', handled: true, failed: false };

test('owner 2026-10-07 (a): an answer to the open tray still advances it - an option label (rules 1-4), or words the model reads as the answer (rule 5)', async () => {
  const picked = harness(ok(journeyOf({ registry: SIGMOID }), familiarityTray), [ok(journeyOf({ revision: 5 }), depthTray)]);
  await picked.refresh();
  const p = tutorOn(picked);
  assert.deepEqual(await p.run(tutor => tutor.ask({ raw: 'Seen it before', begin: p.begin })), HANDLED);
  assert.deepEqual(picked.actions(), ['intake_answer'], 'rule 1: no resolver, no planner');
  assert.deepEqual([picked.calls[1].body.slot, picked.calls[1].body.option_id], ['familiarity', 'seen']);
  assert.equal(picked.view().tray.id, depthTray.id, 'the tray moved on');
  assert.deepEqual(p.began, [], 'no Tutor exchange is drawn for a tray answer');
  const typed = harness(ok(journeyOf({ registry: SIGMOID }), goalTray), [{ status: 200, d: { kind: 'tray_answer' } }, ok(journeyOf({ revision: 5 }), familiarityTray)]);
  await typed.refresh();
  const t = tutorOn(typed);
  assert.deepEqual(await t.run(tutor => tutor.ask({ raw: 'the intuition, for an exam next week', begin: t.begin })), HANDLED);
  assert.deepEqual(typed.actions(), ['resolve', 'intake_answer'], 'rule 5 read the words as the answer');
  assert.deepEqual([typed.calls[2].body.slot, typed.calls[2].body.text], ['goal', 'the intuition, for an exam next week']);
  assert.equal(typed.view().tray.id, familiarityTray.id);
});

test('owner 2026-10-07 (b): a side question in an open setup tray gets a Tutor answer; the tray stays open, unchanged and answerable', async () => {
  const cases = [['intake', journeyOf({ registry: SIGMOID }), goalTray], ['diagnostic', diagnosing(), probeTray], ['path review', journeyOf({ state: 'path_review', path_version: 1, registry: SIGMOID }), previewTray]];
  for (const [name, j, tray] of cases) {
    const h = harness(ok(j, tray), [{ status: 200, d: { kind: 'unrelated_question' } }]);
    await h.refresh();
    const before = h.view().tray, t = tutorOn(h);
    assert.equal(await t.run(tutor => tutor.ask({ raw: 'What is a sigmoid?', begin: t.begin })), PLAN.actions[0].text, `${name}: the Tutor answers`);
    assert.deepEqual(h.actions(), ['resolve', '/api/learn/tutor/plan'], `${name}: rule 5, then the Tutor; no journey write`);
    assert.deepEqual(t.began, [2], `${name}: the exchange is drawn once, after the resolver`);
    assert.deepEqual([h.view().tray, h.view().journey.revision], [before, j.revision], `${name}: the same tray, unadvanced`);
  }
  // Still answerable: the next pick answers the tray the question was asked over.
  const h = harness(ok(journeyOf({ registry: SIGMOID }), goalTray), [{ status: 200, d: { kind: 'unrelated_question' } }, ok(journeyOf({ revision: 5 }), familiarityTray)]);
  await h.refresh();
  const t = tutorOn(h);
  await t.run(tutor => tutor.ask({ raw: 'What is a sigmoid?', begin: t.begin }));
  await h.view().answer('intuition');
  assert.deepEqual(h.actions(), ['resolve', '/api/learn/tutor/plan', 'intake_answer']);
  assert.equal(h.view().tray.id, familiarityTray.id);
  // Only when the model finds the words ambiguous (or cannot be reached) does the chooser ask; its Ask the Tutor hands the
  // same words to the Tutor and the tray is back, unadvanced.
  const unsure = harness(ok(journeyOf({ registry: SIGMOID }), goalTray), [{ status: 200, d: { kind: 'clarification_needed' } }]);
  await unsure.refresh();
  const u = tutorOn(unsure);
  assert.deepEqual(await u.run(tutor => tutor.ask({ raw: 'odds maybe', begin: u.begin })), HANDLED);
  assert.equal(unsure.view().tray.id, 'clarification:turn');
  assert.deepEqual(await unsure.view().answer('tutor'), { ask: 'odds maybe' });
  assert.deepEqual([unsure.view().tray.id, unsure.actions()], [goalTray.id, ['resolve']]);
});

// The chip in setup: the typed words are a side question (rule 5), the Tutor answers and offers the path, and the chip's click
// is the journey start, which meets the setup journey (409 live_journey) and opens continue-or-start.
async function setupChip(replies, state = 'intake', tray = goalTray) {
  const j = journeyOf({ state, registry: SIGMOID, ...(state === 'diagnostic' ? { diagnostic: { probes } } : {}) });
  const h = harness(ok(j, tray), [{ status: 200, d: { kind: 'unrelated_question' } }, { status: 409, d: { error: 'live_journey', journey: j, path: null, tray } }, ...replies]);
  await h.refresh();
  const t = tutorOn(h, { plan: OFFER });
  assert.equal(await t.run(tutor => tutor.ask({ raw: 'Teach me SQL instead', begin: t.begin })), OFFER.actions[0].text);
  const context = h.calls.find(c => c.path === '/api/learn/tutor/plan').body.context;
  assert.deepEqual([context.journey_context.phase, context.allowed_actions], ['setup', ['respond_text', 'suggest_journey']], state);
  const chip = buttonsOf(t.tutor.extras).find(button => button.props.children === 'Start a learning path');
  assert.ok(chip, `${state}: the chip shows`);
  assert.deepEqual(h.actions(), ['resolve', '/api/learn/tutor/plan'], `${state}: nothing starts before the click`);
  chip.props.onClick();
  for (let i = 0; i < 20 && h.view().tray?.id !== 'clarification:live'; i++) await tick();
  assert.deepEqual(h.calls[3].body, { app: APP, board: 'main', action: 'start', text: 'Teach me SQL' }, `${state}: the existing journey start`);
  const confirm = h.view().tray;
  assert.deepEqual([confirm.id, confirm.prompt, confirm.options.map(o => o.label)], ['clarification:live', 'Continue logistic regression or start sql?', ['Continue logistic regression', 'Start sql']], `${state}: both subjects named`);
  return { h, j, tray };
}

test('owner 2026-10-07 (c): Start in the confirmation replaces the setup in one start; the new subject is set up', async () => {
  for (const [state, tray] of [['intake', goalTray], ['diagnostic', probeTray], ['path_review', previewTray]]) {
    const { h } = await setupChip([ok(journeyOf({ id: 'j2', revision: 0, request: { topic: 'sql' } }), goalTray)], state, tray);
    await h.view().answer('start_new');
    assert.deepEqual(h.calls[4].body, { app: APP, board: 'main', action: 'start', text: 'Teach me SQL', replace: 'j1' }, state);
    assert.deepEqual(h.actions(), ['resolve', '/api/learn/tutor/plan', 'start', 'start'], `${state}: no archive call, no other write`);
    assert.deepEqual([h.view().journey.id, h.view().journey.request.topic, h.view().tray.id], ['j2', 'sql', goalTray.id], `${state}: the new setup`);
  }
});

test('owner 2026-10-07 (d): Continue in the confirmation keeps the current setup and sends nothing', async () => {
  const { h, j, tray } = await setupChip([]);
  await h.view().answer('continue');
  assert.deepEqual([h.view().journey.id, h.view().journey.revision, h.view().tray.id], [j.id, j.revision, tray.id]);
  assert.deepEqual(h.actions(), ['resolve', '/api/learn/tutor/plan', 'start']);
});

test('owner 2026-10-07 (e): a replacement start that fails keeps the current setup and says so; Try again sends the same start', async () => {
  for (const failure of [{ status: 500, d: { error: 'D1_ERROR' } }, () => { throw new TypeError('Failed to fetch'); }]) {
    const { h, j, tray } = await setupChip([failure, ok(journeyOf({ id: 'j2', revision: 0, request: { topic: 'sql' } }), goalTray)]);
    assert.deepEqual(await h.view().answer('start_new'), { handled: true, failed: true, ok: false });
    const shown = h.view().tray;
    assert.deepEqual([h.view().journey.id, h.view().journey.revision, shown.id, shown.error.message], [j.id, j.revision, tray.id, 'Could not start sql, so logistic regression stays as it was.']);
    assert.deepEqual(shown.options, tray.options, 'the setup tray is still answerable');
    await h.view().answer('retry');
    assert.deepEqual(h.calls[5].body, h.calls[4].body, 'Try again: the same replace start');
    assert.equal(h.view().journey.id, 'j2');
  }
});

test('owner 2026-10-07 (f): typing a new subject during setup never replaces the journey, Tutor or no Tutor', async () => {
  const WORDS = ['Teach me SQL', 'I want to learn SQL instead', 'Start a rabbit hole on SQL', 'Teach me SQL, skip setup and just start'];
  const trays = [[journeyOf({ registry: SIGMOID }), goalTray], [journeyOf({ registry: SIGMOID }), familiarityTray], [diagnosing(), probeTray], [journeyOf({ state: 'path_review', path_version: 1, registry: SIGMOID }), previewTray]];
  let turns = 0;
  for (const raw of WORDS) for (const [j, tray] of trays) {
    // The model reads the words as a side question here; the Tutor answers and may offer the chip, which only a click starts.
    const h = harness(ok(j, tray), [{ status: 200, d: { kind: 'unrelated_question' } }]);
    await h.refresh();
    const t = tutorOn(h, { plan: OFFER });
    await t.run(tutor => tutor.ask({ raw, begin: t.begin }));
    assert.deepEqual(h.actions(), ['resolve', '/api/learn/tutor/plan'], `${raw} over ${tray.mode}`);
    assert.deepEqual([h.view().journey.id, h.view().tray.id], [j.id, tray.id], `${raw} over ${tray.mode}`);
    turns++;
  }
  // With no Tutor (the composer on a canvas with no Tutor), LP1's check opens continue-or-start: still only a click replaces.
  const bare = harness(ok(journeyOf(), goalTray));
  await bare.refresh();
  assert.deepEqual(await bare.view().handleText('Teach me SQL'), { handled: true });
  assert.deepEqual([bare.view().tray.id, bare.calls.length], ['clarification:live', 1]);
  assert.equal(turns, 16);
});

// Decision 3: on a review board (LearnPage ?board=<name>, dev/review builds only) the Auto Tutor stays, and every journey
// request, evaluate write and Tutor session store is keyed to that board, never to the learner's main board.
test('owner 2026-10-07 (g): a review board keys every journey request, evaluate write and Tutor store to itself', async () => {
  const BOARD = 'pnsreview';
  const h = harness(ok(diagnosing(), explainTray), [{ status: 200, d: { kind: 'tray_answer' } }, ok(diagnosing({ revision: 5 }), previewTray)], BOARD);
  await h.refresh();
  const t = tutorOn(h, { board: BOARD });
  await t.run(tutor => tutor.ask({ raw: 'It squashes any number into 0 to 1', begin: t.begin }));
  assert.deepEqual(h.actions(), ['resolve', '/api/learn/tutor/evaluate', 'probe_advance']);
  assert.equal(h.calls[0].path, `/api/learn/journey?app=${APP}&board=${BOARD}`);
  assert.deepEqual(h.calls.slice(1).map(c => c.body.board), [BOARD, BOARD, BOARD], 'resolve, evaluate and probe_advance name the review board');
  assert.deepEqual([...t.storage.keys()], ['small.tutor:o:e@x.com:journey:j1'], 'the journey store: keyed by the review board journey');
  // A plain review board (no journey): the canvas-domain store is the review board's, never the main board's.
  const plain = harness(none, [], BOARD);
  await plain.refresh();
  const p = tutorOn(plain, { board: BOARD });
  await p.run(tutor => tutor.ask({ raw: 'What is a sigmoid?', begin: p.begin }));
  assert.deepEqual(plain.actions(), ['/api/learn/tutor/plan']);
  assert.deepEqual([...p.storage.keys()], [`small.tutor:o:e@x.com:canvas:${APP}|${BOARD}`]);
  // LearnPage (read only, lane W's file): ?board= becomes the board both hooks key on, a review board never resolves the
  // course, and review boards exist only in the dev/review build.
  const page = read('LearnPage.jsx');
  assert.match(page, /const named = hole \|\| !reviewTools \? null : new URLSearchParams\(window\.location\.search\)\.get\('board'\);/);
  assert.match(page, /const boardName = board \|\| 'main';/);
  assert.match(page, /useJourney\(\{ app, board: boardName,/);
  // The integration adds the 1.7 props after journey (canvasVersion, repository, describe); the board keys stay these.
  assert.match(page, /useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, courseCanvas: learnPreview && !board, journey[,}]/);
});

// ---- Owner decision 2026-10-07, D2 (option A): a skip-setup replacement that fails to plan keeps the old journey ----
// The route answers a planner failure on a replace with 502 and the OLD journey, still live (setup or active, progress
// kept): the line names both subjects, the old tray stays, and Try again sends the same replace start, which then succeeds.
test('owner 2026-10-07 D2: a skip-setup replacement whose planner fails keeps the old journey, setup or active; Try again replaces it', async () => {
  const FAST = 'Teach me SQL, skip setup and just start';
  const active = journeyOf({ state: 'active', registry: SIGMOID, active_section_id: 's1', evidence: { seq: 2, events: [settled('sigmoid/range', 1), settled('sigmoid/shape', 2)] } });
  for (const [phase, old, tray] of [['setup', journeyOf({ registry: SIGMOID, intake: { slots: { goal: 'intuition' }, source: {} } }), familiarityTray], ['active', active, null]]) {
    const fresh = journeyOf({ id: 'j2', revision: 3, state: 'active', request: { topic: 'sql' } });
    const h = harness(ok(old, tray), [
      { status: 409, d: { error: 'live_journey', journey: old, path: null, tray } },
      { status: 502, d: { error: 'The planner failed. Try again.', journey: old, path: null, tray } },
      ok(fresh, null),
    ]);
    await h.refresh();
    await h.view().start(FAST);
    assert.deepEqual([h.view().tray.id, h.view().tray.prompt], ['clarification:live', 'Continue logistic regression or start sql?'], phase);
    assert.deepEqual(await h.view().answer('start_new'), { handled: true, failed: true, ok: false }, phase);
    assert.deepEqual(h.calls[2].body, { app: APP, board: 'main', action: 'start', text: FAST, replace: 'j1' }, phase);
    const shown = h.view().tray;
    assert.deepEqual([h.view().journey, shown.error.message], [old, 'Could not start sql, so logistic regression stays as it was.'], `${phase}: the old journey, progress and all`);
    assert.deepEqual([shown.id, shown.options], tray ? [tray.id, tray.options] : ['status', []], `${phase}: the old tray stays answerable`);
    await h.view().answer('retry');
    assert.deepEqual(h.calls[3].body, h.calls[2].body, `${phase}: Try again is the same replace start`);
    assert.deepEqual([h.view().journey.id, h.view().tray, h.actions()], ['j2', null, ['start', 'start', 'start']], phase);
  }
});

// Learning review of D2: the old journey's tray can carry its own planner-failure error. The replacement's failure line and
// its Try again (the same replace start) still show, never the old journey's retry in its place.
test('owner 2026-10-07 D2: a replacement that fails over an old journey showing its own planner failure still offers Try again for the replacement', async () => {
  const FAST = 'Teach me SQL, skip setup and just start';
  const old = journeyOf({ registry: SIGMOID, error: { op: 'path', message: 'The planner failed.' } }), tray = trayFor(old, null);
  const fresh = journeyOf({ id: 'j2', revision: 3, state: 'active', request: { topic: 'sql' } });
  const h = harness(ok(old, tray), [
    { status: 409, d: { error: 'live_journey', journey: old, path: null, tray } },
    { status: 502, d: { error: 'The planner failed. Try again.', journey: old, path: null, tray } },
    ok(fresh, null),
  ]);
  await h.refresh();
  await h.view().start(FAST);
  assert.deepEqual(await h.view().answer('start_new'), { handled: true, failed: true, ok: false });
  assert.deepEqual([h.view().journey, h.view().tray.error.message], [old, 'Could not start sql, so logistic regression stays as it was.']);
  await h.view().answer('retry');
  assert.deepEqual(h.calls[3].body, { app: APP, board: 'main', action: 'start', text: FAST, replace: 'j1' }, 'Try again is the replacement, not the old journey retry');
  assert.deepEqual([h.view().journey.id, h.actions()], ['j2', ['start', 'start', 'start']]);
});

test('owner 2026-10-07 D2: skipping a question continues the same journey - a cancel, never a start or an archive', async () => {
  const h = harness(ok(journeyOf({ registry: SIGMOID }), goalTray), [ok(journeyOf({ state: 'diagnostic', revision: 5, registry: SIGMOID, diagnostic: { probes } }), probeTray)]);
  await h.refresh();
  assert.deepEqual(await h.view().handleText('skip this'), { handled: true });
  assert.deepEqual(h.actions(), ['cancel']);
  assert.deepEqual([h.view().journey.id, h.view().journey.state, h.view().tray.id], ['j1', 'diagnostic', probeTray.id]);
});

// r29 (Tutor eval, 2026-10-08): a typed Tutor turn's evidence reaches the journey controller with no re-read: adoptEvidence takes the
// evaluate reply's events and revision when newer (never older), and the next action posts that revision. The page calls it after
// every turn, for the same journey only.
test('controller: adoptEvidence takes a Tutor turn\'s newer evidence and revision, never older; the next action posts it', async () => {
  const canvas = fakeCanvas();
  const h = scripted(() => canvas, [recorded('b1'), { status: 409, d: { error: 'next_section has no next section' } }]);
  await h.ctl.refresh();
  const events = [{ seq: 1, claim: 'c', result: 'pass', kind: 'demonstrated_in_transfer', settled: true }];
  assert.equal(h.view().adoptEvidence({ events, seq: 1, revision: 8 }), true);
  assert.deepEqual([h.view().journey.evidence, h.view().journey.revision], [{ seq: 1, events }, 8]);
  assert.equal(h.view().adoptEvidence({ events: [], seq: 1, revision: 9 }), false, 'not newer: kept');
  assert.equal(h.view().adoptEvidence(null), false);
  await h.view().nextSection();
  assert.equal(h.calls.at(-1).body.revision, 8, 'the next action carries the adopted revision');
  const tutor = readFileSync(new URL('./LearnTutor.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(tutor, /const journeyAtStart = journeyRef\.current\?\.journey\?\.id \?\? null;\n\s+let result;/);
  // Beta hardening (owner 2026-10-09): the same rule, named sameJourney, which the Next section chip reads too.
  assert.match(tutor, /save\(result\.store\);\n(?:\s*\/\/[^\n]*\n)*\s*const sameJourney = !!journeyAtStart && journeyRef\.current\?\.journey\?\.id === journeyAtStart, view = journeyRef\.current;\n\s*if \(result\.evaluation\?\.journey && sameJourney\) view\.adoptEvidence\?\.\(result\.evaluation\.journey\);/);
});

// Acceptance (owner 2026-10-09): the chip's click is a completed move, and the server rechecks it. nextSection({ completed: true })
// posts require: 'completed'; a refusal (completion_not_met: the stored evidence no longer meets the section) re-reads the journey
// and draws nothing.
test('controller: nextSection({ completed: true }) posts require completed; a completion_not_met refusal draws nothing', async () => {
  const canvas = fakeCanvas();
  const refused = { status: 409, d: { error: 'completion_not_met', journey: activeJourney({ revision: 7, section_plan: { ...sectionPlan, heading_block_id: 'b1' } }), path: activePath, tray: null } };
  const h = scripted(() => canvas, [recorded('b1'), refused]);
  await h.ctl.refresh();
  h.view().canvasReady();
  const drawn = canvas.inserts().length;
  const out = await h.view().nextSection({ completed: true });
  assert.deepEqual([h.calls.at(-1).body.action, h.calls.at(-1).body.require, out.status, out.d.error], ['next_section', 'completed', 409, 'completion_not_met']);
  assert.equal(canvas.inserts().length, drawn, 'nothing drawn');
  assert.equal(h.view().journey.active_section_id, 's1', 'the section stays current');
});

test('progression: a stale navigation request is not replayed against the next section', async () => {
  const calls = [];
  const current = { status: 409, d: { error: 'revision', journey: { revision: 8, active_section_id: 's2' } } };
  const out = await journeyRequest({ action: 'next_section', section_id: 's1', require: 'completed' }, 7, async body => { calls.push(body); return current; });
  assert.equal(calls.length, 1);
  assert.equal(out, current);
});

test('progression: a fresh Tutor renders the saved eligibility chip without a model call', async () => {
  const claim = 'sigmoid/shape';
  const j = journeyOf({ state: 'active', active_section_id: 's1', registry: SIGMOID,
    evidence: { seq: 1, events: [{ ...settled(claim, 1), result: 'pass', kind: 'demonstrated_in_transfer', settled: true }] },
    section_plan: { section_id: 's1', completion_evidence: [{ claim, minimum: 'demonstrated_in_transfer' }] } });
  const path = { version: 1, sections: [{ id: 's1', status: 'current', title: 'First' }, { id: 's2', status: 'upcoming', title: 'Second' }] };
  const h = harness(ok(j, null, path));
  await h.refresh();
  const t = tutorOn(h);
  const html = renderToStaticMarkup(t.tutor.extras);
  assert.match(html, /Next section: Second/);
  assert.equal(tutorRoutes(h).length, 0);
});

test('progression: already understood is visibly distinct in the rail and a reloaded final outcome retains gaps', async () => {
  const html = renderToStaticMarkup(createElement(PathList, { expanded: true, onOpen: () => {}, entries: [
    { id: 's1', n: 1, title: 'Prior topic', status: 'already_understood' }, { id: 's2', n: 2, title: 'Skipped topic', status: 'skipped' },
  ] }));
  assert.match(html, /Already understood/);
  assert.match(html, /data-status="already_understood"/);
  assert.match(html, /data-status="skipped"/);
  const j = journeyOf({ state: 'completed', registry: SIGMOID });
  const path = { sections: [{ id: 's1', title: 'Prior topic' }, { id: 's2', title: 'Skipped topic' }],
    change: { outcome: { sections: { completed: [], already_understood: ['s1'], skipped: ['s2'], not_reached: [] }, gaps: [{ claim: 'sigmoid/shape', state: 'uncertain' }] } } };
  const h = harness(ok(j, null, path)); await h.refresh();
  const restored = renderToStaticMarkup(tutorOn(h).tutor.extras);
  assert.match(restored, /Already understood: Prior topic/);
  assert.match(restored, /Skipped: Skipped topic/);
  assert.match(restored, /Not yet understood:/);
  assert.equal(tutorRoutes(h).length, 0);
});
