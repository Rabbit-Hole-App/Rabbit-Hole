// The paid-generation confirmation (PaidConfirm in the Chat box's slash notice; brief section 3, clarification 9) in the
// Light and the Dark theme, against the LOCAL stack only. Generate is never clicked: no job starts, every model-capable
// request is aborted and counted. Per theme:
//   1. /cad shows Cancel and Generate in the slash notice;
//   2. at rest, each button's colours ARE the semantic tokens (Cancel: --color-surface, --color-ink, --color-line-strong;
//      Generate: --color-ink fill, --color-surface text), and each label clears 4.5:1 on its composited fill;
//   3. hovered, each label still clears 4.5:1 and Generate's fill differs from Cancel's;
//   4. keyboard focus draws a visible outline on each;
//   5. pressed (mouse held down, released elsewhere so nothing is clicked), each label still clears 4.5:1;
//   6. disabled, a button reads as disabled (opacity, no pointer) - PaidConfirm itself never disables its buttons.
// Before this change step 2 fails in Dark: the notice's hex blue tint matched index.css's `.dark [class*='bg-[#2383e2]']`
// re-pin, which turned --color-white (Cancel's bg-white) pure white under #d4d4d4 text (1.5:1).
// Usage: BASE=http://127.0.0.1:9161 SMALL_CP=http://127.0.0.1:9163 VARS=<cp .dev.vars> node e2e/paid-confirm-theme-check.mjs [shotsDir]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:9161';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:9163';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('paid-confirm-theme-check runs against the local stack only');
const OUT = process.argv[2] || 'paid-confirm-theme-shots';
mkdirSync(OUT, { recursive: true });
const vars = process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url);
const secret = readFileSync(vars, 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36);
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `pct-${run}@example.com`, secret }) })).json();
const created = await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie: `small_session=${session}`, origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Confirm colours ${run}` }) });
if (!created.ok) throw Error(`POST /api/canvases: HTTP ${created.status}`);
const canvas = await created.json();

const refused = [], outside = [], errors = [];
const MODEL = /^\/api\/(ask$|repositories\/[^/]+\/ask$|learn\/(ask|selection|board$|tutor\/|assess|grade|home-ask|image|inline\/|journey|scene|video|transcribe|tts|voice\/|dive|explore|course|cad\/))/;
const PROPOSAL = { result: 'paid_proposal', primitive: 'cad', message: 'This uses paid generation.', block: { type: 'cad', title: 'Bracket' } };
const router = async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== BASE && !['data:', 'blob:'].includes(url.protocol)) { outside.push(url.hostname); return route.abort(); }
  if (url.pathname === '/api/learn/artifact') return route.fulfill({ json: PROPOSAL });
  if (['/api/learn/tutor/next-steps', '/api/learn/next-steps'].includes(url.pathname)) return route.fulfill({ json: { options: [], suggestions: [], fingerprint: null } });
  if (MODEL.test(url.pathname) && request.method() !== 'GET') { refused.push(url.pathname); return route.abort(); }
  return route.fallback();
};

const THEMES = ['light', 'dark'];
const results = [];
const total = 12; // 6 steps per theme
const step = async (name, fn) => {
  try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
  catch (error) { results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message}`); }
};

// Every colour as the browser paints it: each ancestor's background composited from the root down on a 1x1 canvas (so a
// translucent tint counts), the text composited over that. Token values are resolved in the button's own cascade.
const paint = (button, tokens = []) => button.evaluate((node, names) => {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const read = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  const solo = css => { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return read(); };
  const chain = []; for (let n = node; n; n = n.parentElement) chain.unshift(n);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1, 1);
  for (const n of chain) { ctx.fillStyle = getComputedStyle(n).backgroundColor; ctx.fillRect(0, 0, 1, 1); }
  const bg = read();
  const style = getComputedStyle(node);
  ctx.fillStyle = style.color; ctx.fillRect(0, 0, 1, 1);
  const fg = read();
  return { bg, fg, own: { bg: solo(style.backgroundColor), fg: solo(style.color), border: solo(style.borderTopColor) },
    tokens: Object.fromEntries(names.map(name => [name, solo(style.getPropertyValue(name).trim())])),
    outline: { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }, opacity: Number(style.opacity), cursor: style.cursor };
}, tokens);
const luminance = channels => { const [r, g, b] = channels.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };
const readable = (name, p) => { const ratio = contrast(p.fg, p.bg); assert.ok(ratio >= 4.5, `${name}: ${ratio.toFixed(2)}:1 (text ${p.fg} on ${p.bg})`); return ratio; };
const same = (a, b, label) => assert.ok(a.every((c, i) => Math.abs(c - b[i]) <= 1), `${label}: ${a} is not the token ${b}`);

const browser = await chromium.launch();
for (const theme of THEMES) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: theme });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(value => { try { localStorage.setItem('small.theme', value); } catch { /* the default theme then */ } }, theme);
  await context.route('**/*', router);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(`${theme}: ${error.message}`));
  await page.goto(`${BASE}/apps/${canvas.name}`);
  await page.waitForSelector('[data-chat-pane] [data-chat-composer]', { timeout: 60000 });
  const cancel = page.locator('[data-chat-pane] [data-paid-cancel]'), generate = page.locator('[data-chat-pane] [data-paid-generate]');
  const notice = page.locator('[data-chat-pane] [data-slash-result]');
  const away = async () => { await page.mouse.move(5, 5); await page.locator('body').evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(150); };

  await step(`${theme}: /cad shows Cancel and Generate in the slash notice`, async () => {
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark', 'the theme class');
    const box = page.locator('[data-chat-pane] [data-chat-composer] textarea, [data-chat-pane] [data-chat-composer] input:not([type="file"])').first();
    await box.click(); await box.fill('/cad a 40 mm mounting bracket with two holes'); await page.waitForTimeout(150); await box.press('Enter');
    await generate.waitFor();
    assert.equal(await cancel.count(), 1);
    await notice.screenshot({ path: `${OUT}/${theme}-rest.png` });
  });

  await step(`${theme}: at rest the buttons are the semantic tokens and each label clears 4.5:1`, async () => {
    const tokens = ['--color-surface', '--color-ink', '--color-line-strong'];
    const c = await paint(cancel, tokens), g = await paint(generate, tokens);
    assert.ok(c.tokens['--color-surface'], '--color-surface is defined');
    same(c.own.bg, c.tokens['--color-surface'], 'Cancel fill'); same(c.own.fg, c.tokens['--color-ink'], 'Cancel text'); same(c.own.border, c.tokens['--color-line-strong'], 'Cancel border');
    same(g.own.bg, g.tokens['--color-ink'], 'Generate fill'); same(g.own.fg, g.tokens['--color-surface'], 'Generate text');
    console.log(`   ${theme} rest: Cancel ${readable('Cancel', c).toFixed(2)}:1, Generate ${readable('Generate', g).toFixed(2)}:1`);
  });

  await step(`${theme}: hovered, each label clears 4.5:1 and Generate stays distinct from Cancel`, async () => {
    await cancel.hover(); await page.waitForTimeout(250);
    const c = await paint(cancel);
    await cancel.screenshot({ path: `${OUT}/${theme}-cancel-hover.png` });
    await generate.hover(); await page.waitForTimeout(250);
    const g = await paint(generate);
    await notice.screenshot({ path: `${OUT}/${theme}-generate-hover.png` });
    assert.ok(contrast(g.bg, c.bg) >= 3, `Generate's fill ${g.bg} vs Cancel's ${c.bg}: ${contrast(g.bg, c.bg).toFixed(2)}:1`);
    console.log(`   ${theme} hover: Cancel ${readable('Cancel hover', c).toFixed(2)}:1, Generate ${readable('Generate hover', g).toFixed(2)}:1`);
    await away();
  });

  await step(`${theme}: keyboard focus draws a visible outline on each button`, async () => {
    await cancel.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); // a keyboard focus, so :focus-visible
    let p = await paint(cancel);
    assert.ok(p.outline.style !== 'none' && p.outline.width >= 1, `Cancel outline ${p.outline.style} ${p.outline.width}px`);
    await page.keyboard.press('Tab');
    assert.equal(await generate.evaluate(node => node === document.activeElement), true, 'Tab moves to Generate');
    p = await paint(generate);
    assert.ok(p.outline.style !== 'none' && p.outline.width >= 1, `Generate outline ${p.outline.style} ${p.outline.width}px`);
    await notice.screenshot({ path: `${OUT}/${theme}-generate-focus.png` });
    await away();
  });

  await step(`${theme}: pressed, each label clears 4.5:1 (released off the button, so nothing is clicked)`, async () => {
    const ratios = [];
    for (const [name, button] of [['Cancel', cancel], ['Generate', generate]]) {
      await button.hover(); await page.mouse.down(); await page.waitForTimeout(200);
      const p = await paint(button);
      if (name === 'Generate') await notice.screenshot({ path: `${OUT}/${theme}-generate-active.png` });
      await page.mouse.move(5, 5); await page.mouse.up();
      ratios.push(`${name} ${readable(`${name} pressed`, p).toFixed(2)}:1`);
    }
    assert.equal(await generate.count(), 1, 'still confirming: nothing was clicked');
    console.log(`   ${theme} pressed: ${ratios.join(', ')}`);
    await away();
  });

  await step(`${theme}: a disabled button reads as disabled`, async () => {
    // PaidConfirm never disables its buttons; this pins the shared Button's disabled state they inherit.
    await generate.evaluate(node => { node.disabled = true; });
    const p = await paint(generate);
    await notice.screenshot({ path: `${OUT}/${theme}-generate-disabled.png` });
    await generate.evaluate(node => { node.disabled = false; });
    assert.ok(p.opacity <= 0.6, `opacity ${p.opacity}`);
    assert.notEqual(p.cursor, 'pointer');
  });
  await context.close();
}
await browser.close();

console.log(`model-capable requests refused: ${refused.length}${refused.length ? ` (${[...new Set(refused)].join(', ')})` : ''}; outside hosts: ${outside.length}`);
if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} paid-confirm-theme checks passed`);
process.exit(passed === total && results.length === total && !refused.length && !errors.length ? 0 : 1);
