import { chromium } from '@playwright/test';

// YouTube moments on the canvas, against a stubbed Exa search. What matters
// here is the part unit tests cannot see: a card actually reaching the canvas,
// the embed URL carrying the moment window, the window bar being clickable,
// and video_context riding the next question.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const asks = [];
const feedback = [];
const gone = [];
let sse = null;
await page.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/api/learn/search') return route.fulfill({ json: { results: [
    { key: 'Ilg3gGewQ5U', title: 'Backpropagation, intuitively | Chapter 3', subtitle: '3Blue1Brown', why: 'Animates the weight updates.', thumbnail: null, item: { videoId: 'Ilg3gGewQ5U', title: 'Backpropagation, intuitively | Chapter 3', channel: '3Blue1Brown' } },
    { key: 'FaHHWdsIYQg', title: 'Backpropagation Explained', subtitle: null, why: null, thumbnail: null, item: { videoId: 'FaHHWdsIYQg', title: 'Backpropagation Explained', channel: null } },
  ] } });
  if (url.pathname === '/api/learn/video-gone' && request.method() === 'POST') {
    try { gone.push(JSON.parse(request.postData() || '{}')); } catch { /* asserted below */ }
    return route.fulfill({ json: { pruned: 0 } });
  }
  if (url.pathname === '/api/learn/moment-feedback' && request.method() === 'POST') {
    try { feedback.push(JSON.parse(request.postData() || '{}')); } catch { /* shape asserted below */ }
    return route.fulfill({ json: { updated: true } });
  }
  if (request.method() === 'POST' && /ask|selection/.test(url.pathname)) {
    try { asks.push(JSON.parse(request.postData() || '{}')); } catch { /* not this check's business */ }
    const body = sse || 'event: delta\ndata: {"text":"Here."}\n\nevent: done\ndata: {}\n\n';
    sse = null;
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body });
  }
  return route.fulfill({ json: replies[url.pathname] || {} });
});
// The embed is YouTube's; the check never talks to it.
await page.route('**youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>player</body></html>' }));
// One video's thumbnail 404s - the deleted-video observable.
await page.route('**i.ytimg.com/**', route => route.request().url().includes('aircAruvnKk')
  ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' })
  : route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const canvas = page.locator('[aria-label="Lesson canvas"]');

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn');
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(3000);

// --- picking one ---
await page.getByRole('button', { name: 'Search YouTube, arXiv and Wikipedia' }).click();
await page.waitForTimeout(300);
const box = page.getByRole('dialog', { name: 'Search' });
await box.getByRole('combobox', { name: 'Search in' }).selectOption('youtube');
await box.getByRole('textbox').fill('backpropagation intuitively');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
ok('results show title and channel', (await box.getByText('3Blue1Brown').count()) === 1);
await box.getByRole('listbox').getByRole('option').first().click();
await page.waitForTimeout(2000);

const card = canvas.locator('iframe[src*="youtube-nocookie.com"]');
ok('picking a video puts a card on the canvas', (await card.count()) === 1);
ok('the embed is the privacy domain, with no window yet', (await card.getAttribute('src')) === 'https://www.youtube-nocookie.com/embed/Ilg3gGewQ5U');

// --- the window bar ---
const bar = canvas.getByRole('slider', { name: 'Video timeline' });
ok('the card carries its own timeline bar', await bar.isVisible());
ok('with the moment tinted on it', (await canvas.locator('[data-moment]').count()) === 1);
// select the card first, then click at 60% of the bar
await canvas.getByText('Backpropagation, intuitively').click();
await page.waitForTimeout(400);
const rect = await bar.boundingBox();
await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height / 2);
await page.waitForTimeout(800);
const src = await card.getAttribute('src');
ok('clicking the bar reloads the embed at that time', /start=\d+/.test(src), src);

// --- what the tutor is told ---
await page.getByPlaceholder(/Ask about/).first().fill('what is he showing?');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const sent = asks.at(-1)?.video_context;
ok('a question carries the video and where the learner is in it', sent?.videoId === 'Ilg3gGewQ5U' && sent?.start > 0, JSON.stringify(sent));

// --- detaching stops it ---
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: /^Files/ }).click();
await page.waitForTimeout(250);
await page.getByRole('switch', { name: /Tutor reads Backpropagation, intuitively/ }).click();
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.getByPlaceholder(/Ask about/).first().fill('and now?');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
ok('detaching the source stops video_context riding', asks.at(-1)?.video_context === undefined, JSON.stringify(asks.at(-1)?.video_context));

// --- a card with a moment window, restored from storage ---
// Written the way a phase-2 show_video would write it: the block carries the
// moment, and the embed must carry both edges of the window.
await page.evaluate(() => {
  const key = 'small.adaptive-canvas:example-team:b@e.test:nanogpt:ink';
  const state = JSON.parse(localStorage.getItem(key));
  state.blocks.push({ id: 'seeded-moment', type: 'video', dx: 0, dy: 0, videoId: 'FaHHWdsIYQg', title: 'Backpropagation Explained', channel: null, start: 252, end: 338 });
  localStorage.setItem(key, JSON.stringify(state));
});
await page.reload();
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(3000);
ok('both cards survive a reload', (await card.count()) === 2);
const seeded = canvas.locator('iframe[src*="FaHHWdsIYQg"]');
ok('a moment rides the embed as start AND end, so playback enforces the window',
  (await seeded.getAttribute('src')) === 'https://www.youtube-nocookie.com/embed/FaHHWdsIYQg?start=252&end=338', await seeded.getAttribute('src'));
// A restored card has no context until touched; a seek must build it from
// scratch - this is the case that silently dropped before review.
await canvas.getByText('Backpropagation Explained').click();
await page.waitForTimeout(400);
const seededBar = canvas.locator('[aria-label="Video timeline"]').nth(1);
const seededRect = await seededBar.boundingBox();
await page.mouse.click(seededRect.x + seededRect.width * 0.55, seededRect.y + seededRect.height / 2);
await page.waitForTimeout(600);
await page.getByPlaceholder(/Ask about/).first().fill('and here?');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const afterReload = asks.at(-1)?.video_context;
ok('a seek on a restored card carries its own video, not a stale one',
  afterReload?.videoId === 'FaHHWdsIYQg' && afterReload?.title === 'Backpropagation Explained', JSON.stringify(afterReload));

// --- the tutor puts a moment in front of the learner ---
sse = `event: delta\ndata: {"text":"Watch the update rule."}\n\nevent: video\ndata: ${JSON.stringify({ videoId: 'FaHHWdsIYQg', title: 'Backpropagation Explained', start: 100, end: 190, unverified: false, reason: 'shows the rule', momentId: 41 })}\n\nevent: done\ndata: {}\n\n`;
await page.getByPlaceholder(/Ask about/).first().fill('show me the update rule');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
ok('the tutor retargets the existing card to its moment, not a twin', (await card.count()) === 2);
ok('and the embed plays exactly that window',
  (await seeded.getAttribute('src')) === 'https://www.youtube-nocookie.com/embed/FaHHWdsIYQg?start=100&end=190', await seeded.getAttribute('src'));

// --- keep / dismiss on a tutor-shown moment ---
const verdict = canvas.getByText('Did this moment help?');
ok('a tutor-shown moment asks for a verdict', (await verdict.count()) === 1);
await canvas.getByRole('button', { name: 'Keep', exact: true }).click();
await page.waitForTimeout(600);
const graded = feedback.at(-1);
ok('Keep updates the moment log', graded?.momentId === 41 && graded?.accepted === true && graded?.app === 'nanogpt', JSON.stringify(graded));
ok('the card remembers the verdict', (await canvas.getByRole('button', { name: 'Keep', exact: true }).getAttribute('aria-pressed')) === 'true');
await canvas.getByRole('button', { name: 'Dismiss', exact: true }).click();
await page.waitForTimeout(600);
ok('the latest press wins', feedback.at(-1)?.accepted === false);

// a brand-new video from the tutor lands as a new card
sse = `event: video\ndata: ${JSON.stringify({ videoId: 'aircAruvnKk', title: 'But what is a neural network?', start: 0, end: null, unverified: true, reason: null })}\n\nevent: done\ndata: {}\n\n`;
await page.getByPlaceholder(/Ask about/).first().fill('and neural nets generally?');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
const fresh = canvas.locator('iframe[src*="aircAruvnKk"]');
ok('an unverified video arrives as a card with no window', (await fresh.getAttribute('src')) === 'https://www.youtube-nocookie.com/embed/aircAruvnKk', await fresh.getAttribute('src'));
ok('and says so to the learner, not only to the model', (await canvas.getByText('contents unverified').count()) === 1);
await page.waitForTimeout(800);
ok('a 404ing thumbnail reports the video gone, once', gone.length === 1 && gone[0].videoId === 'aircAruvnKk' && gone[0].app === 'nanogpt', JSON.stringify(gone));

await page.screenshot({ path: 'e2e/shots/video-card.png' });
await browser.close();
process.exit(failed ? 1 : 0);
