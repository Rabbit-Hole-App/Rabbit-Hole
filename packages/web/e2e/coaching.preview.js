// Existing app UI with synthetic API reads. Capture must never write or call a model.
import { test, expect } from '@playwright/test';
import { sampleApp } from '../src/coaching/sample-data.js';
import { validateLessonSnapshot } from '../../control-plane/src/learn-context.js';
import { validateCurriculumPlan } from '../../control-plane/src/curriculum-agent.js';

const origin = 'http://127.0.0.1:5186';
test.beforeEach(async ({ page }) => {
  const unexpected = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.coachingState = { unexpected, errors };
  const responses = {
    '/api/apps': { org: sampleApp.org, orgName: sampleApp.orgName, email: sampleApp.email, apps: [sampleApp], folders: [] },
    '/api/apps/shared-counter': sampleApp,
    '/api/apps/shared-counter/learn-course': { course: null, canAuthor: true },
    '/api/byoc/connection': { connection: null },
    '/api/workspaces': { active: sampleApp.org, email: sampleApp.email, workspaces: [{ slug: sampleApp.org, name: sampleApp.orgName, role: 'owner', kind: 'custom' }] },
    '/api/ask/threads': { threads: [{ id: 'sample-thread', title: 'Counter questions' }] },
    '/api/ask/threads/sample-thread': { id: 'sample-thread', messages: [] },
    '/api/watch': { observations: [], runs: [] }, '/api/teams': { teams: [] }, '/api/members': { members: [] },
  };
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    // tldraw's default icons, fonts, and translations; no canvas contents are uploaded.
    if (url.origin === 'https://cdn.tldraw.com' && request.method() === 'GET') return route.continue();
    if (url.origin === origin && request.method() === 'GET' && responses[url.pathname]) return route.fulfill({ json: responses[url.pathname] });
    unexpected.push(request.method() + ' ' + url.origin + url.pathname);
    return route.abort();
  });
  await page.goto('/apps/shared-counter?tab=agent');
  await expect(page.getByRole('tab', { name: 'Chat', exact: true })).toHaveAttribute('data-state', 'active');
});
test.afterEach(async ({ page }) => {
  expect(page.coachingState.errors).toEqual([]);
  expect(page.coachingState.unexpected).toEqual([]);
});

async function openStep(page, title) {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('tab', { name: 'Capture', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
  return dialog;
}

test('Curriculum deletion confirms or cancels, handles failure, preserves learner drawings, and restarts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let revision = 4, rejectDelete = true;
  let course = { revision, brief: { audience: 'App users', goal: 'Read the counter', knowledge: 'None', duration: '10 minutes' }, approved: true,
    curriculum: { title: 'Counter course', lessons: [{ title: 'Shared count', objective: 'Explain a shared value', pages: ['A shared count'], evidence: 'Synthetic source' }] },
    lesson: { id: 'course-1-4', title: 'Shared count', pages: [{ title: 'A shared count', narration: 'A saved explanation.', blocks: [{ kind: 'text', text: 'Course-owned explanation' }] }] } };
  const mutations = [];
  await page.route('**/api/apps/shared-counter/learn-course', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); mutations.push(body); expect(body.revision).toBe(revision);
      if (body.action === 'delete') {
        expect(body.confirm).toBe(true);
        if (rejectDelete) { rejectDelete = false; return route.fulfill({ status: 503, json: { error: 'Deletion failed. Try again.' } }); }
        course = null; revision++;
      } else if (body.action === 'brief') course = { revision: ++revision, brief: body.brief, curriculum: null, approved: false, lesson: null };
      else throw new Error('Unexpected action');
    }
    return route.fulfill({ json: { course, revision, canAuthor: true } });
  });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('button', { name: 'Preview first lesson', exact: true }).click();
  await expect(page.locator('.tl-shape').filter({ hasText: 'Course-owned explanation' })).toBeVisible();
  const bounds = await page.locator('.tl-canvas').boundingBox();
  await page.getByTestId('tools.draw').click();
  await page.mouse.move(bounds.x + 100, bounds.y + 350); await page.mouse.down();
  await page.mouse.move(bounds.x + 170, bounds.y + 390, { steps: 8 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('textbox', { name: 'Course title', exact: true }).fill('Unsaved title');
  await page.getByRole('button', { name: 'Delete curriculum', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete curriculum?', exact: true });
  await expect(dialog).toContainText('Your app and chat history will stay');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(mutations).toHaveLength(0);
  await expect(page.getByRole('textbox', { name: 'Course title', exact: true })).toHaveValue('Unsaved title');
  await page.getByRole('button', { name: 'Delete curriculum', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Deletion failed');
  await expect(page.getByRole('textbox', { name: 'Course title', exact: true })).toHaveValue('Unsaved title');
  await page.getByRole('button', { name: 'Delete curriculum', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create a course', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete curriculum', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lesson chat', exact: true }).click();
  await expect(page.locator('.tl-shape').filter({ hasText: 'Course-owned explanation' })).toHaveCount(0);
  await expect(page.locator('.tl-shape[data-shape-type="draw"]')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('button', { name: 'Colleagues using the app', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Audience', exact: true })).toHaveValue('Colleagues using the app');
  expect(course.revision).toBe(6);
});

test('Curriculum Agent rebuilds a legacy outline as topics and principles while keeping the owner brief', async ({ page }, testInfo) => {
  const brief = { audience: 'People learning the underlying concepts', goal: 'Run the app and interpret its results', knowledge: 'Know the basics', duration: '20 minutes' };
  let course = { revision: 3, brief, approved: false, curriculum: { title: 'Previous walkthrough', lessons: [{ title: 'Run form', objective: 'List the inputs', pages: ['Open the Run form'], evidence: 'Synthetic runbook' }] } };
  const plan = { version: 2, title: 'Interpreting detection results', minutes: 20,
    outcomes: ['Evaluate detection results and justify a confidence threshold'], prerequisites: ['Basic image classification'], assumptions: ['The learner recognizes class labels; confidence interpretation is not assumed'], excludedTopics: ['AWS administration is unnecessary for the stated learning outcome'],
    lessons: [{ title: 'Detection outputs', objective: 'Distinguish labels, localization, and scores', topics: ['Object localization', 'Model confidence'], principles: ['A score ranks a prediction; it does not guarantee correctness'], requires: ['Basic image classification'], rationale: 'These concepts are required before selecting a threshold.', minutes: 10, assessment: 'Identify the label, location, and score in a result, and explain why a high score may still be wrong.', evidence: 'General object-detection concepts' },
      { title: 'Threshold decisions', objective: 'Justify a threshold using error costs', topics: ['False positives and missed detections', 'Confidence thresholds'], principles: ['Raising a threshold can remove both false and true detections'], requires: ['Model confidence'], rationale: 'Threshold choices depend on interpreting scores.', minutes: 10, assessment: 'Justify a threshold choice by stating the consequences of both error types.', evidence: 'General concepts; supplied app accepts a threshold' }] };
  let releaseDraft;
  await page.route('**/api/apps/shared-counter/learn-course', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.revision).toBe(course.revision);
      if (body.action === 'draft') {
        await new Promise(resolve => { releaseDraft = resolve; });
        course = { ...course, curriculum: plan, revision: course.revision + 1, approved: false };
      }
      else if (body.action === 'save') {
        try { validateCurriculumPlan(body.curriculum, body.brief.duration); }
        catch (e) { return route.fulfill({ status: 400, json: { error: e.message } }); }
        course = { ...course, curriculum: body.curriculum, brief: body.brief, revision: course.revision + 1, approved: false };
      } else if (body.action === 'approve') course = { ...course, revision: course.revision + 1, approved: true };
      else throw new Error('Unexpected curriculum action');
    }
    return route.fulfill({ json: { course, canAuthor: true } });
  });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Curriculum Agent', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rebuild with Curriculum Agent', exact: true }).click();
  const working = page.getByRole('progressbar', { name: 'Curriculum generation in progress' });
  await expect(working).toBeVisible();
  await expect(working).not.toHaveAttribute('aria-valuenow');
  await expect(page.locator('[data-course-elapsed]')).not.toHaveText('0:00 elapsed', { timeout: 3000 });
  await expect(page.getByRole('button', { name: 'Planning and reviewing…', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('curriculum-progress.png') });
  releaseDraft();
  await expect(working).toHaveCount(0);
  await expect(page.getByRole('heading', { name: plan.title })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Audience', exact: true })).toHaveValue(brief.audience);
  await expect(page.getByRole('textbox', { name: 'Previous planned pages', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Topics', exact: true }).first()).toHaveValue('Object localization\nModel confidence');
  await expect(page.getByRole('textbox', { name: 'Principles to learn', exact: true }).first()).toHaveValue(plan.lessons[0].principles[0]);
  await expect(page.getByRole('textbox', { name: 'Assumptions to confirm', exact: true })).toHaveValue(plan.assumptions[0]);
  await expect(page.getByText('20 minutes allocated, including assessment.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('curriculum-agent-scope.png') });
  const time = page.getByRole('spinbutton', { name: 'Minutes, including assessment', exact: true }).first();
  await time.fill('30');
  await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unit times exceed the course budget');
  await time.fill('9');
  await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
  await page.getByRole('button', { name: 'Approve curriculum', exact: true }).click();
  await expect(page.getByText('Curriculum approved', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Minutes, including assessment', exact: true }).first()).toHaveValue('9');
});

test('Learn course interviews, reviews, approves, generates, reloads, and invalidates edited lessons', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let course = null;
  const calls = [];
  const curriculum = { title: 'Understand the shared counter', lessons: [
    { title: 'One count for the team', objective: 'Explain what an increment changes.', pages: ['A shared number', 'Try it yourself'], evidence: 'app.py: increment and SQLite update.' },
    { title: 'Keep the count', objective: 'Explain persistence.', pages: ['Why save it?'], evidence: 'app.py: database writes; the original rationale is unknown.' },
  ] };
  await page.route('**/api/apps/shared-counter/learn-course', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); calls.push(body);
      expect(body.revision).toBe(course?.revision || 0);
      const revision = body.revision + 1;
      if (body.action === 'brief') course = { revision, brief: body.brief, curriculum: null, approved: false, lesson: null };
      if (body.action === 'draft') course = { ...course, revision, curriculum: structuredClone(curriculum), approved: false, lesson: null };
      if (body.action === 'save') course = { ...course, revision, brief: body.brief, curriculum: body.curriculum, approved: false, lesson: null };
      if (body.action === 'approve') course = { ...course, revision, approved: true };
      if (body.action === 'generate') {
        expect(course.approved).toBe(true);
        course = { ...course, revision, lesson: { id: `course-1-${revision}`, title: course.curriculum.lessons[0].title,
          pages: course.curriculum.lessons[0].pages.map(title => ({ title, narration: 'The counter is shared by the team.', blocks: [{ kind: 'diagram', text: 'Click → increment → shared value' }, { kind: 'question', text: 'What does your colleague see after you increment?' }] })) } };
      }
    }
    await route.fulfill({ json: { course, canAuthor: true } });
  });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  const setup = page.getByRole('complementary', { name: 'Learn agent chat' });
  for (const answer of ['Colleagues using the app', 'Run the app and interpret its results', 'New to this topic', '10 minutes']) {
    await setup.getByRole('button', { name: answer, exact: true }).click();
    await expect(setup.getByText(answer, { exact: true })).toBeVisible();
  }
  await setup.getByRole('button', { name: 'Draft curriculum', exact: true }).click();
  await expect(page.getByRole('heading', { name: curriculum.title })).toBeVisible();
  expect(calls.filter(c => c.action === 'generate')).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('course-draft.png') });
  await page.getByRole('button', { name: 'Move lesson 2 up', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Lesson 1 title', exact: true })).toHaveValue('Keep the count');
  await expect(page.getByRole('button', { name: 'Approve curriculum', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
  await page.getByRole('button', { name: 'Move lesson 1 down', exact: true }).click();
  await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
  await page.getByRole('button', { name: 'Approve curriculum', exact: true }).click();
  await expect(page.getByText('Curriculum approved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate first lesson', exact: true }).click();
  const controls = page.getByLabel('Lesson playback');
  await expect(controls).toContainText('Page 2 of 2');
  await expect(page.locator('.tl-shape').filter({ hasText: 'What does your colleague see' })).toBeVisible();
  await expect(setup.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await expect(setup.getByRole('button', { name: 'New chat', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('generated-course.png') });
  let snapshot;
  await page.route('**/api/learn/selection', route => {
    snapshot = route.request().postDataJSON().lesson_snapshot;
    validateLessonSnapshot(snapshot);
    return route.fulfill({ contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"Your colleague sees the same shared count after refreshing."}\n\nevent: done\ndata: {}\n\n' });
  });
  const block = await page.locator('.tl-shape').filter({ hasText: 'What does your colleague see' }).boundingBox();
  await page.mouse.click(block.x + block.width / 2, block.y + block.height / 2);
  await expect(setup.getByRole('button', { name: 'Ask about selection', exact: true })).toHaveCount(0);
  const question = setup.getByPlaceholder('Ask about shared-counter…');
  await question.fill('What is the answer?'); await question.press('Enter');
  await expect(setup.getByText('Your colleague sees the same shared count after refreshing.', { exact: true })).toBeVisible();
  expect(snapshot.lessonId).toBe(course.lesson.id);
  expect(snapshot.relatedObjects.some(o => o.originalText.includes('increment'))).toBe(true);
  await controls.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(controls).toContainText('Page 1 of 2');
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('button', { name: 'Preview first lesson', exact: true }).click();
  await expect(controls).toContainText('Page 2 of 2');
  await page.getByTestId('page-menu.button').click();
  await expect(page.getByTestId('page-menu.item')).toHaveCount(3); // Initial learner canvas + two reused course pages.
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await expect(page.getByText('Curriculum approved', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Lesson 1 title', exact: true }).fill('An updated introduction');
  await page.getByRole('button', { name: 'Save curriculum', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve curriculum', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Preview first lesson', exact: true })).toHaveCount(0);
  expect(course.approved).toBe(false); expect(course.lesson).toBe(null);
});

test('Learn opens enlarged with separate chat history, breadcrumbs, and working return navigation', async ({ page }, testInfo) => {
  const agentMessages = [{ role: 'assistant', content: 'Your existing app conversation.' }];
  const threads = new Map([['learn-1', { id: 'learn-1', title: 'Previous lesson', messages: [{ role: 'assistant', content: 'Your separate Learn conversation.' }] }]]);
  await page.route('**/api/ask/threads/sample-thread', route => route.fulfill({ json: { id: 'sample-thread', messages: agentMessages } }));
  await page.route(/\/api\/ask\/threads\?/, route => {
    const url = new URL(route.request().url());
    const rows = url.searchParams.get('scope') === 'learn' ? [...threads.values()].reverse().map(({ id, title }) => ({ id, title })) : [{ id: 'sample-thread', title: 'Counter questions' }];
    expect(url.searchParams.get('ref')).toBe('shared-counter');
    return route.fulfill({ json: { threads: rows } });
  });
  await page.route(/\/api\/ask\/threads\/learn-\d+$/, route => route.fulfill({ json: threads.get(new URL(route.request().url()).pathname.split('/').pop()) }));
  await page.route('**/api/learn/ask', async route => {
    const payload = route.request().postDataJSON();
    expect(payload.scope).toEqual({ app: 'shared-counter' });
    expect(payload.thread_id).not.toBe('sample-thread');
    const id = payload.thread_id || `learn-${threads.size + 1}`;
    const thread = threads.get(id) || { id, title: payload.message, messages: [] };
    thread.messages.push({ role: 'user', content: payload.message }, { role: 'assistant', content: 'This app shares a counter with your team.' });
    threads.set(id, thread);
    await route.fulfill({ contentType: 'text/event-stream', body: `event: chunk\ndata: {"text":"This app shares a counter with your team."}\n\nevent: done\ndata: ${JSON.stringify({ threadId: id })}\n\n` });
  });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await expect(page).toHaveURL(/\?tab=learn$/);
  const learn = page.getByRole('region', { name: 'Learn', exact: true });
  const chat = page.getByRole('complementary', { name: 'Learn agent chat' });
  await expect(learn.getByRole('heading', { name: 'Learn', exact: true })).toBeVisible();
  await expect(learn.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Apps/shared-counter/Learn');
  await expect(page.locator('[data-shell-sidebar]')).toBeVisible();
  await expect(chat.getByText('Your existing app conversation.')).toHaveCount(0);
  await expect(chat.getByText('Your separate Learn conversation.')).toBeVisible();
  await expect(chat.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  const titleBox = await chat.getByRole('heading', { name: 'Learn Agent' }).boundingBox();
  for (const name of ['History', 'New chat']) {
    const box = await chat.getByRole('button', { name, exact: true }).boundingBox();
    expect(Math.abs(box.y + box.height / 2 - titleBox.y - titleBox.height / 2)).toBeLessThan(2);
  }
  const learnBox = await learn.boundingBox(), chatBox = await chat.boundingBox();
  expect(chatBox.x).toBeGreaterThanOrEqual(learnBox.x + learnBox.width - 1);
  const canvas = learn.locator('.tl-canvas');
  await expect(canvas).toBeVisible();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox.height).toBeGreaterThan(300);
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(chatBox.x);
  await learn.getByTestId('tools.draw').click();
  await page.mouse.move(canvasBox.x + 120, canvasBox.y + 150);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 240, canvasBox.y + 220, { steps: 12 });
  await page.mouse.up();
  await expect(learn.locator('.tl-shape')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(learn.locator('.tl-shape')).toHaveCount(0);
  const input = chat.getByPlaceholder('Ask about shared-counter…');
  await input.fill('What does this app do?');
  await input.press('Enter');
  await expect(chat.getByText('This app shares a counter with your team.')).toBeVisible();
  await chat.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(chat.getByText('Your separate Learn conversation.')).toHaveCount(0);
  await input.fill('A new lesson');
  await input.press('Enter');
  await expect(chat.getByText('This app shares a counter with your team.')).toBeVisible();
  await chat.getByRole('button', { name: 'History', exact: true }).click();
  await expect(chat.getByRole('button', { name: /^A new lesson/ })).toBeVisible();
  await expect(chat.getByText('Counter questions', { exact: true })).toHaveCount(0);
  await chat.getByRole('button', { name: /^Previous lesson/ }).click();
  await expect(chat.getByText('Your separate Learn conversation.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('learn-expanded.png'), animations: 'disabled' });
  await page.goBack();
  await expect(page.getByRole('tab', { name: 'Agent', exact: true })).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('Your existing app conversation.')).toBeVisible();
  await expect(page.getByText('This app shares a counter with your team.')).toHaveCount(0);
  await page.goForward();
  await expect(chat).toBeVisible();
  await page.getByRole('button', { name: 'Minimize Learn' }).click();
  await expect(page).toHaveURL('/apps/shared-counter');
  await expect(page.getByRole('tab', { name: 'Learn', exact: true })).toBeVisible();
  await page.goto('/apps/shared-counter?tab=learn');
  await expect(chat).toBeVisible();
  await expect(chat.getByText('A new lesson', { exact: true })).toBeVisible();
  await expect(chat.getByText('Your existing app conversation.')).toHaveCount(0);
  await learn.getByRole('button', { name: 'shared-counter', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Runbook', exact: true })).toHaveAttribute('data-state', 'active');
});

test('Learn plays all three pages continuously and replays without duplicating them', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  const controls = page.getByLabel('Lesson playback');
  const demo = page.getByRole('button', { name: /Explain the sigmoid function/ });
  await expect(demo).toBeEnabled(); await demo.click(); await expect(demo).toBeEnabled();
  await expect(controls).toContainText('Page 3 of 3 · The sigmoid function');
  await expect(page.locator('.tl-shape')).toHaveCount(14);
  await controls.getByRole('button', { name: 'Back', exact: true }).click();
  await controls.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(controls).toContainText('Page 1 of 3 · What is logistic regression?');
  await expect(page.locator('.tl-shape')).toHaveCount(5);
  await expect(page.locator('.tl-shape').filter({ hasText: 'Where to use it' })).toBeVisible();
  await page.getByRole('button', { name: '2. The formula', exact: true }).click();
  await expect(controls).toContainText('Page 2 of 3 · The logistic regression formula');
  await expect(demo).toBeEnabled();
  await expect(page.locator('.tl-shape').filter({ hasText: 'P(y=1 | x)' })).toBeVisible();
  await expect(page.locator('.tl-shape').filter({ hasText: 'Where to use it' })).toHaveCount(0);
  await controls.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(controls).toContainText('Page 3 of 3 · The sigmoid function');
  await expect(demo).toBeEnabled();
  await expect(page.locator('.tl-shape')).toHaveCount(14);
  await page.screenshot({ path: testInfo.outputPath('three-pages.png') });
  await demo.click(); await expect(demo).toBeEnabled();
  await expect(controls).toContainText('Page 3 of 3');
  await expect(page.locator('.tl-shape')).toHaveCount(14);
  await page.getByTestId('page-menu.button').click();
  await expect(page.getByTestId('page-menu.item')).toHaveCount(3);
  await page.getByTestId('page-menu.item').filter({ hasText: 'The logistic regression formula' }).locator('.tlui-page-menu__item__button').click();
  await expect(controls).toContainText('Page 2 of 3');
  await expect(page.locator('.tl-shape').filter({ hasText: 'P(y=1 | x)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('formula-page.png') });
  await controls.getByRole('button', { name: 'Back', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('intro-page.png') });
});

test('Learn pages finish before advancing, scrub within pages, preserve drawings, and send page context', async ({ page }, testInfo) => {
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  const controls = page.getByLabel('Lesson playback');
  const chat = page.getByRole('complementary', { name: 'Learn agent chat' });
  const canvas = page.getByLabel('Lesson canvas', { exact: true });
  const timeline = page.getByRole('slider', { name: 'Lesson timeline' });
  await expect(controls.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  expect((await controls.boundingBox()).y).toBeGreaterThanOrEqual((await canvas.boundingBox()).y + (await canvas.boundingBox()).height);
  await controls.getByRole('button', { name: 'Play', exact: true }).click();
  const title = page.locator('.tl-shape[data-shape-type="text"]').first();
  await expect(title).toContainText('What');
  await controls.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedText = await title.textContent();
  await page.waitForTimeout(200);
  await expect(title).toHaveText(pausedText);
  await controls.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => title.textContent()).not.toBe(pausedText);
  await chat.getByRole('textbox').fill('Why use this model?');
  await expect(controls.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await controls.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(controls).toContainText('Page 1 of 3');
  await expect(page.locator('.tl-shape')).toHaveCount(5);
  await expect(controls.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  // A drawing belongs to this real tldraw page and survives leaving and scrubbing.
  await page.getByTestId('tools.draw').click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 180); await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 230, { steps: 5 }); await page.mouse.up();
  await controls.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(controls).toContainText('Page 2 of 3');
  await expect(page.locator('.tl-shape[data-shape-type="draw"]')).toHaveCount(0);
  await controls.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(controls).toContainText('Page 2 of 3');
  await expect(page.locator('.tl-shape')).toHaveCount(5);
  // Drag the actual timeline into the middle of page 2.
  const track = await timeline.boundingBox();
  await page.mouse.move(track.x + track.width * 2 / 3, track.y + track.height / 2); await page.mouse.down();
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2, { steps: 8 }); await page.mouse.up();
  await expect(controls).toContainText('Page 2 of 3');
  await expect(controls.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  const stopped = await timeline.inputValue();
  expect(Number(stopped)).toBeGreaterThan(1400); expect(Number(stopped)).toBeLessThan(1600);
  await page.waitForTimeout(200);
  await expect(timeline).toHaveValue(stopped);
  let payload;
  await page.route('**/api/learn/ask', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"The weights form the score on this page."}\n\nevent: done\ndata: {}\n\n' });
  });
  await chat.getByRole('textbox').press('Enter');
  await expect(chat.getByText('The weights form the score on this page.', { exact: true })).toBeVisible();
  expect(payload.lesson_snapshot.target).toBeNull();
  expect(payload.lesson_snapshot.lessonContext.pageNumber).toBe(2);
  expect(payload.lesson_snapshot.lessonContext.currentStage).toBe('formula');
  expect(payload.lesson_snapshot.lessonContext.animationProgress).toBeGreaterThan(0.4);
  expect(payload.lesson_snapshot.relatedObjects.some(o => o.objectId === 'midpoint')).toBe(false);
  await controls.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => timeline.inputValue()).not.toBe(stopped);
  await page.getByRole('button', { name: 'Ask about a region', exact: true }).click();
  await expect(controls.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await controls.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(controls).toContainText('Page 1 of 3');
  await expect(page.locator('.tl-shape[data-shape-type="draw"]')).toHaveCount(1);
  await timeline.fill('250');
  await expect(controls).toContainText('Page 1 of 3');
  await expect(page.locator('.tl-shape[data-shape-type="draw"]')).toHaveCount(1);
  await timeline.fill('3000');
  await expect(controls).toContainText('Page 3 of 3');
  await expect(page.locator('.tl-shape')).toHaveCount(14);
  await expect(controls.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('page-timeline.png') });
  await timeline.fill('0');
  await expect(controls).toContainText('Page 1 of 3');
  await expect(controls.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await expect(page.locator('.tl-shape[data-shape-type="draw"]')).toHaveCount(1);
  await controls.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Minimize Learn' }).click();
  await page.waitForTimeout(200);
});

test('Learn selection pins the midpoint, sends its equation and moved bounds, and discards deleted targets', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  const chat = page.getByRole('complementary', { name: 'Learn agent chat' });
  const demo = chat.getByRole('button', { name: /Explain the sigmoid function/ });
  await expect(demo).toBeEnabled(); await demo.click(); await expect(demo).toBeEnabled();
  await page.getByRole('button', { name: '3. The sigmoid function', exact: true }).click();
  const dot = page.locator('.tl-shape[data-shape-type="geo"]');
  const clickDot = async () => { const b = await dot.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  await clickDot();
  await expect(chat.getByRole('button', { name: 'Ask about selection' })).toHaveCount(0);
  await expect(chat.getByRole('status')).toContainText('Sigmoid midpoint (0, 0.5)');
  await expect(chat.getByRole('img', { name: 'Selected canvas preview' })).toBeVisible();
  await chat.getByRole('textbox').fill('My draft question');
  await chat.getByRole('button', { name: 'Remove canvas image' }).click();
  await expect(chat.getByRole('img', { name: 'Selected canvas preview' })).toHaveCount(0);
  await expect(chat.getByRole('textbox')).toHaveValue('My draft question');
  await expect(chat.getByRole('status')).toContainText('Sigmoid midpoint (0, 0.5)');
  const box = await dot.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 8 }); await page.mouse.up();
  let payload, release;
  await page.route('**/api/learn/selection', async route => {
    payload = route.request().postDataJSON();
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"At x = 0, exp(-0) = 1, so sigmoid is 1/(1+1) = 0.5."}\n\nevent: done\ndata: {}\n\n' });
  });
  const input = chat.getByPlaceholder('Ask about shared-counter…');
  await input.fill('Why is this at 0.5?'); await input.press('Enter');
  await expect.poll(() => !!payload).toBe(true);
  expect(payload.lesson_snapshot.target.objectId).toBe('midpoint');
  expect(payload.lesson_snapshot.target.mathPosition).toEqual({ x: 0, y: 0.5 });
  expect(payload.lesson_snapshot.target.shapes.find(s => s.shapeId === payload.lesson_snapshot.target.selectedShapeIds[0]).pageBounds.x).toBeGreaterThan(309);
  expect(payload.lesson_snapshot.relatedObjects.find(o => o.kind === 'equation').originalText).toContain('exp(-x)');
  expect(payload.lesson_snapshot.relatedObjects.find(o => o.kind === 'curve').points).toBeUndefined();
  await expect(demo).toBeDisabled(); // Replay cannot race the pending response.
  release();
  await expect(chat.getByText('At x = 0, exp(-0) = 1, so sigmoid is 1/(1+1) = 0.5.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('selection-answer.png') });
  payload = null;
  await input.fill('Why this point?'); await input.press('Enter');
  await expect.poll(() => !!payload).toBe(true);
  await clickDot(); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Delete / }).click();
  await expect(dot).toHaveCount(0);
  release();
  await expect(chat.getByText(/selected object changed while answering/)).toBeVisible();
  payload = null;
  await input.fill('And now?'); await input.press('Enter');
  await expect(chat.getByText(/selected object was deleted or changed/)).toBeVisible();
  expect(payload).toBeNull();
});

test('Learn circles a midpoint, confirms its target, and reuses selection chat without adding drawings', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  const chat = page.getByRole('complementary', { name: 'Learn agent chat' });
  const demo = chat.getByRole('button', { name: /Explain the sigmoid function/ });
  await expect(demo).toBeEnabled(); await demo.click(); await expect(demo).toBeEnabled();
  await page.getByRole('button', { name: '3. The sigmoid function', exact: true }).click();
  const count = await page.locator('.tl-shape').count();
  const dot = await page.locator('.tl-shape[data-shape-type="geo"]').boundingBox();
  await page.getByRole('button', { name: 'Ask about a region', exact: true }).click();
  const cx = dot.x + dot.width / 2, cy = dot.y + dot.height / 2;
  await page.mouse.move(cx - 28, cy - 28); await page.mouse.down();
  await page.mouse.move(cx + 28, cy + 28, { steps: 8 });
  await page.mouse.up();
  const confirm = page.getByRole('button', { name: 'Ask about: Sigmoid midpoint (0, 0.5)', exact: true });
  await expect(confirm).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask about: Sigmoid curve', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('region-target.png') });
  await confirm.click();
  await expect(chat.getByRole('status')).toContainText('Sigmoid midpoint (0, 0.5)');
  await expect(page.locator('.tl-shape')).toHaveCount(count);
  await expect(chat.getByRole('img', { name: 'Selected canvas preview' })).toBeVisible();
  await expect(chat.getByRole('button', { name: 'Remove canvas image' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('composer-thumbnail.png') });
  await page.route('**/api/learn/selection', async route => {
    expect(route.request().postData()).not.toContain('data:image');
    const snapshot = route.request().postDataJSON().lesson_snapshot;
    expect(snapshot.target.objectId).toBe('midpoint');
    expect(snapshot.target.method).toBe('explicit-selection'); // the learner confirmed the inferred target
    expect(snapshot.relatedObjects.find(o => o.kind === 'equation').originalText).toContain('exp(-x)');
    await route.fulfill({ contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"At zero, sigmoid is 1/(1+1) = 0.5."}\n\nevent: done\ndata: {}\n\n' });
  });
  await chat.getByPlaceholder('Ask about shared-counter…').fill('Why is this at 0.5?');
  await chat.getByPlaceholder('Ask about shared-counter…').press('Enter');
  await expect(chat.getByText('At zero, sigmoid is 1/(1+1) = 0.5.', { exact: true })).toBeVisible();
  const thumbnail = chat.getByRole('img', { name: 'Canvas with the question’s target marked' });
  await expect(thumbnail).toBeVisible();
  await expect(chat.getByRole('img', { name: 'Selected canvas preview' })).toHaveCount(0);
  expect(await thumbnail.evaluate(img => img.naturalWidth > 100 && img.naturalHeight > 100)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('canvas-thumbnail.png') });
  await page.getByRole('button', { name: 'Ask about a region', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Drag selection ellipse')).toHaveCount(0);
  await expect(page.locator('.tl-shape')).toHaveCount(count);
});

test('readable Capture preserves raw inputs, evidence navigation, and the existing chat', async ({ page }, testInfo) => {
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New chat', exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Sessions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add session', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Search sessions' })).toBeVisible();
  let dialog = await openStep(page, 'Read inputs');
  await expect(dialog.getByText('User · m1 · 09:14:02')).toBeVisible();
  await expect(dialog.getByRole('navigation', { name: 'Source files' })).toBeVisible();
  await expect(dialog.locator('pre span[style]').first()).toHaveText('import');
  await dialog.getByRole('button', { name: 'small.toml', exact: true }).click();
  await expect(dialog.locator('pre')).toContainText('size_gb = 1');
  await dialog.getByRole('tab', { name: 'Original', exact: true }).click();
  await expect(dialog.locator('pre')).toContainText('File written.');
  await dialog.getByRole('tab', { name: 'Metadata', exact: true }).click();
  await expect(dialog.locator('pre')).toContainText('"model_executed": false');
  await dialog.getByRole('tab', { name: 'Contents', exact: true }).click();
  await dialog.getByRole('button', { name: 'Open full conversation', exact: true }).click();
  await expect(dialog.getByText('10 of 10 messages')).toBeVisible();
  await dialog.getByRole('button', { name: 'Back in inspector' }).click();
  await expect(dialog.getByRole('heading', { name: 'Read inputs', exact: true })).toBeVisible();

  dialog = await openStep(page, 'Normalize and redact');
  await expect(dialog.getByText('10 messages preserved')).toBeVisible();
  await expect(dialog.locator('mark').first()).toHaveText('DEMO_VALUE_NOT_A_SECRET');
  await expect(dialog.locator('mark').last()).toHaveText('[REDACTED]');
  await expect(dialog.getByText(/This separate illustration/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Open as page', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('capture-redaction.png'), animations: 'disabled' });

  dialog = await openStep(page, 'Build model input');
  await expect(dialog.getByRole('heading', { name: 'Extraction instructions' })).toBeVisible();
  await expect(dialog.getByText(/Keep unknown reasons empty/)).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Included context' })).toBeVisible();

  dialog = await openStep(page, 'Model response');
  await expect(dialog.getByRole('article')).toHaveCount(2);
  await expect(dialog.getByRole('heading', { name: 'Use SQLite for a persistent counter' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('capture-decisions.png'), animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Open conversation', exact: true }).first().click();
  await expect(dialog.locator('#sample-m4')).toBeVisible();
  await dialog.getByRole('button', { name: 'Back in inspector' }).click();
  await dialog.getByRole('button', { name: 'app.py:5–10', exact: true }).click();
  await expect(dialog.locator('#sample-code-5')).toContainText('DB_PATH');
  await dialog.getByRole('button', { name: 'Back in inspector' }).click();

  dialog = await openStep(page, 'Validate candidates');
  await expect(dialog.getByText('Passed', { exact: true })).toHaveCount(2);
  await expect(dialog.getByText('Needs review', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Inspect decision' }).click();
  await expect(dialog.getByRole('heading', { name: 'Require confirmation before resetting' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
});

for (const width of [320, 768, 1024, 1440]) {
  test(`Capture stays readable at ${width}px and minimizes back to its panel`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const dialog = await openStep(page, 'Normalize and redact');
    const panel = await dialog.boundingBox();
    if (width >= 768) {
      const resize = dialog.getByRole('separator', { name: 'Resize inspector' });
      await resize.focus();
      await page.keyboard.press('ArrowRight');
      await expect(resize).toHaveAttribute('aria-valuenow', '588');
    }
    await dialog.getByRole('button', { name: 'Open as page', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Capture', exact: true })).toBeVisible();
    if (width >= 768) await expect(page.locator('[data-shell-sidebar]')).toBeVisible();
    expect(await dialog.locator('.capture-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await dialog.getByRole('button', { name: 'Minimize', exact: true }).click();
    expect((await dialog.boundingBox()).width).toBeLessThanOrEqual(panel.width);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
}
