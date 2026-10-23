// The slash-command cleanup (owner, 2026-10-20; docs/features/rabbit-hole-commands.md "Slash-command cleanup"), against the
// LOCAL stack only, in light and in dark. No model is called: /api/learn/artifact answers one fixed explanation card, photo
// search answers one fixed photo, the paper's PDF is a fixture, and every other model or Ctrl+K route is aborted and counted.
//   1. Chat: the picker lists the retained commands (no removed one), /explain and /dive read "Add explanation" and "Open
//      Rabbit Hole" as menu labels and as pills (no /), picked and typed alike;
//   2. typed /explain makes an explanation card; /image searches real photos and the card says Sourced;
//   3. each of the 17 removed commands typed in Chat says it is unavailable and runs nothing; /generate-image too (off);
//   4. Ctrl+K: its list has no removed command, pills read their labels with no /, /image is Search images, and each removed
//      command typed there says it is unavailable and sends nothing;
//   5. the Slash commands window lists every retained command, says what each does, and Use example prepares an editable
//      draft without sending;
//   6. a saved conversation with old /simplify and /deeper lines opens and shows them as text; cards made by removed commands
//      (a /compare table, a /walkthrough card) and a paper card with its PDF still open; Sources & evidence opens on its card;
//   7. the Library bar has no slash commands: no picker, no Auto, a removed one says so;
//   8. (light only, last) typed /dive <topic> opens a Rabbit Hole about it.
// Usage: BASE=http://127.0.0.1:9231 SMALL_CP=http://127.0.0.1:9233 VARS=C:/s/toc-uislash/.dev.vars node e2e/slash-cleanup-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { PRIMITIVES } from '../../control-plane/src/learn-primitives.js';

const BASE = process.env.BASE || 'http://127.0.0.1:9231';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9233';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('slash-cleanup-check runs against a local stack only');
const OUT = process.argv[2] || 'slash-cleanup-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `slash-cleanup-${run}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const api = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, origin: BASE, 'content-type': 'application/json' } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${body?.error || ''}`);
  return body;
};

// /animate is removed too (L8, owner 2026-10-20): /motion, offered by this development build, is the animation command.
const RETAINED = ['dive', 'practice', 'quiz', 'goal', 'explain', 'code', 'graph', 'diagram', 'motion', 'flashcards', 'notebook', 'image', 'youtube', 'arxiv', 'wikipedia', 'whiteboard', 'video', 'cad', '3d'];
const REMOVED = ['walkthrough', 'do', 'find', 'open', 'connect', 'run', 'new', 'research', 'more', 'ask', 'teach', 'deeper', 'simplify', 'example', 'compare', 'source', 'paper', 'animate'];
const CTRLK = ['explain', 'flashcards', 'code', 'graph', 'diagram', 'motion', 'image', 'video', 'cad', '3d', 'youtube', 'arxiv', 'wikipedia'];
const removedText = name => `/${name} is no longer available. Type / to see the commands, or ask in your own words.`;

// A small PDF (the paper card's bytes), so the paper opens with no arXiv call.
function makePdf(text) {
  const stream = `BT /F1 48 Tf 60 400 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R] /Count 1 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// Saved content made before the cleanup: cards from /compare and /walkthrough, a paper card, a card with Sources & evidence,
// and a conversation whose user lines ran /simplify and /deeper (meta.command kept).
const WALK = { ...PRIMITIVES.walkthrough.block({ title: 'A token through the model', goal: 'Follow one token', steps: [{ label: 'Look up its row', detail: 'embedding' }, { label: 'Add position', detail: '' }, { label: 'Attend', detail: '' }] }), id: 'k-walk', dx: 0, dy: 0, promptUsed: '/walkthrough a token through the model' };
const COMPARE = { id: 'k-compare', type: 'table', title: 'Sigmoid vs tanh', caption: 'Made by /compare before the cleanup.', columns: ['', 'Sigmoid', 'Tanh'], rows: [['Range', '(0, 1)', '(-1, 1)'], ['Value at 0', '0.5', '0']], dx: 520, dy: 0, promptUsed: '/compare sigmoid vs tanh' };
const SOURCED = { id: 'k-exp', type: 'explanation', title: 'Why salt melts ice', body: 'Salt lowers the freezing point of water.', dx: 0, dy: 520,
  sources: [{ kind: 'web', title: 'Freezing-point depression', url: 'https://en.wikipedia.org/wiki/Freezing-point_depression' }] };
const PAPER = { id: 'k-paper', type: 'paper', dx: 1040, dy: 0, paper: { id: '1706.03762', title: 'Attention Is All You Need', page: 1 } };
const canvas = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Slash cleanup ${run}` }) });
await api(`/api/learn/boards/${canvas.name}/main`, { method: 'PUT', body: JSON.stringify({ state: { strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], exchanges: [], blocks: [WALK, COMPARE, SOURCED, PAPER] } }) });
const thread = `canvaschat-${crypto.randomUUID()}`;
const say = (client, role, content, extra = {}) => api(`/api/learn/chat/threads/${thread}/messages`, { method: 'POST', body: JSON.stringify({ app: canvas.name, client_id: client, role, content, ...extra }) });
await say('t1-u', 'user', '/simplify the masking step', { command: 'simplify', title: 'Old slash commands' });
await say('t1-a', 'assistant', 'Masking hides the later tokens from each position.');
await say('t2-u', 'user', '/deeper into the scaling', { command: 'deeper' });
await say('t2-a', 'assistant', 'Dividing by the square root of the key size keeps the scores from growing with it.');

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();

async function pass(theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(value => { try { localStorage.setItem('small.theme', value); } catch {} }, theme);
  const model = [], artifacts = [];
  await context.route('**/api/learn/artifact', async route => {
    const body = route.request().postDataJSON();
    artifacts.push(body.command);
    if (body.command !== 'explain') { model.push(`artifact:${body.command}`); return route.fulfill({ status: 500, json: { error: 'not in this check' } }); }
    return route.fulfill({ json: { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'How binary search works', body: 'Halve the sorted range each step until the target is found.' } } });
  });
  await context.route('**/api/learn/photos?**', route => route.fulfill({ json: { photos: [{ id: 'p1', src: `${BASE}/apple-touch-icon.png`, alt: 'Mount Fuji fixture', photographer: 'Fixture Photographer', url: 'https://www.pexels.com/photo/fixture' }] } }));
  await context.route('**/api/learn/paper?**', route => route.fulfill({ body: makePdf('Attention fixture'), headers: { 'content-type': 'application/pdf' } }));
  await context.route(/\/api\/learn\/(tutor\/plan|ask|selection|inline\/[\w-]+|image|video|scene|search)(\?|$)/, route => { model.push(new URL(route.request().url()).pathname); return route.abort(); });
  await context.route('**/main/thumbnail', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 204 }) : route.continue()));
  const page = await context.newPage();
  const errors = [];
  let at = 'load';
  page.on('pageerror', error => errors.push(`${error.message.slice(0, 160)} (during ${at})`));
  const shot = name => { at = name; return page.screenshot({ path: `${OUT}/${theme}-${name}.png` }); };
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
  ok(`${theme}: the theme is applied`, await page.evaluate(() => document.documentElement.classList.contains('dark')) === (theme === 'dark'));
  const dock = page.locator('[data-chat-pane]');
  const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
  await composer().waitFor({ timeout: 30000 });
  const picker = dock.locator('[data-slash-picker]');
  const pill = dock.locator('[data-command-pill]');
  const notice = dock.locator('[data-slash-result]');
  const blocks = () => page.locator('[data-block-id]:not([data-chat-block])').count();

  // The Chat restores the latest saved thread (the seeded one) and its draft after the page loads: type only once it has.
  // (The dark pass may restore a newer thread the light pass made: then a settle wait.)
  await dock.getByText('/simplify the masking step').first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // 1. The Chat picker: retained commands only, every one reachable (More learning tools opened), menu labels.
  await composer().click();
  await composer().fill('/');
  await picker.waitFor();
  // More learning tools opens on a click, or by itself when the list is scrolled to the end: open it once, either way.
  // (Clicking scrolls the list, and reaching its end opens the section too, so the click may close it again: retry.)
  const more = picker.locator('[data-slash-more]');
  for (let i = 0; i < 4 && !await picker.locator('[data-slash-command="video"]').isVisible(); i += 1) {
    if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
    await page.waitForTimeout(400);
  }
  const rows = await picker.locator('[data-slash-command]').evaluateAll(nodes => nodes.map(node => node.dataset.slashCommand));
  ok(`${theme}: the Chat picker lists every retained command and no removed one`, RETAINED.every(name => rows.includes(name)) && REMOVED.every(name => !rows.includes(name)) && !rows.includes('generate-image'), rows.join(' '));
  ok(`${theme}: menu labels read Add explanation, Open Rabbit Hole, Search images, Generate video, Add 3D scene`,
    (await picker.locator('[data-slash-command="explain"]').innerText()).includes('Add explanation') && (await picker.locator('[data-slash-command="dive"]').innerText()).includes('Open Rabbit Hole')
    && (await picker.locator('[data-slash-command="image"]').innerText()).includes('Search images') && (await picker.locator('[data-slash-command="video"]').innerText()).includes('Generate video')
    && (await picker.locator('[data-slash-command="3d"]').innerText()).includes('Add 3D scene'));
  await shot('01-chat-picker');
  // Picked: the pill is the label, never a /name.
  await picker.locator('[data-slash-command="explain"]').click();
  await pill.waitFor();
  ok(`${theme}: picked /explain is the Add explanation pill`, (await pill.innerText()).trim() === 'Add explanation' && !(await pill.innerText()).includes('/') && await dock.getByRole('button', { name: 'Remove Add explanation', exact: true }).count() === 1);
  await shot('02-pill-explain');
  await dock.getByRole('button', { name: 'Remove Add explanation', exact: true }).click();
  await composer().fill('/');
  await picker.locator('[data-slash-command="dive"]').click();
  await pill.waitFor();
  ok(`${theme}: picked /dive is the Open Rabbit Hole pill`, (await pill.innerText()).trim() === 'Open Rabbit Hole' && !(await pill.innerText()).includes('/'));
  await shot('03-pill-dive');
  await dock.getByRole('button', { name: 'Remove Open Rabbit Hole', exact: true }).click();
  // Typed: the same pills.
  for (const [name, label] of [['explain', 'Add explanation'], ['dive', 'Open Rabbit Hole'], ['image', 'Search images'], ['video', 'Generate video'], ['3d', '3D']]) {
    await composer().fill(`/${name} `);
    await pill.waitFor();
    ok(`${theme}: typed /${name} is the ${label} pill, no slash`, await pill.getAttribute('data-command-pill') === name && (await pill.innerText()).trim() === label);
    await dock.getByRole('button', { name: `Remove ${label}`, exact: true }).click();
  }
  await composer().fill('');

  // 2. Typed /explain makes an explanation card; /image searches photos and its card says Sourced.
  const before = await blocks();
  await composer().fill('/explain how binary search works');
  await composer().press('Enter');
  await notice.getByText('Added an explanation.').waitFor({ timeout: 15000 });
  ok(`${theme}: typed /explain creates an explanation card`, await blocks() === before + 1 && artifacts.at(-1) === 'explain' && await page.getByText('How binary search works').count() > 0);
  await shot('04-explain-card');
  await composer().fill('/image Mount Fuji');
  await composer().press('Enter');
  await notice.getByText('Searching photos for "Mount Fuji".').waitFor({ timeout: 10000 });
  const photo = page.locator('[data-photo-result]').first();
  await photo.waitFor({ timeout: 15000 });
  await photo.click();
  // The light pass's card stays on the board, so the dark pass reads the newest one.
  const sourced = page.locator('[data-media-provenance="sourced"]').filter({ hasText: 'Fixture Photographer' }).last();
  ok(`${theme}: /image searches real photos (no generation) and the card says Sourced with its credit`, await sourced.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
    && (await sourced.innerText()).startsWith('Sourced · Photo by') && !model.some(path => /image|video/.test(path)), model.join(' '));
  await sourced.scrollIntoViewIfNeeded();
  await shot('05-image-sourced');

  // 3. Removed commands typed in Chat: unavailable, nothing runs (no request, no card, no navigation, no search).
  const url = page.url(), count = await blocks(), calls = model.length + artifacts.length;
  const said = [];
  for (const name of REMOVED) {
    await composer().fill(`/${name} the sigmoid`);
    await composer().press('Enter');
    const line = notice.getByText(removedText(name), { exact: true });
    if (!await line.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) said.push(name);
    if (name === 'simplify') await shot('06-removed-simplify');
  }
  ok(`${theme}: each removed command typed in Chat says it is unavailable`, said.length === 0, said.join(' '));
  ok(`${theme}: and runs nothing: no request, no card, no navigation`, model.length + artifacts.length === calls && await blocks() === count && page.url() === url, model.slice(-3).join(' '));
  await composer().fill('/generate-image a watercolor mountain landscape');
  await composer().press('Enter');
  ok(`${theme}: /generate-image is refused while image generation is off`, await notice.getByText('Image generation is not available here. /image searches for real photos.').waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
    && model.length + artifacts.length === calls && await blocks() === count);
  await shot('07-generate-image-off');
  await dock.getByRole('button', { name: 'Dismiss' }).click().catch(() => {});

  // 4. Ctrl+K on the explanation card: its list, pills and refusals.
  const editor = page.locator('[data-inline-ai]');
  const field = page.locator('[data-inline-prompt]');
  const openCtrlK = async () => {
    if (await editor.count()) { await page.keyboard.press('Escape'); await editor.waitFor({ state: 'detached' }).catch(() => {}); }
    await page.locator('[data-block-id="k-exp"] [data-drag-zone]').first().click();
    await page.keyboard.press('Control+k');
    await editor.waitFor({ timeout: 10000 });
  };
  await openCtrlK();
  await field.fill('/');
  const options = await page.locator('[data-inline-command-option]').evaluateAll(nodes => nodes.map(node => node.dataset.inlineCommandOption));
  ok(`${theme}: Ctrl+K lists its retained commands, no removed one`, CTRLK.every(name => options.includes(name)) && options.every(name => CTRLK.includes(name) || name === 'motion'), options.join(' '));
  await shot('08-ctrlk-list');
  for (const [name, label] of [['code', 'Code'], ['image', 'Search images'], ['video', 'Generate video'], ['3d', '3D']]) {
    await field.fill(`/${name}`);
    await page.locator(`[data-inline-command-option="${name}"]`).click();
    const chosen = editor.locator(`[data-command-pill="${name}"]`);
    ok(`${theme}: Ctrl+K /${name} pill reads ${label}, no slash`, await chosen.waitFor({ timeout: 5000 }).then(() => true).catch(() => false) && (await chosen.innerText()).trim() === label);
    if (name === 'image') await shot('09-ctrlk-pill-image');
    await editor.getByRole('button', { name: `Remove ${label}`, exact: true }).click();
  }
  const refused = [];
  const sent = model.length;
  for (const name of [...REMOVED, 'generate-image']) {
    await field.fill(`/${name} x`);
    await field.press('Enter');
    const said = editor.locator(`[data-inline-unsupported="${name}"]`);
    const text = await said.waitFor({ timeout: 5000 }).then(() => said.innerText()).catch(() => '');
    if (text !== (name === 'generate-image' ? 'Image generation is not available here. /image searches for real photos.' : removedText(name))) refused.push(`${name}: ${text}`);
    if (name === 'compare') await shot('10-ctrlk-removed-compare');
  }
  ok(`${theme}: each removed command (and /generate-image) typed in Ctrl+K says it is unavailable`, refused.length === 0, refused.join(' | '));
  ok(`${theme}: and Ctrl+K sends nothing for them`, model.length === sent, model.slice(sent).join(' '));
  await page.keyboard.press('Escape');

  // 5. The Slash commands window.
  await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: 'Slash commands' }).click();
  const sheet = page.getByRole('dialog', { name: 'Slash commands' });
  await sheet.waitFor();
  const listed = await sheet.locator('[data-slash-help]').evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp));
  ok(`${theme}: the window lists every retained command and no removed one`, RETAINED.every(name => listed.includes(name)) && REMOVED.every(name => !listed.includes(name)), listed.join(' '));
  await sheet.locator('[data-slash-help="dive"]').click();
  ok(`${theme}: /dive says Open Rabbit Hole, opens, and what it needs selected`, (await sheet.locator('[data-slash-label]').innerText()) === 'Open Rabbit Hole' && (await sheet.locator('[data-slash-effect]').innerText()) === 'Opens a Rabbit Hole'
    && /selected card/.test(await sheet.locator('[data-slash-about]').innerText()));
  await shot('11-window-dive');
  await sheet.locator('[data-slash-help="image"]').click();
  ok(`${theme}: /image says Search images, Searches, Sourced`, (await sheet.locator('[data-slash-label]').innerText()) === 'Search images' && (await sheet.locator('[data-slash-effect]').innerText()) === 'Searches' && (await sheet.locator('[data-slash-media]').innerText()) === 'Sourced');
  await shot('12-window-image');
  await sheet.locator('[data-slash-help="video"]').click();
  ok(`${theme}: /video says Generate video, AI-generated, with its example`, (await sheet.locator('[data-slash-media]').innerText()) === 'AI-generated' && await sheet.getByText('e.g. /video raindrops falling into a pond').count() === 1);
  await sheet.locator('[data-slash-help="explain"]').click();
  await shot('13-window-explain');
  const posts = model.length + artifacts.length;
  await sheet.locator('[data-slash-use-example="explain"]').click();
  await sheet.waitFor({ state: 'detached', timeout: 5000 });
  await pill.waitFor({ timeout: 5000 });
  ok(`${theme}: Use example prepares an editable draft (pill and words) and sends nothing`, (await pill.innerText()).trim() === 'Add explanation' && await composer().inputValue() === 'how binary search works' && model.length + artifacts.length === posts);
  await shot('14-use-example-draft');
  await composer().fill('how merge sort works');
  ok(`${theme}: the draft is editable before sending`, await composer().inputValue() === 'how merge sort works' && model.length + artifacts.length === posts);
  await dock.getByRole('button', { name: 'Remove Add explanation', exact: true }).click();
  await composer().fill('');

  // 6. Saved content made before the cleanup still opens.
  await dock.locator('button[data-chat-history]').click();
  await page.locator(`[data-chat-history-row="${thread}"]`).click();
  const lines = dock.getByText('/simplify the masking step');
  ok(`${theme}: a saved conversation with /simplify and /deeper lines opens and shows them as text`, await lines.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
    && await dock.getByText('/deeper into the scaling').count() > 0 && await dock.getByText('Masking hides the later tokens from each position.').count() > 0);
  await shot('15-saved-conversation');
  ok(`${theme}: a /walkthrough card and a /compare table made before the cleanup still render`, await page.locator('[data-block-id="k-walk"]').getByText('Look up its row').count() > 0
    && await page.locator('[data-block-id="k-compare"]').getByText('Sigmoid vs tanh').count() > 0);
  await page.locator('[data-block-id="k-walk"]').scrollIntoViewIfNeeded();
  await shot('16-old-cards');
  const evidence = page.locator('[data-block-id="k-exp"] details[data-sources]');
  await evidence.locator('summary').click();
  ok(`${theme}: Sources & evidence opens on its card (what /source did)`, await evidence.evaluate(node => node.open) && await evidence.getByText('Freezing-point depression').count() > 0);
  await evidence.scrollIntoViewIfNeeded();
  await shot('17-sources-evidence');
  const paper = page.locator('[data-block-id="k-paper"]');
  ok(`${theme}: a paper card and its PDF still open`, await paper.locator('canvas, [data-pdf-page], img').first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false), await paper.innerText().catch(() => ''));
  await paper.scrollIntoViewIfNeeded();
  await shot('18-paper-card');

  // 7. The Library has no bar at all (owner, 2026-10-22: the composer is removed from Home, Library and Explore); it used to be
  // checked for having no slash commands, which went with the bar.
  await page.goto(`${BASE}/library`);
  await page.locator('main').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(500);
  ok(`${theme}: the Library has no bar, no composer and so no slash picker, Auto or command pill`, await page.locator('[data-agent-bar], main textarea, main [data-chat-composer], [role="listbox"]').count() === 0);
  await shot('19-library-no-bar');

  // 8. /dive <topic> opens a Rabbit Hole about it (light only: it leaves the canvas).
  if (theme === 'light') {
    await page.goto(`${BASE}/apps/${canvas.name}`);
    await composer().waitFor({ timeout: 30000 });
    await page.keyboard.press('Escape');
    // The hole tree loads after the canvas: /dive runs once the Rabbit Holes Map is there.
    await page.locator('[data-dive-navigator]').waitFor({ timeout: 30000 });
    await composer().fill('/dive how cells produce ATP');
    await composer().press('Enter');
    ok('light: typed /dive <topic> opens a Rabbit Hole about it', await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 15000 }).then(() => true).catch(() => false), page.url());
    await page.waitForTimeout(1200);
    await shot('20-dive-topic');
  }
  ok(`${theme}: no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}

await pass('light');
await pass('dark');
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
