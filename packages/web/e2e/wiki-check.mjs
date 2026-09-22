import { chromium } from '@playwright/test';

// Wikipedia on the canvas, against stubbed articles. The point of this check is
// what a unit test cannot see: that a card reaches the canvas at all (the PDF
// card was dispatched and unreachable for months), that the sanitizer's
// allowlist holds in a real DOM, and that navigation and back behave.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

const licence = { title: 'Creative Commons Attribution-Share Alike 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en' };
// Everything hostile an editor can actually put in an article, on one page.
const ML = [
  '<html><head><base href="//en.wikipedia.org/wiki/"><style>.evil{color:red}</style></head><body>',
  '<section data-mw-section-id="0"><p id="lead">Machine learning is a field of study.</p>',
  '<p><a rel="mw:WikiLink" href="./Neural_network">Neural networks</a> are one approach.</p>',
  '<p><a id="js-link" href="javascript:window.__pwned=1">Looks like a link</a></p>',
  '<p><a id="red-link" class="new" href="./Nothing?action=edit&amp;redlink=1">Nonexistent</a></p>',
  '<p style="position:fixed;inset:0;background:red;z-index:99999" id="overlay">OVERLAY</p>',
  '<div class="fixed inset-0 z-50 flex items-center justify-center bg-white" id="overlay-class">COVER THE APP</div>',
  '<img id="bad-img" src="x" onerror="window.__pwned=2" alt="">',
  '<img id="good-img" src="//upload.wikimedia.org/a.png" srcset="//upload.wikimedia.org/a.png 1.5x" alt="Diagram">',
  '<iframe id="frame" src="https://evil.test"></iframe>',
  '<p id="fake-mark" class="arrived" data-arrived>pre-marked by an editor</p>',
  '<p><a id="cite" href="#cite_note-1">[1]</a></p></section>',
  '<section data-mw-section-id="1"><div class="mw-heading"><h2 id="History">History</h2><span class="mw-editsection">edit</span></div>',
  '<p>Arthur Samuel coined the term in 1959.</p><p class="tall">filler</p></section>',
  '<section data-mw-section-id="2"><h2 id="Approaches">Approaches</h2><p>Supervised and unsupervised.</p><p class="tall">filler</p>',
  '<p><a rel="mw:WikiLink" href="./Neural_network" id="deep-link">Neural networks again</a></p></section>',
  '</body></html>',
].join('\n');
const NN = '<html><body><section data-mw-section-id="0"><p id="lead">A neural network is a model.</p><p><a rel="mw:WikiLink" href="./Machine_learning">Back to machine learning</a></p></section></body></html>';
const ARTICLES = {
  Machine_learning: { title: 'Machine_learning', displayTitle: 'Machine learning', html: ML, url: 'https://en.wikipedia.org/wiki/Machine_learning', licence },
  Neural_network: { title: 'Neural_network', displayTitle: 'Neural network', html: NN, url: 'https://en.wikipedia.org/wiki/Neural_network', licence },
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const asks = [];
let sse = null;
await page.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  if (path === '/api/learn/wiki') return route.fulfill({ json: ARTICLES[url.searchParams.get('title')] || { error: 'No Wikipedia article called that' } });
  if (path === '/api/learn/wiki/search') return route.fulfill({ json: { pages: [{ title: 'Machine_learning', displayTitle: 'Machine learning', description: 'A field of study', thumbnail: null }] } });
  if (request.method() === 'POST' && /ask|selection/.test(path)) {
    try { asks.push(JSON.parse(request.postData() || '{}')); } catch { /* not JSON, not this check's business */ }
    const body = sse || 'event: delta\ndata: {"text":"Here."}\n\nevent: done\ndata: {}\n\n';
    sse = null;
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body });
  }
  return route.fulfill({ json: replies[path] || {} });
});
// Make the stub article tall enough that scrolling to a section is a real move.
await page.addStyleTag; // no-op guard for older versions
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };

const canvas = page.locator('[aria-label="Lesson canvas"]');
const card = canvas.locator('[aria-label="Wikipedia reader"]:not(:has([aria-label="Close article"]))');
// The card and the reader are the same component; only the reader can be closed.
const reader = page.locator('[aria-label="Wikipedia reader"]:has([aria-label="Close article"])');

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn');
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.addStyleTag({ content: '.wiki-article p.wiki-tall { display:block; height: 900px; }' });
await page.waitForTimeout(3000);

// --- the learner adds one ---
ok('no article on the canvas to begin with', (await card.count()) === 0);
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: /^Sources/ }).click();
await page.waitForTimeout(250);
await page.getByRole('menuitem', { name: /Wikipedia article/ }).click();
await page.waitForTimeout(300);
const box = page.getByRole('dialog', { name: 'Add a Wikipedia article' });
ok('the picker searches as you type, with no button to press', (await box.getByRole('button').count()) === 0);
await box.getByRole('textbox').fill('machine');
await page.waitForTimeout(1200);
await box.locator('li').first().click();
await page.waitForTimeout(2500);
ok('picking an article puts a card on the canvas', (await card.count()) === 1);
ok('and opens the reader', await reader.isVisible());
ok('the licence notice is visible with the content', (await reader.getByText(/Creative Commons Attribution-Share Alike 4\.0/).count()) > 0);

// --- the sanitizer, in a real DOM ---
const body = reader.locator('.wiki-article');
ok('the overlay style attribute is gone', (await body.locator('#overlay').getAttribute('style')) === null);
ok('no element anywhere kept a style attribute', (await body.locator('[style]').count()) === 0);
ok('the iframe is gone entirely', (await body.locator('#frame').count()) === 0);
// This app is Tailwind: an unprefixed class is a live utility, so an editor
// could cover the canvas and composer without a line of CSS or script.
ok('an article cannot reach the app utility classes', await page.evaluate(() => {
  const node = document.querySelector('#overlay-class');
  return !!node && getComputedStyle(node).position !== 'fixed';
}));
ok('an editor cannot pre-tint their own text as if the tutor pointed at it', await page.evaluate(() => {
  const node = document.querySelector('#fake-mark');
  return !!node && !node.hasAttribute('data-arrived') && node.getAttribute('class') === 'wiki-arrived' && getComputedStyle(node).animationName === 'none';
}));
ok('its classes are namespaced instead of dropped', (await body.locator('#overlay-class').getAttribute('class')) === 'wiki-fixed wiki-inset-0 wiki-z-50 wiki-flex wiki-items-center wiki-justify-center wiki-bg-white');
ok('the inline stylesheet did not become visible text', !(await body.textContent())?.includes('.evil'));
ok('an onerror image is dropped, handler and all', (await body.locator('#bad-img').count()) === 0);
ok('a real image survives, made absolute', (await body.locator('#good-img').getAttribute('src')) === 'https://upload.wikimedia.org/a.png');
ok('its srcset is absolute too', (await body.locator('#good-img').getAttribute('srcset')) === 'https://upload.wikimedia.org/a.png 1.5x');
ok('the edit pencil is gone', (await body.locator('.mw-editsection').count()) === 0);
const js = body.locator('#js-link');
ok('a javascript: link keeps its text and loses its href', (await js.getAttribute('href')) === null && (await js.textContent()) === 'Looks like a link');
await js.click();
await page.waitForTimeout(400);
ok('and clicking it does nothing at all', (await page.evaluate(() => window.__pwned)) === undefined);
ok('a red link is marked dead, not navigable', (await body.locator('#red-link').getAttribute('data-wiki')) === 'dead');
ok('headings survive the global reset as headings', await page.evaluate(() => {
  const heading = document.querySelector('.wiki-article h2');
  const paragraph = document.querySelector('.wiki-article p');
  return !!heading && parseFloat(getComputedStyle(heading).fontSize) > parseFloat(getComputedStyle(paragraph).fontSize);
}));

// --- navigating ---
// A link far down the article, brought into view first. Clicking one above the
// fold scrolls the reader to the top before the click lands, and back would
// then correctly return to zero - a green check proving nothing.
const offset = async () => page.evaluate(() => {
  const root = [...document.querySelectorAll('[aria-label="Wikipedia reader"]')].find(node => node.querySelector('[aria-label="Close article"]'));
  return root.querySelector('.wiki-article').scrollTop;
});
await body.locator('#deep-link').scrollIntoViewIfNeeded();
await page.waitForTimeout(700);
const left = await offset();
ok('scrolling down stays where the learner put it', left > 100, `scrollTop ${left}`);
await body.locator('#deep-link').click();
await page.waitForTimeout(2000);
ok('clicking an internal link navigates in place', (await reader.locator('h3').textContent()) === 'Neural network', await reader.locator('h3').textContent());
const back = reader.getByLabel('Back');
ok('back becomes available once there is somewhere to go', await back.isEnabled());
if (await back.isEnabled()) {
  await back.click();
  await page.waitForTimeout(2000);
  ok('back returns to the previous article', (await reader.locator('h3').textContent()) === 'Machine learning', await reader.locator('h3').textContent());
  const returned = await offset();
  ok('and to where the learner left off, not the top', Math.abs(returned - left) < 40, `left ${left}, returned ${returned}`);
}

// --- what the tutor is told ---
await page.getByPlaceholder(/Ask about/).first().fill('what is this?');
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
ok('a question carries the article being read', asks.at(-1)?.wiki_context?.title === 'Machine_learning', JSON.stringify(asks.at(-1)?.wiki_context));

// --- the tutor opens one ---
sse = `event: delta\ndata: {"text":"Look at the history."}\n\nevent: wiki\ndata: ${JSON.stringify({ lang: 'en', title: 'Machine_learning', displayTitle: 'Machine learning', section: 1, sectionTitle: 'History', url: 'https://en.wikipedia.org/wiki/Machine_learning' })}\n\nevent: done\ndata: {}\n\n`;
await page.getByPlaceholder(/Ask about/).first().fill('when did this start?');
await page.keyboard.press('Enter');
// The tint removes itself when its 2s animation ends, so look while it lives.
await page.waitForTimeout(1200);
ok('the tutor can open an article at a section', await page.evaluate(() => {
  const root = [...document.querySelectorAll('.wiki-article')].find(node => node.scrollTop > 0);
  if (!root) return false;
  const history = root.querySelector('[data-mw-section-id="1"]');
  return !!history && Math.abs(history.getBoundingClientRect().top - root.getBoundingClientRect().top) < 40;
}));
ok('and the section it points at is visibly marked', await page.evaluate(async () => {
  // The tint follows its section one frame behind a reflow, so give it one.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const root = [...document.querySelectorAll('.wiki-article')].find(node => node.scrollTop > 0);
  const mark = root?.querySelector('[data-arrived]');
  if (!mark || getComputedStyle(mark).animationName !== 'wiki-arrive') return false;
  // over the section it named, not somewhere else in the article
  const section = root.querySelector('[data-mw-section-id="1"]');
  return Math.abs(mark.getBoundingClientRect().top - section.getBoundingClientRect().top) < 8;
}));

// --- it survives a reload ---
await page.reload();
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(3500);
ok('the card keeps the wheel, so it scrolls instead of panning the canvas', (await card.locator('[data-scroll]').count()) >= 1);
ok('the card is still on the canvas after a reload', (await card.count()) >= 1);
ok('and still shows the article, not an empty shell', (await card.first().getByText(/Machine learning is a field of study/).count()) > 0);

// Navigating inside a card must change what it reports, or a question asked
// afterwards is about the article the card was created with.
// A card takes the pointer only once it is selected, like the PDF card: the
// first press selects it, so a drag on the board does not start inside a
// document the learner is only reading.
await card.locator('#lead').click();
await page.waitForTimeout(400);
await card.getByRole('link', { name: 'Neural networks', exact: true }).first().click();
await page.waitForTimeout(2200);
ok('a card reports the article it navigated to, not the one it was created with',
  (await card.locator('h3').textContent()) === 'Neural network', await card.locator('h3').textContent());


await page.screenshot({ path: 'e2e/shots/wiki-card.png' });
await browser.close();
process.exit(failed ? 1 : 0);
