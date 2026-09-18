// Capture the shipped token-journey animation block as the visual baseline that
// Tasks 6-12 are each checked against. Same auth path as chat-block-check.mjs.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const base = process.env.SMALL_BASE || 'https://small-cp-dev.zeroshothq.workers.dev';
const domain = new URL(base).hostname;
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
if (!secret) throw new Error('SMALL_TEST_BYPASS missing from .env');
const login = await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'small-baseline-shot' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) });
if (!login.ok) throw new Error(`test session: HTTP ${login.status}`);
const { session } = await login.json();

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addCookies([{ name: 'small_session', value: session, domain, path: '/' }]);
const page = await context.newPage();
await page.goto(`${base}/apps/repo-06745f10-nanogpt?tab=learn`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
await page.locator('[aria-label="Insert lesson block"]').click();
await page.getByRole('menuitem', { name: 'Animation', exact: true }).click();
const node = canvas.locator('[data-block-id]').last();
await node.getByText('One token, all the way through').waitFor({ timeout: 5000 });
// A fixed, deterministic moment: every object on screen, nothing mid-tween.
await node.locator('input[aria-label="Animation time"]').fill('12.5');
await page.waitForTimeout(900);
await node.screenshot({ path: 'e2e/shots/token-journey-baseline.png' });
console.log('baseline captured at t=12.5s');
await browser.close();
