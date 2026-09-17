import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleLearnCourse, validateCurriculum, validateGeneratedLesson } from '../src/learn-course.js';
import { CURRICULUM_SYSTEM, planCurriculum, validateCurriculumPlan, durationMinutes } from '../src/curriculum-agent.js';

const owner = { email: 'owner@example.test' };
const brief = { audience: 'App users', goal: 'Interpret results', knowledge: 'New to the topic', duration: '10 minutes' };
const curriculum = { version: 2, title: 'Understand the counter', minutes: 10,
  outcomes: ['Explain how a shared value differs from a local value'], prerequisites: [],
  assumptions: ['No database knowledge assumed'], excludedTopics: ['Database administration is outside the user goal'],
  lessons: [{ title: 'One shared count', objective: 'Explain persistence', topics: ['Shared state', 'Persistence'],
    principles: ['A saved value outlives a page refresh'], requires: [], rationale: 'Shared state is required to interpret changes made by colleagues.',
    minutes: 10, assessment: 'Explain whether a refresh changes the stored value; distinguish reading from writing.', evidence: 'app.py: SQLite update; intent is not recorded.' }] };
const planned = { ...curriculum.lessons[0], pages: curriculum.lessons[0].topics };
const lesson = { pages: [{ narration: 'The count is shared.', blocks: [{ kind: 'diagram', text: 'User → counter → saved value' }] }, { narration: 'What happens when another user increments it?', blocks: [{ kind: 'question', text: 'Does a refresh reset the counter?' }] }] };
function fixture(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec('CREATE TABLE apps (id INTEGER PRIMARY KEY); INSERT INTO apps VALUES (1), (2)');
  db.exec(readFileSync(new URL('../migrations/0024-learn-courses.sql', import.meta.url), 'utf8'));
  const env = { calls: [], output: curriculum, deploy: 7, DB: { prepare: sql => ({ bind: (...p) => ({
    first: async () => db.prepare(sql).get(...p) || null,
    run: async () => ({ meta: { changes: db.prepare(sql).run(...p).changes } }),
  }) }) } };
  const deps = {
    appForUser: async (_, user, name) => user.email === 'denied@example.test' ? null : { id: name === 'other' ? 2 : 1, name, org: 'example', owner_email: owner.email, canView: true, runbook: 'A shared counter.' },
    sourceSection: async () => ({ deployId: env.deploy, text: 'app.py: UPDATE counter SET value=value+1' }),
    generate: async (...args) => { env.calls.push(args); if (env.pending) await env.pending; return env.output; },
  };
  const send = (body, user = owner, name = 'counter') => handleLearnCourse(new Request('https://small.test/api/apps/counter/learn-course', body ? { method: 'POST', body: JSON.stringify(body) } : {}), env, user, name, deps);
  const post = async (action, extras = {}) => {
    const current = await (await send()).json();
    return send({ revision: current.revision ?? current.course?.revision ?? 0, action, ...extras });
  };
  const draft = async () => { assert.equal((await post('brief', { brief })).status, 200); assert.equal((await post('draft')).status, 200); };
  return { env, send, post, draft };
}

test('owner interview, source-grounded draft, approval, and generation persist per app', async t => {
  const { env, draft, post, send } = fixture(t);
  await draft();
  assert.equal(env.calls[0][2].source.includes('app.py'), true);
  assert.deepEqual(env.calls[0][2].brief, brief);
  assert.equal((await post('generate')).status, 409);
  await post('approve'); env.output = lesson;
  const result = await (await post('generate')).json();
  assert.equal(result.course.approved, true);
  assert.equal(result.course.lesson.pages.length, 2);
  assert.equal(result.course.lesson.id, 'course-1-4');
  assert.deepEqual((await (await send()).json()).course, result.course);
  assert.equal((await (await send(null, owner, 'other')).json()).course, null);
});

test('viewers cannot author; unapproved drafts are private; app access is checked', async t => {
  const { send, draft, post, env } = fixture(t);
  await draft(); const colleague = { email: 'colleague@example.test' };
  assert.equal((await (await send(null, colleague)).json()).course, null);
  assert.equal((await send({ action: 'approve', revision: 2 }, colleague)).status, 403);
  assert.equal((await send(null, { email: 'denied@example.test' })).status, 404);
  await post('approve');
  assert.equal((await (await send(null, colleague)).json()).course.approved, true);
  assert.equal(env.calls.length, 2);
});

test('edits revoke approval and generated content; approval ignores client replacements', async t => {
  const { post, draft, env } = fixture(t); await draft();
  const approved = await (await post('approve', { brief: { ...brief, goal: 'Injected goal' }, curriculum: {} })).json();
  assert.equal(approved.course.brief.goal, brief.goal);
  env.output = lesson; await post('generate');
  const edited = await (await post('save', { brief, curriculum: { ...curriculum, title: 'Edited title' } })).json();
  assert.equal(edited.course.approved, false); assert.equal(edited.course.lesson, null);
  assert.equal((await post('generate')).status, 409);
});

test('invalid or incomplete model responses do not overwrite the saved course', async t => {
  const { draft, post, env, send } = fixture(t); await draft();
  const before = (await (await send()).json()).course;
  env.output = { title: 'No lessons' };
  assert.equal((await post('draft')).status, 502);
  assert.deepEqual((await (await send()).json()).course, before);
  assert.throws(() => validateCurriculum({ ...curriculum, lessons: [] }));
  assert.throws(() => validateGeneratedLesson({ pages: [lesson.pages[0]] }, planned));
  assert.throws(() => validateGeneratedLesson({ pages: lesson.pages.map(p => ({ ...p, blocks: [{ kind: 'execute', text: 'run code' }] })) }, planned));
});

test('a redeploy requires a new curriculum review before generation', async t => {
  const { draft, post, env } = fixture(t); await draft(); await post('approve');
  env.deploy = 8;
  assert.equal((await post('generate')).status, 409); assert.equal(env.calls.length, 2);
});

test('a pending generation cannot overwrite a concurrently edited curriculum', async t => {
  const { draft, post, send, env } = fixture(t); await draft(); await post('approve');
  let release; env.pending = new Promise(resolve => { release = resolve; }); env.output = lesson;
  const pending = post('generate');
  while (env.calls.length < 3) await new Promise(resolve => setTimeout(resolve, 1));
  const edit = await post('save', { brief, curriculum: { ...curriculum, title: 'Newer edit' } });
  assert.equal(edit.status, 200); release();
  assert.equal((await pending).status, 409);
  const result = await (await send()).json(); assert.equal(result.course.curriculum.title, 'Newer edit'); assert.equal(result.course.lesson, null);
});

test('stale revisions and missing interview answers never start model work', async t => {
  const { send, post, env } = fixture(t);
  assert.equal((await post('draft')).status, 400);
  await post('brief', { brief: { audience: 'Developers' } });
  assert.equal((await send({ action: 'brief', brief, revision: 0 })).status, 409);
  assert.equal(env.calls.length, 0);
});

test('section editing changes only returned text, retaining curriculum and approval', async t => {
  const { post, draft, env, send } = fixture(t);
  await draft(); await post('approve');
  const before = (await (await send()).json()).course;
  env.output = { text: 'Revised learner explanation.' };
  const result = await post('revise_section', { section: { id: 'page-1-text', title: 'Below the canvas', text: 'Original explanation.' }, page: 'Page 1', context: 'Text and diagram planned for this page.', sourceVersion: '7', instruction: 'Make this shorter.' });
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).section, { id: 'page-1-text', title: 'Below the canvas', text: 'Revised learner explanation.' });
  assert.deepEqual((await (await send()).json()).course, before);
  assert.equal(env.calls.length, 3);
  assert.match(env.calls[2][2].source, /app.py/);
  assert.match(env.calls[2][4], /No executable HTML, scripts, or asset generation/);
});

test('section editing rejects viewers, stale sources and oversized content before generation', async t => {
  const { send, post, env } = fixture(t);
  const body = { action: 'revise_section', revision: 0, section: { id: 'a', title: 'Assets', text: 'Draw tiles.' }, page: 'Page 1', context: 'A diagram.', sourceVersion: '7', instruction: 'Simplify.' };
  assert.equal((await send(body, { email: 'colleague@example.test' })).status, 403);
  assert.equal((await send({ ...body, sourceVersion: 'old' })).status, 409);
  assert.equal((await send({ ...body, section: { ...body.section, text: 'a'.repeat(8001) } })).status, 400);
  assert.equal(env.calls.length, 0);
  env.output = { text: '' };
  assert.equal((await post('revise_section', body)).status, 400);
  assert.equal((await (await send()).json()).course, null);
});

test('pending section edit rejects a changed curriculum', async t => {
  const { post, env, draft } = fixture(t); await draft();
  let release; env.pending = new Promise(resolve => { release = resolve; }); env.output = { text: 'Old draft edit' };
  const pending = post('revise_section', { section: { id: 'a', title: 'Assets', text: 'Draw tiles.' }, page: 'Page 1', context: 'A diagram.', instruction: 'Simplify.' });
  while (env.calls.length < 3) await new Promise(resolve => setTimeout(resolve, 1));
  await post('save', { brief, curriculum }); release();
  assert.equal((await pending).status, 409);
});

test('Curriculum Agent drafts and reviews with its own instructions and does not seed a legacy slide outline', async () => {
  const calls = [];
  const result = await planCurriculum(async (...args) => { calls.push(args); return curriculum; }, {}, 'test', {
    brief, source: 'Synthetic source', curriculum: { title: 'Deployment walkthrough', lessons: [{ pages: ['Click Run'] }] },
  }, 'Focus on shared state');
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2].curriculum, null);
  assert.equal(calls[0][4], CURRICULUM_SYSTEM);
  assert.equal(calls[1][4], CURRICULUM_SYSTEM);
  assert.deepEqual(calls[1][2].candidate, curriculum);
  assert.match(calls[1][3], /Review and correct/);
  assert.equal(result.version, 2);
  assert.equal(result.lessons[0].pages, undefined);
});

test('curriculum validation rejects slide plans, missing principles, missing assessment, and excessive budgets', () => {
  assert.throws(() => validateCurriculumPlan({ ...curriculum, lessons: [{ ...curriculum.lessons[0], pages: ['Start with an example'] }] }), /not planned pages/);
  assert.throws(() => validateCurriculumPlan({ ...curriculum, lessons: [{ ...curriculum.lessons[0], principles: [] }] }), /principles/);
  assert.throws(() => validateCurriculumPlan({ ...curriculum, lessons: [{ ...curriculum.lessons[0], assessment: '' }] }), /assessment/);
  assert.throws(() => validateCurriculumPlan({ ...curriculum, minutes: 5 }), /exceed/);
  assert.throws(() => validateCurriculumPlan(curriculum, '5 minutes'), /requested duration/);
  assert.equal(durationMinutes('0.5 hours'), 30);
  assert.equal(durationMinutes('20 minutes'), 20);
  assert.equal(durationMinutes('a short course'), null);
});

test('legacy saved outlines remain usable until the owner rebuilds them', async t => {
  const { post, send, env, draft } = fixture(t);
  const old = { title: 'Old course', lessons: [{ title: 'Old lesson', objective: 'Explain the count', pages: ['Count', 'Refresh'], evidence: 'Runbook' }] };
  await draft();
  assert.equal((await post('save', { curriculum: old, brief })).status, 200);
  await post('approve'); env.output = lesson;
  assert.equal((await post('generate')).status, 200);
  assert.equal((await (await send()).json()).course.lesson.pages[0].title, 'Count');
  env.output = curriculum;
  const rebuilt = await (await post('draft')).json();
  assert.deepEqual(rebuilt.course.brief, brief);
  assert.equal(rebuilt.course.curriculum.version, 2);
  assert.equal(rebuilt.course.approved, false);
});

test('deleting a curriculum requires owner, confirmation and current revision, and permits starting again', async t => {
  const { draft, post, send, env } = fixture(t); await draft();
  await post('approve'); env.output = lesson; await post('generate');
  const before = (await (await send()).json()).course;
  assert.equal((await post('delete')).status, 400);
  assert.equal((await send({ action: 'delete', confirm: true, revision: before.revision }, { email: 'colleague@example.test' })).status, 403);
  assert.equal((await post('delete', { confirm: true, revision: before.revision - 1 })).status, 409);
  assert.deepEqual((await (await send()).json()).course, before);
  assert.equal((await post('delete', { confirm: true })).status, 200);
  assert.equal((await (await send()).json()).course, null);
  const stored = await env.DB.prepare('SELECT * FROM learn_courses WHERE app_id = ?').bind(1).first();
  assert.equal(stored.brief, '{}');
  for (const field of ['curriculum', 'approved_revision', 'lesson', 'source_version']) assert.equal(stored[field], null);
  const restarted = await (await post('brief', { brief: { audience: 'New audience' } })).json();
  assert.equal(restarted.course.brief.audience, 'New audience');
  assert.equal(restarted.course.revision, before.revision + 2);
});

test('pending generation cannot resurrect a deleted curriculum, even after starting a new one', async t => {
  const { draft, post, send, env } = fixture(t); await draft(); await post('approve');
  let release; env.pending = new Promise(resolve => { release = resolve; }); env.output = lesson;
  const pending = post('generate');
  while (env.calls.length < 3) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal((await post('delete', { confirm: true })).status, 200);
  await post('brief', { brief: { audience: 'Replacement audience' } });
  release(); assert.equal((await pending).status, 409);
  const current = (await (await send()).json()).course;
  assert.equal(current.brief.audience, 'Replacement audience');
  assert.equal(current.curriculum, null); assert.equal(current.lesson, null);
});
