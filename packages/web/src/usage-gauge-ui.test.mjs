// The canvas top bar's AI usage gauge, its popover and Settings > AI usage (owner D4 sections 1-3). UsageGauge.jsx is bundled
// with esbuild and rendered with react-dom/server against a store fed by a mocked GET /api/learn/usage, as answer-footer.test.mjs
// renders its footer. Opening, Escape, outside presses and focus need a browser: that wiring is pinned in source here.
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.TZ = 'America/Los_Angeles'; // the viewer's zone: 2026-11-01 00:00 UTC reads October 31, 5:00 PM PDT
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dir = mkdtempSync(join(tmpdir(), 'usage-gauge-')), outfile = join(dir, 'gauge.cjs');
await esbuild.build({
  stdin: { contents: "export { default as UsageGauge, UsageDetails, UsageSettings, popoverShift } from './UsageGauge.jsx'; export { default as BuyCreditsDialog } from './BuyCreditsDialog.jsx'; export { createUsageStore } from './account-usage.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const body = (over = {}) => ({ enforced: false, period: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z',
  allowanceCredits: 5000, usedCredits: 1740, reservedCredits: 0, estimatedCredits: 0, remainingCredits: 3260, ...over });
const storeOf = async (status, json) => {
  const store = B.createUsageStore({ load: async () => ({ status, json: async () => json }), target: null });
  if (status) await store.refresh();
  return store;
};
const gauge = (store, props = {}) => B.renderToStaticMarkup(B.createElement(B.UsageGauge, { store, ...props }));
const details = (state, props = {}) => B.renderToStaticMarkup(B.createElement(B.UsageDetails, { state, onViewUsage: () => {}, ...props }));
const Heading = ({ children }) => B.createElement('h2', null, children);
const settings = store => B.renderToStaticMarkup(B.createElement(B.UsageSettings, { Heading, store }));
const ready = over => ({ status: 'ready', usage: { allowance: 50_000_000, used: 17_400_000, reserved: 0, remaining: 32_600_000, resetsAt: '2026-11-01T00:00:00.000Z', period: '2026-10', enforced: false, ...over } });

test('the gauge: green with a balance, its words in the tooltip and the accessible name, a gauge icon, keyboard button', async () => {
  const html = gauge(await storeOf(200, body()));
  assert.match(html, /<button type="button" data-usage-gauge="true" data-state="ok" title="AI credits: 3,260 credits remaining\. Tracking only - limits are not enforced yet\." aria-label="AI credits: 3,260 credits remaining\. Tracking only - limits are not enforced yet\." aria-haspopup="dialog" aria-expanded="false"/);
  assert.match(html, /lucide-gauge[^"]*text-pass/);
  assert.doesNotMatch(html, /lucide-sparkles|data-usage-popover/);
});

test('the gauge: red only for remaining 0 from the server', async () => {
  const html = gauge(await storeOf(200, body({ usedCredits: 5000, remainingCredits: 0 })));
  assert.match(html, /data-state="empty" title="No AI credits remaining\. Tracking only - limits are not enforced yet\."/);
  assert.match(html, /lucide-gauge[^"]*text-fail/);
});

test('the gauge: neutral while loading, when unavailable, on a failure and for a signed-out viewer', async () => {
  const cases = [
    ['loading', await storeOf(0), {}, 'Loading AI usage'],
    ['config', await storeOf(200, { enforced: false, unavailable: 'config' }), {}, 'AI usage unavailable'],
    ['accounting', await storeOf(503, { unavailable: 'accounting' }), {}, 'AI usage unavailable'],
    ['401', await storeOf(401, {}), {}, 'Sign in to see your AI credits'],
    // A signed-out link viewer gets no personal allowance even when the store holds numbers from earlier.
    ['signed out', await storeOf(200, body()), { signedIn: false }, 'Sign in to see your AI credits'],
  ];
  for (const [name, store, props, label] of cases) {
    const html = gauge(store, props);
    assert.match(html, new RegExp(`data-state="neutral" title="${label}" aria-label="${label}"`), name);
    assert.match(html, /lucide-gauge[^"]*text-ink-2/, name);
    assert.doesNotMatch(html, /\$\d|\d credit/, `${name}: no amount`);
  }
});

test('the popover: allowance heading, remaining prominently, used of total, reset date, bar, the not-enforced note, View usage', () => {
  const html = details(ready());
  assert.match(html, />AI credits</);
  assert.match(html, /data-usage-remaining="true" class="[^"]*text-2xl[^"]*text-ink">3,260 credits <span[^>]*>remaining<\/span>/);
  assert.match(html, /data-usage-every[^>]*>5,000 AI credits every month</);
  assert.match(html, /data-usage-used[^>]*>1,740 credits used</);
  assert.match(html, /data-usage-reset[^>]*>Renews on October 31, 5:00 PM PDT</, 'the instant in the viewer own zone, zone named');
  assert.match(html, /role="meter" aria-label="AI credits used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="34" aria-valuetext="1,740 credits of 5,000 credits used"/);
  assert.doesNotMatch(html, /\$/, 'credits only, never dollars (owner messages 32-33)');
  assert.match(html, /data-usage-note[^>]*>Tracking only - limits are not enforced yet\.</);
  assert.match(html, /<button type="button" data-view-usage[^>]*>View usage<\/button>/);
  assert.doesNotMatch(html, /Temporarily reserved|data-usage-bar-reserved/, 'no reserved line at zero');
  // Buy credits (owner, 2026-10-29) replaced "no purchase controls": one Buy credits button, still no plan or subscription.
  assert.match(html, /<button type="button" data-buy-credits[^>]*>Buy credits<\/button>/);
  assert.doesNotMatch(html, /Upgrade|Subscribe|checkout/i, 'no plan or subscription controls');
});

test('the popover: reserved shown apart, exhausted in words, enforced hides the note, allowance from the server', () => {
  const reserved = details(ready({ reserved: 500_000, remaining: 32_100_000 }));
  assert.match(reserved, /data-usage-reserved[^>]*>Temporarily reserved: 50 credits</);
  assert.match(reserved, /data-usage-bar-reserved/);
  assert.match(reserved, /aria-valuetext="1,740 credits of 5,000 credits used, 50 credits temporarily reserved"/);
  const empty = details(ready({ used: 50_000_000, remaining: 0 }));
  assert.match(empty, /text-fail">0 credits <span/);
  assert.match(empty, /No AI credits remaining\./);
  assert.doesNotMatch(details(ready({ enforced: true })), /data-usage-note/);
  assert.match(details(ready({ allowance: 80_000_000, remaining: 62_600_000 })), />8,000 AI credits every month</);
});

test('requests that ended without a confirmed cost: one quiet line in the popover and Settings, a count and never $0, absent at 0 or missing', async () => {
  const two = details(ready({ unknownAttempts: 2 }));
  assert.match(two, /<p data-usage-unknown="true" class="text-xs text-ink-2">2 AI requests ended without a confirmed cost and were not charged<\/p>/);
  assert.equal(details(ready({ unknownAttempts: 1 })).match(/data-usage-unknown[^>]*>([^<]*)</)[1], '1 AI request ended without a confirmed cost and was not charged');
  for (const html of [details(ready({ unknownAttempts: 0 })), details(ready())]) assert.doesNotMatch(html, /data-usage-unknown|not yet known/);
  const withUnknown = settings(await storeOf(200, body({ unknownAttempts: 1 })));
  assert.match(withUnknown, /data-usage-unknown[^>]*>1 AI request ended without a confirmed cost and was not charged</);
  assert.doesNotMatch(withUnknown.match(/data-usage-unknown[^>]*>[^<]*</)[0], /\$/);
  assert.doesNotMatch(settings(await storeOf(200, body())), /data-usage-unknown|not yet known/, 'a server without the field');
  assert.doesNotMatch(settings(await storeOf(200, body({ unknownAttempts: 0 }))), /data-usage-unknown/);
});

test('the popover: unavailable says so with no numbers; signed out has no numbers and no View usage', () => {
  const unavailable = details({ status: 'unavailable', reason: 'config' });
  assert.match(unavailable, /role="status"[^>]*>AI usage unavailable</);
  assert.match(unavailable, /data-view-usage/);
  assert.doesNotMatch(unavailable, /\$\d|\d credit/);
  const out = details({ status: 'signed_out' });
  assert.match(out, />Sign in to see your AI credits</);
  assert.doesNotMatch(out, /\$\d|\d credit|data-view-usage|data-buy-credits/);
});

test('Settings > AI usage: allowance, used, remaining, next reset and the bar; reserved only when held; the note', async () => {
  const html = settings(await storeOf(200, body()));
  assert.match(html, /data-usage-settings/);
  assert.match(html, />AI usage</);
  assert.match(html, /across all your canvases/);
  assert.match(html, /<button[^>]*data-buy-credits="true"[^>]*>Buy credits<\/button>/, 'Buy credits beside the usage, which stays');
  assert.doesNotMatch(html, /data-buy-credits-dialog/, 'the dialog opens only from the button');
  assert.match(html, /data-usage-note[^>]*>Tracking only - limits are not enforced yet\.</);
  for (const [row, value] of [['Monthly credits', '5,000 AI credits every month'], ['Used', '1,740 credits'], ['Remaining', '3,260 credits'], ['Renewal', 'Renews on October 31, 5:00 PM PDT']])
    assert.match(html, new RegExp(`>${row}</div>[\\s\\S]*?>${value}</span>`), row);
  assert.match(html, /role="meter"/);
  assert.doesNotMatch(html, /Temporarily reserved/);
  assert.match(settings(await storeOf(200, body({ reservedCredits: 125, remainingCredits: 3135 }))), />Temporarily reserved<\/div>[\s\S]*?>125 credits<\/span>/);
  assert.doesNotMatch(html, /\$/, 'credits only, never dollars (owner messages 32-33)');
  const down = settings(await storeOf(503, { unavailable: 'accounting' }));
  assert.match(down, /role="status"[^>]*>AI usage unavailable</);
  assert.doesNotMatch(down, /\$\d|\d credit/);
});

test('the popover wiring: opens from the button, refreshes on open, Escape and outside presses close, Escape restores focus', () => {
  const source = read('UsageGauge.jsx');
  assert.match(source, /onClick=\{\(\) => setOpen\(value => !value\)\}/, 'a native button: Enter and Space open it');
  assert.match(source, /if \(signedIn\) store\.refresh\(\); \/\/ opening is a refresh point/);
  assert.match(source, /panel\.current\?\.focus\(\);/, 'focus moves into the popover');
  assert.match(source, /const outside = event => \{ if \(!box\.current\?\.contains\(event\.target\)\) close\(false\); \};/);
  assert.match(source, /if \(event\.key === 'Escape'\) \{ event\.stopPropagation\(\); close\(true\); \}/);
  assert.match(source, /const close = useCallback\(restore => \{ setOpen\(false\); if \(restore\) trigger\.current\?\.focus\(\); \}, \[\]\);/);
  assert.match(source, /role="dialog" aria-label="AI credits" tabIndex=\{-1\}/);
  assert.match(source, /absolute top-full right-0 z-50 mt-2 w-72 max-w-\[calc\(100vw-1\.5rem\)\] rounded-xl border border-line bg-white p-3 shadow-pop/, 'the top bar popover styling, narrow-screen safe');
  // Settings refreshes on open, once: not a second request on top of the first load the hook has just started.
  assert.match(source, /useEffect\(\(\) => \{ if \(store\.getSnapshot\(\)\.status !== 'loading'\) store\.refresh\(\); \}, \[store\]\);/);
});

test('the popover stays on screen: right-aligned under the gauge, slid inside a 12px gutter on a narrow or wrapped top bar', () => {
  assert.equal(B.popoverShift(1400, 288, 1440), 0, 'desktop: right edges aligned');
  assert.equal(B.popoverShift(259, 288, 390), 41, 'a phone with the gauge left of centre: slides right to x 12');
  assert.equal(B.popoverShift(400, 288, 390), -22, 'never past the right gutter');
  assert.equal(B.popoverShift(300, 288, 300), 0, 'too narrow for both gutters: the left one wins');
  assert.match(read('UsageGauge.jsx'), /style=\{shift \? \{ right: -shift \} : undefined\}/);
});

test('the owner and member canvas top bars carry the gauge, the shared header does not (owner, 2026-10-22), and View usage reaches Settings', () => {
  assert.match(read('LearnPage.jsx'), /\{learnPreview && <UsageGauge \/>\}/);
  assert.doesNotMatch(read('SharedBoardPage.jsx'), /UsageGauge/, 'no usage meter in the shared header');
  assert.match(read('comments/MemberBoardPage.jsx'), /<UsageGauge onViewUsage=\{goToUsageSettings\} \/>/);
  const gaugeSource = read('UsageGauge.jsx');
  assert.match(gaugeSource, /new CustomEvent\('small:settings', \{ detail: \{ tab: 'usage' \} \}\)/);
  assert.match(gaugeSource, /window\.open\('\/apps\?settings=usage', '_blank', 'noopener'\)/);
  const sidebar = read('Sidebar.jsx');
  // Rabbit Hole's Settings (owner L11): the AI usage pane is in the settings model and RabbitHoleSettings renders it.
  assert.match(read('settings-model.js'), /\{ id: 'usage', title: 'AI usage' \}/);
  assert.match(read('RabbitHoleSettings.jsx'), /\{tab === 'usage' && <UsageSettings Heading=\{Heading\} \/>\}/);
  assert.match(sidebar, /asked = params\.get\('settings'\);\n    if \(asked && \/\^\[a-z-\]\{1,32\}\$\/\.test\(asked\)\) \{/);
  // The endpoint answers for the session only: the client never names a user.
  assert.doesNotMatch(read('account-usage.js'), /USAGE_PATH\s*\+|\?user|userId|user_id/);
});

test('Buy credits (owner, 2026-10-29): one dialog, $20 picked, the total in dollars and no credits figure, Buy, Cancel and Close', () => {
  const html = B.renderToStaticMarkup(B.createElement(B.BuyCreditsDialog, { onClose: () => {} }));
  assert.match(html, /role="dialog" aria-modal="true" aria-label="Buy credits"/);
  assert.match(html, />Buy credits</);
  assert.match(html, /role="radiogroup" aria-label="Amount"/);
  const options = [...html.matchAll(/role="radio" aria-checked="(true|false)" data-buy-amount="([^"]+)"[^>]*>([^<]*)</g)].map(m => [m[2], m[1], m[3]]);
  assert.deepEqual(options, [['20', 'true', '$20'], ['50', 'false', '$50'], ['100', 'false', '$100'], ['other', 'false', 'Other amount']]);
  assert.match(html, /data-buy-total[^>]*>Total: \$20\.00</);
  assert.doesNotMatch(html, /data-buy-other/, 'the USD box appears only for Other amount');
  assert.doesNotMatch(html, /\d[\d,]* (AI )?credits?\b/i, 'no dollars-to-credits conversion');
  assert.match(html, /aria-label="Close" title="Close"/);
  assert.match(html, />Cancel<\/button>/);
  assert.match(html, /<button[^>]*>Buy<\/button>/);
  assert.doesNotMatch(html, /\.\.\.|…/, 'no ellipsis');
});

test('Buy credits wiring: one handler that only says coming soon, Buy disabled while invalid, focus in and back, both entry points', () => {
  const dialog = read('BuyCreditsDialog.jsx'), gauge = read('UsageGauge.jsx');
  assert.match(dialog, /const amount = pick === 'other' \? purchaseAmount\(other\) : pick;/);
  assert.match(dialog, /confirmDisabled=\{amount == null\}/);
  assert.match(dialog, /onConfirm=\{\(\) => \{ if \(amount != null\) setNotice\(checkoutCredits\(amount\)\); \}\}/);
  assert.match(dialog, /onCancel=\{onClose\}/, 'Cancel, Escape and the backdrop close it');
  assert.match(dialog, /aria-label="Close" title="Close" onClick=\{onClose\}/);
  assert.match(dialog, /\{pick === 'other' && \(/);
  assert.match(dialog, /box\.current\?\.querySelector\('\[aria-checked="true"\]'\)\?\.focus\(\);/, 'focus moves into the dialog');
  assert.match(dialog, /return \(\) => \{ if \(opener\?\.isConnected\) opener\.focus\(\); \};/, 'and back to what opened it');
  assert.doesNotMatch(dialog, /fetch\(|api\(|refresh/, 'no network call and no credit change');
  // Both entry points render the same dialog; Settings in place (its Escape defers to a dialog inside it), the gauge portaled.
  assert.match(gauge, /onBuyCredits=\{\(\) => \{ close\(true\); setBuying\(true\); \}\}/);
  assert.match(gauge, /\{buying && createPortal\(<BuyCreditsDialog onClose=\{\(\) => setBuying\(false\)\} \/>, document\.body\)\}/);
  assert.match(gauge, /\{buying && <BuyCreditsDialog onClose=\{\(\) => setBuying\(false\)\} \/>\}/);
  assert.equal(gauge.match(/<BuyCreditsDialog /g).length, 2);
});
