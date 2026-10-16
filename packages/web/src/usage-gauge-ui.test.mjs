// The canvas top bar's AI usage gauge, its popover and Settings > AI usage (owner D4 sections 1-3). UsageGauge.jsx is bundled
// with esbuild and rendered with react-dom/server against a store fed by a mocked GET /api/learn/usage, as answer-footer.test.mjs
// renders its footer. Opening, Escape, outside presses and focus need a browser: that wiring is pinned in source here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dir = mkdtempSync(join(tmpdir(), 'usage-gauge-')), outfile = join(dir, 'gauge.cjs');
await esbuild.build({
  stdin: { contents: "export { default as UsageGauge, UsageDetails, UsageSettings, popoverShift } from './UsageGauge.jsx'; export { createUsageStore } from './account-usage.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const body = (over = {}) => ({ enforced: false, currency: 'USD', period: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z',
  allowanceMicros: 50_000_000, usedMicros: 17_400_000, reservedMicros: 0, estimatedMicros: 0, remainingMicros: 32_600_000, ...over });
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
  assert.match(html, /<button type="button" data-usage-gauge="true" data-state="ok" title="AI allowance: \$32\.60 remaining\. Tracking only - limits are not enforced yet\." aria-label="AI allowance: \$32\.60 remaining\. Tracking only - limits are not enforced yet\." aria-haspopup="dialog" aria-expanded="false"/);
  assert.match(html, /lucide-gauge[^"]*text-pass/);
  assert.doesNotMatch(html, /lucide-sparkles|data-usage-popover/);
});

test('the gauge: red only for remaining 0 from the server', async () => {
  const html = gauge(await storeOf(200, body({ usedMicros: 50_000_000, remainingMicros: 0 })));
  assert.match(html, /data-state="empty" title="No AI allowance remaining\. Tracking only - limits are not enforced yet\."/);
  assert.match(html, /lucide-gauge[^"]*text-fail/);
});

test('the gauge: neutral while loading, when unavailable, on a failure and for a signed-out viewer', async () => {
  const cases = [
    ['loading', await storeOf(0), {}, 'Loading AI usage'],
    ['config', await storeOf(200, { enforced: false, unavailable: 'config' }), {}, 'AI usage unavailable'],
    ['accounting', await storeOf(503, { unavailable: 'accounting' }), {}, 'AI usage unavailable'],
    ['401', await storeOf(401, {}), {}, 'Sign in to see your AI allowance'],
    // A signed-out link viewer gets no personal allowance even when the store holds numbers from earlier.
    ['signed out', await storeOf(200, body()), { signedIn: false }, 'Sign in to see your AI allowance'],
  ];
  for (const [name, store, props, label] of cases) {
    const html = gauge(store, props);
    assert.match(html, new RegExp(`data-state="neutral" title="${label}" aria-label="${label}"`), name);
    assert.match(html, /lucide-gauge[^"]*text-ink-2/, name);
    assert.doesNotMatch(html, /\$\d/, `${name}: no amount`);
  }
});

test('the popover: allowance heading, remaining prominently, used of total, reset date, bar, the not-enforced note, View usage', () => {
  const html = details(ready());
  assert.match(html, /Monthly AI allowance/);
  assert.match(html, /data-usage-remaining="true" class="[^"]*text-2xl[^"]*text-ink">\$32\.60 <span[^>]*>remaining<\/span>/);
  assert.match(html, /data-usage-used[^>]*>\$17\.40 used of \$50\.00</);
  assert.match(html, /data-usage-reset[^>]*>Resets November 1 \(00:00 UTC\)</, 'the UTC date, and it says UTC');
  assert.match(html, /role="meter" aria-label="AI allowance used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="34" aria-valuetext="\$17\.40 of \$50\.00 used"/);
  assert.match(html, /data-usage-note[^>]*>Tracking only - limits are not enforced yet\.</);
  assert.match(html, /<button type="button" data-view-usage[^>]*>View usage<\/button>/);
  assert.doesNotMatch(html, /Reserved for processing|data-usage-bar-reserved/, 'no reserved line at zero');
  assert.doesNotMatch(html, /Upgrade|Buy|Subscribe|checkout/i, 'no purchase controls');
});

test('the popover: reserved shown apart, exhausted in words, enforced hides the note, allowance from the server', () => {
  const reserved = details(ready({ reserved: 500_000, remaining: 32_100_000 }));
  assert.match(reserved, /data-usage-reserved[^>]*>Reserved for processing: \$0\.50</);
  assert.match(reserved, /data-usage-bar-reserved/);
  assert.match(reserved, /aria-valuetext="\$17\.40 of \$50\.00 used, \$0\.50 reserved for processing"/);
  const empty = details(ready({ used: 50_000_000, remaining: 0 }));
  assert.match(empty, /text-fail">\$0\.00 <span/);
  assert.match(empty, /No AI allowance remaining\./);
  assert.doesNotMatch(details(ready({ enforced: true })), /data-usage-note/);
  assert.match(details(ready({ allowance: 80_000_000, remaining: 62_600_000 })), />\$17\.40 used of \$80\.00</);
});

test('requests with cost not yet known: one quiet line in the popover and Settings, a count and never $0, absent at 0 or missing', async () => {
  const two = details(ready({ unknownAttempts: 2 }));
  assert.match(two, /<p data-usage-unknown="true" class="text-xs text-ink-2">2 AI requests with cost not yet known<\/p>/);
  assert.equal(details(ready({ unknownAttempts: 1 })).match(/data-usage-unknown[^>]*>([^<]*)</)[1], '1 AI request with cost not yet known');
  for (const html of [details(ready({ unknownAttempts: 0 })), details(ready())]) assert.doesNotMatch(html, /data-usage-unknown|not yet known/);
  const withUnknown = settings(await storeOf(200, body({ unknownAttempts: 1, unknownReservedMicros: 0 })));
  assert.match(withUnknown, /data-usage-unknown[^>]*>1 AI request with cost not yet known</);
  assert.doesNotMatch(withUnknown.match(/data-usage-unknown[^>]*>[^<]*</)[0], /\$/);
  assert.doesNotMatch(settings(await storeOf(200, body())), /data-usage-unknown|not yet known/, 'a server without the field');
  assert.doesNotMatch(settings(await storeOf(200, body({ unknownAttempts: 0 }))), /data-usage-unknown/);
});

test('the popover: unavailable says so with no numbers; signed out has no numbers and no View usage', () => {
  const unavailable = details({ status: 'unavailable', reason: 'config' });
  assert.match(unavailable, /role="status"[^>]*>AI usage unavailable</);
  assert.match(unavailable, /data-view-usage/);
  assert.doesNotMatch(unavailable, /\$\d/);
  const out = details({ status: 'signed_out' });
  assert.match(out, />Sign in to see your AI allowance</);
  assert.doesNotMatch(out, /\$\d|data-view-usage/);
});

test('Settings > AI usage: allowance, used, remaining, next reset and the bar; reserved only when held; the note', async () => {
  const html = settings(await storeOf(200, body()));
  assert.match(html, /data-usage-settings/);
  assert.match(html, />AI usage</);
  assert.match(html, /across all your canvases/);
  assert.match(html, /data-usage-note[^>]*>Tracking only - limits are not enforced yet\.</);
  for (const [row, value] of [['Monthly allowance', '\\$50\\.00'], ['Used', '\\$17\\.40'], ['Remaining', '\\$32\\.60'], ['Next reset', 'November 1, 2026']])
    assert.match(html, new RegExp(`>${row}</div>[\\s\\S]*?>${value}</span>`), row);
  assert.match(html, /role="meter"/);
  assert.doesNotMatch(html, /Reserved for processing/);
  assert.match(settings(await storeOf(200, body({ reservedMicros: 1_250_000, remainingMicros: 31_350_000 }))), />Reserved for processing<\/div>[\s\S]*?>\$1\.25<\/span>/);
  const down = settings(await storeOf(503, { unavailable: 'accounting' }));
  assert.match(down, /role="status"[^>]*>AI usage unavailable</);
  assert.doesNotMatch(down, /\$\d/);
});

test('the popover wiring: opens from the button, refreshes on open, Escape and outside presses close, Escape restores focus', () => {
  const source = read('UsageGauge.jsx');
  assert.match(source, /onClick=\{\(\) => setOpen\(value => !value\)\}/, 'a native button: Enter and Space open it');
  assert.match(source, /if \(signedIn\) store\.refresh\(\); \/\/ opening is a refresh point/);
  assert.match(source, /panel\.current\?\.focus\(\);/, 'focus moves into the popover');
  assert.match(source, /const outside = event => \{ if \(!box\.current\?\.contains\(event\.target\)\) close\(false\); \};/);
  assert.match(source, /if \(event\.key === 'Escape'\) \{ event\.stopPropagation\(\); close\(true\); \}/);
  assert.match(source, /const close = useCallback\(restore => \{ setOpen\(false\); if \(restore\) trigger\.current\?\.focus\(\); \}, \[\]\);/);
  assert.match(source, /role="dialog" aria-label="Monthly AI allowance" tabIndex=\{-1\}/);
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

test('every canvas top bar carries the gauge; shared and member canvases show the viewer\'s own, and View usage reaches Settings', () => {
  assert.match(read('LearnPage.jsx'), /\{learnPreview && <UsageGauge \/>\}/);
  assert.match(read('SharedBoardPage.jsx'), /\{learnPreview && <UsageGauge signedIn=\{!!shared\.viewer\} onViewUsage=\{goToUsageSettings\} \/>\}/);
  assert.match(read('comments/MemberBoardPage.jsx'), /<UsageGauge onViewUsage=\{goToUsageSettings\} \/>/);
  const gaugeSource = read('UsageGauge.jsx');
  assert.match(gaugeSource, /new CustomEvent\('small:settings', \{ detail: \{ tab: 'usage' \} \}\)/);
  assert.match(gaugeSource, /window\.open\('\/apps\?settings=usage', '_blank', 'noopener'\)/);
  const sidebar = read('Sidebar.jsx');
  assert.match(sidebar, /\{learnPreview && <NavBtn id="usage" icon=\{Gauge\}>AI usage<\/NavBtn>\}/);
  assert.match(sidebar, /\{tab === 'usage' && learnPreview && <UsageSettings Heading=\{Heading\} \/>\}/);
  assert.match(sidebar, /asked = params\.get\('settings'\);\n    if \(asked && \/\^\[a-z-\]\{1,32\}\$\/\.test\(asked\)\) \{/);
  // The endpoint answers for the session only: the client never names a user.
  assert.doesNotMatch(read('account-usage.js'), /USAGE_PATH\s*\+|\?user|userId|user_id/);
});
