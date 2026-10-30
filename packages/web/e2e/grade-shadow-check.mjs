import { chromium } from '@playwright/test';

// Owner 2026-10-30, "one Practice card" (Explain-back = Challenge = Practice): a saved challenge block WITHOUT mode
// 'explain_back' (an old Challenge) is the Practice card. On this dev-flag build (dist-dev, VITE_COACHING_DEV) an editable
// canvas has the durable attempt store, so its answer is one saved attempt and the legacy grade (/api/learn/assess) and the
// Jev side-by-side shadow (/api/learn/grade, docs/features/jev-grading.md) are no longer called from it. This check used to
// drive the old one-line Challenge (Commit, data-grade tint, Answer again) through that legacy grade; that card is gone. The
// shadow client itself stays covered by learn-grade-shadow.test.mjs and the legacy commit path (a view-only canvas, where
// the store is off) by learn-challenge.test.mjs.
// 1. an old Challenge renders as the Practice card and submits one durable attempt, no legacy grade, no shadow;
// 2. an old Challenge already answered shows its guess, the Tutor's verdict (no VERDICT token) and its reveal as attempt 1,
//    Not rated; Revise answer starts a draft from the guess, and the new attempt is attempt 2 with no server parent.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] },
  // A profile with a handle, so HandleGate lets the page through (session-display.js loadProfile).
  '/api/profile': { name: 'B', avatar: null, handle: 'grade_shadow', description: '' } };
const BOARD = 'grade-shadow-1';
const KEY = `small.adaptive-canvas:example-team:b@e.test:nanogpt:${BOARD}:s0`;
const CHALLENGE = { id: 'c1', type: 'challenge', dx: 0, dy: 0, prompt: 'Why does softmax use exp?', hint: 'Think about signs.', expects: ['exp makes every score positive', 'dividing by the sum makes them add to one'], reveal: 'Dividing by the sum turns the scores into shares of one whole.', answer: null };
const ANSWERED = { ...CHALLENGE, answer: 'exp makes them positive', attemptId: 'old-attempt-1', verdict: 'VERDICT: good\nYou have both ideas.', grading: false };

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const total = 12;
const browser = await chromium.launch();
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// One fresh learner per scenario, its board seeded with `block`. The durable attempt routes (learn-attempt-routes.js) are
// stubbed: bind, the server draft, submit (its assessment left pending: no model), list and read.
async function scenario(block) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.addInitScript(([key, seeded]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [seeded] }));
  }, [KEY, block]);
  const page = await context.newPage();
  const seen = { asks: 0, grades: 0, binds: [], posts: [] };
  const stored = new Map(), drafts = new Map();
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/learn/assess') { seen.asks += 1; return json(route, 500, { error: 'the legacy grade must not be called' }); }
    if (url.pathname.startsWith('/api/learn/grade')) { seen.grades += 1; return json(route, 500, { error: 'the Jev shadow must not be called' }); }
    if (url.pathname.startsWith('/api/learn/tutor/attempts')) {
      const path = url.pathname.slice('/api/learn/tutor/attempts'.length);
      const view = id => ({ attempt: { attemptId: id, submittedContent: stored.get(id).content }, assessment: { assessmentId: `as_${id}`, status: 'pending' } });
      if (request.method() === 'POST' && path === '/bind') {
        const body = JSON.parse(request.postData() || '{}');
        seen.binds.push(body);
        return json(route, 200, { goalId: 'goal_eb', activityId: `act_${body.cardId}`, activityRevision: 1, criterionRefs: [{ criterionId: 'k_a', version: 1 }, { criterionId: 'k_b', version: 1 }], rubricVersion: 'eb-v1' });
      }
      if (path === '/drafts') {
        const cardId = request.method() === 'GET' ? url.searchParams.get('cardId') : JSON.parse(request.postData() || '{}').cardId;
        if (request.method() === 'GET') return json(route, 200, { draft: drafts.get(cardId) || null });
        const { expectedRevision, answer } = JSON.parse(request.postData() || '{}');
        const current = drafts.get(cardId);
        if ((current?.revision || 0) !== expectedRevision) return json(route, 409, { error: 'draft_conflict', detail: { draft: current || null } });
        if (answer === null) { drafts.delete(cardId); return json(route, 200, { draft: null }); }
        const draft = { cardId, revision: (current?.revision || 0) + 1, answer, updatedAt: new Date().toISOString() };
        drafts.set(cardId, draft);
        return json(route, 200, { draft });
      }
      if (request.method() === 'POST' && path === '') {
        const sent = JSON.parse(request.postData() || '{}');
        seen.posts.push(sent);
        const id = `at_${seen.posts.length}`;
        stored.set(id, { cardId: sent.activityId.replace(/^act_/, ''), content: sent.submittedContent });
        return json(route, 201, view(id));
      }
      if (request.method() === 'GET' && path === '') {
        const cardId = url.searchParams.get('cardId');
        return json(route, 200, { attempts: [...stored].filter(([, it]) => it.cardId === cardId).map(([attemptId]) => ({ attemptId })).reverse() });
      }
      const id = decodeURIComponent(path.slice(1));
      if (request.method() === 'GET' && stored.has(id)) return json(route, 200, view(id));
      return json(route, 404, { error: 'unknown_attempt' });
    }
    return route.fulfill({ json: replies[url.pathname] || {} });
  });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.log('PAGEERROR:', error.message); });
  await page.goto(`http://localhost:5189/apps/nanogpt?tab=learn&board=${BOARD}`);
  const card = page.locator('[data-block-id="c1"]');
  await card.locator('[data-explain-back]').waitFor({ timeout: 30000 });
  return { context, page, card, seen, errors };
}

// 1. A new answer on an old Challenge: the Practice card, one durable attempt, nothing legacy.
{
  const s = await scenario(CHALLENGE);
  const field = s.card.locator('textarea[data-eb-answer]');
  await field.waitFor({ timeout: 30000 });
  const text = await s.card.innerText();
  ok('1a an old Challenge renders as the Practice card: kicker Practice, its question and hint', /PRACTICE/i.test(text) && text.includes(CHALLENGE.prompt) && text.includes(CHALLENGE.hint) && !/challenge/i.test(text), text.slice(0, 200));
  ok('1b no one-line guess field and no Commit button', await s.card.locator('input[placeholder="Your guess in one sentence"]').count() === 0 && await s.card.getByRole('button', { name: 'Commit', exact: true }).count() === 0);
  ok('1c the reveal waits for an answer', await s.card.locator('[data-eb-reveal]').count() === 0);
  await field.fill('exp makes them positive and we divide by the sum');
  await s.card.getByRole('button', { name: 'Submit answer', exact: true }).click();
  await s.card.locator('[data-eb-reviewing]').waitFor({ timeout: 15000 });
  ok('1d one durable attempt, bound to this card with its saved prompt and key ideas', s.seen.posts.length === 1 && s.seen.binds[0]?.cardId === 'c1' && s.seen.binds[0]?.prompt === CHALLENGE.prompt && JSON.stringify(s.seen.binds[0]?.expects) === JSON.stringify(CHALLENGE.expects), JSON.stringify(s.seen.binds));
  ok('1e the attempt carries the typed answer', s.seen.posts[0]?.submittedContent?.text === 'exp makes them positive and we divide by the sum', JSON.stringify(s.seen.posts[0]?.submittedContent));
  ok('1f no legacy grade and no Jev shadow request', s.seen.asks === 0 && s.seen.grades === 0, `assess ${s.seen.asks}, grade ${s.seen.grades}`);
  ok('1g after the answer the reveal shows', (await s.card.locator('[data-eb-reveal]').innerText()).includes('shares of one whole'));
  ok('1h no page errors', s.errors.length === 0, s.errors.join(' | '));
  await s.context.close();
}

// 2. An old Challenge answered before: its guess and verdict are attempt 1; a revision is attempt 2 with no server parent.
{
  const s = await scenario(ANSWERED);
  await s.card.locator('[data-attempt-label]').waitFor({ timeout: 30000 });
  ok('2a the saved guess is attempt 1, reviewed and Not rated', (await s.card.locator('[data-attempt-label]').innerText()) === 'Attempt 1 · Reviewed'
    && (await s.card.locator('[data-rating-badge]').innerText()).includes('Not rated') && (await s.card.locator('[data-answer-view] [data-answer]').innerText()) === 'exp makes them positive');
  await s.card.locator('[data-feedback-tab="feedback"]').click();
  const feedback = await s.card.locator('[data-feedback-view]').innerText();
  ok('2b the Tutor verdict shows without its VERDICT token, with the reveal', feedback.includes('You have both ideas.') && !/VERDICT/.test(feedback) && (await s.card.locator('[data-eb-reveal]').innerText()).includes('shares of one whole'), feedback);
  await s.card.getByRole('button', { name: 'Revise answer', exact: true }).click();
  const field = s.card.locator('textarea[data-eb-answer]');
  await field.waitFor({ timeout: 10000 });
  const draft = await field.inputValue();
  await field.fill('exp makes them positive; dividing by the sum makes them add to one');
  await s.card.getByRole('button', { name: 'Submit answer', exact: true }).click();
  await s.card.locator('[data-eb-reviewing]').waitFor({ timeout: 15000 });
  const options = await s.card.locator('[data-attempt-select] option').allInnerTexts();
  ok('2c Revise answer starts from the saved guess; the new attempt is attempt 2 and attempt 1 stays', draft === 'exp makes them positive' && options.length === 2 && options[0].startsWith('Attempt 1') && options[1].startsWith('Attempt 2'), `${draft} | ${options.join(' / ')}`);
  ok('2d the revision is saved with no server parent (the old guess was never a stored attempt), and nothing legacy is called',
    s.seen.posts.length === 1 && !('baseline' in (s.seen.posts[0]?.submittedContent || {})) && s.seen.asks === 0 && s.seen.grades === 0, JSON.stringify(s.seen.posts[0]?.submittedContent));
  await s.context.close();
}

const passed = total - failed;
console.log(failed ? `${failed} of ${total} failed` : `all green (${passed}/${total})`);
await browser.close();
process.exit(failed ? 1 : 0);
