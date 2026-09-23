import { chromium } from '@playwright/test';

// The search bar, the Files panel, and insert-where-you-look, against a
// stubbed worker. Every way out of the search bar, every state it can be in
// (idle, busy, results, exact match, nothing found, failed), keyboard use,
// and the Files panel's switch / show / remove on real cards.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

const VIDEOS = [
  { key: 'Ilg3gGewQ5U', title: 'Backpropagation, intuitively', subtitle: '3Blue1Brown', why: 'Animates how each weight gets its nudge.', thumbnail: null, item: { videoId: 'Ilg3gGewQ5U', title: 'Backpropagation, intuitively', channel: '3Blue1Brown' } },
  { key: 'RyKrG8rTGUY', title: 'Backpropagation In Depth', subtitle: 'Some channel', why: 'Builds the computational graph step by step.', thumbnail: null, item: { videoId: 'RyKrG8rTGUY', title: 'Backpropagation In Depth', channel: 'Some channel' } },
];
const PAPER = { key: '1706.03762', title: 'Attention Is All You Need', subtitle: 'Vaswani et al. · arXiv:1706.03762', why: 'Exactly the paper you pasted.', exact: true, thumbnail: null, item: { id: '1706.03762', title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762' } };
const ARTICLE = { key: 'Backpropagation', title: 'Backpropagation', subtitle: 'Wikipedia', why: 'The algorithm itself.', thumbnail: null, item: { title: 'Backpropagation' } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const searches = [];
let failNext = false;
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/learn/search') {
    const source = url.searchParams.get('source'), q = url.searchParams.get('q');
    searches.push({ source, q });
    await new Promise(resolve => setTimeout(resolve, 250));
    if (failNext) { failNext = false; return route.fulfill({ status: 400, json: { error: 'Too many searches right now. Wait a moment and try again.' } }); }
    if (/zzqq/.test(q)) return route.fulfill({ json: { results: [] } });
    if (source === 'arxiv') return route.fulfill({ json: { results: [PAPER], exact: true } });
    if (source === 'wikipedia') return route.fulfill({ json: { results: [ARTICLE] } });
    return route.fulfill({ json: { results: VIDEOS } });
  }
  if (url.pathname === '/api/learn/wiki') return route.fulfill({ json: { title: 'Backpropagation', displayTitle: 'Backpropagation', html: '<section><p>Backpropagation computes gradients.</p></section>', toc: [], licence: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } } });
  return route.fulfill({ json: replies[url.pathname] || {} });
});
await page.route('**youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>player</body></html>' }));
await page.route('**i.ytimg.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const canvas = page.locator('[aria-label="Lesson canvas"]');
const menubar = page.getByRole('menubar', { name: 'Canvas menu' });
const bar = page.getByRole('dialog', { name: 'Search' });
const openSearch = async () => { await menubar.getByRole('menuitem', { name: /^Search/ }).click(); await page.waitForTimeout(250); };

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn&board=search-files-1');
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(2500);

// --- the menubar ---
const labels = await menubar.getByRole('menuitem').allInnerTexts();
ok('the menubar reads Search, Files, Insert, Edit, View', labels.map(label => label.trim()).join(',') === 'Search,Files,Insert,Edit,View', labels.join(','));
for (const title of ['Insert', 'Edit', 'View']) {
  await menubar.getByRole('menuitem', { name: new RegExp(`^${title}`) }).click();
  await page.waitForTimeout(200);
  const rows = page.locator('[role="menubar"] [class*="top-9"] button[role="menuitem"]');
  const count = await rows.count();
  const withIcon = await rows.evaluateAll(buttons => buttons.filter(button => button.querySelector('svg.lucide')).length);
  ok(`every ${title} row has an icon`, count > 0 && withIcon === count, `${withIcon}/${count}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}
await menubar.getByRole('menuitem', { name: /^Files/ }).click();
await page.waitForTimeout(250);
const filesText = await page.locator('[role="menubar"]').innerText();
ok('Files has no search rows and no Google Slides until it exists', !/arXiv paper|Wikipedia article|YouTube video|Google Slides/.test(filesText));
ok('the repository is listed with its switch, and cannot be removed', (await page.getByRole('switch', { name: /Tutor reads karpathy\/nanoGPT/ }).count()) === 1 && (await page.getByRole('button', { name: /Remove karpathy/ }).count()) === 0);
await page.keyboard.press('Escape');
await page.mouse.click(700, 700);

// --- every way out ---
await openSearch();
ok('Search opens one bar', (await bar.count()) === 1);
const rect = await bar.boundingBox();
ok('centered horizontally, in the upper part of the page', Math.abs(rect.x + rect.width / 2 - 750) < 4 && rect.y < 950 / 3, `x-center ${Math.round(rect.x + rect.width / 2)}, top ${Math.round(rect.y)}`);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
ok('Esc closes it', (await bar.count()) === 0);
await openSearch();
await bar.getByRole('button', { name: 'Close search' }).click();
await page.waitForTimeout(150);
ok('the X closes it', (await bar.count()) === 0);
await openSearch();
await page.mouse.click(40, 900);
await page.waitForTimeout(150);
ok('a click outside closes it', (await bar.count()) === 0);
ok('closing added nothing and searched nothing', searches.length === 0 && (await canvas.locator('iframe').count()) === 0);

// --- idle: examples, no search per keystroke ---
await openSearch();
ok('idle state offers example searches', (await bar.getByRole('button', { name: 'I want to understand backpropagation' }).count()) === 1);
ok('no instruction line above them', !/Ask in plain words/.test(await bar.innerText()));
const chips = await bar.getByRole('button', { name: /backpropagation|transformers|gradient descent/ }).evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
ok('the examples stack one under another', chips.length === 3 && chips[1] > chips[0] + 10 && chips[2] > chips[1] + 10, chips.map(Math.round).join(','));
for (const source of ['youtube', 'arxiv', 'wikipedia']) {
  await bar.getByRole('combobox', { name: 'Search in' }).selectOption(source);
  const fits = await bar.getByRole('textbox').evaluate(input => { const probe = document.createElement('span'); const style = getComputedStyle(input); probe.style.font = style.font; probe.style.whiteSpace = 'nowrap'; probe.textContent = input.placeholder; document.body.append(probe); const width = probe.offsetWidth; probe.remove(); return width <= input.clientWidth; });
  ok(`the ${source} placeholder fits on one line`, fits);
}
await bar.getByRole('combobox', { name: 'Search in' }).selectOption('youtube');
await bar.getByRole('textbox').pressSequentially('backprop', { delay: 40 });
await page.waitForTimeout(600);
ok('typing does not search - Enter does', searches.length === 0);
ok('and the bar says so', (await bar.getByText('to search').count()) === 1);

// --- results, keyboard, pick ---
await bar.getByRole('textbox').fill('I want to understand backpropagation');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
ok('a busy line while it searches, no trailing dots', /Finding the best YouTube videos for that$/.test((await bar.innerText()).split('\n').find(line => line.startsWith('Finding')) || ''));
const spinner = await bar.locator('[role="status"] svg.animate-spin').evaluate(node => ({ color: getComputedStyle(node).color, animation: getComputedStyle(node).animationName }));
ok('with a coloured, moving spinner', spinner.animation !== 'none' && spinner.color === 'rgb(35, 131, 226)', JSON.stringify(spinner));
ok('and placeholder rows in the shape of results', (await bar.locator('[role="status"] .animate-pulse').count()) === 3);
await page.waitForTimeout(500);
ok('results show title, channel, and why', (await bar.getByRole('listbox').getByRole('option').count()) === 2 && (await bar.getByText('Animates how each weight gets its nudge.').count()) === 1);
ok('the query went to the chosen source', searches.at(-1)?.source === 'youtube' && searches.at(-1)?.q === 'I want to understand backpropagation');
await page.keyboard.press('ArrowDown');
ok('arrow keys move the highlight', (await bar.getByRole('listbox').getByRole('option').nth(1).getAttribute('aria-selected')) === 'true');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
ok('Enter adds the highlighted result and closes the bar', (await bar.count()) === 0 && (await canvas.locator('iframe[src*="RyKrG8rTGUY"]').count()) === 1);

// --- source dropdown, remembered; exact match ---
await openSearch();
ok('the source is remembered', (await bar.getByRole('combobox', { name: 'Search in' }).inputValue()) === 'youtube');
await bar.getByRole('combobox', { name: 'Search in' }).selectOption('arxiv');
await bar.getByRole('textbox').fill('1706.03762');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
ok('a pasted id comes back as an exact match', (await bar.getByText('Exact match').count()) === 1);
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
const paperCard = canvas.locator('[aria-label="Paper reader"]');
ok('picking a paper puts a paper card on the canvas', (await paperCard.count()) === 1);
ok('and not the side panel', (await page.locator('aside [aria-label="Paper reader"]').count()) === 0);

// --- nothing found: one click to try elsewhere, same words ---
await openSearch();
await bar.getByRole('textbox').fill('zzqq nothing like this');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
ok('no results says so plainly', (await bar.getByText('No arXiv papers matched that.').count()) === 1);
await bar.getByRole('button', { name: 'Search Wikipedia' }).click();
await page.waitForTimeout(700);
ok('switching source re-runs the same words there', searches.at(-1)?.source === 'wikipedia' && searches.at(-1)?.q === 'zzqq nothing like this');

// --- failure: message + Retry ---
failNext = true;
await bar.getByRole('textbox').fill('backpropagation');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
ok('a failure shows its reason', (await bar.getByRole('alert').getByText(/Too many searches/).count()) === 1);
await bar.getByRole('button', { name: 'Retry' }).click();
await page.waitForTimeout(700);
ok('Retry recovers', (await bar.getByRole('listbox').getByRole('option').count()) === 1);
await bar.getByRole('listbox').getByRole('option').first().click();
await page.waitForTimeout(1500);
ok('picking an article puts its card on the canvas', (await canvas.locator('.wiki-article').count()) >= 1);

// --- Files panel: switch, show, remove ---
await menubar.getByRole('menuitem', { name: /^Files/ }).click();
await page.waitForTimeout(250);
const videoSwitch = page.getByRole('switch', { name: /Tutor reads Backpropagation In Depth/ });
ok('each canvas source has a switch', (await videoSwitch.count()) === 1 && (await videoSwitch.getAttribute('aria-checked')) === 'true');
await videoSwitch.click();
await page.waitForTimeout(150);
ok('switching off keeps the card, the row says the tutor ignores it', (await videoSwitch.getAttribute('aria-checked')) === 'false' && (await page.getByText('YouTube - the tutor ignores it').count()) === 1 && (await canvas.locator('iframe[src*="RyKrG8rTGUY"]').count()) === 1);
await page.getByRole('button', { name: 'Remove Backpropagation In Depth' }).click({ force: true });
await page.waitForTimeout(400);
ok('remove takes the card off the canvas', (await canvas.locator('iframe[src*="RyKrG8rTGUY"]').count()) === 0);
ok('and the row out of the list', (await page.getByRole('switch', { name: /Tutor reads Backpropagation In Depth/ }).count()) === 0);
await page.keyboard.press('Escape');
await page.mouse.click(700, 700);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
ok('undo brings the card back', (await canvas.locator('iframe[src*="RyKrG8rTGUY"]').count()) === 1);

// --- insert where you are looking ---
const surface = canvas.locator('div.touch-none').first();
const view = await surface.boundingBox();
for (let at = 0; at < 8; at++) { await page.mouse.move(view.x + 700, view.y + 400); await page.mouse.wheel(0, 600); }
await page.waitForTimeout(400);
await menubar.getByRole('menuitem', { name: /^Insert/ }).click();
await page.waitForTimeout(200);
await page.getByRole('menuitem', { name: 'Divider line' }).click();
await page.waitForTimeout(300);
const rule = await canvas.locator('[data-section]').last().boundingBox();
ok('a divider lands on the screen being looked at', rule && rule.y > view.y && rule.y < view.y + view.height, rule && `y ${Math.round(rule.y)}`);
ok('and is a wide plain rule, no title', rule && rule.width > 900 && (await canvas.locator('[data-section]').last().innerText()).trim() === '', rule && `width ${Math.round(rule.width)}`);
await menubar.getByRole('menuitem', { name: /^Insert/ }).click();
await page.waitForTimeout(200);
await page.getByRole('menuitem', { name: 'Section', exact: true }).click();
await page.waitForTimeout(700);
const heading = await canvas.locator('[data-block-id]').filter({ has: page.locator('[contenteditable]') }).last().boundingBox();
ok('a section heading lands on the screen being looked at', heading && heading.y + heading.height > view.y && heading.y < view.y + view.height, heading && `y ${Math.round(heading.y)}`);

await page.screenshot({ path: 'e2e/shots/search-files-1.png' });
await browser.close();
console.log(failed ? `${failed} FAILURES` : 'all green');
process.exit(failed ? 1 : 0);
