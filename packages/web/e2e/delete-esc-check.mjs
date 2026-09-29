import { chromium } from '@playwright/test';

// Del removes anything on the canvas, and Esc always returns to the pointer.
// Every object kind is seeded, clicked once the way a learner would, and
// deleted with the Delete key - no menu, no right-click.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

const board = 'delete-esc-1';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(([key]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], links: [], shapes: [
    { id: 's1', kind: 'rect', x1: 660, y1: 60, x2: 820, y2: 160, color: '#37352f', width: 2 },
    { id: 's2', kind: 'line', x1: 660, y1: 200, x2: 860, y2: 200, color: '#37352f', width: 2 },
  ], items: [
    { id: 'n1', kind: 'sticky', x: 900, y: 60, text: 'a note' },
    { id: 't1', kind: 'text', x: 900, y: 260, w: 300, text: 'some text', level: 'body' },
    { id: 'd1', kind: 'section', x: -240, y: 1100, w: 1040, text: '' },
  ], blocks: [
    { id: 'h1', type: 'heading', dx: 0, dy: 0, level: 1, text: 'A heading' },
    { id: 'v1', type: 'video', dx: 0, dy: 0, videoId: 'Ilg3gGewQ5U', title: 'Backprop', start: 0, end: null },
    { id: 'w1', type: 'wiki', dx: 0, dy: 0, title: 'Backpropagation', section: 0 },
  ] }));
}, [`small.adaptive-canvas:example-team:b@e.test:nanogpt:${board}:s0`]);
const page = await context.newPage();
await page.route('**/api/**', route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/learn/wiki') return route.fulfill({ json: { title: 'Backpropagation', displayTitle: 'Backpropagation', html: '<section><p>Backpropagation computes gradients.</p></section>', toc: [], licence: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } } });
  return route.fulfill({ json: replies[url.pathname] || {} });
});
await page.route('**youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>player</body></html>' }));
await page.route('**i.ytimg.com/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const canvas = page.locator('[aria-label="Lesson canvas"]');

await page.goto(`http://localhost:5189/apps/nanogpt?tab=learn&board=${board}`);
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(2500);
// The composer grabs focus on load - the learner's first click must still
// make Del mean "delete this", not "delete a character in the composer".

const tryDelete = async (name, locator, click = async target => target.click({ position: { x: 12, y: 8 } })) => {
  const before = await locator.count();
  if (!before) { ok(`${name}: seeded`, false, 'not rendered'); return; }
  await page.keyboard.press('Escape');
  await click(locator.first());
  await page.waitForTimeout(150);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  ok(`Del removes a ${name}`, (await locator.count()) === before - 1);
};

await tryDelete('sticky note', canvas.locator('[data-item-id="n1"]'));
await tryDelete('text box', canvas.locator('[data-item-id="t1"]'));
await tryDelete('rectangle', canvas.locator('[data-shape-id="s1"]'), async target => { const b = await target.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); });
// Near its left end: the right half sits under the tool palette at this size.
await tryDelete('line', canvas.locator('[data-shape-id="s2"]'), async target => { const b = await target.boundingBox(); await page.mouse.click(b.x + 16, b.y + b.height / 2); });
await tryDelete('heading card', canvas.locator('[data-block-id="h1"]'));
await tryDelete('video card', canvas.locator('[data-block-id="v1"]'));
await tryDelete('Wikipedia card', canvas.locator('[data-block-id="w1"]'));
await page.mouse.wheel(0, 700);
await page.waitForTimeout(300);
await tryDelete('divider line', canvas.locator('[data-section]'), async target => { const b = await target.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); });

// --- Esc always returns to the pointer ---
const tools = page.getByRole('toolbar', { name: 'Canvas tools' });
const pointer = tools.locator('[aria-label="Select and move"]');
for (const tool of ['Pen', 'Highlighter', 'Rectangle', 'Text', 'Sticky note', 'Eraser', 'Hand — pan the canvas']) {
  const button = tools.locator(`[aria-label="${tool}"]`);
  if (!(await button.count())) { ok(`Esc from ${tool}: tool exists`, false); continue; }
  await button.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  ok(`Esc from ${tool} returns to the pointer`, (await pointer.getAttribute('aria-pressed')) === 'true');
}
await tools.locator('[aria-label="Highlighter"]').click();
ok('arming the highlighter opens the style island', (await page.getByRole('group', { name: 'Style' }).count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
ok('Esc closes the style island too', (await page.getByRole('group', { name: 'Style' }).count()) === 0);
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: /^View/ }).click();
await page.waitForTimeout(150);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
ok('Esc closes an open menu', (await page.getByRole('menuitem', { name: 'Zoom in' }).count()) === 0);

await browser.close();
console.log(failed ? `${failed} FAILURES` : 'all green');
process.exit(failed ? 1 : 0);
