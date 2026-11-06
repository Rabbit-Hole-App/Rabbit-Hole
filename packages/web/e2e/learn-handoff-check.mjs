import { chromium } from '@playwright/test';

// The Agent Bar handoff into Learn (Tutor cleanup P4: teach only): small.learn.request (sessionStorage, read once on mount) and
// the small:learn-request event, each answered by exactly one small:learn-result, also kept at small.learn.result:<id>. A teach
// request fills Chat's composer and attaches its context refs, and never sends: no /api/learn/ask or /api/learn/selection request
// is ever made. The research kind is gone (Q5). /api/profile is stubbed so the page passes the handle gate.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/profile': { name: 'Tester', avatar: null, handle: 'tester', description: '' }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };
const PROMPT = 'Explain how softmax turns scores into probabilities';
const BOARD = 'handoff-1';
const REF = { sourceId: 'doc:ctx:0123456789ab', kind: 'doc', name: 'Notes.pdf', version: '2026-10-14 07:00:00', range: null };

const asks = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(([prompt, board, ref]) => {
  window.__results = [];
  window.addEventListener('small:learn-result', event => window.__results.push(event.detail));
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  // The Agent Bar writes this, then navigates here.
  sessionStorage.setItem('small.learn.request', JSON.stringify({ id: 'teach-1', kind: 'teach', app: 'nanogpt', board, prompt, contextRefs: [ref] }));
}, [PROMPT, BOARD, REF]);
const page = await context.newPage();
await page.route('**/api/**', route => {
  const request = route.request();
  const url = new URL(request.url());
  if (request.method() === 'POST' && /\/ask|selection/.test(url.pathname)) {
    asks.push(url.pathname);
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: done\ndata: {}\n\n' });
  }
  return route.fulfill({ json: replies[url.pathname] || {} });
});
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const resultFor = async id => (await page.waitForFunction(id => window.__results.find(result => result.id === id), id, { timeout: 25000 })).jsonValue();
const resultsFor = id => page.evaluate(id => window.__results.filter(result => result.id === id).length, id);
const saved = id => page.evaluate(id => JSON.parse(sessionStorage.getItem(`small.learn.result:${id}`) || 'null'), id);
const send = detail => page.evaluate(detail => window.dispatchEvent(new CustomEvent('small:learn-request', { detail })), detail);
const composer = page.locator('[data-chat-pane] [data-chat-composer] :is(textarea, input:not([type="file"]))');
const chips = page.locator('[data-chat-pane] [data-context-chip]');

await page.goto(`http://localhost:5189/apps/nanogpt?tab=learn&board=${BOARD}`);

// --- teach, through the navigation handoff ---
const teach = await resultFor('teach-1');
ok('session handoff: teach is answered after Learn mounts', teach.status === 'prefilled' && teach.kind === 'teach', JSON.stringify(teach));
ok('the result echoes the request id', teach.id === 'teach-1');
ok('the whole request is in the real composer', (await composer.inputValue()) === PROMPT);
ok('and the composer has focus, caret at the end', await composer.evaluate((input, prompt) => document.activeElement === input && input.selectionStart === prompt.length, PROMPT));
ok('the context ref rides as a chip beside the text', (await chips.filter({ hasText: 'Notes.pdf' }).count()) >= 1, `${await chips.count()} chip(s)`);
ok('the pending request was consumed', (await page.evaluate(() => sessionStorage.getItem('small.learn.request'))) === null);
ok('the result is kept for a remounted caller', (await saved('teach-1'))?.status === 'prefilled');
await page.waitForTimeout(1200);
ok('nothing was sent: no ask request at all', asks.length === 0 && (await composer.inputValue()) === PROMPT, `asks ${asks.length}`);

// --- teach never overwrites a draft ---
await composer.fill('my own half-written question');
await send({ id: 'teach-2', kind: 'teach', app: 'nanogpt', board: BOARD, prompt: 'Something else' });
const conflict = await resultFor('teach-2');
ok('a draft in the composer refuses teach, saying why', conflict.status === 'rejected' && /draft/i.test(conflict.reason), conflict.reason);
ok('and the draft is untouched', (await composer.inputValue()) === 'my own half-written question');
await composer.fill('');

// --- live teach while Learn is open ---
await send({ id: 'teach-3', kind: 'teach', app: 'nanogpt', board: BOARD, prompt: 'What is a logit?' });
ok('already-open Learn takes the live event', (await resultFor('teach-3')).status === 'prefilled' && (await composer.inputValue()) === 'What is a logit?');
await composer.fill('');
ok('still nothing sent', asks.length === 0);

// --- refusals ---
await send({ id: 'research-1', kind: 'research', app: 'nanogpt', board: BOARD, source: { kind: 'wiki', ref: 'Logit' } });
const research = await resultFor('research-1');
ok('the research kind is gone: refused with the reason', research.status === 'rejected' && /Unknown request kind/.test(research.reason), research.reason);
await send({ id: 'teach-other-app', kind: 'teach', app: 'someone-else', board: BOARD, prompt: 'Hello' });
ok('a request for another app is refused', (await resultFor('teach-other-app')).status === 'rejected');
await send({ id: 'teach-other-board', kind: 'teach', app: 'nanogpt', board: 'another-board', prompt: 'Hello' });
ok('a request for another canvas is refused', (await resultFor('teach-other-board')).status === 'rejected');
await send({ id: 'teach-empty', kind: 'teach', app: 'nanogpt', board: BOARD, prompt: '   ' });
ok('an empty prompt is refused', (await resultFor('teach-empty')).status === 'rejected');
ok('and the composer is still empty', (await composer.inputValue()) === '');

// --- one-shot and idempotent ---
await send({ id: 'teach-3', kind: 'teach', app: 'nanogpt', board: BOARD, prompt: 'What is a logit?' });
await page.waitForFunction(() => window.__results.filter(result => result.id === 'teach-3').length === 2, null, { timeout: 5000 }).catch(() => {});
ok('a repeated id replays its result', (await resultsFor('teach-3')) === 2);
ok('and fills nothing a second time', (await composer.inputValue()) === '');
await page.evaluate(detail => { for (let at = 0; at < 3; at += 1) window.dispatchEvent(new CustomEvent('small:learn-request', { detail })); }, { id: 'teach-burst', kind: 'teach', app: 'nanogpt', board: BOARD, prompt: 'One burst' });
await resultFor('teach-burst');
await page.waitForTimeout(800);
ok('three deliveries at once answer once', (await resultsFor('teach-burst')) === 1 && (await composer.inputValue()) === 'One burst');
ok('teach-1 did not run again', (await resultsFor('teach-1')) === 1);
ok('still no ask request', asks.length === 0);

console.log(failed ? `${failed} failed` : 'all green');
await browser.close();
process.exit(failed ? 1 : 0);
