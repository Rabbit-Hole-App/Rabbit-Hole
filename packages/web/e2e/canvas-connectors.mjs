import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Acceptance for shape connectors on the parallel clone
// (docs/features/canvas-connectors.md): four ports per shape, drag or
// click-click to connect, elbow by default, switch route in the style panel,
// label at the middle, the Elbow arrow tool. No model calls. Prints no secrets.
// usage: node e2e/canvas-connectors.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const BOARD = `connectors-${Date.now()}`;
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'canvas-connectors-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'canvas-connectors-check' } })).json();
const KEY = `small.adaptive-canvas:${apps.org}:${apps.email}:${APP}:${BOARD}:s0`;
const style = { color: '#37352f', width: 2, dash: 'solid', fill: null, opacity: 1, round: false };
const SHAPES = [
  { id: 'a', kind: 'rect', x1: 60, y1: 120, x2: 220, y2: 210, ...style, text: 'Scores' },
  { id: 'b', kind: 'ellipse', x1: 360, y1: 320, x2: 520, y2: 410, ...style, text: 'Softmax' },
  { id: 'c', kind: 'diamond', x1: 380, y1: 60, x2: 540, y2: 150, ...style },
];

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1800, height: 1300 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
await context.addInitScript(([key, shapes]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem(key, JSON.stringify({ strokes: [], shapes, items: [], links: [], blocks: [] }));
}, [KEY, SHAPES]);
const page = await context.newPage();
const board = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), KEY);
const settle = () => page.waitForTimeout(700);
const centre = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const port = (owner, side) => page.locator(`[data-port="${side}"][data-owner="${owner}"]`);
// A point on a connection's drawn path, in screen pixels.
const onLink = (id, at = 0.5) => page.evaluate(([id, at]) => {
  const path = document.querySelector(`[data-connection="${id}"] path`);
  const p = path.getPointAtLength(path.getTotalLength() * at).matrixTransform(path.getScreenCTM());
  return { x: p.x, y: p.y };
}, [id, at]);
const axisAligned = id => page.evaluate(id => {
  const d = document.querySelector(`[data-connection="${id}"] path`).getAttribute('d');
  const points = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  return !/C/.test(d) && points.slice(1).every((p, i) => p[0] === points[i][0] || p[1] === points[i][1]);
}, id);

await page.goto(`${BASE}/apps/${APP}?tab=learn&board=${BOARD}`);
await page.locator('[data-shape-id="a"]').waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

// four ports on hover
await page.mouse.move(...Object.values(await centre(page.locator('[data-shape-id="a"] rect').first())));
await settle();
const visible = await page.locator('[data-port][data-owner="a"]').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).opacity !== '0').map(node => node.dataset.port));
check('a shape shows four ports on hover', visible.sort().join(',') === 'bottom,left,right,top', visible.join(','));

// drag from a port to another shape's port
const from = await centre(port('a', 'right'));
const to = await centre(port('b', 'left'));
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(to.x - 30, to.y - 20, { steps: 10 });
await page.mouse.move(to.x, to.y, { steps: 4 });
await page.mouse.up();
await settle();
let links = (await board()).links;
const dragged = links.find(link => link.from === 'a' && link.to === 'b');
check('dragging port to port connects the shapes with an elbow arrow', !!dragged && dragged.fromSide === 'right' && dragged.toSide === 'left' && dragged.route === 'elbow' && dragged.head === true, JSON.stringify(dragged));
check('the elbow only turns at right angles', await axisAligned(dragged.id));

// click a port, then click the other shape
await page.mouse.click(...Object.values(await centre(port('a', 'bottom'))));
await page.mouse.click(...Object.values(await centre(page.locator('[data-shape-id="c"] polygon').first())));
await settle();
links = (await board()).links;
const clicked = links.find(link => link.from === 'a' && link.fromSide === 'bottom');
check('click a port, then click a shape, also connects to the side facing it', !!clicked && clicked.to === 'c' && clicked.toSide === 'left', JSON.stringify(clicked));

// the connector follows a moved shape
const before = await onLink(dragged.id, 1);
const b = await centre(page.locator('[data-shape-id="b"] ellipse').first());
await page.mouse.move(b.x, b.y);
await page.mouse.down();
await page.mouse.move(b.x + 120, b.y + 60, { steps: 10 });
await page.mouse.up();
await settle();
const after = await onLink(dragged.id, 1);
check('moving a shape re-routes its connectors', Math.abs(after.x - before.x - 120) < 3 && Math.abs(after.y - before.y - 60) < 3 && await axisAligned(dragged.id));

// select the connector: the style panel offers straight / curved / elbow
await page.mouse.click(...Object.values(await onLink(dragged.id, 0.5)));
await settle();
const panel = page.getByRole('group', { name: 'Style' });
check('selecting a connector shows the Line row', await panel.getByRole('button', { name: 'Elbow line' }).getAttribute('aria-pressed') === 'true');
await panel.getByRole('button', { name: 'Curved line' }).click();
await settle();
const curved = (await board()).links.find(link => link.id === dragged.id).route;
await panel.getByRole('button', { name: 'Straight line' }).click();
await settle();
const straight = (await board()).links.find(link => link.id === dragged.id).route;
check('the Line row switches the route', curved === 'curved' && straight === 'straight', `${curved} then ${straight}`);

// a label in the middle
await page.locator(`[data-connection="${dragged.id}"] [data-label-handle]`).click();
const label = page.locator(`[data-connection="${dragged.id}"] [data-line-label]`);
await label.waitFor({ timeout: 5000 });
check('the middle dot opens a label editor', await label.evaluate(node => node === document.activeElement));
await page.keyboard.type('normalise');
await page.keyboard.press('Enter');
await settle();
check('the label is saved on the connector', (await board()).links.find(link => link.id === dragged.id).label === 'normalise');
await page.mouse.click(...Object.values(await onLink(dragged.id, 0.2)));
await settle();
const noDot = await page.locator(`[data-connection="${dragged.id}"] [data-label-handle]`).count() === 0;
await label.click();
check('on a selected connector, clicking its label edits it (the dot is gone once labelled)', noDot && await label.evaluate(node => node === document.activeElement));
await page.keyboard.press('Enter');
await settle();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/connectors.png` });

// the Elbow arrow tool, and switching a drawn arrow
await page.getByRole('button', { name: 'Elbow arrow' }).first().click();
const canvas = await page.locator('[aria-label="Lesson canvas"]').boundingBox();
const s = { x: canvas.x + 120, y: canvas.y + canvas.height - 380 };
await page.mouse.move(s.x, s.y);
await page.mouse.down();
await page.mouse.move(s.x + 220, s.y + 120, { steps: 10 });
await page.mouse.up();
await settle();
const drawn = (await board()).shapes.find(shape => shape.kind === 'elbow');
check('the toolbar draws an elbow arrow', !!drawn);
await page.mouse.click(s.x + 110, s.y);
await settle();
await panel.getByRole('button', { name: 'Curved line' }).click();
await settle();
check('a drawn arrow switches between elbow and curved', (await board()).shapes.find(shape => shape.id === drawn.id).kind === 'curve');

// deleting a shape deletes its connectors; everything survives a reload
await page.mouse.click(...Object.values(await centre(page.locator('[data-shape-id="a"] rect').first())));
await page.keyboard.press('Delete');
await settle();
check('deleting a shape deletes its connectors', !(await board()).links.some(link => link.from === 'a' || link.to === 'a'));
await page.keyboard.press('Control+z');
await settle();
await page.reload();
await page.locator(`[data-connection="${dragged.id}"]`).waitFor({ timeout: 60000 });
const restored = (await board()).links.find(link => link.id === dragged.id);
check('undo brings them back and a reload keeps route and label', restored?.route === 'straight' && restored.label === 'normalise' && await page.locator(`[data-connection="${dragged.id}"] [data-line-label]`).innerText() === 'normalise');

console.log('board', BOARD);
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
