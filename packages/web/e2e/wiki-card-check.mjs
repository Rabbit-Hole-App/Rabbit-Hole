import { chromium } from '@playwright/test';

// The Wikipedia card: navigation chrome stripped, scroll lock, and the
// highlighter - marks that survive a reload and come off with a click.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

// The shape of the real Softmax article's lead: hatnotes and the "Part of a
// series" sidebar before the first sentence.
const filler = Array.from({ length: 30 }, (_, at) => `<p>Paragraph ${at} about the normalised exponential and its gradient.</p>`).join('');
const HTML = '<section data-mw-section-id="0">'
  + '<div class="hatnote navigation-not-searchable" role="note">This article is about the smooth approximation of one-hot arg max.</div>'
  + '<table class="sidebar nomobile nowraplinks"><tbody><tr><th>Part of a series on</th></tr><tr><td><a href="./Machine_learning">Machine learning</a> and data mining</td></tr></tbody></table>'
  + '<p>The <b>softmax function</b> converts a vector of real numbers into a probability distribution.</p>'
  + filler
  + '<div role="navigation" class="navbox"><div>vte Glossary of artificial intelligence</div></div></section>';
const KEY = 'small.adaptive-canvas:example-team:b@e.test:nanogpt:wiki-card-1:s0';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(([key]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [{ id: 'w1', type: 'wiki', dx: 0, dy: 0, title: 'Softmax_function', section: 0, h: 520 }] }));
}, [KEY]);
const page = await context.newPage();
await page.route('**/api/**', route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/learn/wiki') return route.fulfill({ json: { title: 'Softmax_function', displayTitle: 'Softmax function', html: HTML, toc: [], url: 'https://en.wikipedia.org/wiki/Softmax_function', licence: { title: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } } });
  return route.fulfill({ json: replies[url.pathname] || {} });
});
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const card = page.locator('[data-block-id="w1"]');
const article = card.locator('.wiki-article');

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn&board=wiki-card-1');
await article.waitFor({ timeout: 30000 });
await page.waitForTimeout(800);

// --- chrome is gone, the article starts at its first sentence ---
const text = await article.innerText();
ok('no hatnote, sidebar or navbox before the article', !/This article is about|Part of a series|vte Glossary/.test(text));
ok('the article itself is there', /The softmax function converts a vector/.test(text));

// --- scroll lock ---
const box = await article.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + 200);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(300);
const scrolled = await article.evaluate(node => node.scrollTop);
ok('unlocked, the wheel scrolls the article', scrolled > 100, `scrollTop ${scrolled}`);
await card.click({ position: { x: 20, y: 10 } });
await card.getByRole('button', { name: 'Lock scrolling' }).click();
await page.waitForTimeout(200);
const cardBefore = await card.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + 200);
await page.mouse.wheel(0, 400);
await page.waitForTimeout(300);
const cardAfter = await card.boundingBox();
ok('locked, the article holds still', (await article.evaluate(node => node.scrollTop)) === scrolled);
ok('and the wheel moves the canvas instead', Math.abs(cardAfter.y - cardBefore.y) > 50, `card moved ${Math.round(cardAfter.y - cardBefore.y)}`);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(300);
await card.getByRole('button', { name: 'Unlock scrolling' }).click();
await article.evaluate(node => { node.scrollTop = 0; });

// --- highlighter ---
await card.getByRole('button', { name: 'Highlighter' }).click();
ok('highlighter mode is visibly on', (await card.getByRole('button', { name: 'Highlighter' }).getAttribute('aria-pressed')) === 'true');
const select = async (needle) => article.evaluate((node, needle) => {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const at = text.data.indexOf(needle);
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(text, at); range.setEnd(text, at + needle.length);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return true;
  }
  return false;
}, needle);
await select('a probability distribution');
await page.waitForTimeout(400);
const painted = () => page.evaluate(() => (CSS.highlights?.get('wiki-highlight') ? [...CSS.highlights.get('wiki-highlight')].map(range => range.toString()) : []));
ok('a selection becomes a highlight', (await painted()).includes('a probability distribution'), JSON.stringify(await painted()));
ok('the badge counts it', (await card.getByRole('button', { name: 'Highlighter' }).innerText()).trim() === '1');
const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').blocks?.[0]?.highlights || [], KEY);
await page.waitForTimeout(600);
ok('it is saved on the card, by quote', (await stored())[0]?.exact === 'a probability distribution' && (await stored())[0]?.title === 'Softmax_function');

await page.reload();
await article.waitFor({ timeout: 30000 });
await page.waitForTimeout(1000);
ok('highlights survive a reload', (await painted()).includes('a probability distribution'));

// a click inside the highlight, in highlighter mode, removes it
await card.click({ position: { x: 20, y: 10 } });
await card.getByRole('button', { name: 'Highlighter' }).click();
await article.evaluate(node => {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const at = text.data.indexOf('probability');
    if (at < 0) continue;
    const range = document.createRange();
    range.setStart(text, at + 3); range.collapse(true);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return;
  }
});
await page.waitForTimeout(500);
ok('a click on a highlight removes it', (await painted()).length === 0 && (await stored()).length === 0);
await page.keyboard.press('Control+z');
await page.waitForTimeout(500);
ok('undo brings it back', (await painted()).includes('a probability distribution'));

await page.screenshot({ path: 'e2e/shots/wiki-card-1.png' });
await browser.close();
console.log(failed ? `${failed} FAILURES` : 'all green');
process.exit(failed ? 1 : 0);
