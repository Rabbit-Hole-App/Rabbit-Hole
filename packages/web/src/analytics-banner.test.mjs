// The consent banner's persistence (AN-1) and the landing page's hidden-by-flag state (AN-2), release 142. Real banner and consent modules on a linkedom document;
// two "tabs" share one storage object exactly as two tabs of one browser profile do, and a private window is a storage object nobody else holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
import { BANNER_TEXT, BANNER_UPDATE_TEXT } from './analytics-copy.js';
import { CONSENT_KEY, CONSENT_VERSION_KEY, consentState, setConsent } from './analytics-consent.js';

// The banner imports a stylesheet and analytics-config.js reads Vite's import.meta.env; node has neither, so both are stood in for at load time.
register('data:text/javascript,' + encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  const loaded = await next(url, context);
  if (!url.endsWith('/analytics-config.js')) return loaded;
  const env = '({ VITE_POSTHOG_TOKEN: "phc_testtoken0000000000000000000000000000000000", VITE_POSTHOG_HOST: "https://us.i.posthog.com", VITE_ANALYTICS_ENV: "test" })';
  return { ...loaded, source: String(loaded.source).replaceAll('import.meta.env', env) };
}`));

const CONFIG = { token: 'phc_testtoken0000000000000000000000000000000000', host: 'https://us.i.posthog.com', env: 'test' };
const memory = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return { getItem: k => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), get length() { return data.size; }, key: i => [...data.keys()][i] ?? null };
};
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); }, length: 0, key: () => null };
let tabs = 0;
// A page load: its own document and its own copy of the banner module (the "mounted" flag is per page load), on the browser's storage.
async function load(localStorage, navigator = {}) {
  const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
  const target = Object.assign(new EventTarget(), { localStorage, document, navigator, location: { origin: 'https://digrabbithole.com', pathname: '/b/token', protocol: 'https:' } });
  const { mountConsentBanner } = await import(`./analytics-banner.js?load=${++tabs}`);
  mountConsentBanner(target, CONFIG);
  return { target, document, banner: () => document.querySelector('[data-analytics-banner]'), press: choice => document.querySelector(`[data-analytics-choose="${choice}"]`).dispatchEvent(new window.Event('click')) };
}
const storageEvent = key => Object.assign(new Event('storage'), { key });

test('AN-1: with no saved choice a page load opens the banner, every time: a private window starts with empty storage', async () => {
  for (let i = 0; i < 3; i++) {
    const page = await load(memory());
    assert.ok(page.banner(), `load ${i + 1}`);
    assert.equal(page.banner().querySelector('p').textContent.startsWith(BANNER_TEXT), true);
  }
});

test('AN-1: Reject optional once, and a new tab or page load on the same site never opens the banner again', async () => {
  const storage = memory();
  const first = await load(storage);
  assert.ok(first.banner());
  first.press('rejected');
  assert.equal(first.banner(), null, 'the answer closes it');
  assert.equal(storage.getItem(CONSENT_KEY), 'rejected');
  for (let i = 0; i < 3; i++) assert.equal((await load(storage)).banner(), null, `new load ${i + 1}`);
});

test('AN-1: Accept (this version) is remembered the same way, and a withdrawn choice stays an answer', async () => {
  const storage = memory();
  (await load(storage)).press('accepted');
  assert.equal(storage.getItem(CONSENT_VERSION_KEY), '2');
  assert.equal((await load(storage)).banner(), null);
  setConsent({ localStorage: storage }, 'rejected');
  assert.equal((await load(storage)).banner(), null);
});

test('AN-1: an answer in one tab closes the banner already open in another (storage event) and it does not come back', async () => {
  const storage = memory();
  const open = await load(storage), other = await load(storage);
  assert.ok(open.banner() && other.banner());
  other.press('rejected');
  open.target.dispatchEvent(storageEvent(CONSENT_KEY)); // what the browser sends the tabs that did not make the change
  assert.equal(open.banner(), null);
  open.target.dispatchEvent(storageEvent(null));
  assert.equal(open.banner(), null, 'a later storage event with the answer saved does not reopen it');
});

test('AN-1: a published /b canvas page runs this same banner on the same origin as the app (one entry, main.jsx)', () => {
  const main = readFileSync(new URL('./main.jsx', import.meta.url), 'utf8');
  const start = main.indexOf('if (learnPreview && !embedded) startAppAnalytics();');
  assert.ok(start > 0, 'startAppAnalytics runs for every non-embedded page');
  assert.ok(main.indexOf('SharedBoardPage', start) > start, '/b/<token> renders inside that same entry, after analytics starts');
  assert.match(readFileSync(new URL('./analytics-config.js', import.meta.url), 'utf8'), /startAppAnalytics = \(\) => \{.*mountConsentBanner\(window, ANALYTICS_CONFIG\)/);
});

test('AN-1: an acceptance from before version 2 asks once, with the update words, and stops after Accept', async () => {
  const storage = memory({ [CONSENT_KEY]: 'accepted' });
  assert.equal(consentState({ localStorage: storage }), 'outdated');
  const first = await load(storage);
  assert.ok(first.banner());
  assert.equal(first.banner().querySelector('p').textContent.startsWith(BANNER_UPDATE_TEXT), true);
  first.press('accepted');
  assert.equal(first.banner(), null);
  assert.equal((await load(storage)).banner(), null);
});

test('AN-1 note: storage that throws cannot keep the answer, so the banner asks on every load (private mode on some browsers); no UI is added for it', async () => {
  const first = await load(throwing);
  assert.ok(first.banner());
  first.press('rejected');
  assert.equal(first.banner(), null, 'closed for this page load');
  assert.ok((await load(throwing)).banner(), 'asks again on the next load');
});

test('AN-1: Do Not Track and Global Privacy Control never open the banner', async () => {
  assert.equal((await load(memory(), { doNotTrack: '1' })).banner(), null);
  assert.equal((await load(memory(), { globalPrivacyControl: true })).banner(), null);
});

test('AN-2: the landing entry mounts no banner while SHOW_LANDING_CONSENT_BANNER is false, and sets no choice marker for the Privacy page button', async () => {
  const source = readFileSync(new URL('./landing/analytics.js', import.meta.url), 'utf8');
  assert.match(source, /^const SHOW_LANDING_CONSENT_BANNER = false;/m, 'shipped hidden');
  assert.match(source, /^if \(SHOW_LANDING_CONSENT_BANNER\) mountConsentBanner\(window, ANALYTICS_CONFIG\);/m, 'the one call is behind the flag');
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  const location = { origin: 'https://digrabbithole.com', pathname: '/pricing', protocol: 'https:', host: 'digrabbithole.com' };
  const window = Object.assign(new EventTarget(), { localStorage: memory(), document, navigator: {}, location, setInterval: () => 1, clearInterval() {} });
  Object.assign(globalThis, { window, location });
  await import('./landing/analytics.js');
  assert.equal(document.querySelector('[data-analytics-banner]'), null);
  assert.equal(document.documentElement.dataset.analyticsChoice, undefined, 'footer-links.css keeps [data-analytics-preferences] display:none');
  assert.equal(window.localStorage.getItem(CONSENT_KEY), null, 'nothing is chosen for the visitor');
});
