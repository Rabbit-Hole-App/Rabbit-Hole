// Release B lane B1 (C:/s/spec/rel-b.md; owner decisions 1A, 2A, 4A and A4, 2026-10-16), the canvas Chat composer against
// the LOCAL stack only: the / picker lists the shared registry (a Search section with /youtube, /arxiv and /wikipedia; no
// /paper row; /video "Generate video"), a typed and a picked command become the same CommandPill, the pill's x keeps the
// text, and a source command opens the source finder with its query while the composer keeps its draft: closed with
// nothing added, the draft and focus come back; after a result is added the command line clears. A typed /paper still opens
// the arXiv search. Search answers come from a route in this check: no Exa call, no model call, nothing sent to the Tutor.
// usage: BASE=http://127.0.0.1:<app> SMALL_CP=http://127.0.0.1:<cp> TEST_BYPASS_SECRET=<that stack's> node e2e/slash-core-check.mjs [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('slash-core-check runs against a local stack only: set BASE');
const CP = process.env.SMALL_CP, secret = process.env.TEST_BYPASS_SECRET;
if (!CP || !secret) throw Error('set SMALL_CP and TEST_BYPASS_SECRET for the local stack');
const OUT = process.argv[2] || 'slash-core-shots';
mkdirSync(OUT, { recursive: true });
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `slash-core-${Date.now().toString(36)}@example.com`, secret }) })).json();
const cookie = `small_session=${session}`;
const root = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Slash core check' }) })).json();

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
// What the finder searched, and anything that would reach the Tutor or a model: a source command must send none.
const searches = [], tutor = [];
await context.route('**/api/learn/search?**', route => {
  const url = new URL(route.request().url());
  const source = url.searchParams.get('source'), q = url.searchParams.get('q');
  searches.push(`${source}:${q}`);
  const results = source === 'youtube'
    ? [{ key: 'yt1', title: 'Attention in transformers, visually', subtitle: 'A channel', why: 'Draws attention step by step.', item: { videoId: 'eMlx5fFNoYc', title: 'Attention in transformers, visually' } }]
    : [{ key: 'ax1', title: 'Attention Is All You Need', subtitle: 'Vaswani et al.', exact: true, why: 'The paper itself.', item: { id: '1706.03762', title: 'Attention Is All You Need' } }];
  return route.fulfill({ json: { results } });
});
await context.route(/\/api\/learn\/(tutor\/plan|ask|artifact|selection)(\?|$)/, route => { tutor.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 500, json: { error: 'not in this check' } }); });
await context.route('**/main/thumbnail', route => (route.request().method() === 'PUT' ? route.fulfill({ status: 204 }) : route.continue()));
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message.slice(0, 160)));
await page.goto(`${BASE}/apps/${root.name}`);
await page.waitForSelector('[data-tool-gutter]', { timeout: 60000 });
const dock = page.locator('[data-chat-pane]');
const composer = () => page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"]):not([data-slash-search])').first();
await composer().waitFor({ timeout: 30000 });
const picker = dock.locator('[data-slash-picker]');
const pill = dock.locator('[data-command-pill]');
const finder = page.getByRole('dialog', { name: 'Search' });
const focused = () => composer().evaluate(node => node === document.activeElement);

// 1. The picker reads the shared registry.
await composer().click();
await composer().fill('/');
await picker.waitFor();
const rows = await picker.locator('[data-slash-command]').evaluateAll(nodes => nodes.map(node => node.dataset.slashCommand));
ok('the picker has a Search section with /youtube, /arxiv and /wikipedia, in that order', await picker.getByText('Search', { exact: true }).count() === 1
  && rows.indexOf('youtube') >= 0 && rows.indexOf('youtube') < rows.indexOf('arxiv') && rows.indexOf('arxiv') < rows.indexOf('wikipedia'), rows.join(' '));
ok('their lines read Search YouTube, Search arXiv, Search Wikipedia', await picker.locator('[data-slash-command="youtube"]').innerText().then(t => t.includes('Search YouTube'))
  && await picker.locator('[data-slash-command="arxiv"]').innerText().then(t => t.includes('Search arXiv')) && await picker.locator('[data-slash-command="wikipedia"]').innerText().then(t => t.includes('Search Wikipedia')));
ok('no /paper row: /arxiv is the one listed paper search', !rows.includes('paper'));
await page.screenshot({ path: `${OUT}/01-picker-search-section.png` });
await composer().fill('/vid');
ok('/video reads Generate video', await picker.locator('[data-slash-command="video"]').innerText().then(t => t.includes('Generate video')));
await composer().fill('/pa');
ok('typing /pa offers no /paper', await picker.locator('[data-slash-command="paper"]').count() === 0);
await composer().fill('');

// 2. Picked and typed commands are the same pill; its x keeps the text.
await composer().fill('why softmax');
await dock.getByRole('button', { name: 'Commands' }).click();
await dock.locator('[data-slash-search]').pressSequentially('add an expl');
await dock.locator('[data-slash-search]').press('Enter');
await pill.waitFor();
// The pill reads the command's label, never /name (owner, 2026-10-20).
ok('picking /explain shows the Explain pill and keeps the text', await pill.getAttribute('data-command-pill') === 'explain' && (await pill.innerText()).trim() === 'Explain' && await composer().inputValue() === 'why softmax', `${await pill.getAttribute('data-command-pill')} ${JSON.stringify(await pill.innerText())} / ${await composer().inputValue()}`);
await page.screenshot({ path: `${OUT}/02-explain-pill.png` });
await dock.getByRole('button', { name: 'Remove Explain', exact: true }).click();
ok('Remove Explain drops the pill and keeps the text', await pill.count() === 0 && await composer().inputValue() === 'why softmax');
await composer().fill('/explain ');
await pill.waitFor();
ok('typing /explain makes the same pill', await pill.getAttribute('data-command-pill') === 'explain' && (await pill.innerText()).trim() === 'Explain' && await dock.getByRole('button', { name: 'Remove Explain', exact: true }).count() === 1);
await dock.getByRole('button', { name: 'Remove Explain', exact: true }).click();
await composer().fill('');

// 3. A source command opens the finder with its query; the draft waits for the finder.
await composer().fill('/youtube ');
await pill.waitFor();
ok('typing /youtube makes its pill, Search YouTube, Remove Search YouTube', await pill.getAttribute('data-command-pill') === 'youtube' && (await pill.innerText()).trim() === 'Search YouTube' && await dock.getByRole('button', { name: 'Remove Search YouTube', exact: true }).count() === 1);
await composer().fill('attention');
await composer().press('Enter');
await finder.waitFor({ timeout: 10000 });
await finder.getByText('Attention in transformers, visually').waitFor({ timeout: 10000 });
ok('the finder opens on YouTube with the query and searches at once', await finder.getByLabel('Search in').inputValue() === 'youtube' && await finder.getByRole('textbox').inputValue() === 'attention' && searches.at(-1) === 'youtube:attention', searches.join(' '));
await page.screenshot({ path: `${OUT}/03-youtube-finder.png` });
ok('the composer keeps its draft while the finder is open', await pill.getAttribute('data-command-pill') === 'youtube' && await composer().inputValue() === 'attention');
await page.keyboard.press('Escape');
await finder.waitFor({ state: 'detached' });
await page.waitForFunction(() => document.activeElement?.closest?.('[data-chat-composer]'), null, { timeout: 5000 }).catch(() => {});
ok('closed with nothing added: the same pill and text, focused', await pill.getAttribute('data-command-pill') === 'youtube' && await composer().inputValue() === 'attention' && await focused());
await page.screenshot({ path: `${OUT}/04-draft-restored.png` });
const blocks = () => page.locator('[data-block-id]:not([data-chat-block])').count();
const before = await blocks();
await composer().press('Enter');
await finder.getByText('Attention in transformers, visually').waitFor({ timeout: 10000 });
await finder.getByText('Attention in transformers, visually').click();
// Release B lane B3 (owner decision 4A): a click previews the result; only Add to canvas adds it.
await finder.getByRole('button', { name: 'Add to canvas' }).click();
await finder.waitFor({ state: 'detached' });
await page.waitForFunction(n => document.querySelectorAll('[data-block-id]:not([data-chat-block])').length > n, before, { timeout: 10000 }).catch(() => {});
ok('adding a result puts the card on the canvas and clears the command line', await blocks() > before && await pill.count() === 0 && await composer().inputValue() === '');

// 4. /arxiv takes an ID and previews it; a typed /paper still opens the arXiv search.
await composer().fill('/arxiv 1706.03762');
await composer().press('Enter');
await finder.getByText('Attention Is All You Need').waitFor({ timeout: 10000 });
ok('/arxiv <id> opens the finder on arXiv with the ID, previewed before adding', await finder.getByLabel('Search in').inputValue() === 'arxiv' && searches.at(-1) === 'arxiv:1706.03762');
await page.keyboard.press('Escape');
await finder.waitFor({ state: 'detached' });
ok('closed: the typed line comes back as typed', await pill.count() === 0 && await composer().inputValue() === '/arxiv 1706.03762');
await composer().fill('/paper attention mechanisms');
await composer().press('Enter');
await finder.waitFor({ timeout: 10000 });
ok('a typed /paper <topic> still opens the arXiv search', searches.at(-1) === 'arxiv:attention mechanisms');
await page.keyboard.press('Escape');
await finder.waitFor({ state: 'detached' });

ok('no source command reached the Tutor or a model', tutor.length === 0, tutor.join(' '));
ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
