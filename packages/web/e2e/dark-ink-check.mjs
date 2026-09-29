import { chromium } from '@playwright/test';

// Dark mode: default canvas ink must render white, deliberate colors stay
// themselves; the text box resizes from its corner without changing type size.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(() => {
  localStorage.setItem('small.theme', 'dark');
  const state = { strokes: [{ tool: 'pen', color: '#37352f', width: 2, points: [{ x: 700, y: 60 }, { x: 800, y: 100 }] }], shapes: [
    { id: 's1', kind: 'rect', x1: 650, y1: 150, x2: 850, y2: 260, color: '#37352f', width: 2 },
    { id: 's2', kind: 'rect', x1: 650, y1: 300, x2: 850, y2: 380, color: '#b42318', width: 2 },
  ], items: [{ id: 't1', kind: 'text', x: 80, y: 480, text: 'Dark ink', color: '#37352f', level: 'h2' }], links: [], blocks: [] };
  localStorage.setItem('small.adaptive-canvas:example-team:b@e.test:nanogpt:darkink-1:s0', JSON.stringify(state));
});
const page = await context.newPage();
await page.route('**/api/**', route => route.fulfill({ json: replies[new URL(route.request().url()).pathname] || {} }));
page.on('pageerror', error => console.log('PAGEERROR:', error.message.slice(0, 200)));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn&board=darkink-1');
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(2500);

const textColor = await page.locator('[data-item-id="t1"]').evaluate(node => getComputedStyle(node).color);
ok('default text ink renders white in dark mode', textColor === 'rgb(255, 255, 255)', textColor);
const inkRect = await page.locator('svg[data-ink] rect').first().evaluate(node => getComputedStyle(node).stroke);
ok('default shape ink renders white', inkRect === 'rgb(255, 255, 255)', inkRect);
const redRect = await page.locator('svg[data-ink] rect').nth(1).evaluate(node => getComputedStyle(node).stroke);
ok('a deliberate color stays itself', redRect === 'rgb(180, 35, 24)', redRect);
const stroke = await page.locator('svg[data-ink] path').first().evaluate(node => getComputedStyle(node).stroke);
ok('default pen stroke renders white', stroke === 'rgb(255, 255, 255)', stroke);

// resize the text box from its corner: the box widens, the type does not
const item = page.locator('[data-item-id="t1"]');
await item.click();
const handle = page.locator('[aria-label="Resize text box"]');
ok('the text box has the corner handle', (await handle.count()) === 1);
ok('one click shows the level ladder - no double-click', (await page.locator('[aria-label="Text level"]').count()) === 1);
ok('the handle is the card glyph, not a square', (await handle.locator('svg path').count()) === 1);
const before = await item.boundingBox();
const grip = await handle.boundingBox();
await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
await page.mouse.down();
await page.mouse.move(grip.x + 140, grip.y + 60, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await item.boundingBox();
const fontSize = await item.evaluate(node => getComputedStyle(node).fontSize);
ok('the box scales', after.width > before.width + 100, `${Math.round(before.width)} -> ${Math.round(after.width)}`);
ok('the type does not', fontSize === '24px', fontSize);

await page.screenshot({ path: 'e2e/shots/dark-ink-1.png' });
await browser.close();
console.log(failed ? `${failed} FAILURES` : 'all green');
process.exit(failed ? 1 : 0);
