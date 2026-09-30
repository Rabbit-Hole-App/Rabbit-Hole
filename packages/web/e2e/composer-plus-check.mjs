import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// The Learn composer on the parallel clone (project Learn, karpathy/nanoGPT):
// the / picker's "More learning tools" section, View > Slash commands, and the
// composer's + menu - an attached image and an @-mentioned repository both
// reach the tutor. Two real model calls; no paid generation.
// usage: node e2e/composer-plus-check.mjs [screenshot dir]
const BASE = 'https://small-cp-dev-small-parallel.zeroshothq.workers.dev';
const APP = 'repo-06745f10-nanogpt';
const SHOTS = process.argv[2] || 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
const session = (await (await fetch(`${BASE}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'composer-plus' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.SMALL_TEST_BYPASS }) })).json()).session;

// A 64x64 solid red PNG, written by hand so the check needs no image library.
const png = () => {
  const crc = buf => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
  const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([Buffer.from(type), data])), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(64, 0); header.writeUInt32BE(64, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.concat(Array.from({ length: 64 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(64 * 3, Buffer.from([220, 20, 20]))])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
};
const imagePath = `${SHOTS}/red-square.png`;
writeFileSync(imagePath, png());

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const page = await context.newPage();
const asks = [];
// Each tutor request as sent: its content type and the host that answered
// (this dev clone, never the live worker), and its status. Answers are read
// from the chat cards: streamed bodies are unreliable to capture here.
page.on('response', response => {
  if (!/\/api\/learn\/(ask|selection)$/.test(new URL(response.url()).pathname)) return;
  asks.push({ status: response.status(), type: response.request().headers()['content-type'] || '', host: new URL(response.url()).host });
});
await page.goto(`${BASE}/apps/${APP}?tab=learn&board=plus-${Date.now().toString(36)}`);
const composer = page.locator('[data-learn-dock] [data-chat-composer]');
await composer.waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
const input = composer.locator('input:not([type="file"])');

// 1. The / picker: no /more row; More learning tools opens by click and by scrolling.
await input.fill('/');
const picker = page.locator('[data-slash-picker]');
await picker.waitFor();
ok('the picker has no /more row', await picker.locator('[data-slash-command="more"]').count() === 0);
const more = picker.locator('[data-slash-more]');
ok('More learning tools is a collapsed section', await more.count() === 1 && await more.getAttribute('aria-expanded') === 'false');
await more.click();
ok('clicking it opens the rest of the tools in place, in view', await more.getAttribute('aria-expanded') === 'true' && await picker.locator('[data-slash-command="walkthrough"]').count() === 1
  && await picker.evaluate(box => { const first = box.querySelector('[data-slash-more]').nextElementSibling || box.querySelector('[data-slash-more]'); const a = box.getBoundingClientRect(), b = first.getBoundingClientRect(); return b.top >= a.top - 1 && b.bottom <= a.bottom + 1; }));
await page.screenshot({ path: `${SHOTS}/picker-more-open.png` });
await more.click();
await picker.evaluate(box => { box.scrollTop = box.scrollHeight; box.dispatchEvent(new Event('scroll')); });
await page.waitForTimeout(300);
ok('scrolling to the bottom opens it too', await more.getAttribute('aria-expanded') === 'true');
await input.fill('');

// 2. View > Slash commands.
await page.getByRole('menubar', { name: 'Canvas menu' }).getByRole('menuitem', { name: 'View' }).click();
await page.getByRole('menuitem', { name: 'Slash commands' }).click();
const sheet = page.getByRole('dialog', { name: 'Slash commands' });
await sheet.waitFor();
const rows = await sheet.locator('[data-slash-help]').count();
ok('View > Slash commands lists the commands with examples', rows >= 20 && await sheet.getByText('e.g. /graph sigmoid').count() === 1, `${rows} commands`);
await sheet.screenshot({ path: `${SHOTS}/slash-commands-sheet.png` });
await page.keyboard.press('Escape');

// 3. + > Add images, PDFs, or CSVs: the tutor sees the image.
await composer.getByRole('button', { name: 'Add' }).dispatchEvent('mousedown');
const attach = page.getByRole('button', { name: /Add images, PDFs, or CSVs/ });
ok('+ > attach is enabled on project Learn', await attach.isEnabled());
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), attach.click()]);
await chooser.setFiles(imagePath);
await input.fill('What single colour fills the attached image? Reply with just the colour.');
await input.press('Enter');
const q1 = 'What single colour fills the attached image?';
const saw = await page.waitForFunction(q => /red/i.test(document.querySelector('[aria-label="Lesson canvas"]')?.innerText.split(q)[1] || ''), q1, { timeout: 90000 }).then(() => true).catch(() => false);
const first = asks[0] || {};
ok('the attachment travels as multipart to this dev clone (not live) and succeeds', first.status === 200 && first.type.includes('multipart/form-data') && first.host === new URL(BASE).host, `status ${first.status}, ${first.host}`);
ok('the tutor sees the image (it names red)', saw, ((await page.locator('[aria-label="Lesson canvas"]').innerText()).split(q1)[1] || '').replace(/\s+/g, ' ').slice(0, 60));

// 4. + > Mention an app: another repository reaches the tutor.
await page.waitForTimeout(2000);
await composer.getByRole('button', { name: 'Add' }).dispatchEvent('mousedown');
await page.getByRole('button', { name: 'Mention an app' }).click();
const suggestion = page.locator('button', { hasText: /^repo-/ }).first();
await suggestion.waitFor({ timeout: 20000 });
const names = await page.locator('button', { hasText: /^(repo-|[a-z])/ }).filter({ has: page.locator('svg') }).allInnerTexts();
const mentioned = (await suggestion.innerText()).trim();
ok('mentions offer other repositories only (never this chat itself)', !!mentioned && mentioned !== APP, mentioned);
await suggestion.dispatchEvent('mousedown');
await input.fill('Which files are in the repository I mentioned? One short line.');
await input.press('Enter');
// Read the answer from its chat card: the card holds exactly what the learner sees.
const answered = await page.waitForFunction(() => /README/i.test(document.querySelector('[aria-label="Lesson canvas"]')?.innerText.split('Which files are in the repository I mentioned?')[1] || ''), null, { timeout: 90000 }).then(() => true).catch(() => false);
const reply = (await page.locator('[aria-label="Lesson canvas"]').innerText()).split('Which files are in the repository I mentioned?')[1]?.replace(/\s+/g, ' ').slice(0, 140) || '';
ok('the mentioned repository reaches the tutor (it names a file from it)', answered, `${mentioned}: ${reply}`);
await page.screenshot({ path: `${SHOTS}/composer-plus.png` });
await browser.close();
process.exit(failed ? 1 : 0);
