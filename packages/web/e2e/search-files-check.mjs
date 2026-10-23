import { chromium } from '@playwright/test';

// The search bar, the Files panel, and insert-where-you-look, against a
// stubbed worker. Every way out of the search bar, every state it can be in
// (idle, busy, results, exact match, nothing found, failed), keyboard use,
// and the Files panel's switch / show / remove on real cards.
// Release B (C:/s/spec/rel-b.md, owner decisions 4A and 5A, 2026-10-16): the top-bar Search control is gone; Insert opens
// the finder on a source, results preview there and a card is added only by Add to canvas (or Enter on the chosen one).

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

const VIDEOS = [
  { key: 'Ilg3gGewQ5U', title: 'Backpropagation, intuitively', subtitle: '3Blue1Brown', why: 'Animates how each weight gets its nudge.', thumbnail: null, item: { videoId: 'Ilg3gGewQ5U', title: 'Backpropagation, intuitively', channel: '3Blue1Brown' } },
  { key: 'RyKrG8rTGUY', title: 'Backpropagation In Depth', subtitle: 'Some channel', why: 'Builds the computational graph step by step.', thumbnail: null, item: { videoId: 'RyKrG8rTGUY', title: 'Backpropagation In Depth', channel: 'Some channel' } },
];
const PAPER = { key: '1706.03762', title: 'Attention Is All You Need', subtitle: 'Vaswani et al. · arXiv:1706.03762', why: 'Exactly the paper you pasted.', exact: true, thumbnail: null, item: { id: '1706.03762', title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762' } };
const ARTICLE = { key: 'Backpropagation', title: 'Backpropagation', subtitle: 'Wikipedia', why: 'The algorithm itself.', thumbnail: null, item: { title: 'Backpropagation' } };

// A real, minimal one-page PDF, so the paper card renders its toolbar.
const tinyPdf = () => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << >> >>', '<< /Length 8 >>\nstream\n0 0 m S\nendstream'];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, at) => { const offset = body.length; body += `${at + 1} 0 obj\n${object}\nendobj\n`; return offset; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
};

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
  if (url.pathname === '/api/learn/paper') return route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf() });
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
// // Owner brief 2026-10-22: one Search sources row; a source (YouTube, arXiv, Wikipedia) is chosen inside the finder, or left on its remembered default.
const openSearch = async (source = null) => { await menubar.getByRole('menuitem', { name: 'Insert', exact: true }).click(); await page.waitForTimeout(200); await page.getByRole('menuitem', { name: 'Search sources', exact: true }).click(); await page.waitForTimeout(250); if (source) await bar.getByRole('combobox', { name: 'Search in' }).selectOption(source); };

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn&board=search-files-1');
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(2500);

// --- the menubar ---
const labels = await menubar.getByRole('menuitem').allInnerTexts();
ok('the menubar reads Insert, Edit, Arrange, View (no Files)', labels.map(label => label.trim()).join(',') === 'Insert,Edit,Arrange,View', labels.join(','));
for (const title of ['Insert', 'Edit', 'Arrange', 'View']) {
  await menubar.getByRole('menuitem', { name: title, exact: true }).click();
  await page.waitForTimeout(200);
  // The menu's own rows (a submenu's choices are text only, and Page guides is a label with a selector): a lucide icon each.
  const rows = menubar.locator('button[data-menu-item]');
  const icons = await rows.evaluateAll(buttons => buttons.filter(button => button.closest('[role="menu"]').parentElement.className.includes('top-9')).map(button => !!button.querySelector('svg.lucide')));
  ok(`every ${title} row has an icon`, icons.length > 0 && icons.every(Boolean), `${icons.filter(Boolean).length}/${icons.length}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}
// // Owner brief 2026-10-22: no Files menu: the right panel's Context manages AI materials and its Search locates canvas items
ok('there is no Files menu', (await menubar.getByRole('menuitem', { name: /^Files/ }).count()) === 0);
await page.mouse.click(700, 700);

// --- every way out ---
await openSearch();
ok('no top-bar Search control', (await page.getByRole('button', { name: 'Search YouTube, arXiv and Wikipedia' }).count()) === 0);
ok('Insert > Search sources opens one bar, on YouTube by default', (await bar.count()) === 1 && (await bar.getByRole('combobox', { name: 'Search in' }).inputValue()) === 'youtube');
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
await page.waitForTimeout(400);
ok('Enter on the answered query only previews: the bar stays and nothing is added', (await bar.count()) === 1 && (await canvas.locator('iframe').count()) === 0);
await bar.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(800);
ok('Add to canvas adds the highlighted result and closes the bar', (await bar.count()) === 0 && (await canvas.locator('iframe[src*="RyKrG8rTGUY"]').count()) === 1);

// --- Insert > Search arXiv; exact match; preview, then Add to canvas ---
await openSearch('arxiv');
ok('Insert > Search sources, then the arXiv choice, searches arXiv', (await bar.getByRole('combobox', { name: 'Search in' }).inputValue()) === 'arxiv');
await bar.getByRole('textbox').fill('1706.03762');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
ok('a pasted id comes back as an exact match', (await bar.getByText('Exact match').count()) === 1);
const paperCard = canvas.locator('[aria-label="Paper reader"]');
await bar.getByRole('listbox').getByRole('option').first().locator('button').click();
await page.waitForTimeout(400);
ok('clicking a result previews it and adds nothing', (await bar.count()) === 1 && (await paperCard.count()) === 0);
await bar.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(1000);
ok('picking a paper puts a paper card on the canvas', (await paperCard.count()) === 1);
ok('and not the side panel', (await page.locator('aside [aria-label="Paper reader"]').count()) === 0);
await paperCard.locator('[aria-label="Next paper page"]').waitFor({ timeout: 15000 });
await paperCard.click({ position: { x: 40, y: 12 } });
await page.waitForTimeout(250);
// EXP-T28 (plan 1.3): the canvas toolbar's Ask about selection is the one region path; no card or reader keeps its own.
ok('a selected paper card has no Ask selection of its own - the toolbar asks about a region', (await canvas.getByRole('button', { name: 'Ask selection', exact: true }).count()) === 0 && (await paperCard.locator('[data-paper-select]').count()) === 0
  && (await page.getByRole('button', { name: 'Ask about selection — drag over any part of the canvas' }).count()) === 1);
await paperCard.click({ button: 'right', position: { x: 40, y: 12 } });
await page.waitForTimeout(250);
await page.getByRole('menu', { name: 'Canvas actions' }).getByRole('menuitem', { name: 'Open in reader' }).click();
await page.locator('aside [aria-label="Paper reader"] [aria-label="Next paper page"]').waitFor({ timeout: 15000 });
ok('the side-panel reader has no second Ask selection button', (await page.locator('aside [aria-label="Paper reader"] [data-paper-select]').count()) === 0);
await page.locator('aside [aria-label="Close paper"]').click();

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

// --- Files panel (switch, show, remove) is gone with the Files menu (// Owner brief 2026-10-22: item 1); the card stays on the canvas ---
ok('the video card is on the canvas', (await canvas.locator('iframe[src*="RyKrG8rTGUY"]').count()) === 1);

// --- insert where you are looking ---
const surface = canvas.locator('div.touch-none').first();
const view = await surface.boundingBox();
for (let at = 0; at < 8; at++) { await page.mouse.move(view.x + 700, view.y + 400); await page.mouse.wheel(0, 600); }
await page.waitForTimeout(400);
await menubar.getByRole('menuitem', { name: /^Insert/ }).click();
await page.waitForTimeout(200);
await page.getByRole('menuitem', { name: 'Divider', exact: true }).click(); // Owner brief 2026-10-22: Divider line is Divider
await page.waitForTimeout(300);
const rule = await canvas.locator('[data-section]').last().boundingBox();
ok('a divider lands on the screen being looked at', rule && rule.y > view.y && rule.y < view.y + view.height, rule && `y ${Math.round(rule.y)}`);
ok('and is a wide plain rule, no title', rule && rule.width > 900 && (await canvas.locator('[data-section]').last().innerText()).trim() === '', rule && `width ${Math.round(rule.width)}`);
await menubar.getByRole('menuitem', { name: /^Insert/ }).click();
await page.waitForTimeout(200);
await menubar.locator('[data-menu-item="Section"][data-submenu]').click(); // Owner brief 2026-10-22: Section is a submenu
await menubar.getByRole('menu', { name: 'Section', exact: true }).getByRole('menuitem', { name: 'Section', exact: true }).click();
await page.waitForTimeout(700);
const heading = await canvas.locator('[data-block-id]').filter({ has: page.locator('[contenteditable]') }).last().boundingBox();
ok('a section heading lands on the screen being looked at', heading && heading.y + heading.height > view.y && heading.y < view.y + view.height, heading && `y ${Math.round(heading.y)}`);

await page.screenshot({ path: 'e2e/shots/search-files-1.png' });
await browser.close();
console.log(failed ? `${failed} FAILURES` : 'all green');
process.exit(failed ? 1 : 0);
