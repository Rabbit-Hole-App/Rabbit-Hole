import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// The Learn dock's chat sheet: a plain question ("hi") answers in a panel
// above the composer and makes no card; follow-ups stay in one thread; Add to
// canvas turns an answer into a card in view; Ask in chat on a card still
// answers as a linked card and stays out of the sheet; New chat and Collapse
// work. Asks are answered by a stub (no model calls). Parallel clone only.
// usage: node e2e/learn-chat-sheet.mjs [screenshot dir]
const BASE = process.env.BASE || 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `chat-sheet-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'chat-sheet-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'chat-sheet-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const SEED = ['Softmax', 'Attention'].map((title, i) => ({ id: `seed-${i}`, type: 'explanation', dx: 0, dy: 0, title, body: 'A card already on the board. '.repeat(5), more: [] }));

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, blocks]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], blocks }));
}, [KEY, SEED]);
const page = await context.newPage();
const asks = [];
let turn = 0;
await page.route('**/api/learn/ask', async route => {
  let body = {};
  try { body = route.request().postDataJSON() || {}; } catch { /* multipart */ }
  asks.push(body);
  // Two paragraphs, so the sheet must still show one block per answer.
  const reply = [`Hello! Answer ${++turn}.\n\n`, 'What would you like to learn?'];
  await new Promise(resolve => setTimeout(resolve, 400));
  await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: reply.map(text => `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`).join('') + `event: done\ndata: ${JSON.stringify({ threadId: body.thread_id || `stub-thread-${turn}` })}\n\n` });
});

await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.locator('[data-block-id="seed-1"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(600);
const composer = page.locator('[data-learn-dock] [data-chat-composer] input:not([type="file"])').first();
const sheet = page.locator('[data-chat-sheet]');
const chatCards = () => page.locator('[data-chat-block]').count();
const say = async text => { await composer.click(); await composer.fill(text); await composer.press('Enter'); };
const answered = async n => { await sheet.getByText(`Answer ${n}.`).waitFor({ timeout: 15000 }); await page.waitForTimeout(400); };

// 1. "hi" answers in the sheet, no card
await say('hi');
await answered(1);
check('a plain question opens the sheet above the composer', await sheet.isVisible());
const sheetBox = await sheet.boundingBox(), dockBox = await page.locator('[data-learn-dock] [data-chat-composer]').first().boundingBox();
check('the sheet sits directly above the composer, same width', sheetBox.y + sheetBox.height <= dockBox.y + 2 && Math.abs(sheetBox.width - dockBox.width) < 4, `sheet ${Math.round(sheetBox.width)}w bottom ${Math.round(sheetBox.y + sheetBox.height)}, composer ${Math.round(dockBox.width)}w top ${Math.round(dockBox.y)}`);
check('"hi" makes no card on the canvas', await chatCards() === 0);
check('the sheet shows the question and the answer', await sheet.getByText('hi', { exact: true }).isVisible() && await sheet.getByText('Answer 1.').isVisible());
const copies = await sheet.getByRole('button', { name: /^Copy answer/ }).count(), askAbout = await sheet.getByRole('button', { name: /^Ask about answer block/ }).count();
check('a two-paragraph answer is one block with one copy icon and no ask-about icon', copies === 1 && askAbout === 0, `${copies} copy, ${askAbout} ask-about`);
await shot(page, 'sheet-hi');

// 2. a follow-up continues the same thread
await say('and what about attention?');
await answered(2);
check('a follow-up stays in the same thread', asks.length === 2 && !asks[0].thread_id && asks[1].thread_id === 'stub-thread-1', `thread ids ${asks.map(ask => ask.thread_id || 'none').join(', ')}`);
check('both turns are in the sheet, still no card', await sheet.getByText('Answer 1.').isVisible() && await sheet.getByText('Answer 2.').isVisible() && await chatCards() === 0);

// 3. Add to canvas: the answer becomes a chat card, in view
await sheet.locator('[data-add-to-canvas]').last().click();
await page.waitForTimeout(1200);
const added = page.locator('[data-chat-block]').filter({ hasText: 'Answer 2.' });
check('Add to canvas makes one chat card with that answer', await chatCards() === 1 && await added.count() === 1);
const canvasBox = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
const cardBox = await added.boundingBox();
const openSheet = await sheet.boundingBox();
check('the added card is in view, above the open sheet', cardBox && cardBox.y >= canvasBox.y - 1 && cardBox.y + Math.min(cardBox.height, 120) <= openSheet.y && cardBox.x >= canvasBox.x && cardBox.x + cardBox.width <= canvasBox.x + canvasBox.width, cardBox ? `card ${Math.round(cardBox.x)},${Math.round(cardBox.y)}, sheet top ${Math.round(openSheet.y)}` : 'none');
check('the button says the answer is on the canvas', await sheet.locator('[data-add-to-canvas]').last().getByText('On the canvas').isVisible());
await shot(page, 'sheet-added');

// 4. Collapse hides the sheet; Ask in chat on a card: a linked card, not in the sheet
await sheet.getByRole('button', { name: 'Collapse chat' }).click();
check('Collapse hides the sheet', !(await sheet.isVisible()));
await page.locator('[data-block-id="seed-1"]').click({ position: { x: 30, y: 12 } });
await page.locator('[data-block-id="seed-1"]').getByRole('button', { name: 'Ask in chat' }).click();
await say('explain this card');
await page.locator('[data-chat-block]').filter({ hasText: 'Answer 3.' }).waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
const links = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').links || [], KEY);
check('Ask in chat on a card still answers as a linked card', links.some(link => link.from === 'seed-1') && await chatCards() === 2);
check('that card question stays out of the sheet', !(await sheet.getByText('explain this card').count()) && !(await sheet.getByText('Answer 3.').count()));
check('the card question is its own thread', !asks[2].thread_id, `thread ${asks[2].thread_id || 'none'}`);
check('Ask in chat sends the typed question as message and the card as canvas_target', asks[2].message === 'explain this card' && asks[2].canvas_target?.id === 'seed-1' && !!asks[2].canvas_target?.text, `message ${JSON.stringify(asks[2].message)}, target ${asks[2].canvas_target?.id || 'none'}`);

// 5. the sheet's thread survives the card question
await say('back to chat');
await answered(4);
check('the sheet thread continues after a card question', asks[3].thread_id === 'stub-thread-1', `thread ${asks[3].thread_id || 'none'}`);
check('the next question reopens the collapsed sheet', await sheet.isVisible());

// 7. New chat empties it and starts a new thread
await sheet.getByRole('button', { name: 'New chat' }).click();
check('New chat clears the sheet', !(await sheet.isVisible()));
await say('fresh start');
await answered(5);
check('New chat starts a new thread', !asks[4].thread_id, `thread ${asks[4].thread_id || 'none'}`);
await sheet.getByRole('button', { name: 'History' }).click();
await page.waitForTimeout(1500);
check('History opens in the sheet', await sheet.getByRole('button', { name: 'Back to chat' }).isVisible());
// Card questions now keep the learner's words (canvas_target carries the card), and grading no longer makes threads.
check('History leaves out card questions and grading chats', await sheet.getByText(/^(explain this card|Question about this|You are )/).count() === 0);
await shot(page, 'sheet-history');

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
