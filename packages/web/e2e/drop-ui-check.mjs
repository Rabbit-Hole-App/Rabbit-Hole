import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:5189';
const origin = new URL(BASE);
if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('drop-ui-check requires a local HTTP origin');

// Dropped-file cards plus the strip/toolbar/text/shape UI changes, against a
// stubbed worker. What unit tests cannot see: a real OS-style drop landing as
// a card, image_context riding the next question, the level pill styling a
// fresh text box, and a shape dragged by its interior.

// Repository IDs use repo-: their canvas owns the composer (routes.js), not the app's global Agent Bar.
const app = { name: 'repo-drop-nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/repo-drop-nanogpt': app, '/api/apps/repo-drop-nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/repo-drop-nanogpt': { ...app, status: 'ready' }, '/api/repositories/repo-drop-nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };

// The signed-in fixture must pass handle onboarding and supply the canvas navigator tree.
replies['/api/profile'] = { handle: 'drop_tester', name: 'Drop tester' };
replies['/api/canvases/dives'] = { path: [{ app: 'repo-drop-nanogpt', board: 'main', title: 'nanoGPT' }], children: [] };

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
// Existing media cards can occupy a guessed screen fraction. A creation tool needs a real blank canvas hit.
const emptyCanvasPoint = () => surface.evaluate(surface => {
  const box = surface.getBoundingClientRect();
  for (let y = Math.min(box.bottom - 100, box.top + 600); y > box.top + 100; y -= 32) {
    for (let x = box.right - 100; x > box.left + 120; x -= 32) {
      const hit = document.elementFromPoint(x, y);
      if (hit?.closest('[data-canvas-surface]') && !hit.closest('[data-block-id],[data-item-id],[data-shape-id],[data-group-box],[data-group-chip],button,input,textarea,[role="toolbar"],[data-zoom],[data-minimap]')) return { x, y };
    }
  }
  throw Error('No visible blank canvas point for the creation tool');
});

await page.goto(`${origin.origin}/apps/repo-drop-nanogpt?tab=learn`);
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForTimeout(3000);

// --- the strip: title, centered menubar, present/share/panel in it ---
// Repository canvases use the approved canvas selector and Rename dialog (project-menu-check case 13).
const strip = page.locator('[data-canvas-switcher]');
const renameDialog = page.getByRole('dialog', { name: 'Rename canvas' });
const openRename = async () => {
  await strip.click();
  await page.locator('[data-menu-button-open] [data-rename-canvas]').click();
  await renameDialog.waitFor();
  return renameDialog.getByRole('textbox', { name: 'Canvas name' });
};
ok('the page heading is gone - no Learn h1', (await page.locator('h1', { hasText: /^Learn$/ }).count()) === 0);
ok('the strip holds the canvas title selector', (await strip.count()) === 1);
ok('share sits beside present in the strip', (await page.locator('[aria-label="Share"]').count()) === 1 && (await page.locator('[aria-label="Present"]').count()) === 1);
const titleField = await openRename();
ok('Rename focuses an editable title field', await titleField.isEditable() && await titleField.evaluate(element => element === document.activeElement));
await titleField.fill('My lesson canvas');
await renameDialog.getByRole('button', { name: 'Save', exact: true }).click();
await renameDialog.waitFor({ state: 'hidden' });
await page.reload();
await page.waitForSelector('[aria-label="Lesson canvas"]', { timeout: 30000 });
await page.waitForFunction(() => document.querySelector('[data-canvas-switcher] [data-canvas-name]')?.textContent === 'My lesson canvas');
ok('the renamed title survives a reload', (await strip.innerText()).trim() === 'My lesson canvas');
const cancelledTitle = await openRename();
ok('Rename opens with the persisted title', await cancelledTitle.inputValue() === 'My lesson canvas');
await cancelledTitle.fill('Discard this rename');
await renameDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
await renameDialog.waitFor({ state: 'hidden' });
ok('Cancel preserves the canvas title', (await strip.innerText()).trim() === 'My lesson canvas');

// --- present refuses an empty canvas without changing its chrome ---
await page.locator('[aria-label="Present"]').click();
await page.waitForTimeout(400);
ok('presenting an empty canvas refuses with a toast', (await page.getByText('The canvas is empty. Draw or add something, then present it.').count()) >= 1);
ok('and no step counter appears', (await page.getByText(/1 \/ \d+/).count()) === 0);
ok('and the panel stays open', (await page.locator('[aria-label="Learn agent chat"]').count()) === 1);

// --- zoom pill: Add section moved to Insert ---
ok('Add section is off the zoom pill', (await page.locator('[data-zoom]').getByText('Add section').count()) === 0);
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: /^Insert/ }).click();
await page.waitForTimeout(250);
ok('Insert offers the divider', (await page.getByRole('menuitem', { name: 'Divider', exact: true }).count()) === 1); // Owner brief 2026-10-22: Divider line is Divider
await page.keyboard.press('Escape');

const box0 = await surface.boundingBox();

// --- dropping files ---
const drop = async (name, type, bytes, point = { x: 0.2, y: 0.5 }) => {
  const target = await surface.elementHandle();
  const bounds = await surface.boundingBox();
  await page.evaluate(([element, fileName, fileType, data, clientX, clientY]) => {
    const file = new File([new Uint8Array(data)], fileName, { type: fileType });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    element.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX, clientY }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX, clientY }));
  }, [target, name, type, [...bytes], bounds.x + bounds.width * point.x, bounds.y + bounds.height * point.y]);
  await page.waitForTimeout(1200);
};
// Real files: media cards are decided from their bytes (media-import.js), so a bare signature is refused as not an image.
const fixture = name => [...readFileSync(new URL(`../src/__fixtures__/media/${name}`, import.meta.url))];
const PNG = fixture('photo.png');

await drop('diagram.png', 'image/png', PNG, { x: 0.15, y: 0.2 });
ok('a dropped image lands as a card', (await canvas.locator('img[alt="diagram.png"]').count()) === 1);
ok('the image was posted for the tutor', mediaPosts.length === 1);

await drop('anim.gif', 'image/gif', fixture('anim.gif'), { x: 0.15, y: 0.6 });
ok('a GIF lands as a card without a server copy', (await canvas.locator('img[alt="anim.gif"]').count()) === 1 && mediaPosts.length === 1);

await drop('clip.mp4', 'video/mp4', fixture('clip.mp4'), { x: 0.6, y: 0.2 });
ok('a video clip lands as a native player card', (await canvas.locator('video[controls]').count()) === 1);

await drop('program.exe', 'application/octet-stream', [0x4d, 0x5a]);
ok('an unknown type is refused with a visible reason', (await page.getByText('program.exe: drop an image, GIF, video, PDF, notebook (.ipynb), Python file (.py) or code file', { exact: true }).count()) >= 1);

// Ask mode exercises the scripted /ask response; Auto now routes to the Tutor planner.
const chat = page.locator('[data-chat-pane]').first();
await chat.getByRole('button', { name: 'Mode', exact: true }).click();
await page.locator('[data-chat-mode-option="ask"]').click();
// image_context rides the next question
await chat.locator('textarea, input[placeholder^="Ask about"]').last().fill('what is in this diagram?');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const withImage = asks.find(body => body.image_context);
ok('the next question carries image_context', withImage?.image_context?.id === 'media:0123456789ab');

// --- no Files menu (owner brief 2026-10-22 item 1: the right panel's Context and Search do that work); Upload a file is in Insert ---
ok('the menubar has no Files menu', (await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: /^Files/ }).count()) === 0);
ok('the menubar reads Insert, Edit, Arrange, View', (await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem').allInnerTexts()).map(text => text.trim()).join(',') === 'Insert,Edit,Arrange,View');
ok('no trailing dots anywhere in the menubar', !(await page.locator('[role="menubar"]').innerText()).includes('\u2026'));
await page.keyboard.press('Escape');
await page.mouse.click(box0.x + 40, box0.y + 700);
await page.waitForTimeout(200);
const imagesBefore = await canvas.locator('img[alt="diagram.png"]').count();
await page.locator('input[type="file"][multiple]').setInputFiles({ name: 'uploaded.png', mimeType: 'image/png', buffer: Buffer.from(PNG) });
// Owner brief 2026-10-22 item 3: after choosing the file, Add to canvas / Use as AI context / Both; an image can only go to the canvas
// (the Context panel takes PDF, .txt and .md), so the other two stay, greyed. Nothing is added to AI context unasked.
const destination = page.locator('[data-upload-destination]');
await destination.waitFor({ timeout: 5000 });
ok('the upload asks where it goes: Add to canvas, Use as AI context, Both', (await destination.getByRole('button').allInnerTexts()).map(text => text.trim()).join(',') === 'Add to canvas,Use as AI context,Both,Cancel');
ok('an image can only be added to the canvas: the context choices are greyed', !(await destination.getByRole('button', { name: 'Add to canvas' }).isDisabled()) && (await destination.getByRole('button', { name: 'Use as AI context' }).isDisabled()) && (await destination.getByRole('button', { name: 'Both' }).isDisabled()));
ok('nothing was added to the canvas or the context while the question is open', (await canvas.locator('img[alt="diagram.png"]').count()) === imagesBefore);
await page.locator('[data-upload-destination] [data-upload-choice="canvas"]').click(); // Owner brief 2026-10-22 item 3: the picker asks where the file goes first; Add to canvas is the drop road
await page.waitForTimeout(1200);
// The stubbed media route titles everything diagram.png, so count, not name.
ok('Upload lands a card through the same route as a drop', (await canvas.locator('img[alt="diagram.png"]').count()) === imagesBefore + 1 && mediaPosts.length === 2);

// --- Insert: creates on the screen being looked at ---
const itemsBefore = await canvas.locator('[data-item-id]').count();
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: /^Insert/ }).click();
await page.waitForTimeout(250);
await page.getByRole('menuitem', { name: 'Text box' }).click();
await page.waitForTimeout(300);
ok('Insert > Text box creates a text box, ready to type', (await canvas.locator('[data-item-id]').count()) === itemsBefore + 1 && (await page.getByRole('group', { name: 'Text level' }).count()) === 1);
await page.mouse.click(box0.x + 40, box0.y + 700);
await page.waitForTimeout(200);

// --- text tool: level pill on a fresh box ---
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Text"]').click();
const box = await surface.boundingBox();
const priorTextIds = await canvas.locator('[data-item-id]').evaluateAll(nodes => nodes.map(node => node.dataset.itemId));
const textPoint = await emptyCanvasPoint();
await page.mouse.click(textPoint.x, textPoint.y);
await page.waitForFunction(ids => [...document.querySelectorAll('[data-item-id]')].some(node => !ids.includes(node.dataset.itemId)), priorTextIds);
await page.waitForTimeout(400);
const levels = page.getByRole('group', { name: 'Text level' });
ok('a fresh text box offers the level ladder', (await levels.count()) === 1);
const freshBox = await canvas.locator('[data-item-id]').last().boundingBox();
ok('a fresh text box grows with its words until resized', freshBox && freshBox.width > 0 && await canvas.locator('[data-item-id]').last().evaluate(node => node.style.width) === 'max-content', `${Math.round(freshBox?.width || 0)}px`);
ok('the ladder reaches H4', (await levels.getByRole('button', { name: 'H4' }).count()) === 1);
await levels.getByRole('button', { name: 'H2' }).click();
await page.keyboard.type('Chapter');
await page.mouse.click(box.x + 60, box.y + 500);
await page.waitForTimeout(500);
const chapter = canvas.locator('[data-item-id]', { hasText: 'Chapter' }).first();
const size = (await chapter.count()) ? await chapter.evaluate(node => getComputedStyle(node).fontSize) : 'no item';
ok('picking H2 styles the box', size === '24px', String(size));

// --- stickies: color from the style panel; highlighter panel closable ---
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Sticky note"]').click();
const stickyPoint = await emptyCanvasPoint();
await page.mouse.click(stickyPoint.x, stickyPoint.y);
await page.waitForTimeout(300);
await page.mouse.click(box.x + 40, box.y + 500); // settle out of editing
await page.waitForTimeout(200);
const note = canvas.locator('[data-item-id]').last();
await note.click();
await page.waitForTimeout(300);
await page.getByRole('group', { name: 'Style' }).locator('[aria-label="Color #2383e2"]').click();
await page.waitForTimeout(300);
const noteBg = await note.evaluate(node => getComputedStyle(node).backgroundColor);
ok('a post-it takes a color from the style panel', noteBg === 'rgb(219, 234, 254)', noteBg);
await page.keyboard.press('Delete');
await page.waitForTimeout(200);
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Highlighter"]').click();
await page.waitForTimeout(200);
ok('arming the highlighter opens the style island', (await page.getByRole('group', { name: 'Style' }).count()) === 1);
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Style"]').click();
await page.waitForTimeout(200);
ok('the swatch closes it even while the tool is armed', (await page.getByRole('group', { name: 'Style' }).count()) === 0);
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Style"]').click();
await page.waitForTimeout(200);
ok('and reopens it', (await page.getByRole('group', { name: 'Style' }).count()) === 1);
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Select and move"]').click();

// --- shapes: drag by the interior ---
await page.getByRole('toolbar', { name: 'Canvas tools' }).locator('[aria-label="Rectangle"]').click();
await page.mouse.move(box.x + box.width * 0.7, box.y + 300);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.9, box.y + 450, { steps: 5 });
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
ok('a shape drags from its interior, not just its outline', Math.abs(after.x - before.x - 80) < 10 && Math.abs(after.y - before.y - 40) < 10, `moved ${Math.round(after.x - before.x)},${Math.round(after.y - before.y)}`);

// --- ctrl-drag rubber band + right-click Group / Ungroup ---
const cardA = canvas.locator('img[alt="diagram.png"]').first();
const cardB = canvas.locator('video[controls]');
// Earlier uploads reveal their own cards. Fit through the actual keyboard command before marqueeing distant cards.
await page.keyboard.press('Shift+1');
await page.waitForFunction(() => {
  const frame=document.querySelector('[data-canvas-surface]').getBoundingClientRect();
  return [document.querySelector('img[alt="diagram.png"]'),document.querySelector('video[controls]')].every(node=>{
    const box=node?.closest('[data-block-id]')?.getBoundingClientRect();
    return box && box.top>=frame.top && box.bottom<=frame.bottom && box.left>=frame.left && box.right<=frame.right;
  });
});
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
ok('the group draws its outline', (await page.locator('[data-group-box]').count()) === 1);
ok('the group has its own selection actions (Add to chat), one bar, like a card', (await page.locator('[data-selection-bar]').count()) === 1);
// deselect, then a plain click on one member picks the whole group
await page.mouse.click(box.x + 40, box.y + 700);
await page.waitForTimeout(200);
await page.mouse.click(a1.x + 40, a1.y + 20);
await page.waitForTimeout(200);
// drag from EMPTY space inside the outline; the whole group must follow
const gapPoint = await page.locator('[data-group-box]').evaluate(group => {
  const bounds = group.getBoundingClientRect(), frame = document.querySelector('[data-canvas-surface]').getBoundingClientRect();
  for (let y = Math.max(bounds.top + 8, frame.top + 8); y < Math.min(bounds.bottom - 8, frame.bottom - 30); y += 12) {
    for (let x = Math.max(bounds.left + 8, frame.left + 8); x < Math.min(bounds.right - 8, frame.right - 50); x += 12) {
      if (document.elementFromPoint(x, y) === group) return { x, y };
    }
  }
  throw Error('No visible empty group surface to drag');
});
const b3 = await cardB.boundingBox();
const a3before = await cardA.boundingBox();
await page.mouse.move(gapPoint.x, gapPoint.y);
await page.mouse.down();
await page.mouse.move(gapPoint.x + 40, gapPoint.y + 20, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(400);
const b4 = await cardB.boundingBox();
const a4after = await cardA.boundingBox();
const groupDx = a4after.x - a3before.x, groupDy = a4after.y - a3before.y;
// The claim is coherence: both members move by the same vector, substantially.
ok('pressing empty space inside the outline drags the whole group', groupDx > 25 && Math.abs((b4.x - b3.x) - groupDx) < 3 && Math.abs((b4.y - b3.y) - groupDy) < 3, `A moved ${Math.round(groupDx)},${Math.round(groupDy)}; B moved ${Math.round(b4.x - b3.x)},${Math.round(b4.y - b3.y)}`);
const chip = page.locator('[data-group-chip]');
await chip.dblclick();
await page.waitForTimeout(250);
// Owner, 2026-10-21: the editor opens on the default name with the caret after its p, so "s" makes "Groups".
await page.keyboard.type('s');
await page.mouse.click(box.x + 40, box.y + 700);
await page.waitForTimeout(300);
ok('the group can be named from its chip, typing after the default name', (await chip.textContent()) === 'Groups', await chip.textContent());
await chip.dblclick();
await page.waitForTimeout(250);
await page.keyboard.type(' 2');
await page.mouse.click(box.x + 40, box.y + 700);
await page.waitForTimeout(300);
ok('renaming again edits from the end of the name', (await chip.textContent()) === 'Groups 2', await chip.textContent());
const a3 = await cardA.boundingBox();
await page.mouse.click(a3.x + 40, a3.y + 20, { button: 'right' });
await page.waitForTimeout(300);
await actions.getByRole('menuitem', { name: 'Ungroup' }).click();
await page.waitForTimeout(300);
ok('Ungroup removes the chip and the outline', (await page.locator('[data-group-chip]').count()) === 0 && (await page.locator('[data-group-box]').count()) === 0);
await page.mouse.click(box.x + 40, box.y + 700);
await page.mouse.click(a3.x + 40, a3.y + 20);
const dragStrip = canvas.locator('[data-block-id]:has(img[alt="diagram.png"]) [data-drag-handle]').first();
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
const dupBefore = await canvas.locator('img[alt="diagram.png"]').count();
await actions.getByRole('menuitem', { name: 'Duplicate' }).click();
await page.waitForTimeout(400);
ok('Duplicate copies the card', (await canvas.locator('img[alt="diagram.png"]').count()) === dupBefore + 1);
await page.keyboard.press('Delete');
await page.waitForTimeout(300);
ok('the copy was selected, so Delete removes it again', (await canvas.locator('img[alt="diagram.png"]').count()) === dupBefore);

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

// --- lower-left stack: minimap directly above the zoom row (owner 2026-10-08) ---
const map = await page.locator('[data-canvas-minimap]').boundingBox();
const pill = await page.locator('[data-zoom]').boundingBox();
ok('minimap sits directly above the zoom row on the same left edge', map && pill && Math.abs(map.x - pill.x) <= 2 && pill.y >= map.y + map.height && pill.y - (map.y + map.height) <= 16, map && pill ? `gap ${Math.round(pill.y - map.y - map.height)}px` : 'missing');

// Code imports have their explicit confirmation flow, checked after the media-only grouping scenario.
await drop('page.html', 'text/html', [60, 104, 116, 109, 108, 62]);
const importDialog = page.locator('[data-file-import-dialog]');
ok('HTML offers Code card, never a notebook or executable page', await importDialog.locator('[data-import-choice="code"]').getAttribute('aria-checked') === 'true' && await importDialog.locator('[data-import-choice="notebook"]').count() === 0);
await importDialog.getByRole('button', { name: 'Add to canvas', exact: true }).click();
await importDialog.waitFor({ state: 'detached' });
const htmlCard = canvas.locator('[data-block-id]').filter({ hasText: 'page.html' }).first();
await htmlCard.waitFor();
ok('HTML lands as a code card, never an executable page', await htmlCard.count() === 1 && await htmlCard.locator('iframe').count() === 0);

await page.screenshot({ path: 'e2e/shots/drop-ui-1.png' });
await browser.close();
console.log(failed ? `${failed} FAILURES` : 'all green');
process.exit(failed ? 1 : 0);
