import { test, expect } from '@playwright/test';
import { sampleApp } from '../src/coaching/sample-data.js';
import { validateLessonSnapshot } from '../../control-plane/src/learn-context.js';

test.beforeEach(async ({ page }) => {
  const replies = {
    '/api/apps': { org: sampleApp.org, orgName: sampleApp.orgName, email: sampleApp.email, apps: [sampleApp], folders: [] },
    '/api/apps/shared-counter': sampleApp,
    '/api/apps/shared-counter/learn-course': { course: null, canAuthor: true },
    '/api/workspaces': { active: sampleApp.org, email: sampleApp.email, workspaces: [{ slug: sampleApp.org, name: sampleApp.orgName, role: 'owner', kind: 'custom' }] },
    '/api/ask/threads': { threads: [] }, '/api/watch': { observations: [], runs: [] },
    '/api/teams': { teams: [] }, '/api/members': { members: [] }, '/api/byoc/connection': { connection: null },
  };
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:5186') return route.continue();
    if (route.request().method() !== 'GET') throw new Error('Preview unexpectedly mutated an API');
    return route.fulfill({ json: replies[url.pathname] || {} });
  });
  await page.goto('/apps/shared-counter?tab=learn');
});

test('lesson controls, source above composer, quiz and flashcards preserve chat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Preview Lesson 5' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Course setup' })).toHaveCount(0);
  const chat = page.getByRole('complementary', { name: 'Learn agent chat' });
  const divider = page.getByRole('separator', { name: 'Resize Learn panel' });
  const originalWidth = (await chat.boundingBox()).width;
  const handle = await divider.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 90);
  await page.mouse.down();
  await page.mouse.move(handle.x - 115, handle.y + 90, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await chat.boundingBox()).width).toBeGreaterThan(originalWidth + 100);
  await divider.dblclick();
  await expect.poll(async () => (await chat.boundingBox()).width).toBe(originalWidth);
  await page.getByRole('navigation', { name: 'Lesson views' }).getByRole('button', { name: 'Curriculum', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Lesson views' }).getByRole('button', { name: 'Curriculum', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Curriculum Agent' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to canvas', exact: true })).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Lesson views' }).getByRole('button', { name: 'Lesson', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Course curriculum' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Lesson views' }).getByRole('button', { name: 'Lesson', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(chat.getByRole('button', { name: 'Ask about selection' })).toHaveCount(0);
  await chat.getByRole('button', { name: /Explain the sigmoid function/ }).click();
  const dot = page.locator('.tl-shape[data-shape-type="geo"]');
  await expect(dot).toBeVisible();
  const point = await dot.boundingBox();
  await page.mouse.click(point.x + point.width / 2, point.y + point.height / 2);
  await expect(chat.getByRole('status')).toContainText('Sigmoid midpoint');
  await expect(chat.getByAltText('Selected canvas preview')).toBeVisible();
  await chat.getByRole('button', { name: 'Clear selected context' }).click();
  await expect(chat.getByAltText('Selected canvas preview')).toHaveCount(0);
  const canvas = page.getByLabel('Lesson canvas', { exact: true });
  await expect(page.getByRole('button', { name: 'Ask about selection', exact: true })).toHaveAttribute('title', 'Ask about selection: draw a red ellipse');
  await canvas.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => canvas.evaluate(el => el.parentElement.parentElement.scrollTop)).toBeGreaterThan(0);
  const chatBefore = await chat.boundingBox();
  const input = chat.getByPlaceholder('Ask about shared-counter…');
  await input.fill('Question draft survives source viewing');
  await page.getByRole('button', { name: 'lesson_geometry.py:4–9' }).click();
  const source = chat.getByRole('region', { name: 'Lesson source' });
  await expect(source.locator('[data-highlighted=true]')).toHaveCount(6);
  const sourceBox = await source.boundingBox(), chatAfter = await chat.boundingBox();
  expect(sourceBox.x).toBeGreaterThanOrEqual(chatAfter.x);
  expect(sourceBox.x + sourceBox.width).toBeLessThanOrEqual(chatAfter.x + chatAfter.width);
  expect(chatAfter.x).toBe(chatBefore.x);
  await expect(input).toHaveValue('Question draft survives source viewing');
  const inputBox = await input.boundingBox();
  expect(inputBox.y).toBeGreaterThan(sourceBox.y + sourceBox.height);
  await source.hover();
  await page.mouse.wheel(0, 900);
  await expect(input).toBeInViewport();
  await page.getByRole('button', { name: 'Close lesson source' }).click();
  await expect(source).toHaveCount(0);
  await expect(input).toHaveValue('Question draft survives source viewing');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check answers' })).toBeDisabled();
  await page.getByLabel('Neck', { exact: true }).check();
  await page.getByLabel('Predefined anchor-box templates', { exact: true }).check();
  await page.getByLabel('No, they are candidate predictions', { exact: true }).check();
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByText('3 of 3 correct')).toBeVisible();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Got it right', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Flip card to answer' }).click();
  await expect(page.locator('[data-flashcard-flipped]')).toHaveAttribute('data-flashcard-flipped', 'true');
  await page.getByRole('button', { name: 'Not yet', exact: true }).click();
  await page.getByRole('button', { name: 'Next flashcard' }).click();
  await page.getByRole('button', { name: 'Flip card to answer' }).click();
  await page.getByRole('button', { name: 'Got it right', exact: true }).click();
  await expect(page.getByText('1 remembered · 1 to review')).toBeVisible();
  await page.getByRole('button', { name: 'Previous flashcard' }).click();
  await expect(page.getByText('Your answer: Not yet')).toBeVisible();
  await expect(chat.getByPlaceholder('Ask about shared-counter…')).toBeVisible();
  await page.screenshot({ path: '../../.small/learn-practice.png', fullPage: true });
});

test('real notebook executes edited Python, survives view switching, resets only after confirmation', async ({ page }) => {
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  const notebook = page.frameLocator('iframe[title="Jupyter lesson notebook"]');
  const cell = notebook.locator('.jp-CodeCell .cm-content').first();
  await expect(cell).toBeVisible({ timeout: 90_000 });
  const scrollArea = notebook.locator('.jp-WindowedPanel-outer').first();
  await scrollArea.hover();
  const beforeScroll = await scrollArea.evaluate(el => el.scrollTop);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => scrollArea.evaluate(el => el.scrollTop)).toBeGreaterThan(beforeScroll);
  await cell.scrollIntoViewIfNeeded();
  await cell.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('print(6 * 7)');
  await page.keyboard.press('Shift+Enter');
  await expect(notebook.locator('.jp-OutputArea-output').filter({ hasText: '42' }).first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await expect(cell).toContainText('print(6 * 7)');
  await page.getByRole('button', { name: 'Reset notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(cell).toContainText('print(6 * 7)');
  await page.getByRole('button', { name: 'Reset notebook', exact: true }).click();
  await page.getByRole('dialog', { name: 'Reset notebook?' }).getByRole('button', { name: 'Reset notebook', exact: true }).click();
  await expect(cell).toContainText('score = 0', { timeout: 90_000 });
  await expect(notebook.locator('.jp-OutputArea-output').filter({ hasText: '42' })).toHaveCount(0);
  await page.screenshot({ path: '../../.small/learn-notebook.png', fullPage: true });
});

test('owner switches between editing and a navigable learner outline', async ({ page }) => {
  const chat = page.getByRole('complementary', { name: 'Learn agent chat' });
  await page.getByRole('navigation', { name: 'Lesson views' }).getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('tab', { name: 'Learner view' }).click();
  const outline = page.getByRole('region', { name: 'Learner curriculum' });
  const reopenOutline = async () => { await page.getByRole('button', { name: 'Curriculum', exact: true }).click(); await page.getByRole('tab', { name: 'Learner view' }).click(); };
  await expect(outline).toBeVisible();
  await outline.getByRole('button', { name: 'Backbone: extracting features' }).click();
  await expect(page.getByLabel('Lesson playback')).toContainText('Page 2 of 7');
  await expect(page.getByLabel('Course title')).toHaveText('From classification to object detection');
  await expect(page.getByLabel('Current lesson and section')).toContainText('Lesson 2: Inside the YOLOv8 architecture');
  await expect(page.getByLabel('Current lesson and section')).toContainText('Section 2 of 7: Backbone: extracting features');
  await reopenOutline();
  await outline.getByRole('button', { name: 'Lesson 1: Logistic regression', exact: true }).click();
  await expect(page.getByLabel('Current lesson and section')).toContainText('Lesson 1: Logistic regression');
  await expect(page.getByLabel('Lesson playback')).toContainText('Page 1 of 3');
  await reopenOutline();
  await outline.getByRole('button', { name: 'The sigmoid function', exact: true }).click();
  await expect(page.getByLabel('Lesson playback')).toContainText('Page 3 of 3');
  await reopenOutline();
  await outline.getByRole('button', { name: 'Lesson 2: Inside the YOLOv8 architecture', exact: true }).click();
  await expect(page.getByLabel('Lesson playback')).toContainText('Page 1 of 7');
  await reopenOutline();
  await outline.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Flip card to answer' })).toBeVisible();
  await reopenOutline();
  await outline.getByRole('button', { name: 'Quiz', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check answers' })).toBeVisible();
  await expect(chat.getByRole('textbox')).toBeVisible();
  await reopenOutline();
  await outline.getByRole('button', { name: 'Notebook: decoding a box' }).click();
  await expect(page.getByRole('button', { name: 'Reset notebook' })).toBeVisible();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('tab', { name: 'Edit course' }).click();
  await expect(page.getByRole('heading', { name: 'Curriculum Agent' })).toBeVisible();
});


test('learner has only the outline, without authoring tabs', async ({ page }) => {
  await page.route('**/api/apps/shared-counter/learn-course', route => route.fulfill({ json: { course: null, canAuthor: false } }));
  await page.reload();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Learner curriculum' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Edit course' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Curriculum Agent' })).toHaveCount(0);
});

test('saved curriculum opens generated pages and labels unfinished lessons', async ({ page }) => {
  await page.route('**/api/apps/shared-counter/learn-course', route => route.fulfill({ json: { canAuthor: false, course: {
    curriculum: { title: 'Detection course', lessons: [{ title: 'Features', topics: ['Learned weights'] }, { title: 'Boxes', topics: ['Coordinates'] }] },
    lesson: { id: 'course-test-1', title: 'Features', pages: [{ title: 'Learned weights', narration: 'Training adjusts the weights.', blocks: [{ kind: 'text', text: 'Images become features' }] }] },
  } } }));
  await page.reload();
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  const outline = page.getByRole('region', { name: 'Learner curriculum' });
  await page.getByLabel('Browse course').selectOption('saved');
  await expect(outline.getByRole('button', { name: 'Coordinates' })).toBeDisabled();
  await expect(outline.getByText('Content not generated yet')).toBeVisible();
  await outline.getByRole('button', { name: 'Learned weights' }).click();
  await expect(page.getByLabel('Lesson playback')).toContainText('Page 1 of 1');
  await expect(outline).toHaveCount(0);
});


test('completed sections accumulate across lessons and light the course award', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const bar = page.getByRole('progressbar', { name: 'Course completion' });
  await expect(bar).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: /Explain the sigmoid function/ }).click();
  await expect(bar).toHaveAttribute('aria-valuenow', '3');
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('tab', { name: 'Learner view' }).click();
  const outline = page.getByRole('region', { name: 'Learner curriculum' });
  await expect(outline.getByRole('img', { name: 'Logistic regression: completed', exact: true })).toBeVisible();
  await outline.getByRole('button', { name: 'Lesson 2: Inside the YOLOv8 architecture', exact: true }).click();
  await expect(bar).toHaveAttribute('aria-valuenow', '10');
  await expect(page.getByRole('img', { name: 'Course complete', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('tab', { name: 'Learner view' }).click();
  for (const label of ['Notebook: decoding a box completed', 'Quiz completed', 'Flashcards completed']) await outline.getByRole('checkbox', { name: label, exact: true }).check();
  await expect(bar).toHaveAttribute('aria-valuenow', '13');
  await expect(page.getByRole('img', { name: 'Course complete', exact: true })).toBeVisible();
  await expect(outline.getByRole('img', { name: 'Inside the YOLOv8 architecture: completed', exact: true })).toBeVisible();
  await outline.getByRole('button', { name: 'The formula', exact: true }).click();
  await expect(bar).toHaveAttribute('aria-valuenow', '13');
  await page.getByRole('button', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('tab', { name: 'Learner view' }).click();
  await outline.getByRole('checkbox', { name: 'Quiz completed', exact: true }).uncheck();
  await expect(bar).toHaveAttribute('aria-valuenow', '12');
  await expect(page.getByRole('img', { name: 'Course complete', exact: true })).toHaveCount(0);
});

test('personal canvas notes save across reloads without changing lesson drawings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /Explain the sigmoid function/ }).click();
  await page.getByRole('button', { name: 'Add personal note', exact: true }).click();
  const notes = page.getByRole('region', { name: 'Edit personal note' });
  await expect(notes).toBeVisible();
  await expect(notes.getByRole('button', { name: 'Notes mode' })).toHaveAttribute('aria-pressed', 'true');
  await expect(notes.locator('.tl-background')).toHaveCSS('background-color', 'rgb(255, 251, 235)');
  const saveButton = await notes.getByRole('button', { name: 'Save & resume', exact: true }).boundingBox();
  const noteBounds = await notes.getByLabel('Personal note canvas').boundingBox();
  expect(saveButton.y + saveButton.height).toBeLessThanOrEqual(noteBounds.y);
  await notes.getByLabel('Description (optional)').fill('Why the midpoint is one half');
  await notes.getByRole('button', { name: 'Text', exact: true }).click();
  const board = notes.getByLabel('Personal note canvas');
  await board.click({ position: { x: 160, y: 110 } });
  await page.keyboard.type('My private sigmoid insight');
  await page.keyboard.press('Escape');
  await expect(notes.getByText('My private sigmoid insight', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Lesson', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(notes).toBeVisible();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check answers', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My notes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit notes', exact: true }).click();
  await notes.getByRole('button', { name: 'Save & resume', exact: true }).click();
  await expect(notes).toHaveCount(0);
  await expect(page.getByLabel('Lesson canvas', { exact: true }).getByText('My private sigmoid insight')).toHaveCount(0);
  await page.getByRole('button', { name: 'My notes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit notes', exact: true })).toHaveCount(1);
  await expect(page.getByText('Completed slide', { exact: true })).toHaveCount(3);
  await page.reload();
  await page.getByRole('button', { name: 'My notes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit notes', exact: true }).click();
  await expect(notes.getByLabel('Description (optional)')).toHaveValue('Why the midpoint is one half');
  await expect(notes.getByText('My private sigmoid insight', { exact: true }).first()).toBeVisible();
  await notes.getByRole('button', { name: 'Save to My notes', exact: true }).click();
  await expect(page.getByText('Why the midpoint is one half', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'My notes' }).locator('article img')).toHaveCount(4);
  await expect.poll(() => page.getByRole('region', { name: 'My notes' }).locator('article img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: '../../.small/learn-personal-notes.png', fullPage: true });
  await page.route('**/api/apps/shared-counter', route => route.fulfill({ json: { ...sampleApp, email: 'another@example.test' } }));
  await page.reload();
  await page.getByRole('button', { name: 'My notes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit notes', exact: true })).toHaveCount(0);
  await expect(page.getByText('Play a lesson to collect its slides.', { exact: false })).toBeVisible();
});

test('failed note storage keeps the editor open until a successful retry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /Explain the sigmoid function/ }).click();
  await page.getByRole('button', { name: 'Add personal note', exact: true }).click();
  const notes = page.getByRole('region', { name: 'Edit personal note' });
  await expect(notes.getByRole('status')).toHaveText('Saved');
  await page.evaluate(() => {
    window.restoreNoteStorage = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await notes.getByRole('button', { name: 'Save & resume', exact: true }).click();
  await expect(notes.getByRole('status')).toContainText('Not saved');
  await expect(notes).toBeVisible();
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.restoreNoteStorage; });
  await notes.getByRole('button', { name: 'Save & resume', exact: true }).click();
  await expect(notes).toHaveCount(0);
});

test('delete note can be cancelled and does not remove completed slides or resurrect on reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /Explain the sigmoid function/ }).click();
  await page.getByRole('button', { name: 'Add personal note', exact: true }).click();
  await page.getByRole('button', { name: 'Save to My notes', exact: true }).click();
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit notes', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit notes', exact: true }).click();
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete note', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Edit personal note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit notes', exact: true })).toHaveCount(0);
  await expect(page.getByText('Completed slide', { exact: true })).toHaveCount(3);
  await page.reload();
  await page.getByRole('button', { name: 'My notes', exact: true }).click();
  await expect(page.getByText('Completed slide', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Edit notes', exact: true })).toHaveCount(0);
});

test('return to lesson restores the saved note timeline, paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /Explain the sigmoid function/ }).click();
  const timeline = page.getByRole('slider', { name: 'Lesson timeline' });
  await timeline.fill('1450');
  const savedPosition = await timeline.inputValue();
  await page.getByRole('button', { name: 'Add personal note', exact: true }).click();
  await page.getByRole('button', { name: 'Save to My notes', exact: true }).click();
  const note = page.locator('article').filter({ has: page.getByRole('button', { name: 'Edit notes', exact: true }) });
  await note.getByRole('button', { name: 'Return to lesson', exact: true }).click();
  await expect(timeline).toHaveValue(savedPosition);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('Learn answers typeset math and copy as one block', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /Explain the sigmoid function/ }).click();
  const answer = String.raw`**Page 1 . What is logistic regression?**

Start with the sigmoid:

$$\sigma(x) = \frac{1}{1 + e^{-x}}$$

Step 1: substitute $x=0$.

\[
\sigma(0) = \frac{1}{1 + e^{0}}
\]

Step 2: evaluate the denominator.

$$= \frac{1}{2} = 0.5$$

Code stays literal:` + '\n\n```python\nformula = "$x$"\n```';
  await page.route('**/api/learn/ask', route => {
    return route.fulfill({ contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {}\n\n` });
  });
  const chat = page.getByRole('complementary', { name: 'Learn agent chat' });
  const input = chat.getByPlaceholder(/Ask about shared-counter/);
  await input.fill('Show the calculation'); await input.press('Enter');
  await expect(chat.locator('[data-chat-math="display"]')).toHaveCount(3);
  await expect(chat.locator('.katex-error')).toHaveCount(0);
  await expect(chat.locator('.katex mfrac')).toHaveCount(3);
  await expect(chat.getByText('formula = "$x$"', { exact: true })).toBeVisible();
  await page.evaluate(() => { window.blockClipboard = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.blockClipboard = text; } } }); });
  // One block per answer: one copy icon, nothing to ask about a single paragraph.
  await expect(chat.getByRole('button', { name: 'Copy answer', exact: true })).toHaveCount(1);
  await expect(chat.getByRole('button', { name: /^Ask about answer block/ })).toHaveCount(0);
  await chat.getByRole('button', { name: 'Copy answer', exact: true }).click();
  await expect(chat.getByText('Copied', { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => window.blockClipboard);
  expect(copied).toContain('Step 1: substitute');
  expect(copied).toContain('Step 2: evaluate');
});
