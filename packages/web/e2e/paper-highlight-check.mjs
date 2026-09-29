import { chromium } from '@playwright/test';

// The paper card's highlighter: a real text layer over the rendered page, so
// a mouse drag selects words; the selection becomes a yellow mark saved per
// page, survives a reload, and comes off with a click.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

// A two-page PDF with real Helvetica text on each page.
const textPdf = () => {
  const page = words => { const stream = `BT /F1 14 Tf 20 150 Td (${words}) Tj ET`; return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`; };
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
    page('Softmax turns scores into probabilities'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
    page('Attention weights sum to one'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, at) => { const offset = body.length; body += `${at + 1} 0 obj\n${object}\nendobj\n`; return offset; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
};
const KEY = 'small.adaptive-canvas:example-team:b@e.test:nanogpt:paper-hl-1:s0';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(([key]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks: [{ id: 'p1', type: 'paper', dx: 0, dy: 0, title: 'Softmax notes', paper: { id: '2401.00001', title: 'Softmax notes', page: 1 } }] }));
}, [KEY]);
const page = await context.newPage();
await page.route('**/api/**', route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/learn/paper') return route.fulfill({ status: 200, contentType: 'application/pdf', body: textPdf() });
  return route.fulfill({ json: replies[url.pathname] || {} });
});
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const card = page.locator('[data-block-id="p1"]');
const layer = card.locator('.textLayer');
const painted = () => page.evaluate(() => (CSS.highlights?.get('wiki-highlight') ? [...CSS.highlights.get('wiki-highlight')].map(range => range.toString()) : []));
const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').blocks?.[0]?.highlights || [], KEY);
const wordBox = word => layer.locator('span', { hasText: word }).first().boundingBox();
const open = async () => {
  await page.goto('http://localhost:5189/apps/nanogpt?tab=learn&board=paper-hl-1');
  await layer.locator('span').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
};

await open();
ok('no trailing dots while loading', !(await page.content()).includes('Loading paper...'));
ok('the page has a text layer with its words', (await layer.innerText()).includes('Softmax turns scores into probabilities'));
const span = await wordBox('Softmax');
const pageBox = await card.getByLabel('Paper PDF page').boundingBox();
ok('the words sit on the page image', span && span.x >= pageBox.x && span.x + span.width <= pageBox.x + pageBox.width && span.y >= pageBox.y && span.y + span.height <= pageBox.y + pageBox.height, JSON.stringify(span));
ok('and span its printed width, not a sliver', span.width > pageBox.width * 0.4, `${Math.round(span.width)} of ${Math.round(pageBox.width)}`);

// First click selects the card; the highlighter sits in the card header.
await card.click({ position: { x: 40, y: 12 } });
await page.waitForTimeout(200);
const pen = card.getByRole('button', { name: 'Highlighter' });
await pen.click();
ok('highlighter mode is visibly on', (await pen.getAttribute('aria-pressed')) === 'true');

// A real drag across the start of the line.
const cardAt = await card.boundingBox();
const line = await wordBox('Softmax');
await page.mouse.move(line.x + 1, line.y + line.height / 2);
await page.mouse.down();
await page.mouse.move(line.x + line.width * 0.35, line.y + line.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(500);
const marks = await painted();
ok('a drag becomes a highlight', marks.length === 1 && marks[0].startsWith('Softmax'), JSON.stringify(marks));
ok('the badge counts it', (await pen.innerText()).trim() === '1');
const cardNow = await card.boundingBox();
ok('the card did not move', Math.abs(cardNow.x - cardAt.x) < 1 && Math.abs(cardNow.y - cardAt.y) < 1);
if (process.env.SHOT) await card.screenshot({ path: process.env.SHOT });
await page.waitForTimeout(600);
const saved = await stored();
ok('it is saved on the card with its page', saved.length === 1 && saved[0].page === 1 && saved[0].exact === marks[0], JSON.stringify(saved));
ok('the text on the page stays the page image, not a second copy', (await layer.locator('span').first().evaluate(node => getComputedStyle(node).color)) === 'rgba(0, 0, 0, 0)');

// Page two has no marks; page one keeps its own.
await card.getByRole('button', { name: 'Next paper page' }).click();
await layer.locator('span', { hasText: 'Attention' }).waitFor({ timeout: 15000 });
await page.waitForTimeout(400);
ok('another page shows none of page one\'s marks', (await painted()).length === 0 && (await pen.innerText()).trim() === '');
await card.getByRole('button', { name: 'Previous paper page' }).click();
await layer.locator('span', { hasText: 'Softmax' }).waitFor({ timeout: 15000 });
await page.waitForTimeout(400);
ok('back on page one, its mark returns', (await painted()).length === 1);

await page.reload();
await layer.locator('span').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
ok('highlights survive a reload', (await painted()).length === 1 && (await painted())[0].startsWith('Softmax'));

// A click on the mark, in highlighter mode, removes it; undo brings it back.
await card.click({ position: { x: 40, y: 12 } });
await card.getByRole('button', { name: 'Highlighter' }).click();
const again = await wordBox('Softmax');
await page.mouse.click(again.x + again.width * 0.1, again.y + again.height / 2);
await page.waitForTimeout(500);
ok('a click on a highlight removes it', (await painted()).length === 0 && (await stored()).length === 0);
await page.keyboard.press('Escape');
await page.mouse.click(40, 900);
await page.keyboard.press('Control+z');
await page.waitForTimeout(500);
ok('undo brings it back', (await painted()).length === 1 && (await stored()).length === 1);

// Without highlighter mode a drag is a plain text selection - copyable.
await card.click({ position: { x: 40, y: 12 } });
await card.getByRole('button', { name: 'Highlighter' }).click();
ok('the highlighter turns off', (await card.getByRole('button', { name: 'Highlighter' }).getAttribute('aria-pressed')) === 'false');
const plain = await wordBox('Softmax');
await page.mouse.move(plain.x + 1, plain.y + plain.height / 2);
await page.mouse.down();
await page.mouse.move(plain.x + plain.width * 0.9, plain.y + plain.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const chosen = await page.evaluate(() => window.getSelection().toString());
ok('highlighter off, a drag selects the words for copying', chosen.startsWith('Softmax') && (await stored()).length === 1, JSON.stringify(chosen));

// Region select still sits over the words.
await card.getByRole('button', { name: 'Ask selection' }).click();
await page.waitForTimeout(300);
ok('the red region picker is above the text layer', await card.getByLabel('Select paper region').evaluate(svg => { const box = svg.getBoundingClientRect(); return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === svg || svg.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)); }));

console.log(failed ? `${failed} failed` : 'all green');
await browser.close();
process.exit(failed ? 1 : 0);
