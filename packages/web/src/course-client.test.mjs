// Create a course (owner 2026-11-14), the browser side without a browser: the routes, Generate course and the progress state, the sections in the table of contents and in
// the draft, the progress card rendered with react-dom/server, and the wiring pinned in source. Clicks and the canvas need a browser (the owner tries them).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { parseHTML } from 'linkedom';
import { canRetryCourse, canStartCourse, courseOf, initialState, invitationOf, pillOf, reduce, routes, tocOf } from './roadmap-client.js';
import { entriesOf } from './roadmap-transcript.js';
import { withRoadmap } from './learn-outline-model.js';
import { createRoadmapController } from './roadmap-controller.js';
import { STRINGS } from './roadmap-strings.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'course-client-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const outfile = join(dir, 'course.cjs');
await esbuild.build({
  stdin: { contents: "export { default as CourseProgress } from './CourseProgress.jsx'; export { default as RoadmapPlan } from './RoadmapPlan.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
const html = (component, props) => parseHTML(`<main>${B.renderToStaticMarkup(B.createElement(B[component], props))}</main>`).document;

const step = (n, over = {}) => ({ id: `st_${n}`, position: n, title: `Step ${n}`, goal: `Goal ${n}`, format: 'explanation', state: 'planned', stage: 'planned', passage: { start: 0, end: 10 }, sourceRef: null, ...over });
const viewOf = (steps, { course = null, state = 'active', accepted = true } = {}) => ({ roadmap: { id: 'rm_1', boardId: 'b1', state, revision: 4, planVersion: 1, acceptedPlanVersion: accepted ? 1 : null, scope: { source: { key: 'file:f1', name: 'Notes.md' } } },
  steps, results: [], proposal: null, acceptedPlan: accepted ? { version: 1, steps, outcome: 'o', stoppingPoint: 's' } : null, course });
const held = view => ({ ...reduce(initialState(), { type: 'view', view }) });

test('the routes: Generate course and Cancel are guarded roadmap actions', () => {
  const view = viewOf([step(1)]);
  assert.deepEqual(routes.startCourse(view, 'ak_1'), { method: 'POST', path: '/api/learn/roadmap/rm_1/course/start', body: { boardId: 'b1', revision: 4, actionKey: 'ak_1' } });
  assert.equal(routes.stopCourse(view, 'ak_2').path, '/api/learn/roadmap/rm_1/course/stop');
});

test('Generate course is offered for an accepted plan with cards to make, and only then', () => {
  const steps = [step(1), step(2)];
  assert.equal(canStartCourse(held(viewOf(steps))), true);
  assert.equal(canStartCourse(held(viewOf(steps, { accepted: false }))), false, 'plan not accepted');
  assert.equal(canStartCourse(held(viewOf(steps, { course: { running: true, total: 2, made: 0, failed: 0 } }))), false, 'already running');
  assert.equal(canStartCourse(held(viewOf(steps.map(s => ({ ...s, state: 'delivered', stage: 'ready' }))))), false, 'nothing left to make');
  assert.equal(canStartCourse(reduce(held(viewOf(steps)), { type: 'begin', gesture: 'course:start:rm_1:4' })), false, 'a start in flight');
  assert.equal(canStartCourse(held(viewOf(steps, { state: 'completed' }))), false);
});

test('the progress shows a start in flight at once, then the run, and ends when nothing is left to make or place', () => {
  const steps = [step(1), step(2), step(3)];
  assert.equal(courseOf(held(viewOf(steps))), null, 'no run, no progress');
  assert.deepEqual(courseOf(reduce(held(viewOf(steps)), { type: 'begin', gesture: 'course:start:rm_1:4' })), { total: 3, made: 0, failed: 0, current: null, facts: [] });
  const running = held(viewOf([step(1, { state: 'delivered', stage: 'ready' }), step(2, { state: 'generating', stage: 'generating' }), step(3)], { course: { running: true, total: 3, made: 1, failed: 0, current: 'Step 2', facts: ['A fact.'] } }));
  assert.deepEqual(courseOf(running), { total: 3, made: 1, failed: 0, current: 'Step 2', facts: ['A fact.'] });
  const done = held(viewOf([step(1, { state: 'delivered', stage: 'ready' }), step(2, { state: 'incomplete', stage: 'failed' })], { course: { running: true, total: 2, made: 1, failed: 1 } }));
  assert.equal(courseOf(done), null, 'every step is placed or failed: the progress goes away');
});

test('the per-card offer is retired: no pill, no Accept or Next card, and the Chat has one Generate course', () => {
  const view = { ...viewOf([step(1, { state: 'proposed', stage: 'proposed' }), step(2)]), proposal: { id: 'pr_1', stepId: 'st_1', version: 1, state: 'pending', acceptable: true, title: 'Step 1', format: 'explanation' } };
  const state = held(view);
  assert.equal(pillOf(state), null);
  const accepted = entriesOf(state).find(e => e.kind === 'accepted');
  assert.deepEqual(accepted.actions.map(a => a.id), ['generate_course', 'open_toc', 'edit_roadmap']);
  assert.equal(accepted.actions.some(a => a.id === 'end'), false, 'no End roadmap (owner 2026-11-14)');
  assert.equal(accepted.actions[0].label, 'Generate course');
  assert.equal(entriesOf(state).some(e => e.kind === 'step' || e.kind === 'recovery'), false);
  assert.equal(accepted.actions.some(a => a.id === 'propose_next'), false);
  const running = held({ ...view, course: { running: true, total: 2, made: 0, failed: 0 } });
  assert.equal(entriesOf(running).find(e => e.kind === 'accepted').actions.some(a => a.id === 'generate_course'), false, 'no second Generate course while one runs');
});

test('a plan with sections: the table of contents has a section row above its steps, which sit one level down; a step with no section stays top level', () => {
  const steps = [step(1, { section: 'Basics' }), step(2, { section: 'Basics' }), step(3, { section: 'Splits' }), step(4)];
  const toc = tocOf(held(viewOf(steps)));
  assert.deepEqual(toc.steps.map(s => s.section), ['Basics', 'Basics', 'Splits', null]);
  const rows = withRoadmap([], toc);
  assert.deepEqual(rows.map(r => [r.level, r.label]), [[1, 'Basics'], [2, 'Step 1'], [2, 'Step 2'], [1, 'Splits'], [2, 'Step 3'], [1, 'Step 4']]);
  assert.equal(rows[0].roadmap.section, true, 'a section row is the plan\'s, not an editable heading');
  assert.equal(rows[1].roadmap.stepId, 'st_1');
});

test('the draft in Chat groups its steps under their sections, in the stored text and in the plan', () => {
  const steps = [{ section: 'Basics', title: 'One', goal: 'g', format: 'explanation' }, { section: 'Basics', title: 'Two', goal: 'g', format: 'explanation' }, { section: 'Splits', title: 'Three', goal: 'g', format: 'table' }];
  const view = { ...viewOf([]), roadmap: { ...viewOf([]).roadmap, state: 'proposed', planVersion: 1, acceptedPlanVersion: null }, acceptedPlan: null, planDraft: { version: 1, outcome: 'o', acceptable: true, steps, settings: { depth: 'balanced' } } };
  const entry = entriesOf(held(view)).find(e => e.kind === 'draft');
  assert.match(entry.content, /\*\*Basics\*\*\n\n1\. \*\*One\*\*[^\n]*\n2\. \*\*Two\*\*[^\n]*\n\n\*\*Splits\*\*\n\n3\. \*\*Three\*\*/);
  const document = html('RoadmapPlan', { draft: entry.draft });
  assert.deepEqual([...document.querySelectorAll('[data-roadmap-section]')].map(n => n.textContent), ['Basics', 'Splits']);
  assert.equal(document.querySelectorAll('ol > li:not([data-roadmap-section])').length, 3);
});

test('the progress card: how many cards are made, the one being made, a fun fact, and Cancel', () => {
  const course = { total: 12, made: 4, failed: 1, current: 'Gini impurity', facts: ['Gini was named for an Italian statistician.', 'Another fact.'] };
  const document = html('CourseProgress', { course, onCancel: () => {} });
  assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '4');
  assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuemax'), '12');
  assert.match(document.querySelector('[data-course-count]').textContent, /^4 of 12 cards made · 1 could not be made$/);
  assert.equal(document.querySelector('[data-course-current]').textContent, 'Making Gini impurity');
  assert.match(document.querySelector('[data-course-fact]').textContent, /^Did you knowGini was named for an Italian statistician\.$/);
  assert.equal(document.querySelector('[data-course-cancel]').textContent, 'Cancel');
  assert.match(document.querySelector('[data-course-progress]').className, /pointer-events-none/, 'the veil lets the pointer through, the card takes clicks');
  assert.match(document.querySelector('[role="status"]').className, /pointer-events-auto/);
  const bare = html('CourseProgress', { course: { total: 3, made: 0, failed: 0, current: null, facts: [] }, onCancel: () => {} });
  assert.equal(bare.querySelector('[data-course-fact]'), null);
  assert.equal(bare.querySelector('[data-course-current]'), null);
  for (const text of Object.values(STRINGS.courseStopped)) assert.doesNotMatch(text, /\.\.\.|…|\$/);
});

test('the controller starts and stops the course with one guarded request each', async () => {
  const sent = [];
  const view = viewOf([step(1), step(2)]);
  const api = async (path, init = {}) => { sent.push([init.method || 'GET', path, init.body ? JSON.parse(init.body) : null]); return path.endsWith('course/start') ? { ...view, course: { running: true, total: 2, made: 0, failed: 0 } } : view; };
  const controller = createRoadmapController({ api, boardId: 'b1', host: { readOnly: () => false, hasBlock: () => false }, schedule: () => 0, cancel: () => {} });
  controller.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  await controller.startCourse();
  const start = sent.find(([, path]) => path.endsWith('course/start'));
  assert.ok(start, 'the start request went');
  assert.equal(start[2].boardId, 'b1');
  assert.equal(controller.getState().view.course.running, true);
  await controller.stopCourse();
  assert.ok(sent.some(([, path]) => path.endsWith('course/stop')));
  controller.stop();
});

test('the wiring: Accept opens the contents, Generate course runs the controller, the overlay reads the course and no Tab or pill remains', () => {
  const transcript = read('RoadmapTranscript.jsx'), surfaces = read('RoadmapSurfaces.jsx'), toc = read('TableOfContents.jsx'), hook = read('use-roadmap.js');
  assert.match(transcript, /case 'accept_roadmap': return roadmap\.acceptPlan\(\)\.then\(body => \{ if \(body\) \{ chat\.panels\.setTab\('toc'\); chat\.panels\.setOpen\(true\); \}/);
  assert.match(transcript, /case 'generate_course': return c\.startCourse\(\);/);
  assert.doesNotMatch(transcript, /case 'accept': |case 'cancel': |case 'propose_next'|case 'edit_card'/);
  assert.match(surfaces, /roadmap\.course && <CourseProgress course=\{roadmap\.course\}[^>]*onCancel=\{\(\) => roadmap\.stopCourse\(\)\}/);
  assert.doesNotMatch(surfaces, /ProposalOverlay/);
  assert.match(toc, /roadmap\?\.canStartCourse && !readOnly && .*data-toc-generate-course onClick=\{\(\) => roadmap\.startCourse\(\)\}>Generate course</);
  assert.match(hook, /canStartCourse: canStartCourse\(state\), canRetryCourse: canRetryCourse\(state\), course: courseOf\(state\), startCourse: \(\) => controller\.startCourse\(\), stopCourse: \(\) => controller\.stopCourse\(\), retryCourse: \(\) => controller\.retryCourse\(\)/);
  assert.match(read('LearnPage.jsx'), /roadmap\.expectInvitation\(\); droppedMarkdown\.current\.add\(block\.id\);/);
});

test('Try again: offered for a stopped course with cards that could not be made, in Chat and the contents, and the summary says how many; Edit waits while a course runs', () => {
  const done = [step(1, { state: 'delivered', stage: 'ready' }), step(2, { state: 'skipped', stage: 'skipped' })];
  const stopped = held(viewOf(done, { course: { running: false, stopped: 'incomplete', total: 2, made: 1, failed: 1 } }));
  assert.equal(canRetryCourse(stopped), true);
  assert.equal(canStartCourse(stopped), false, 'nothing is planned: only Try again');
  const accepted = entriesOf(stopped).find(e => e.kind === 'accepted');
  assert.deepEqual(accepted.actions.map(a => a.id), ['try_again', 'open_toc', 'edit_roadmap']);
  assert.equal(accepted.actions[0].label, 'Try again');
  assert.equal(accepted.content, '1 of 2 cards made. 1 could not be made.');
  assert.equal(canRetryCourse(held(viewOf(done, { course: { running: true, total: 2, made: 1, failed: 1 } }))), false, 'not while running');
  assert.equal(canRetryCourse(held(viewOf(done, { course: { running: false, total: 2, made: 2, failed: 0 } }))), false, 'nothing to retry');
  assert.equal(canRetryCourse(reduce(stopped, { type: 'begin', gesture: 'course:retry:rm_1:4' })), false, 'a retry in flight');
  const running = held(viewOf([step(1, { state: 'generating', stage: 'generating' }), step(2)], { course: { running: true, total: 2, made: 0, failed: 0 } }));
  assert.equal(entriesOf(running).find(e => e.kind === 'accepted').actions.find(a => a.id === 'edit_roadmap').disabled, true, 'no editing the plan while it is being made');
  assert.equal(routes.retryCourse(stopped.view, 'ak_3').path, '/api/learn/roadmap/rm_1/course/retry');
  assert.match(read('RoadmapTranscript.jsx'), /case 'try_again': return c\.retryCourse\(\);/);
  assert.match(read('TableOfContents.jsx'), /roadmap\?\.canRetryCourse && !readOnly && .*data-toc-try-again onClick=\{\(\) => roadmap\.retryCourse\(\)\}>Try again</);
  for (const reason of ['source_changed', 'failures', 'safety', 'incomplete']) assert.ok(STRINGS.courseStopped[reason], reason);
});

test('a paused roadmap can Generate course; a drop is invited over a stopped course but not a running one', () => {
  const steps = [step(1), step(2)];
  assert.equal(canStartCourse(held(viewOf(steps, { state: 'paused' }))), true);
  const offered = { id: 'iv_1', state: 'offered', title: 'New.md', sourceKeys: ['file:f2'] };
  const stopped = reduce(held(viewOf(steps, { course: { running: false, stopped: 'cancelled', total: 2, made: 0, failed: 0 } })), { type: 'invitation', invitation: offered });
  assert.ok(invitationOf(stopped));
  const running = reduce(held(viewOf(steps, { course: { running: true, total: 2, made: 0, failed: 0 } })), { type: 'invitation', invitation: offered });
  assert.equal(invitationOf(running), null);
  assert.match(STRINGS.boundary('New.md'), /A course is being made/);
  assert.doesNotMatch(STRINGS.boundary('New.md'), /End roadmap/);
});

test('typed words: "create a course" is a declared chat capability the router reads by its intent, never a phrase list (owner 2026-11-14)', async () => {
  const { CHAT_CAPABILITIES, chatRoutesWith, chatRouteRequest } = await import('./inline-ai-route.js');
  const { routeOutcome } = await import('./generation-proposal-chat.js');
  const { SLASH, SLASH_FLAGS } = await import('./agent/slash.js');
  const { chatCapability } = await import('./inline-ai-route.js');
  assert.match(CHAT_CAPABILITIES.course.intent, /document they added to the canvas/);
  assert.match(CHAT_CAPABILITIES.course.intent, /The test is the goal, not the words/);
  assert.equal(CHAT_CAPABILITIES.course.flow, 'direct');
  assert.ok(chatRoutesWith().course, 'offered to the router');
  assert.equal(CHAT_CAPABILITIES.course.standalone, true, 'no slash command: no picker row, colour or window card');
  assert.equal(SLASH.some(c => c.name === 'course'), false);
  assert.equal(SLASH_FLAGS.course, undefined);
  assert.equal(chatCapability('course').id, 'course', 'the server can route it');
  const request = chatRouteRequest({ text: 'turn this into a study course' }, 'jev-model', chatRoutesWith());
  assert.ok(JSON.stringify(request).includes('document they added to the canvas'), 'the router is asked with the capability\'s intent');
  const source = read('inline-ai-route.js');
  assert.doesNotMatch(source.slice(source.indexOf('course: { flow')), /^\s*course: \{[^\n]*\/[^\n]*\/i/, 'no regular expression of phrases');
  assert.deepEqual(routeOutcome({ route: 'capability:course', capability: 'course', flow: 'direct', args: 'create a course' }), { direct: { command: 'course', args: 'create a course' } }, 'the router\'s answer runs the command');
  const page = read('LearnPage.jsx');
  assert.match(page, /startCourse: words => \{/);
  assert.match(page, /roadmap\.controller\.lesson\(\{ depth: chat\?\.settings\?\.depth \|\| 'balanced', instruction: String\(words \|\| ''\)\.trim\(\) \|\| 'Create a course from this document\.'/);
  assert.match(read('ask.jsx'), /outcome\.direct\?\.command === 'course' && chat\?\.canvasOps\?\.startCourse/);
});

test('the waiting shimmer never ends silently: no invitation after a minute is said in Chat (owner 2026-11-14)', async () => {
  const timers = [];
  const controller = createRoadmapController({ api: async () => ({ roadmap: null }), boardId: 'b1', host: { readOnly: () => false, hasBlock: () => false }, schedule: fn => timers.push(fn) && timers.length, cancel: () => {} });
  controller.start(); await new Promise(resolve => setTimeout(resolve, 10));
  controller.expectInvitation();
  assert.equal(controller.getState().waiting, true);
  timers.at(-1)();
  assert.equal(controller.getState().waiting, false);
  assert.equal(controller.getState().notice, STRINGS.prepareFailed);
  assert.doesNotMatch(STRINGS.prepareFailed, /\.\.\.|…/);
});

test('Create a course is a row of the Insert menu, disabled while a course runs; a canvas that cannot make one has no row; and the canvas fits itself to a finished course', async () => {
  const { ownerInsertItems } = await import('./canvas-menus.js');
  const rowOf = options => ownerInsertItems({ canvas: () => null, onUpload() {}, onSearchSources() {}, onLinkToCanvas() {}, ...options }).find(item => item.label === 'Create a course');
  assert.equal(rowOf({}), undefined, 'no handler, no row');
  const on = Object.assign(() => {}, { disabled: false });
  assert.equal(rowOf({ onCreateCourse: on }).disabled, false);
  assert.equal(rowOf({ onCreateCourse: Object.assign(() => {}, { disabled: true }) }).disabled, true);
  const page = read('LearnPage.jsx');
  assert.match(page, /onCreateCourse: canEditCanvas && roadmap\.on \? Object\.assign\(\(\) => \{ const done = chat\.canvasOps\?\.startCourse\?\.\(''\)/);
  assert.match(page, /if \(courseWas\.current && !on && !roadmap\.state\.view\?\.course\?\.stopped\) canvasApi\.current\?\.zoomFit\?\.\(\);/);
  const controllerSource = read('roadmap-controller.js');
  assert.match(controllerSource, /unsaved \+= 1; if \(unsaved === 3\) dispatch\(\{ type: 'refused', message: STRINGS\.saveFailed \}\)/);
  assert.match(STRINGS.saveFailed, /could not be saved to this canvas/);
});
