import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';

// View > Slash commands on the parallel clone, then the Agent Bar's sheet on the Library: the search is focused on open and
// filters by name and description; choosing a command shows the real card it
// makes (the canvas's own card component) at its canvas size and working; paid
// media shows a committed finished clip or a labelled picture, never Generate;
// /dive says what it opens. Every retained command shows a demo, what it does and an example; Use example prepares an
// editable draft and sends nothing; the 17 removed commands appear nowhere, and the Agent Bar has no commands left (owner,
// 2026-10-20). No model calls, nothing generated.
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
await search.fill('rabbit');
ok('typing filters by description', await rows.count() === 1 && await rows.first().getAttribute('data-slash-help') === 'dive');
await search.fill('zzz');
ok('no match says so', await rows.count() === 0 && await sheet.getByText('No commands match').count() === 1);
await page.keyboard.press('Escape');
ok('Esc clears the search and keeps the sheet open', await search.inputValue() === '' && await sheet.isVisible() && await rows.count() === all, `${all} rows`);
// Owner, 2026-10-20: every retained command is listed (More learning tools included, no /more); none of the 17 removed is.
const RETAINED = ['dive', 'practice', 'quiz', 'explain', 'code', 'graph', 'diagram', 'animate', 'flashcards', 'notebook', 'image', 'youtube', 'arxiv', 'wikipedia', 'whiteboard', 'video', 'cad', '3d'];
const REMOVED = ['walkthrough', 'do', 'find', 'open', 'connect', 'run', 'new', 'research', 'more', 'ask', 'teach', 'deeper', 'simplify', 'example', 'compare', 'source', 'paper'];
const listed = await rows.evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp));
ok('every retained command is listed', RETAINED.every(name => listed.includes(name)) && listed.filter(name => name !== 'motion').length === RETAINED.length, listed.join(' '));
ok('no removed command is listed', REMOVED.every(name => !listed.includes(name)));
await sheet.screenshot({ path: `${SHOTS}/sheet-list.png` });
// Each says what it is and does: menu label, whether it creates a card, opens or searches, its sentence, Sourced or AI-generated.
const about = async name => { await sheet.locator(`[data-slash-help="${name}"]`).click(); return { label: await sheet.locator('[data-slash-label]').innerText(), effect: await sheet.locator('[data-slash-effect]').innerText(), media: await sheet.locator('[data-slash-media]').count() ? await sheet.locator('[data-slash-media]').innerText() : null, text: await sheet.locator('[data-slash-about]').innerText() }; };
const explain = await about('explain');
ok('/explain: Add explanation, creates a card', explain.label === 'Add explanation' && explain.effect === 'Creates a card' && explain.text.startsWith('Creates an explanation card on the canvas.'), JSON.stringify(explain));
await sheet.screenshot({ path: `${SHOTS}/sheet-explain-about.png` });
const dive = await about('dive');
ok('/dive: Open Rabbit Hole, opens, says what it needs selected', dive.label === 'Open Rabbit Hole' && dive.effect === 'Opens a Rabbit Hole' && /selected card/.test(dive.text), JSON.stringify(dive));
await sheet.screenshot({ path: `${SHOTS}/sheet-dive.png` });
const image = await about('image'), video = await about('video'), youtube = await about('youtube'), three = await about('3d');
ok('/image searches and is Sourced; /video generates and is AI-generated; /youtube searches and is Sourced', image.label === 'Search images' && image.effect === 'Searches' && image.media === 'Sourced'
  && video.label === 'Generate video' && video.effect === 'Creates a card' && video.media === 'AI-generated' && youtube.media === 'Sourced', JSON.stringify([image, video, youtube]));
ok('/3d reads Add 3D scene', three.label === 'Add 3D scene', three.label);
ok('/generate-image is not advertised while image generation is off', !listed.includes('generate-image'));
// Every command shows a demo: a card, what a source search does (Release B), or what /dive does.
const missing = [];
for (const command of await rows.evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp))) {
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  if (!await sheet.locator('[data-slash-card], [data-slash-chat], [data-slash-finder], [data-slash-cad]').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) missing.push(command);
  if(command==='cad'){
    const text=await sheet.locator('[data-slash-cad]').textContent();
    ok('CAD describes background work, clarification and explicit generation',text.includes('saved background job')&&text.includes('missing dimensions')&&text.includes('Selecting CAD does not start generation'));
  }
}
ok('every command shows a demo', missing.length === 0, missing.join(' '));
// The card a command makes: [data-slash-card] and a readiness hint per card type.
// /explain opens on its interactive visual (L10): a stored real /explain scene drawn by the scene renderer.
const expect = { graph: '.dcg-container, canvas', quiz: 'button', diagram: '.react-flow__node', animate: 'video[data-lesson-video]', explain: 'svg [data-animation-object]', notebook: 'iframe', code: 'pre, code' };
for (const [command, ready] of Object.entries(expect)) {
  if (LOCAL && command === 'graph') { skip('/graph shows its real card', 'no Desmos key in a keyless build'); continue; }
  await sheet.locator(`[data-slash-help="${command}"]`).click();
  const card = sheet.locator('[data-slash-card]');
  await card.waitFor({ timeout: 15000 });
  const drawn = await card.locator(ready).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  // The canvas width of that card type (CanvasNode: BLOCK_TYPES width, or 380; notebook 640); an animation is sized from its scene.
  const widths = { graph: 560, quiz: 380, flow: 560, mathAnimation: 560, explanation: 440, notebook: 640, walkthrough: 420, snippet: 520, animation: null };
  const type = await card.getAttribute('data-slash-card');
  const width = Math.round((await card.boundingBox()).width);
  await page.waitForTimeout(800);
  await sheet.screenshot({ path: `${SHOTS}/sheet-${command}.png` });
  ok(`/${command} shows its real card (${type}) at its canvas width`, drawn && (widths[type] === null ? width >= 400 : width === widths[type]), `${width}px`);
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
await sheet.locator('[data-slash-help="dive"]').click();
const diveDemo = sheet.locator('[data-slash-chat="dive"]');
ok('/dive says what it opens and adds no card', await sheet.locator('[data-slash-card]').count() === 0 && (await diveDemo.innerText()).includes('/dive how cells produce ATP'));
await sheet.locator('[data-slash-help="diagram"]').click();
await sheet.getByRole('tab', { name: 'Mermaid diagram' }).click();
ok('a command with several cards switches between them', await sheet.locator('[data-slash-card="mermaid"]').count() === 1);
await search.focus();
await page.keyboard.press('Escape');
ok('Esc with an empty search closes the sheet', await sheet.waitFor({ state: 'detached', timeout: 5000 }).then(() => true).catch(() => false));
// Use example (owner, 2026-10-20): the example becomes an editable draft - the command's pill and its words - in the Chat
// composer, and nothing is sent.
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'View' }).click();
await page.getByRole('menuitem', { name: 'Slash commands' }).click();
await sheet.waitFor();
await sheet.locator('[data-slash-help="explain"]').click();
const posted = paid.length;
await sheet.locator('[data-slash-use-example="explain"]').click();
await sheet.waitFor({ state: 'detached', timeout: 5000 });
const chatComposer = page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
await chatComposer.waitFor({ timeout: 10000 });
const draftPill = page.locator('[data-chat-pane] [data-command-pill]');
await page.waitForTimeout(500);
ok('Use example: the composer holds the Add explanation pill and the words, editable, focused, not sent',
  await draftPill.getAttribute('data-command-pill') === 'explain' && (await draftPill.innerText()).trim() === 'Add explanation' && await chatComposer.inputValue() === 'how binary search works'
  && await chatComposer.evaluate(node => node === document.activeElement) && paid.length === posted, `${await chatComposer.inputValue()} / ${paid.length - posted} posts`);
await page.screenshot({ path: `${SHOTS}/use-example-draft.png` });
await chatComposer.fill('how merge sort works');
ok('the drafted words can be edited before sending', await chatComposer.inputValue() === 'how merge sort works' && paid.length === posted);
// The Agent Bar on the Library has no slash commands left (owner, 2026-10-20): no Auto picker or / commands sheet, and a typed
// removed command says it is unavailable. Library, so nothing here asks a model.
await page.goto(`${BASE}/library`);
const barInput = page.locator('[data-agent-bar] textarea');
await barInput.waitFor({ timeout: 60000 });
await barInput.fill('/');
await page.waitForTimeout(300);
ok('the bar opens no picker, has no Auto button and no / commands sheet', await page.locator('[data-agent-bar] [role="listbox"]').count() === 0 && await page.locator('[data-bar-slash-help]').count() === 0
  && await page.locator('[data-agent-bar]').getByRole('button', { name: 'Auto', exact: true }).count() === 0);
await barInput.fill('/find nanoGPT');
await barInput.press('Enter');
const barNote = page.locator('[data-result-sheet]').getByText('/find is no longer available.', { exact: false }).first();
ok('a removed bar command says it is unavailable', await barNote.waitFor({ timeout: 10000 }).then(() => true).catch(() => false));
await page.screenshot({ path: `${SHOTS}/bar-removed-command.png` });
ok('no page errors and no paid request', errors.length === 0 && paid.length === 0, `${errors.join(' | ')} ${paid.join(' ')}`);
await browser.close();
process.exit(failed ? 1 : 0);
