import { chromium } from '@playwright/test';

// Dropped-file cards plus the strip/toolbar/text/shape UI changes, against a
// stubbed worker. What unit tests cannot see: a real OS-style drop landing as
// a card, image_context riding the next question, the level pill styling a
// fresh text box, and a shape dragged by its interior.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const asks = [];
const mediaPosts = [];
await page.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/api/learn/media' && request.method() === 'POST') {
    mediaPosts.push(request.postDataBuffer()?.length || 0);
    return route.fulfill({ json: { id: 'media:0123456789ab', title: 'diagram.png' } });
  }
  if (request.method() === 'POST' && /ask|selection/.test(url.pathname)) {
    try { asks.push(JSON.parse(request.postData() || '{}')); } catch { /* multipart, not this check's business */ }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: delta\ndata: {"text":"Here."}\n\nevent: done\ndata: {}\n\n' });
  }
  return route.fulfill({ json: replies[url.pathname] || {} });
});
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const canvas = page.locator('[aria-label="Lesson canvas"]');
const surface = canvas.locator('div.touch-none').first();

await page.goto('http://localhost:5189/apps/nanogpt?tab=learn');
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(3000);

// --- the strip: title, centered menubar, present/share/panel in it ---
const strip = page.locator('input[aria-label="Canvas title"]');
ok('the page heading is gone - no Learn h1', (await page.locator('h1', { hasText: /^Learn$/ }).count()) === 0);
ok('the strip holds an editable title', (await strip.count()) === 1);
ok('share sits beside present in the strip', (await page.locator('[aria-label="Share"]').count()) === 1 && (await page.locator('[aria-label="Present"]').count()) === 1);
await strip.fill('My lesson canvas');
await strip.press('Enter');
await page.reload();
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(2500);
ok('the title survives a reload', (await page.locator('input[aria-label="Canvas title"]').inputValue()) === 'My lesson canvas');

// --- zoom pill: Add section moved to Insert ---
ok('Add section is off the zoom pill', (await page.locator('[data-zoom]').getByText('Add section').count()) === 0);
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: /^Insert/ }).click();
await page.waitForTimeout(250);
ok('Insert offers the section divider', (await page.getByRole('menuitem', { name: 'Section divider' }).count()) === 1);
await page.keyboard.press('Escape');

// --- dropping files ---
const drop = async (name, type, bytes) => {
  const target = await surface.elementHandle();
  await page.evaluate(([element, fileName, fileType, data]) => {
    const file = new File([new Uint8Array(data)], fileName, { type: fileType });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, [target, name, type, [...bytes]]);
  await page.waitForTimeout(1200);
};
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];

await drop('diagram.png', 'image/png', PNG);
ok('a dropped image lands as a card', (await canvas.locator('img[alt="diagram.png"]').count()) === 1);
ok('the image was posted for the tutor', mediaPosts.length === 1);

await drop('anim.gif', 'image/gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]);
ok('a GIF lands as a card without a server copy', (await canvas.locator('img[alt="anim.gif"]').count()) === 1 && mediaPosts.length === 1);

await drop('clip.mp4', 'video/mp4', [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
ok('a video clip lands as a native player card', (await canvas.locator('video[controls]').count()) === 1);

await drop('page.html', 'text/html', [60, 104, 116, 109, 108, 62]);
ok('an unknown type is refused with a visible reason', (await page.getByText('drop an image, GIF, video, or PDF').count()) >= 1);

// image_context rides the next question
await page.locator('textarea, input[placeholder^="Ask about"]').last().fill('what is in this diagram?');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const withImage = asks.find(body => body.image_context);
ok('the next question carries image_context', withImage?.image_context?.id === 'media:0123456789ab');

// --- text tool: level pill on a fresh box ---
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Text"]').click();
const box = await surface.boundingBox();
await page.mouse.click(box.x + 800, box.y + 600);
await page.waitForTimeout(400);
const levels = page.getByRole('group', { name: 'Text level' });
ok('a fresh text box offers the level ladder', (await levels.count()) === 1);
const freshBox = await canvas.locator('[data-item-id]').last().boundingBox();
ok('a fresh text box opens long', freshBox && freshBox.width >= 380, `${Math.round(freshBox?.width || 0)}px`);
ok('the ladder reaches H4', (await levels.getByRole('button', { name: 'H4' }).count()) === 1);
await levels.getByRole('button', { name: 'H2' }).click();
await page.keyboard.type('Chapter');
await page.mouse.click(box.x + 60, box.y + 500);
await page.waitForTimeout(500);
const chapter = canvas.locator('[data-item-id]', { hasText: 'Chapter' }).first();
const size = (await chapter.count()) ? await chapter.evaluate(node => getComputedStyle(node).fontSize) : 'no item';
ok('picking H2 styles the box', size === '24px', String(size));

// --- shapes: drag by the interior ---
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Rectangle"]').click();
await page.mouse.move(box.x + 700, box.y + 300);
await page.mouse.down();
await page.mouse.move(box.x + 900, box.y + 450, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
const rect = canvas.locator('svg[data-ink] rect').first();
const before = await rect.boundingBox();
await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
await page.mouse.down();
await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 40, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
const after = await rect.boundingBox();
ok('a shape drags from its interior, not just its outline', Math.abs(after.x - before.x - 80) < 6 && Math.abs(after.y - before.y - 40) < 6, `moved ${Math.round(after.x - before.x)},${Math.round(after.y - before.y)}`);

// --- ctrl-drag rubber band + right-click Group / Ungroup ---
const cardA = canvas.locator('img[alt="diagram.png"]');
const cardB = canvas.locator('video[controls]');
const a1 = await cardA.boundingBox();
const b1 = await cardB.boundingBox();
const left = Math.max(box.x + 4, Math.min(a1.x, b1.x) - 30), top = Math.max(box.y + 4, Math.min(a1.y, b1.y) - 30);
const right = Math.max(a1.x + a1.width, b1.x + b1.width) + 30, bottom = Math.max(a1.y + a1.height, b1.y + b1.height) + 30;
await page.keyboard.down('Control');
await page.mouse.move(left, top);
await page.mouse.down();
await page.mouse.move(right, bottom, { steps: 6 });
await page.mouse.up();
await page.keyboard.up('Control');
await page.waitForTimeout(300);
await page.mouse.click(a1.x + 40, a1.y + 20, { button: 'right' });
await page.waitForTimeout(300);
const actions = page.getByRole('menu', { name: 'Canvas actions' });
ok('right-click opens the canvas actions menu', (await actions.count()) === 1);
await actions.getByRole('menuitem', { name: 'Group', exact: true }).click();
await page.waitForTimeout(300);
ok('marquee then Group gives the set a name chip', (await page.locator('[data-group-chip]').count()) === 1);
// deselect, then a plain click on one member picks the whole group
await page.mouse.click(box.x + 40, box.y + 700);
await page.waitForTimeout(200);
await page.mouse.click(a1.x + 40, a1.y + 20);
await page.waitForTimeout(200);
// drag by the card's drag strip; the whole group must follow
const dragStrip = canvas.locator('[data-block-id]:has(img[alt="diagram.png"]) [data-drag-handle]');
const grip2 = await dragStrip.boundingBox();
const b3 = await cardB.boundingBox();
await page.mouse.move(grip2.x + grip2.width / 2, grip2.y + grip2.height / 2);
await page.mouse.down();
await page.mouse.move(grip2.x + grip2.width / 2 + 40, grip2.y + grip2.height / 2 + 20, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(400);
const b4 = await cardB.boundingBox();
ok('a grouped set moves together', Math.abs(b4.x - b3.x - 40) < 10 && Math.abs(b4.y - b3.y - 20) < 10, `moved ${Math.round(b4.x - b3.x)},${Math.round(b4.y - b3.y)}`);
const chip = page.locator('[data-group-chip]');
await chip.dblclick();
await page.keyboard.type('Backprop set');
await page.mouse.click(box.x + 40, box.y + 700);
await page.waitForTimeout(300);
ok('the group can be named from its chip', (await chip.textContent()) === 'Backprop set', await chip.textContent());
const a3 = await cardA.boundingBox();
await page.mouse.click(a3.x + 40, a3.y + 20, { button: 'right' });
await page.waitForTimeout(300);
await actions.getByRole('menuitem', { name: 'Ungroup' }).click();
await page.waitForTimeout(300);
ok('Ungroup removes the chip', (await page.locator('[data-group-chip]').count()) === 0);
await page.mouse.click(box.x + 40, box.y + 700);
await page.mouse.click(a3.x + 40, a3.y + 20);
const stripAgain = await dragStrip.boundingBox();
const b5 = await cardB.boundingBox();
await page.mouse.move(stripAgain.x + stripAgain.width / 2, stripAgain.y + stripAgain.height / 2);
await page.mouse.down();
await page.mouse.move(stripAgain.x + stripAgain.width / 2 + 50, stripAgain.y + stripAgain.height / 2, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(400);
const b6 = await cardB.boundingBox();
ok('after Ungroup, a plain click moves only that card', Math.abs(b6.x - b5.x) < 4 && Math.abs(b6.y - b5.y) < 4, `other moved ${Math.round(b6.x - b5.x)},${Math.round(b6.y - b5.y)}`);

// --- card-aware rows: image re-attach and Duplicate ---
const a4 = await cardA.boundingBox();
await page.mouse.click(a4.x + 40, a4.y + 20, { button: 'right' });
await page.waitForTimeout(300);
ok('an image card offers re-attaching to the tutor', (await actions.getByRole('menuitem', { name: 'Show the tutor this image' }).count()) === 1);
await actions.getByRole('menuitem', { name: 'Duplicate' }).click();
await page.waitForTimeout(400);
ok('Duplicate copies the card', (await canvas.locator('img[alt="diagram.png"]').count()) === 2);
await page.keyboard.press('Delete');
await page.waitForTimeout(300);
ok('the copy was selected, so Delete removes it again', (await canvas.locator('img[alt="diagram.png"]').count()) === 1);

// --- toolbar handle snaps to the left edge ---
const handle = page.locator('[aria-label="Move the toolbar"]');
ok('the toolbar has a drag handle', (await handle.count()) === 1);
const grip = await handle.boundingBox();
await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 60, box.y + 300, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const parked = await page.getByRole('toolbar', { name: 'Canvas tools' }).boundingBox();
ok('released near the left edge, it parks left', parked.x < box.x + box.width / 3, `x=${Math.round(parked.x)}`);

// --- minimap (on by default) shares the composer's lower edge ---
const map = await page.locator('svg[aria-label="Canvas overview"]').boundingBox();
const pill = await page.locator('[data-zoom]').boundingBox();
ok('minimap bottom lines up with the zoom pill bottom', map && pill && Math.abs((map.y + map.height) - (pill.y + pill.height)) <= 2, map && pill ? `${Math.round(map.y + map.height)} vs ${Math.round(pill.y + pill.height)}` : 'missing');

await page.screenshot({ path: 'e2e/shots/drop-ui-1.png' });
await browser.close();
console.log(failed ? `${failed} FAILURES` : 'all green');
process.exit(failed ? 1 : 0);
