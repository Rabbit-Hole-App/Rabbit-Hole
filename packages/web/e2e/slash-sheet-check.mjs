import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// View > Slash commands on the parallel clone, then the Agent Bar's sheet on the Library: the search is focused on open and
// filters by name and description; choosing a command shows the real card it
// makes (the canvas's own card component) at its canvas size and working; paid
// media shows a committed finished clip or a labelled picture, never Generate;
// /source opens a card's Sources & evidence; chat-only commands show an example
// exchange. Every command shows a demo. No model calls, nothing generated.
// usage: node e2e/slash-sheet-check.mjs [screenshot dir]
// A local stack instead: BASE=http://127.0.0.1:<app> SMALL_CP=http://127.0.0.1:<cp> node e2e/slash-sheet-check.mjs [dir] - a fresh
// canvas, a session minted with packages/control-plane/.dev.vars, and /graph's card skipped (a keyless build has no Desmos key).
const LOCAL = process.env.BASE || null;
if (LOCAL && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(LOCAL)) throw Error('BASE must be a local stack');
const BASE = LOCAL || 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const SHOTS = process.argv[2] || 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
let session;
if (LOCAL) {
  const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
  session = (await (await fetch(`${process.env.SMALL_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `slash-sheet-${Date.now().toString(36)}@example.com`, secret }) })).json()).session;
} else {
  const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
  session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'slash-sheet' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
}
let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const skip = (name, why) => console.log(`SKIP  ${name}  (local stack: ${why})`);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
const paid = [];
page.on('request', request => { if (request.method() === 'POST' && /\/api\/learn\/(image|video|scene|tts|artifact)/.test(request.url())) paid.push(request.url()); });
const canvasName = LOCAL && (await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: `small_session=${session}` }, body: JSON.stringify({ title: 'Slash sheet check' }) })).json()).name;
await page.goto(LOCAL ? `${BASE}/apps/${canvasName}` : `${BASE}/apps/repo-06745f10-nanogpt?tab=learn&board=sheet-${Date.now().toString(36)}`);
await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'View' }).click();
await page.getByRole('menuitem', { name: 'Slash commands' }).click();
const sheet = page.getByRole('dialog', { name: 'Slash commands' });
await sheet.waitFor();
// The search: focused on open; a leading / is ignored; Enter takes the first match; Esc clears it before it closes the sheet.
const search = sheet.locator('[data-slash-search]');
const rows = sheet.locator('[data-slash-help]');
const all = await rows.count();
ok('the search is focused when the sheet opens', await search.evaluate(node => node === document.activeElement));
await search.fill('/flash');
ok('typing filters by command name, ignoring the leading /', await rows.count() === 1 && await rows.first().getAttribute('data-slash-help') === 'flashcards');
await search.press('Enter');
ok('Enter selects the first match', await sheet.locator('[data-slash-card="flashcards"]').waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
await search.fill('evidence');
ok('typing filters by description', await rows.count() === 1 && await rows.first().getAttribute('data-slash-help') === 'source');
await search.fill('zzz');
ok('no match says so', await rows.count() === 0 && await sheet.getByText('No commands match').count() === 1);
await page.keyboard.press('Escape');
ok('Esc clears the search and keeps the sheet open', await search.inputValue() === '' && await sheet.isVisible() && await rows.count() === all, `${all} rows`);
// Every command shows a demo: a card, the card /source opens, or an example exchange.
const missing = [];
for (const command of await rows.evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp))) {
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  if (!await sheet.locator('[data-slash-card], [data-slash-chat]').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) missing.push(command);
}
ok('every command shows a demo', missing.length === 0, missing.join(' '));
// The card a command makes: [data-slash-card] and a readiness hint per card type.
const expect = { graph: '.dcg-container, canvas', quiz: 'button', diagram: '.react-flow__node', animate: 'video[data-lesson-video]', explain: 'p', notebook: 'iframe', walkthrough: 'svg, button', code: 'pre, code' };
for (const [command, ready] of Object.entries(expect)) {
  if (LOCAL && command === 'graph') { skip('/graph shows its real card', 'no Desmos key in a keyless build'); continue; }
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  const card = sheet.locator('[data-slash-card]');
  await card.waitFor({ timeout: 15000 });
  const drawn = await card.locator(ready).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  // The canvas width of that card type (CanvasNode: BLOCK_TYPES width, or 380; notebook 640).
  const widths = { graph: 560, quiz: 380, flow: 560, mathAnimation: 560, explanation: 440, notebook: 640, walkthrough: 420, snippet: 520 };
  const type = await card.getAttribute('data-slash-card');
  const width = Math.round((await card.boundingBox()).width);
  await page.waitForTimeout(800);
  await sheet.screenshot({ path: `${SHOTS}/sheet-${command}.png` });
  ok(`/${command} shows its real card (${type}) at its canvas width`, drawn && width === widths[type], `${width}px`);
}
// Interactive as on the canvas: answering the quiz reveals why; paid Generate is off.
await sheet.locator('[data-slash-help="quiz"]').click();
await sheet.locator('[data-slash-card="quiz"]').getByRole('button').first().click();
ok('the quiz card works: choosing an option answers it', await sheet.locator('[data-slash-card="quiz"]').innerText().then(text => /differentiate|σ|sigma/i.test(text)));
// Paid media always shows a finished example from committed files, on any stack: /animate plays the softmax clip; /3d
// and /video show a labelled picture of the finished card. No Generate card.
await sheet.locator('[data-slash-help="animate"]').click();
const clip = sheet.locator('[data-slash-card] video[data-lesson-video]');
const plays = await clip.waitFor({ timeout: 20000 }).then(() => clip.evaluate(node => new Promise(done => { if (node.readyState >= 1) return done(node.duration); node.addEventListener('loadedmetadata', () => done(node.duration), { once: true }); setTimeout(() => done(0), 15000); }))).catch(() => 0);
ok('/animate plays the finished softmax clip, not a Generate card', plays > 0 && await sheet.locator('[data-slash-card]').getByText('Softmax shares the whole by score').count() === 1 && await sheet.locator('[data-slash-card] [data-generate-video]').count() === 0, `${plays}s`);
await sheet.screenshot({ path: `${SHOTS}/sheet-animate.png` });
for (const [command, type] of [['3d', 'scene'], ['video', 'videoGenerate']]) {
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  // decode(), not naturalWidth: an SVG with only a viewBox loads with naturalWidth 0; decode() rejects only a broken image.
  const picture = sheet.locator(`[data-slash-card="${type}"] img[data-slash-illustration]`);
  const drawn = await picture.waitFor({ timeout: 15000 }).then(() => picture.evaluate(node => node.decode().then(() => true, () => false))).catch(() => false);
  ok(`/${command} shows a labelled picture of the finished card, not a Generate card`, drawn && await sheet.locator(`[data-slash-card="${type}"]`).getByText('Illustration.').count() === 1 && await sheet.locator('[data-slash-card] [data-generate-video], [data-slash-card] [data-generate-scene]').count() === 0);
  await sheet.screenshot({ path: `${SHOTS}/sheet-${command}.png` });
}
// /source opens the Sources & evidence of a card: here the sheet's own /explain card, its list open.
await sheet.locator('[data-slash-help="source"]').click();
ok('/source opens the Sources & evidence of a card', await sheet.locator('[data-slash-sources] [data-slash-card="explanation"] details[data-sources][open]').count() === 1 && await sheet.locator('[data-slash-sources]').getByText('model.py:127').count() > 0);
await sheet.screenshot({ path: `${SHOTS}/sheet-source.png` });
await sheet.locator('[data-slash-help="compare"]').click();
ok('/compare explains the tutor picks one, and shows a real comparison', await sheet.getByText('The tutor picks one:').count() === 1 && await sheet.locator('[data-slash-card="table"]').getByText('Sigmoid vs tanh').count() === 1);
await sheet.screenshot({ path: `${SHOTS}/sheet-compare.png` });
// /research and /do are Home, Library and Project workflows, never Canvas commands (Professor Next Steps contract §1.7).
ok('the sheet offers no /research or /do', await sheet.locator('[data-slash-help="research"], [data-slash-help="do"]').count() === 0);
await sheet.screenshot({ path: `${SHOTS}/sheet-commands.png` });
for (const command of ['deeper', 'dive', 'simplify', 'example', 'ask', 'teach']) {
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  const chat = sheet.locator(`[data-slash-chat="${command}"]`);
  ok(`/${command} shows an example exchange and adds no card`, await sheet.locator('[data-slash-card]').count() === 0 && await chat.locator('.katex, p').count() > 0 && (await chat.innerText()).includes(`/${command}`));
  await sheet.screenshot({ path: `${SHOTS}/sheet-${command}.png` });
}
await sheet.locator('[data-slash-help="diagram"]').click();
await sheet.getByRole('tab', { name: 'Mermaid diagram' }).click();
ok('a command with several cards switches between them', await sheet.locator('[data-slash-card="mermaid"]').count() === 1);
await search.focus();
await page.keyboard.press('Escape');
ok('Esc with an empty search closes the sheet', await sheet.waitFor({ state: 'detached', timeout: 5000 }).then(() => true).catch(() => false));
// The Agent Bar's Slash commands (r28): the same search and a demo for every command it offers - its example as typed
// and what that example does. Library, so nothing here asks a model (no Send).
await page.goto(`${BASE}/library`);
const barInput = page.locator('[data-agent-bar] textarea');
await barInput.waitFor({ timeout: 60000 });
await barInput.fill('/');
await page.locator('[data-bar-slash-help]').click();
const barSheet = page.getByRole('dialog', { name: 'Slash commands' });
await barSheet.waitFor();
const barRows = barSheet.locator('[data-bar-command]');
const offered = await barRows.evaluateAll(nodes => nodes.map(node => node.dataset.barCommand));
ok('the bar sheet offers what its picker does: no /research, no dimmed rows', !offered.includes('research') && ['ask', 'teach', 'do', 'find', 'open', 'new', 'connect'].every(name => offered.includes(name)), offered.join(' '));
ok('the bar sheet search is focused when it opens', await barSheet.locator('[data-slash-search]').evaluate(node => node === document.activeElement));
const blank = [];
for (const command of offered) {
  await barSheet.locator(`[data-bar-command="${command}"]`).click();
  const demo = barSheet.locator(`[data-bar-demo="${command}"]`);
  const text = await demo.waitFor({ timeout: 5000 }).then(() => demo.innerText()).catch(() => '');
  if (!text.includes(`/${command} `) || text.length < 80) blank.push(command);
}
ok('every bar command shows its example and what it does', blank.length === 0, blank.join(' '));
await barSheet.screenshot({ path: `${SHOTS}/bar-sheet.png` });
await barSheet.locator('[data-slash-search]').fill('/conn');
ok('the bar sheet filters like the canvas sheet', await barRows.count() === 1 && await barRows.first().getAttribute('data-bar-command') === 'connect');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
ok('Esc clears the search, then closes the bar sheet', await barSheet.waitFor({ state: 'detached', timeout: 5000 }).then(() => true).catch(() => false));
ok('no page errors and no paid request', errors.length === 0 && paid.length === 0, `${errors.join(' | ')} ${paid.join(' ')}`);
await browser.close();
process.exit(failed ? 1 : 0);
