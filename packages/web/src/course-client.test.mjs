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
import { canStartCourse, courseOf, initialState, pillOf, reduce, routes, tocOf } from './roadmap-client.js';
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
  assert.deepEqual(accepted.actions.map(a => a.id), ['generate_course', 'open_toc', 'edit_roadmap', 'end']);
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
  assert.match(hook, /canStartCourse: canStartCourse\(state\), course: courseOf\(state\), startCourse: \(\) => controller\.startCourse\(\), stopCourse: \(\) => controller\.stopCourse\(\)/);
  assert.match(read('LearnPage.jsx'), /roadmap\.expectInvitation\(\); droppedMarkdown\.current\.add\(block\.id\);/);
});
