import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Every Learn chat shows an answer as one block with one copy icon - no
// per-paragraph blocks and no ask-about-this-block icon. Checked on the
// repository page's Learn chat with a two-paragraph stubbed answer (no model
// calls). Parallel clone only. Prints no secrets.
// usage: node e2e/learn-chat-one-block.mjs [screenshot dir]
const BASE = process.env.BASE || 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const SHOTS = process.argv[2] || null;
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'one-block-check' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;
const apps = await (await fetch(`${BASE}/api/apps`, { headers: { Cookie: `small_session=${session}`, 'User-Agent': 'one-block-check' } })).json();
const repository = (apps.apps || []).find(app => app.kind === 'repository');
if (!repository) { console.log('✗ no repository app for this login on the dev database'); process.exit(1); }

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
await page.route('**/api/learn/ask', route => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ['First paragraph of the answer.\n\n', 'Second paragraph of the answer.'].map(text => `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`).join('') + 'event: done\ndata: {}\n\n' }));
await page.goto(`${BASE}/apps/${encodeURIComponent(repository.name)}`);
const chat = page.getByRole('complementary', { name: 'Repository Graph Agent' });
const composer = chat.locator('[data-chat-composer] input:not([type="file"]), [data-chat-composer] textarea').first();
await composer.waitFor({ timeout: 60000 });
await composer.fill('explain the model');
await composer.press('Enter');
await chat.getByText('Second paragraph of the answer.').waitFor({ timeout: 15000 });
await page.waitForTimeout(500);
const copies = await chat.getByRole('button', { name: /^Copy answer/ }).count(), askAbout = await chat.getByRole('button', { name: /^Ask about answer block/ }).count();
check('a two-paragraph answer is one block with one copy icon and no ask-about icon', copies === 1 && askAbout === 0, `${copies} copy, ${askAbout} ask-about`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/repository-chat.png` });
await browser.close();
process.exitCode = results.every(result => result.ok) ? 0 : 1;
