import { chromium } from '@playwright/test';

// Dropping and uploading .ipynb and .py onto the canvas (owner, 2026-10-08; docs/features/canvas-file-drop.md), against a
// stubbed worker on the local Vite server, as drop-ui-check.mjs does. Every drop opens "Add to canvas" with the file name
// and its choices; Cancel and Escape add nothing; each choice places its card; an invalid notebook says so and keeps the
// dialog; nothing asks a model or uploads to /api/learn/media; a notebook card never runs on its own.
// Usage: the web dev server on http://localhost:5189 (npm run dev), then node e2e/canvas-file-drop-check.mjs

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const asks = [], media = [];
await page.route('**/api/**', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.pathname === '/api/learn/media') { media.push(url.pathname); return route.fulfill({ status: 500, json: {} }); }
  if (request.method() === 'POST' && /ask|selection|learn-course|journey/.test(url.pathname)) { asks.push(url.pathname); return route.fulfill({ status: 500, json: {} }); }
  return route.fulfill({ json: replies[url.pathname] || {} });
});
// The notebook site is another origin: a blank page that only records what the card sends it (init is expected; run-all never).
await page.route(/canvas-notebook/, route => route.fulfill({ contentType: 'text/html', body: '<script>window.seen = []; addEventListener("message", e => seen.push(e.data && e.data.type))</script>' }));
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const canvas = page.locator('[aria-label="Lesson canvas"]');
const surface = canvas.locator('div.touch-none').first();
const dialog = page.getByRole('dialog', { name: 'Add to canvas' });
const choice = id => dialog.locator(`[data-import-choice="${id}"]`);

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn');
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(3000);

// A real drop event at a point on the canvas, carrying one file.
const drop = async (name, text, at = { x: 0.5, y: 0.5 }) => {
  const box = await surface.boundingBox();
  const target = await surface.elementHandle();
  await page.evaluate(([element, fileName, body, x, y]) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([body], fileName, { type: '' }));
    const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: x, clientY: y };
    element.dispatchEvent(new DragEvent('dragover', init));
    element.dispatchEvent(new DragEvent('drop', init));
  }, [target, name, text, box.x + box.width * at.x, box.y + box.height * at.y]);
  await page.waitForTimeout(500);
};
const NOTEBOOK = JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [
  { cell_type: 'markdown', metadata: {}, source: '# Imported notes' },
  { cell_type: 'code', metadata: {}, execution_count: 1, source: 'print("hi")', outputs: [{ output_type: 'display_data', metadata: {}, data: { 'text/html': '<script>window.ran = 1</script>' } }] },
] });
const PY = 'def greet(name):\n    return f"hi {name}"\n';
const choicesOf = async () => (await dialog.locator('[data-import-choice]').allInnerTexts()).map(t => t.trim());

// --- .ipynb: the dialog, Cancel, then a notebook card ---
await drop('analysis.ipynb', NOTEBOOK);
ok('a dropped .ipynb opens Add to canvas with its file name', await dialog.count() === 1 && (await dialog.locator('[data-import-file]').innerText()).trim() === 'analysis.ipynb');
ok('a notebook offers Notebook or File attachment, Notebook first', JSON.stringify(await choicesOf()) === JSON.stringify(['Notebook', 'File attachment']) && await choice('notebook').getAttribute('aria-checked') === 'true');
ok('the dialog offers Add to canvas and Cancel', await dialog.getByRole('button', { name: 'Add to canvas' }).count() === 1 && await dialog.getByRole('button', { name: 'Cancel' }).count() === 1);
const notebooksBefore = await canvas.locator('[data-notebook-header]').count();
await dialog.getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(300);
ok('Cancel adds nothing', await dialog.count() === 0 && await canvas.locator('[data-notebook-header]').count() === notebooksBefore);
await drop('analysis.ipynb', NOTEBOOK);
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(1200);
ok('Notebook places a notebook card', await dialog.count() === 0 && await canvas.locator('[data-notebook-header]').count() === notebooksBefore + 1);
ok('no saved output script ran on the page', !(await page.evaluate(() => window.ran)));

// --- .py: Escape, then a code card ---
await drop('train.py', PY);
ok('a dropped .py offers Code card, Notebook or File attachment', JSON.stringify(await choicesOf()) === JSON.stringify(['Code card', 'Notebook', 'File attachment']));
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok('Escape adds nothing', await dialog.count() === 0 && await canvas.getByText('def greet(name):').count() === 0);
await drop('train.py', PY);
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(800);
ok('Code card places the code under its file name, with nothing run', await canvas.getByText('train.py').count() >= 1 && await canvas.getByText('def greet(name):').count() === 1);

// --- a drop at the top of the canvas lands above that card: the card goes where it was dropped ---
const codeTop = async () => (await canvas.getByText('def greet(name):').boundingBox()).y;
const before = await codeTop();
await drop('notes.py', '# notes\n', { x: 0.5, y: 0.02 });
await choice('attachment').click();
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(800);
const attachment = canvas.locator('[data-file-attachment]').filter({ hasText: 'notes.py' });
ok('File attachment places the file with its name and Download', await attachment.count() === 1 && await attachment.getByRole('link', { name: 'Download' }).count() === 1);
ok('dropped at the top, it lands above the code card', (await attachment.boundingBox()).y < await codeTop(), `attachment ${(await attachment.boundingBox()).y}, code ${await codeTop()} (was ${before})`);

// --- an invalid notebook: the error names the file, the dialog stays, File attachment still works ---
await drop('broken.ipynb', '{not json');
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(400);
ok('an invalid notebook says so in the dialog, naming the file, and nothing is placed', await dialog.count() === 1 && /^broken\.ipynb is not valid notebook JSON/.test((await dialog.locator('[data-import-error]').innerText()).trim()));
await choice('attachment').click();
await dialog.getByRole('button', { name: 'Add to canvas' }).click();
await page.waitForTimeout(600);
ok('then kept as a File attachment, as it is', await dialog.count() === 0 && await canvas.locator('[data-file-attachment]').filter({ hasText: 'broken.ipynb' }).count() === 1);

// --- Insert > Upload a file opens the same dialog ---
await page.locator('input[type="file"][accept*=".ipynb"]').setInputFiles({ name: 'upload.py', mimeType: 'text/x-python', buffer: Buffer.from('x = 1\n') });
await page.waitForTimeout(500);
ok('Upload a file opens the same dialog', await dialog.count() === 1 && (await dialog.locator('[data-import-file]').innerText()).trim() === 'upload.py');
await dialog.getByRole('button', { name: 'Cancel' }).click();

// --- nothing asked a model, uploaded media or ran a notebook ---
ok('no ask, journey or course request', asks.length === 0, asks.join(', '));
ok('no media upload', media.length === 0, media.join(', '));
const seen = (await Promise.all(page.frames().filter(f => /canvas-notebook/.test(f.url())).map(f => f.evaluate(() => window.seen || [])))).flat();
ok('the notebook card was opened with its cells and never told to run', seen.includes('init') && !seen.includes('run-all'), seen.join(', '));

await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
