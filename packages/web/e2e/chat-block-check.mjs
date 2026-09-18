// Verifies the adaptive React canvas on the dev deployment: asking from the
// dock creates a movable chat card (blue question + streamed agent answer),
// the right toolbar draws ink and drops stickies, and the zoom pill zooms.
// Run: node e2e/chat-block-check.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const base = process.env.SMALL_BASE || 'https://small-cp-dev.zeroshothq.workers.dev';
const domain = new URL(base).hostname;
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
if (!secret) throw new Error('SMALL_TEST_BYPASS missing from .env');
const login = await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-chat-block-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
const { session } = await login.json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, domain, path: '/' }]);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
const failures = [];
const check = async (label, fn) => { try { await fn(); console.log(`ok: ${label}`); } catch (e) { failures.push(label); console.log(`FAIL: ${label} — ${e.message.split('\n')[0]}`); } };

await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await check('canvas mounts', () => canvas.waitFor({ timeout: 30000 }));
await check('toolbar strip visible', () => page.locator('[aria-label="Canvas tools"]').waitFor({ timeout: 10000 }));
await check('zoom controls visible', () => page.locator('[aria-label="Zoom controls"]').waitFor({ timeout: 5000 }));

const dock = page.locator('input[placeholder^="Ask about"], textarea[placeholder^="Ask about"]').first();
await check('dock composer present', () => dock.waitFor({ timeout: 10000 }));
await dock.fill('Explain me sigmoid');
await dock.press('Enter');

await check('question bubble on canvas', () => canvas.locator('[data-chat-block]').getByText('Explain me sigmoid', { exact: true }).waitFor({ timeout: 15000 }));
await check('answer streams into block', () => canvas.locator('[data-chat-block]').getByText(/sigmoid/i).nth(1).waitFor({ timeout: 90000 }));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'e2e/shots/chat-block.png', fullPage: false });

// movable: drag the card and confirm it translated. The streamed card can be
// taller than the canvas with its top panned off-screen — grab a visible point.
const block = canvas.locator('[data-chat-block]').first();
await check('block is movable', async () => {
  const before = await block.boundingBox();
  const cbox = await canvas.boundingBox();
  if (!before || !cbox) throw new Error('no bounding box');
  const hb = await block.locator('[data-drag-handle]').boundingBox();
  const gx = hb.x + hb.width / 2;
  const gy = hb.y + hb.height / 2;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx + 160, gy + 60, { steps: 12 });
  await page.mouse.up();
  const after = await block.boundingBox();
  if (!after || Math.abs(after.x - before.x) < 80) throw new Error(`did not move (dx=${after ? after.x - before.x : 'gone'})`);
});

// resizable: drag the corner handle, width grows
await check('chat block resizes', async () => {
  const before = await block.boundingBox();
  const handle = block.locator('[aria-label="Resize chat block"]');
  await handle.hover({ force: true });
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 150, hb.y + 40, { steps: 8 });
  await page.mouse.up();
  const after = await block.boundingBox();
  if (after.width - before.width < 80) throw new Error(`width ${before.width} -> ${after.width}`);
});

// pen: draw a stroke on empty space
await check('pen draws a stroke', async () => {
  await page.locator('[aria-label="Pen"]').click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 200, { steps: 10 });
  await page.mouse.up();
  const paths = await canvas.locator('[data-ink] path').count();
  if (!paths) throw new Error('no stroke path');
});

// ctrl+z: the stroke just drawn disappears
await check('ctrl+z undoes the stroke', async () => {
  const before = await canvas.locator('[data-ink] path').count();
  await page.keyboard.press('Control+z');
  const after = await canvas.locator('[data-ink] path').count();
  if (after !== before - 1) throw new Error(`paths ${before} -> ${after}`);
});

// sticky: place one and type into it. Left edge is clear of the dragged card,
// the blur click stays away from the toolbar strip and zoom pill.
await check('sticky note placed', async () => {
  await page.locator('[aria-label="Sticky note"]').click();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + 60, box.y + 100);
  await page.keyboard.type('ID = index, row = meaning');
  await page.mouse.click(box.x + 260, box.y + box.height - 30);
  await canvas.getByText('ID = index, row = meaning').waitFor({ timeout: 5000 });
});

// shape: drag out a rectangle on empty space
await check('rectangle draws', async () => {
  await page.locator('[aria-label="Rectangle"]').click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width - 260, box.y + 380);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 120, box.y + 470, { steps: 8 });
  await page.mouse.up();
  if (!(await canvas.locator('[data-ink] rect').count())) throw new Error('no rect');
});

// del key: select the sticky, delete it
await check('Del removes selected sticky', async () => {
  const sticky = canvas.getByText('ID = index, row = meaning');
  await sticky.click();
  await page.keyboard.press('Delete');
  if (await sticky.count()) throw new Error('sticky still present');
});

// zoom: out then reset
await check('zoom pill works', async () => {
  await page.locator('[aria-label="Zoom controls"] [title="Zoom out"]').click();
  await page.locator('[aria-label="Zoom controls"]').getByText('80%').waitFor({ timeout: 5000 });
  await page.locator('[aria-label="Zoom controls"] [title="Reset zoom"]').click();
  await page.locator('[aria-label="Zoom controls"]').getByText('100%').waitFor({ timeout: 5000 });
});
// persistence: blocks and shapes survive a reload
await check('blocks survive reload', async () => {
  await page.waitForTimeout(700);
  await page.reload();
  await canvas.locator('[data-chat-block]').getByText('Explain me sigmoid', { exact: true }).waitFor({ timeout: 20000 });
  if (!(await canvas.locator('[data-ink] rect').count())) throw new Error('shape lost');
});

// node select + Del: the chat block deletes; ctrl+z brings it back
await check('Del removes selected block', async () => {
  const count = await canvas.locator('[data-chat-block]').count();
  await canvas.locator('[data-chat-block]').first().click();
  await page.keyboard.press('Delete');
  if ((await canvas.locator('[data-chat-block]').count()) !== count - 1) throw new Error('block not deleted');
});
await check('ctrl+z restores deleted block', async () => {
  const count = await canvas.locator('[data-chat-block]').count();
  await page.keyboard.press('Control+z');
  if ((await canvas.locator('[data-chat-block]').count()) !== count + 1) throw new Error('block not restored');
});

// challenge lesson block: insert from the dev menu, commit a guess, reveal
await check('challenge block commits and reveals', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Challenge' }).click();
  await canvas.getByText('Commit a guess before we look', { exact: false }).waitFor({ timeout: 5000 });
  await page.locator('input[placeholder^="Your guess"]').fill('each id picks an embedding row, positions are added, the blocks mix them and a final layer scores every token');
  await page.getByRole('button', { name: 'Commit', exact: true }).click();
  await canvas.getByText('Hold that thought.', { exact: false }).waitFor({ timeout: 5000 });
});

// the tutor reads the committed answer and tints it green or orange
await check('challenge answer gets a tutor verdict', async () => {
  const verdict = canvas.locator('[data-verdict]');
  await verdict.waitFor({ timeout: 20000 });
  await canvas.locator('[data-answer][data-grade="good"], [data-answer][data-grade="partial"]').first().waitFor({ timeout: 90000 });
  const text = await verdict.innerText();
  if (/VERDICT:/i.test(text)) throw new Error('verdict token leaked into the text');
  if (text.replace('Tutor', '').trim().length < 20) throw new Error('verdict too short');
});
await check('challenge block survives reload', async () => {
  await page.waitForTimeout(700);
  await page.reload();
  await canvas.getByText('each id picks an embedding row', { exact: false }).waitFor({ timeout: 20000 });
});

// quiz block: math renders, wrong answer retries, right answer locks with why
await check('quiz block with equations works', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Quiz' }).click();
  await page.locator('[data-quiz-option="B"]').waitFor({ timeout: 5000 });
  if (!(await canvas.locator('.katex').count())) throw new Error('no rendered math');
  await page.locator('[data-quiz-option="B"]').click();
  await canvas.getByText('Not quite', { exact: false }).waitFor({ timeout: 3000 });
  await page.locator('[data-quiz-option="A"]').click();
  await canvas.getByText('✓ Right.', { exact: false }).waitFor({ timeout: 3000 });
});
await check('quiz reset clears the attempt', async () => {
  await page.locator('[aria-label="Reset quiz"]').click();
  if (await canvas.getByText('✓ Right.', { exact: false }).count()) throw new Error('verdict still shown');
});

// flashcards: flip and navigate
await check('flashcards flip and navigate', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Flashcards' }).click();
  const card = page.locator('[data-flashcard]');
  await card.waitFor({ timeout: 5000 });
  await card.click();
  await canvas.getByText('one learned row per vocabulary token', { exact: false }).waitFor({ timeout: 3000 });
  await page.locator('[data-flash-knew]').click();
  await canvas.getByText('2 / 3', { exact: false }).waitFor({ timeout: 3000 });
});

// select-to-ask: selecting the quiz arms the composer; asking creates a
// linked conversation node below it
await check('ask about selected quiz links a node', async () => {
  await canvas.getByText('what is the derivative', { exact: false }).first().click();
  await page.getByRole('button', { name: 'Ask in chat' }).click();
  await page.locator('[data-canvas-target]').waitFor({ timeout: 5000 });
  const linksBefore = await canvas.locator('[data-connection]').count();
  await dock.fill('why is the derivative maximal at zero?');
  await dock.press('Enter');
  await canvas.locator('[data-chat-block]').getByText('why is the derivative maximal at zero?', { exact: true }).waitFor({ timeout: 15000 });
  if ((await canvas.locator('[data-connection]').count()) !== linksBefore + 1) throw new Error('no auto link');
});
await check('linked node settles without overlapping', async () => {
  await page.waitForTimeout(6000); // let the answer finish and the node settle
  const boxes = await canvas.locator('[data-block-id]').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect();
    return { id: node.dataset.blockId, x: r.x, y: r.y, w: r.width, h: r.height };
  }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    if (overlap > 400) throw new Error(`nodes overlap by ${Math.round(overlap)}px²`);
  }
});

// paper: the arXiv reader block with page navigation
await check('paper block renders and pages', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Paper' }).click();
  const paper = canvas.locator('[data-block-id]').last();
  await paper.locator('canvas').waitFor({ timeout: 60000 });
  const next = paper.getByRole('button', { name: /next page/i });
  if (await next.count()) { await next.click(); await page.waitForTimeout(1500); }
});

// table: multi-column lesson data with math and code in the cells
await check('table block renders rows and columns', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Table' }).click();
  const table = canvas.locator('[data-lesson-table]').last();
  await table.waitFor({ timeout: 5000 });
  const columns = await table.locator('thead th').count();
  const rows = await table.locator('tbody tr').count();
  if (columns !== 5 || rows !== 10) throw new Error(`grid ${columns}x${rows}`);
  if (!(await table.locator('.katex').count())) throw new Error('no math in cells');
});

// explanation: titled prose with folded "explain more" sections
await check('explanation block expands more', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Explanation' }).click();
  await canvas.getByText('An id is an index, not a meaning').waitFor({ timeout: 5000 });
  if (await canvas.getByText('selects row', { exact: false }).count()) throw new Error('more section started open');
  await canvas.getByRole('button', { name: 'Worked example' }).click();
  await canvas.getByText('selects row', { exact: false }).waitFor({ timeout: 3000 });
});

// clipboard and multi-select, on two freshly inserted compact blocks that the
// camera has just panned to
const handleClick = async (node, modifiers = []) => {
  const hb = await node.locator('[data-drag-handle]').boundingBox();
  if (!hb) throw new Error('handle has no box');
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
  for (const key of modifiers) await page.keyboard.up(key);
};
await check('ctrl+c and ctrl+v copy a node', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Explanation' }).click();
  await page.waitForTimeout(500);
  const before = await canvas.locator('[data-block-id]').count();
  await handleClick(canvas.locator('[data-block-id]').last());
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);
  const after = await canvas.locator('[data-block-id]').count();
  if (after !== before + 1) throw new Error(`nodes ${before} -> ${after}`);
});

await check('ctrl+click selects and moves several nodes', async () => {
  const nodes = canvas.locator('[data-block-id]');
  const count = await nodes.count();
  const first = nodes.nth(count - 2), second = nodes.nth(count - 1);
  const a0 = await first.boundingBox(), b0 = await second.boundingBox();
  await handleClick(first);
  await handleClick(second, ['Control']);
  const hb = await second.locator('[data-drag-handle]').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 70, { steps: 10 });
  await page.mouse.up();
  const a1 = await first.boundingBox(), b1 = await second.boundingBox();
  if (Math.abs(a1.y - a0.y) < 40 || Math.abs(b1.y - b0.y) < 40) throw new Error(`group did not move (${Math.round(a1.y - a0.y)}, ${Math.round(b1.y - b0.y)})`);
});

// interactive graph: the Desmos renderer mounts inside a canvas block
await check('interactive graph renders', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Interactive graph' }).click();
  await canvas.getByText('Sharpen the sigmoid').waitFor({ timeout: 5000 });
  const graph = canvas.locator('[data-graph]').last();
  await graph.waitFor({ timeout: 5000 });
  await page.waitForTimeout(6000); // Desmos loads its SDK from the CDN
  const mounted = await graph.evaluate(node => !!node.querySelector('.dcg-container, canvas, .js-plotly-plot'));
  if (!mounted) throw new Error('renderer did not mount');
});

// plotly: the data-plot variant mounts its own renderer
await check('plotly data plot renders', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Data plot' }).click();
  await canvas.getByText('Training loss against iterations').waitFor({ timeout: 5000 });
  const plot = canvas.locator('[data-graph]').last();
  await plot.locator('.js-plotly-plot').waitFor({ timeout: 30000 });
});

// drag handle: the body no longer drags, only the top strip does
await check('only the handle drags the node', async () => {
  const node = canvas.locator('[data-block-id]').last();
  const before = await node.boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + before.height - 30);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height - 30, { steps: 8 });
  await page.mouse.up();
  const still = await node.boundingBox();
  if (Math.abs(still.x - before.x) > 6) throw new Error('body dragged the node');
  const handle = node.locator('[data-drag-handle]');
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 100, hb.y + 40, { steps: 8 });
  await page.mouse.up();
  const after = await node.boundingBox();
  if (Math.abs(after.x - before.x) < 60) throw new Error('handle did not drag');
});

// 3D, image and video blocks
await check('3D model block renders', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: '3D model' }).click();
  await canvas.getByText('Orbit a glTF model').waitFor({ timeout: 5000 });
  await canvas.locator('[data-block-id]').last().locator('canvas').waitFor({ timeout: 60000 });
});

await check('image block renders', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Image', exact: true }).click();
  const image = canvas.locator('[data-block-id]').last().locator('img');
  await image.waitFor({ timeout: 15000 });
  const loaded = await image.evaluate(node => node.complete && node.naturalWidth > 0);
  if (!loaded) throw new Error('image did not load');
});

await check('video block generates a clip', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Video generate' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('[data-generate-video]').waitFor({ timeout: 5000 });
  await node.locator('[data-generate-video]').click();
  await node.getByText('Generating the clip', { exact: false }).waitFor({ timeout: 20000 });
  await node.locator('[data-lesson-video]').waitFor({ timeout: 420000 });
});

// Blender scene: the spec posts to the durable job endpoint and the GLB comes
// back into the same 3D viewer (Blender start-up makes this the slow check)
await check('blender scene builds and renders', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Blender scene' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('Perspective projection').waitFor({ timeout: 5000 });
  await node.locator('[data-generate-scene]').click();
  await node.getByText(/Blender is rendering|Queued for Blender/).waitFor({ timeout: 15000 });
  await node.locator('canvas').waitFor({ timeout: 300000 });
});

// knowledge graph: nodes and edges render and a node selects
await check('graph block renders', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Graph', exact: true }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('How a sentence becomes a prediction').waitFor({ timeout: 5000 });
  await node.locator('[data-graph-node]').first().waitFor({ timeout: 10000 });
  const dots = await node.locator('[data-node-dot]').count();
  if (dots < 8) throw new Error(`only ${dots} nodes drawn`);
});

// image block: search Pexels and pick a result
await check('image block searches photos', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Image', exact: true }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('input[placeholder^="Search or describe"]').fill('mountain');
  await node.locator('[data-photo-search]').click();
  const first = node.locator('[data-photo-result]').first();
  await first.waitFor({ timeout: 30000 });
  await first.click();
  await node.getByText('on Pexels', { exact: false }).waitFor({ timeout: 10000 });
});

// narration: text to speech through the lesson TTS endpoint
await check('narration block speaks', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Narration' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('[data-speak]').click();
  await node.locator('[data-narration]').waitFor({ timeout: 60000 });
  const ok = await node.locator('[data-narration]').evaluate(audio => new Promise(resolve => {
    if (audio.readyState > 0) return resolve(true);
    audio.addEventListener('loadedmetadata', () => resolve(true), { once: true });
    audio.addEventListener('error', () => resolve(false), { once: true });
    setTimeout(() => resolve(audio.readyState > 0), 15000);
  }));
  if (!ok) throw new Error('audio did not load');
});

// a resized node keeps its size across a reload
await check('block size survives reload', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Explanation' }).click();
  await page.waitForTimeout(400);
  const node = canvas.locator('[data-block-id]').last();
  const handle = node.locator('[aria-label="Resize chat block"]');
  await handle.hover({ force: true });
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 140, hb.y + 60, { steps: 8 });
  await page.mouse.up();
  const wide = (await node.boundingBox()).width;
  await page.waitForTimeout(700);
  await page.reload();
  await canvas.locator('[data-block-id]').last().waitFor({ timeout: 20000 });
  const after = (await canvas.locator('[data-block-id]').last().boundingBox()).width;
  if (Math.abs(after - wide) > 12) throw new Error(`width ${Math.round(wide)} -> ${Math.round(after)} after reload`);
});

// generated pictures stack up as cached variants with arrows
await check('image variants navigate', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Image', exact: true }).click();
  const node = canvas.locator('[data-block-id]').last();
  const field = node.locator('input[placeholder^="Search or describe"]');
  await field.fill('forest path');
  await node.locator('[data-photo-search]').click();
  await node.locator('[data-photo-result]').first().waitFor({ timeout: 30000 });
  await node.locator('[data-photo-result]').first().click();
  await field.fill('desert dunes');
  await node.locator('[data-photo-search]').click();
  await node.locator('[data-photo-result]').first().waitFor({ timeout: 30000 });
  await node.locator('[data-photo-result]').nth(1).click();
  // the block ships with one figure already, so two picks make three variants
  await node.getByText('3 / 3', { exact: false }).waitFor({ timeout: 5000 });
  await node.locator('[aria-label="Previous picture"]').click();
  await node.getByText('2 / 3', { exact: false }).waitFor({ timeout: 5000 });
});

// ELK-laid-out React Flow diagram
await check('flow diagram lays out', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Flow diagram' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('Where a token goes').waitFor({ timeout: 5000 });
  await node.locator('.react-flow__node').first().waitFor({ timeout: 20000 });
  const drawn = await node.locator('.react-flow__node').count();
  if (drawn !== 8) throw new Error(`${drawn} nodes laid out`);
  const edges = await node.locator('.react-flow__edge').count();
  if (edges !== 8) throw new Error(`${edges} edges drawn`);
});

// mermaid diagram with a Shiki-highlighted source view
await check('mermaid diagram renders', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Mermaid diagram' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('[data-mermaid] svg').waitFor({ timeout: 30000 });
  await node.locator('[data-toggle-source]').click();
  await node.getByText('sequenceDiagram', { exact: false }).waitFor({ timeout: 15000 });
  // dark mode must not leave the diagram text unreadable
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(1500);
  const ink = await node.locator('[data-mermaid] svg text').first().evaluate(text => getComputedStyle(text).fill);
  const [r, g, b] = ink.match(/\d+/g).map(Number);
  if (r + g + b < 300) throw new Error(`diagram text stayed dark in dark mode (${ink})`);
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.waitForTimeout(1200);
});

// the interaction engine: one behaviour, two lesson datasets, state that
// survives a reload and feeds the tutor
await check('walkthrough activity steps and persists', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Walkthrough', exact: true }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('Walk a token through the model').waitFor({ timeout: 5000 });
  await node.getByText('1 / 5 steps', { exact: false }).waitFor({ timeout: 5000 });
  await node.locator('[data-scene-action="advance_step"]').click();
  await node.locator('[data-scene-action="advance_step"]').click();
  await node.getByText('3 / 5 steps', { exact: false }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(700);
  await page.reload();
  await canvas.locator('[data-block-id]').last().getByText('3 / 5 steps', { exact: false }).waitFor({ timeout: 20000 });
});

await check('walkthrough reset and ask in chat carry the step', async () => {
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('[data-scene-action="reset_attempt"]').click();
  await node.getByText('1 / 5 steps', { exact: false }).waitFor({ timeout: 5000 });
  await node.locator('[data-scene-action="advance_step"]').click();
  await node.locator('[data-scene-step="2"]').click();
  if (await node.locator('[data-scene-ask]').count()) throw new Error('the in-block ask button is still there');
  const handle = await node.locator('[data-drag-handle]').boundingBox();
  await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2);
  const pill = page.getByRole('button', { name: 'Ask in chat' });
  const pillBox = await pill.boundingBox();
  await page.mouse.click(pillBox.x + pillBox.width / 2, pillBox.y + pillBox.height / 2);
  await page.locator('[data-canvas-target]').waitFor({ timeout: 5000 });
  await node.getByText('2 / 5 steps', { exact: false }).waitFor({ timeout: 3000 }); // asking must not reset the activity
});

// the pipeline builder: drop, validate, keyboard route, saved artifact
await check('pipeline builder places and validates', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Pipeline builder' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('Assemble the inference pipeline').waitFor({ timeout: 5000 });
  const piece = await node.locator('[data-piece="tokenise"]').boundingBox();
  const slot = await node.locator('[data-slot="step-1"]').boundingBox();
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 12 });
  await page.mouse.up();
  await node.getByText('1 / 5 in place', { exact: false }).waitFor({ timeout: 5000 });
});

await check('pipeline keyboard route completes the artifact', async () => {
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('Place without dragging').click();
  for (const [slot, piece] of [['then', 'embed'], ['step-3', 'blocks'], ['step-4', 'head'], ['last', 'sample']]) {
    void slot; void piece;
  }
  const selects = node.locator('select');
  await selects.nth(1).selectOption('embed');
  await selects.nth(2).selectOption('blocks');
  await selects.nth(3).selectOption('head');
  await selects.nth(4).selectOption('sample');
  await node.getByText('5 / 5 in place', { exact: false }).waitFor({ timeout: 5000 });
  await node.getByText('· done', { exact: false }).waitFor({ timeout: 3000 });
});

await check('pipeline artifact survives a reload and resets', async () => {
  await page.waitForTimeout(700);
  await page.reload();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('5 / 5 in place', { exact: false }).waitFor({ timeout: 20000 });
  await node.locator('[data-scene-action="reset_attempt"]').click();
  await node.getByText('0 / 5 in place', { exact: false }).waitFor({ timeout: 5000 });
});

// the vector explorer: dragging, keyboard and numbers drive one action
await check('vector explorer drags and computes', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Vector explorer' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('Project one vector onto another').waitFor({ timeout: 5000 });
  await node.locator('[data-projection]').getByText('proj_b(a) = 2', { exact: false }).waitFor({ timeout: 5000 });
  const handle = node.locator('[data-vector-handle="a"]');
  await handle.scrollIntoViewIfNeeded().catch(() => {});
  const box = await handle.boundingBox();
  const cbox = await canvas.boundingBox();
  if (box.y < cbox.y || box.y > cbox.y + cbox.height) throw new Error('the handle is outside the canvas viewport');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const text = await node.locator('[data-projection]').innerText();
  if (!/proj_b\(a\) = /.test(text) || /= 2 ·/.test(text)) throw new Error(`projection did not follow the drag: ${text}`);
});

await check('keyboard and numbers move the same vector', async () => {
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('[data-vector-handle="b"]').focus();
  await page.keyboard.press('ArrowUp');
  const afterKey = await node.locator('input[aria-label="b y"]').inputValue();
  if (Number(afterKey) !== 0.5) throw new Error(`arrow key gave b.y = ${afterKey}`);
  await node.locator('input[aria-label="b y"]').fill('0');
  await node.locator('input[aria-label="b x"]').fill('0');
  await node.getByText('zero length', { exact: false }).waitFor({ timeout: 5000 });
});

await check('vector state survives a reload and resets', async () => {
  await page.waitForTimeout(700);
  await page.reload();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('zero length', { exact: false }).waitFor({ timeout: 20000 });
  await node.locator('[data-scene-action="reset_attempt"]').click();
  await node.locator('[data-projection]').getByText('proj_b(a) = 2', { exact: false }).waitFor({ timeout: 5000 });
});

// explain back: evidence of understanding, judged against the key ideas
await check('explain back is judged, not revealed', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Explain back' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('In your own words', { exact: false }).waitFor({ timeout: 5000 });
  await node.locator('input[placeholder^="Explain it in your own words"]').fill('the id picks a row of the embedding table');
  await node.getByRole('button', { name: 'Submit', exact: true }).click();
  await node.getByText('Understanding evidence', { exact: false }).waitFor({ timeout: 20000 });
  await node.locator('[data-answer][data-grade="partial"], [data-answer][data-grade="good"]').waitFor({ timeout: 90000 });
  const text = await node.innerText();
  if (/VERDICT:/i.test(text)) throw new Error('verdict token leaked');
  if (/Hold that thought/.test(text)) throw new Error('explain back must not reveal an answer');
});

// the animation engine: deterministic playback, scrub, pause and ask
await check('animation plays and scrubs', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Animation', exact: true }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.getByText('One token, all the way through').waitFor({ timeout: 5000 });
  const drawnAtStart = await node.locator('[data-animation-object]').count();
  await node.locator('[data-animation-play]').click();
  await page.waitForTimeout(3500);
  await node.locator('[data-animation-play]').click(); // pause
  const drawnLater = await node.locator('[data-animation-object]').count();
  if (drawnLater <= drawnAtStart) throw new Error(`objects did not appear over time (${drawnAtStart} -> ${drawnLater})`);
  await node.locator('input[aria-label="Animation time"]').fill('0');
  await page.waitForTimeout(400);
  const afterScrub = await node.locator('[data-animation-object]').count();
  if (afterScrub !== drawnAtStart) throw new Error(`scrubbing back is not deterministic (${drawnAtStart} vs ${afterScrub})`);
});

await check('replay restarts a finished animation', async () => {
  const node = canvas.locator('[data-block-id]').last();
  const slider = node.locator('input[aria-label="Animation time"]');
  await slider.fill('13');
  await node.locator('[data-animation-replay]').click();
  await page.waitForTimeout(700);
  const now = Number(await slider.inputValue());
  if (!(now > 0.1 && now < 12)) throw new Error(`replay did not restart a finished scene (time ${now}s)`);
  await node.locator('[data-animation-play]').click(); // pause again for the next check
});

await check('pausing and marking a region asks about that moment', async () => {
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('input[aria-label="Animation time"]').fill('6');
  await node.locator('[data-animation-select]').click();
  const frame = await node.locator('[data-animation-frame]').boundingBox();
  await page.mouse.move(frame.x + frame.width * 0.2, frame.y + frame.height * 0.05);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.8, frame.y + frame.height * 0.3, { steps: 10 });
  await page.mouse.up();
  await page.locator('[data-canvas-target]').waitFor({ timeout: 5000 });
  await node.locator('[data-animation-selection]').getByText('6.0s', { exact: false }).waitFor({ timeout: 3000 }); // the scene stays where it was paused
  await node.locator('[data-animation-clear]').click();
  if (await node.locator('[data-animation-selection]').count()) throw new Error('the marked region did not clear');
});

await check('a scrubbed moment is what a question refers to', async () => {
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('input[aria-label="Animation time"]').fill('9');   // commit one moment
  await node.locator('[data-animation-object="tokens"]').click();       // selection line now visible
  await node.locator('[data-animation-selection]').getByText('9.0s', { exact: false }).waitFor({ timeout: 3000 });
  await node.locator('input[aria-label="Animation time"]').fill('3');   // scrub again, still paused
  await node.locator('[data-animation-selection]').getByText('3.0s', { exact: false }).waitFor({ timeout: 3000 });
  await node.locator('[data-animation-clear]').click();
});

// the abstraction test: a second subject through the same engine, built from
// JSON in the page rather than a menu entry
await check('the numbers change and a winner emerges', async () => {
  const node = canvas.locator('[data-block-id]').last();
  const at = async seconds => {
    await node.locator('input[aria-label="Animation time"]').fill(String(seconds));
    await page.waitForTimeout(400);
  };
  await at(1.0);
  if (await node.locator('[data-animation-object="tokens"] rect').count() !== 5) throw new Error('the characters are not on screen');
  // the row the id selects leaves the table as its own numbers, and the
  // blocks change those numbers rather than swapping one label for another
  await at(6.5);
  const before = await node.locator('[data-animation-object="embedding-row"] text').allTextContents();
  await at(9.2);
  const after = await node.locator('[data-animation-object="embedding-row"] text').allTextContents();
  if (before.join() === after.join()) throw new Error(`the embedding numbers never changed: ${after.join(' ')}`);
  await at(12.6);
  const bars = await node.locator('[data-animation-object="next-token-scores"] rect').evaluateAll(rects => rects.map(rect => Number(rect.getAttribute('height'))));
  const tallest = bars.indexOf(Math.max(...bars));
  if (tallest !== 7) throw new Error(`the winning score is bar ${tallest}, expected the one labelled l`);
});

// speaking an answer: the mic is offered next to the input and the transcript
// route is wired, so a spoken answer reaches the same grading path
await check('an answer can be spoken', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Explain back' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('[data-speak-answer]').waitFor({ timeout: 5000 });
  const wired = await page.evaluate(async () => {
    const response = await fetch('/api/learn/transcribe', { method: 'POST', body: new FormData() });
    return { status: response.status, error: (await response.json()).error };
  });
  if (wired.status === 404) throw new Error('the transcribe route is not deployed');
  if (wired.status !== 400) throw new Error(`empty recording should be refused, got HTTP ${wired.status}: ${wired.error}`);
});

// the whiteboard block: tldraw's own tools, saved with the block
await check('the sigmoid board asks, draws and saves', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Whiteboard' }).click();
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('.tl-canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  const drawn = await node.locator('.tl-shape').count();
  if (drawn < 8) throw new Error(`the sigmoid was not drawn on the board (${drawn} shapes)`);
  // the node floats, so it never satisfies the stability check; the pill
  // appearing is the proof that the click selected it
  await node.locator('[data-drag-zone]').first().click({ force: true });
  await page.getByRole('button', { name: 'Ask selection' }).click({ timeout: 10000 });
  const frame = await node.locator('.tl-canvas').boundingBox();
  await page.mouse.move(frame.x + frame.width * 0.3, frame.y + frame.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width * 0.75, frame.y + frame.height * 0.7, { steps: 12 });
  await page.mouse.up();
  await page.getByText('Whiteboard selection').waitFor({ timeout: 10000 });
  await node.locator('[data-board-marker]').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: 'Clear selection' }).click();
  if (await node.locator('[data-board-marker]').count()) throw new Error('the marked rectangle did not clear');
  const board = await node.locator('.tl-canvas').boundingBox();
  await page.mouse.move(board.x + 120, board.y + 100);
  await page.keyboard.press('d'); // draw tool
  await page.mouse.move(board.x + 80, board.y + 80);
  await page.mouse.down();
  await page.mouse.move(board.x + 200, board.y + 160, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  if (await node.locator('.tl-shape').count() <= drawn) throw new Error('the learner stroke was not added');
  await page.reload();
  const reloaded = canvas.locator('[data-block-id]').last();
  await reloaded.locator('.tl-canvas').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  if (await reloaded.locator('.tl-shape').count() <= drawn) throw new Error('the drawing did not survive a reload');
});

// the board marker lives in page coordinates, the toolbar folds away, and the
// answer to a board question can be drawn back onto that same board
await check('the marked rectangle stays on what it was drawn over', async () => {
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('[data-drag-zone]').first().click({ force: true });
  await page.getByRole('button', { name: 'Ask selection' }).click({ timeout: 10000 });
  const area = await node.locator('.tl-canvas').boundingBox();
  await page.mouse.move(area.x + area.width * 0.3, area.y + area.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.7, area.y + area.height * 0.65, { steps: 10 });
  await page.mouse.up();
  const marker = node.locator('[data-board-marker]');
  await marker.waitFor({ timeout: 8000 });
  const before = await marker.boundingBox();
  const frame = await node.locator('.tl-canvas').boundingBox();
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.wheel(0, 220); // pan the board
  await page.waitForTimeout(600);
  const after = await marker.boundingBox();
  if (Math.abs(after.y - before.y) < 60) throw new Error(`the marker did not travel with the board (${Math.round(before.y)} -> ${Math.round(after.y)})`);
});

await check('the drawing tools fold away', async () => {
  const node = canvas.locator('[data-block-id]').last();
  await node.locator('[data-board-tools]').click();
  await page.waitForTimeout(400);
  if (await node.locator('.tlui-toolbar').count()) throw new Error('the toolbar is still there');
  await node.locator('[data-board-tools]').click();
  await node.locator('.tlui-toolbar').first().waitFor({ timeout: 5000 });
});

await check('a board answer can be explained back on the board', async () => {
  const board = canvas.locator('[data-block-id]').last();
  const shapesBefore = await board.locator('.tl-shape').count();
  const dock = page.locator('input[placeholder^="Ask about"], textarea[placeholder^="Ask about"]').first();
  await dock.fill('What does the flat part of this curve mean?');
  await dock.press('Enter');
  const answer = canvas.locator('[data-block-id]').filter({ hasText: 'What does the flat part of this curve mean?' }).first();
  await answer.waitFor({ timeout: 30000 });
  await answer.locator('[data-scroll]').getByText('sigmoid', { exact: false }).waitFor({ timeout: 120000 }).catch(() => {});
  await answer.locator('[data-drag-zone]').first().click({ force: true });
  const pill = page.locator('[data-explain-canvas]');
  await pill.waitFor({ timeout: 30000 });
  await pill.click();
  // the plan is drawn onto the same board, never a copy of it
  const failure = page.locator('[data-toast-error]');
  for (let waited = 0; waited < 240000; waited += 4000) {
    if (await board.locator('.tl-shape').count() > shapesBefore) return;
    // a failure is reported in a toast the learner can copy, not swallowed
    if (await failure.count()) throw new Error(`explaining failed: ${await failure.first().innerText()}`);
    await page.waitForTimeout(4000);
  }
  throw new Error('the explanation never reached the board');
});

// code sample: display-only code with its output shown below
await check('code sample shows code and output', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Code sample' }).click();
  await canvas.getByText('Building the character vocabulary').waitFor({ timeout: 5000 });
  await canvas.getByText('6 characters', { exact: false }).waitFor({ timeout: 3000 });
});

// code exercise: complete the function, run in-browser Python, checks pass
await check('code exercise runs and passes', async () => {
  await page.locator('[aria-label="Insert lesson block"]').click();
  await page.getByRole('menuitem', { name: 'Code exercise' }).click();
  const editor = canvas.locator('[data-code-editor]').last();
  await editor.waitFor({ timeout: 5000 });
  await editor.fill('def encode(s):\n    return []');
  await page.locator('[data-run-code]').click();
  await canvas.getByText('Why it failed:', { exact: false }).waitFor({ timeout: 120000 });
  await canvas.getByText('Hint:', { exact: false }).waitFor({ timeout: 3000 });
  await editor.fill('def encode(s):\n    return [stoi[c] for c in s]');
  await page.locator('[data-run-code]').click();
  await canvas.getByText('✓ All checks passed', { exact: false }).waitFor({ timeout: 30000 });
});

// the exercise node grows on its own so the output is readable unresized
await check('code block auto-sizes for its output', async () => {
  const printed = canvas.getByText("encode('hi') = [2, 3]", { exact: false });
  await printed.waitFor({ timeout: 5000 });
  const out = await printed.boundingBox();
  const node = await canvas.locator('[data-block-id]').last().boundingBox();
  if (!out || !node) throw new Error('no boxes');
  if (out.y + out.height > node.y + node.height + 1) throw new Error('output clipped by the node');
});

await page.waitForTimeout(400);
await page.screenshot({ path: 'e2e/shots/chat-block-moved.png', fullPage: false });

await browser.close();
if (failures.length) { console.log(`\n${failures.length} FAILURES`); process.exit(1); }
console.log('\nall checks passed');
