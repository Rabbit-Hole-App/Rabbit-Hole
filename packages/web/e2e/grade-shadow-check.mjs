import { chromium } from '@playwright/test';

// Jev side by side (docs/features/jev-grading.md): the learner sees exactly
// what Opus says, whatever the shadow path does; the shadow request carries
// the attempt, and a baseline follows.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };
const BOARD = 'grade-shadow-1';
const KEY = `small.adaptive-canvas:example-team:b@e.test:nanogpt:${BOARD}:s0`;
const CHALLENGE = { id: 'c1', type: 'challenge', dx: 0, dy: 0, prompt: 'Why does softmax use exp?', hint: '', expects: ['exp makes every score positive', 'dividing by the sum makes them add to one'], reveal: '', answer: null };
const SSE = `event: chunk\ndata: ${JSON.stringify({ text: 'VERDICT: good\nYou have both ideas.' })}\n\nevent: done\ndata: {"ok":true}\n\n`;

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();

// One fresh learner per scenario. `grade` decides the shadow reply, `baseline`
// the baseline reply, `opus` the tutor reply.
async function scenario({ grade = { status: 200 }, gradeDelay = 0, baseline = 200, opus = 'ok' } = {}) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.addInitScript(([key, block]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [block] }));
  }, [KEY, CHALLENGE]);
  const page = await context.newPage();
  const seen = { grades: [], baselines: [], asks: 0 };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/learn/ask') {
      seen.asks += 1;
      if (opus === 'error') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Tutor down' }) });
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: SSE });
    }
    if (url.pathname === '/api/learn/grade') {
      seen.grades.push(JSON.parse(request.postData() || '{}'));
      if (gradeDelay) await new Promise(resolve => setTimeout(resolve, gradeDelay));
      if (grade === 'abort') return route.abort('failed');
      return route.fulfill({ status: grade.status, contentType: 'application/json', body: JSON.stringify({ grade_id: 11, status: 'x' }) });
    }
    if (/^\/api\/learn\/grade\/\d+\/baseline$/.test(url.pathname)) {
      seen.baselines.push(JSON.parse(request.postData() || '{}'));
      return route.fulfill({ status: baseline, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({ json: replies[url.pathname] || {} });
  });
  page.on('pageerror', error => console.log('PAGEERROR:', error.message));
  await page.goto(`http://localhost:5189/apps/nanogpt?tab=learn&board=${BOARD}`);
  const card = page.locator('[data-block-id="c1"]');
  await card.locator('input').waitFor({ timeout: 30000 });
  const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').blocks?.[0] || {}, KEY);
  return { context, page, card, seen, stored };
}
const shown = async card => ({ grade: await card.locator('[data-answer]').getAttribute('data-grade'), text: (await card.locator('[data-verdict]').innerText()).trim() });

// 1. The normal path: the verdict as today, a shadow request with the attempt, then a baseline.
{
  const s = await scenario();
  await s.card.locator('input').fill('exp makes them positive and we divide by the sum');
  await s.card.getByRole('button', { name: 'Commit' }).click();
  await s.card.locator('[data-verdict]', { hasText: 'You have both ideas.' }).waitFor({ timeout: 10000 });
  await s.page.waitForTimeout(800);
  const reference = await shown(s.card);
  ok('the learner sees the Opus verdict as today', reference.grade === 'good' && reference.text.includes('You have both ideas.'), JSON.stringify(reference));
  const body = s.seen.grades[0] || {};
  ok('one shadow request per commit', s.seen.grades.length === 1);
  ok('it carries the attempt, mode, board, block, prompt, ideas, answer and app name - and no source',
    typeof body.attempt_id === 'string' && body.attempt_id.length >= 8 && body.mode === 'challenge' && body.board === BOARD && body.block_id === 'c1'
    && body.prompt === CHALLENGE.prompt && JSON.stringify(body.expects) === JSON.stringify(CHALLENGE.expects) && body.answer === 'exp makes them positive and we divide by the sum' && body.app === 'nanogpt' && !('source' in body), JSON.stringify(body));
  const baseline = s.seen.baselines[0] || {};
  ok('a baseline follows with the parsed verdict and a non-negative integer ms', baseline.verdict === 'good' && Number.isInteger(baseline.ms) && baseline.ms >= 0 && baseline.app === 'nanogpt', JSON.stringify(baseline));
  const block = await s.stored();
  ok('the committed block keeps its attempt id', block.attemptId === body.attempt_id);
  await s.page.reload();
  await s.card.locator('[data-answer]').waitFor({ timeout: 30000 });
  await s.page.waitForTimeout(600);
  ok('a reload keeps the same attempt id', (await s.stored()).attemptId === body.attempt_id);
  await s.card.getByRole('button', { name: 'Answer again' }).click();
  await s.page.waitForTimeout(600);
  ok('Answer again clears the attempt id', (await s.stored()).attemptId === null);
  await s.card.locator('input').fill('a second, different answer');
  await s.card.getByRole('button', { name: 'Commit' }).click();
  await s.card.locator('[data-verdict]', { hasText: 'You have both ideas.' }).waitFor({ timeout: 10000 });
  await s.page.waitForTimeout(500);
  ok('the next answer gets a new attempt id', s.seen.grades.length === 2 && s.seen.grades[1].attempt_id !== body.attempt_id);
  await s.context.close();

  // 2. Every shadow or baseline failure leaves the learner's view identical.
  const cases = [
    ['a slow shadow call', { gradeDelay: 4000 }],
    ['a 503', { grade: { status: 503 } }],
    ['a 202 pending duplicate', { grade: { status: 202 } }],
    ['a 409 incomplete duplicate', { grade: { status: 409 } }],
    ['a 500', { grade: { status: 500 } }],
    ['a network error', { grade: 'abort' }],
    ['a failed baseline post', { baseline: 500 }],
    ['a 404 baseline (already recorded)', { baseline: 404 }],
  ];
  for (const [name, options] of cases) {
    const t = await scenario(options);
    await t.card.locator('input').fill('exp makes them positive and we divide by the sum');
    const started = Date.now();
    await t.card.getByRole('button', { name: 'Commit' }).click();
    await t.card.locator('[data-verdict]', { hasText: 'You have both ideas.' }).waitFor({ timeout: 10000 });
    const elapsed = Date.now() - started;
    await t.page.waitForTimeout(options.gradeDelay ? 4500 : 800);
    const view = await shown(t.card);
    ok(`${name}: the learner's view is identical`, JSON.stringify(view) === JSON.stringify(reference), JSON.stringify(view));
    if (options.gradeDelay) ok(`${name}: the verdict does not wait for it`, elapsed < 3000, `${elapsed} ms`);
    await t.context.close();
  }
}

// 3. An Opus failure shows exactly the Opus error, and still records a baseline with verdict null.
{
  const s = await scenario({ opus: 'error' });
  await s.card.locator('input').fill('an answer');
  await s.card.getByRole('button', { name: 'Commit' }).click();
  await s.card.locator('[data-verdict]', { hasText: 'Could not reach the tutor: Tutor down' }).waitFor({ timeout: 10000 });
  await s.page.waitForTimeout(800);
  ok('the Opus error text is unchanged', (await s.card.locator('[data-verdict]').innerText()).includes('Could not reach the tutor: Tutor down'));
  ok('a failed Opus call still records a baseline, with verdict null', s.seen.baselines.length === 1 && s.seen.baselines[0].verdict === null && Number.isInteger(s.seen.baselines[0].ms), JSON.stringify(s.seen.baselines));
  await s.context.close();
}

// 4. A double click in the same tick commits once.
{
  const s = await scenario();
  await s.card.locator('input').fill('exp makes them positive');
  await s.page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-block-id="c1"] button')].find(node => node.textContent === 'Commit');
    button.click();
    button.click();
  });
  await s.card.locator('[data-verdict]', { hasText: 'You have both ideas.' }).waitFor({ timeout: 10000 });
  await s.page.waitForTimeout(800);
  ok('a same-tick double click makes one shadow call and one Opus call', s.seen.grades.length === 1 && s.seen.asks === 1, `grades ${s.seen.grades.length}, asks ${s.seen.asks}`);
  await s.context.close();
}

// 6. An AWS-hosted app sends no shadow request (LearnPage passes the app object with .hosting).
{
  const saved = { app: replies['/api/apps/nanogpt'], list: replies['/api/apps'] };
  replies['/api/apps/nanogpt'] = { ...app, hosting: 'aws', app_chat: true };
  replies['/api/apps'] = { ...saved.list, apps: [{ ...app, hosting: 'aws', app_chat: true }] };
  const s = await scenario();
  await s.card.locator('input').fill('an answer');
  await s.card.getByRole('button', { name: 'Commit' }).click();
  await s.card.locator('[data-verdict]', { hasText: 'You have both ideas.' }).waitFor({ timeout: 10000 });
  await s.page.waitForTimeout(600);
  ok('an AWS-hosted app sends no shadow request', s.seen.grades.length === 0);
  await s.context.close();
  replies['/api/apps/nanogpt'] = saved.app;
  replies['/api/apps'] = saved.list;
}

// 5. A block without key ideas sends no shadow request.
{
  const s = await scenario();
  await s.page.evaluate(([key, block]) => localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [{ ...block, expects: [] }] })), [KEY, CHALLENGE]);
  await s.page.reload();
  await s.card.locator('input').waitFor({ timeout: 30000 });
  await s.card.locator('input').fill('an answer');
  await s.card.getByRole('button', { name: 'Commit' }).click();
  await s.card.locator('[data-verdict]', { hasText: 'You have both ideas.' }).waitFor({ timeout: 10000 });
  await s.page.waitForTimeout(600);
  ok('no key ideas, no shadow request', s.seen.grades.length === 0);
  await s.context.close();
}

console.log(failed ? `${failed} failed` : 'all green');
await browser.close();
process.exit(failed ? 1 : 0);
