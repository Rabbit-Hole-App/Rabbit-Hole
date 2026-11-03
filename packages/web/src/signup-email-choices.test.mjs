// The two optional email boxes on "Choose your handle" (docs/features/signup-email-preferences.md, owner 2026-11-03): both checked by
// default, independent, optional, and saved only when Continue is pressed. ChooseHandle.jsx is bundled with esbuild and rendered with
// react-dom/server, as aspect-ratio-select.test.mjs renders its dropdown; the rules the click handlers call are tested as functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { CATEGORIES, DISCLOSURE_VERSION, initialChoices, onboardingSubmission, toggleChoice, wording } from '../../control-plane/src/email-preferences.js';
import { isPublicPageRequest } from './landing/support-routes.js';
import { gateFor } from './session-display.js';

const dir = mkdtempSync(join(tmpdir(), 'signup-choices-')), outfile = join(dir, 'gate.cjs');
await esbuild.build({
  stdin: { contents: "export { ChooseHandle } from './HandleGate.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'dataurl' },
  define: { 'import.meta.env': '{"VITE_RABBIT_HOLE":"true"}' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

// A render must save nothing: any request while it renders fails the test.
const calls = [];
globalThis.fetch = (...args) => { calls.push(args); return Promise.reject(new Error('no request while rendering')); };
const html = B.renderToStaticMarkup(B.createElement(B.ChooseHandle, { onDone() {} }));
const box = category => html.match(new RegExp(`<input[^>]*data-email-choice="${category}"[^>]*>`))?.[0] ?? '';

test('both boxes are shown checked, each with its own label and plain description, and neither is required', () => {
  assert.equal(calls.length, 0, 'rendering makes no request');
  // A static render runs no effects, so the source is checked too: the only saveProfile call is inside the submit handler, never an effect.
  const gate = readFileSync(new URL('./HandleGate.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const submit = gate.slice(gate.indexOf('const submit = async event'), gate.indexOf('const problem ='));
  assert.equal((gate.match(/saveProfile\(/g) || []).length, 1, 'ChooseHandle saves in exactly one place');
  assert.ok(submit.includes('saveProfile({ handle: checked.handle, emailPreferences: onboardingSubmission(choices) })'), 'and that place is the Continue handler');
  assert.doesNotMatch(gate.slice(gate.indexOf('export function ChooseHandle')), /useEffect/, 'no effect in ChooseHandle can save the boxes');
  for (const category of CATEGORIES) {
    assert.match(box(category), /type="checkbox"/);
    assert.match(box(category), /checked=""/, `${category} starts checked`);
    assert.doesNotMatch(box(category), /required|disabled/, `${category} is optional`);
    assert.ok(html.includes(wording()[category].label) && html.includes(wording()[category].description), `${category} says what it sends`);
  }
  assert.deepEqual(CATEGORIES.map(c => wording()[c].label), ['Rabbit Hole Updates', 'Newsletter']);
  assert.match(html, /Optional\. Change or unsubscribe any time in Settings\./);
  assert.ok(html.includes('The founder’s newsletter about tech and AI.'), "the Newsletter is the founder's tech and AI newsletter");
});

test('the boxes are two separate inputs inside the form, before Continue, and Continue still needs only a valid handle', () => {
  assert.equal(new Set(CATEGORIES.map(box)).size, 2, 'two distinct inputs');
  assert.ok(html.indexOf('data-email-choice="newsletter"') < html.indexOf('>Continue<'));
  assert.ok(html.indexOf('<form') < html.indexOf('data-email-choice="updates"') && html.indexOf('data-email-choice="newsletter"') < html.indexOf('</form>'));
  assert.match(html, /<button type="submit" disabled=""/, 'with no handle yet Continue is off, whatever the boxes say');
});

test('unchecking one box leaves the other as it was; both can be unchecked; checking again is an active yes', () => {
  const start = initialChoices();
  assert.deepEqual(start, { updates: { enabled: true, touched: false }, newsletter: { enabled: true, touched: false } });
  const noNews = toggleChoice(start, 'newsletter');
  assert.deepEqual(noNews.newsletter, { enabled: false, touched: true });
  assert.equal(noNews.updates, start.updates, 'Updates is the very same untouched choice');
  const noUpdates = toggleChoice(start, 'updates');
  assert.deepEqual([noUpdates.updates.enabled, noUpdates.newsletter.enabled], [false, true]);
  const neither = toggleChoice(noNews, 'updates');
  assert.deepEqual([neither.updates.enabled, neither.newsletter.enabled], [false, false]);
  assert.deepEqual(toggleChoice(noNews, 'newsletter').newsletter, { enabled: true, touched: true });
});

test('what Continue sends: the shown wording version and, per box, its value and whether the person touched it', () => {
  assert.deepEqual(onboardingSubmission(initialChoices()), { source: 'onboarding', disclosure: DISCLOSURE_VERSION, updates: { enabled: true, touched: false }, newsletter: { enabled: true, touched: false } });
  assert.deepEqual(onboardingSubmission(toggleChoice(initialChoices(), 'updates')).updates, { enabled: false, touched: true });
  assert.equal(DISCLOSURE_VERSION, 'v2');
});

test('the wording has no ellipsis, and the unsubscribe page is not swallowed by the public-page 404', () => {
  for (const category of CATEGORIES) assert.doesNotMatch(wording()[category].label + wording()[category].description, /\.\.\.|…/);
  const page = path => isPublicPageRequest(new Request(`https://x.test${path}`, { headers: { accept: 'text/html' } }));
  assert.equal(page('/unsubscribe'), false);
  assert.equal(page('/no-such-page'), true);
});

// Owner hold 2026-11-03: the gate asks exactly when there is no handle. The pair is saved BEFORE the handle is claimed (profile.js), so a failed
// save leaves no handle and a reload asks again, while an ordinary account (a handle, no email choice recorded) is never asked.
test('gateFor asks only when there is no handle: an ordinary account with a handle and unset email choices is never sent back to Choose your handle', () => {
  const unset = { disclosure: 'v2', deliverable: true, updates: { enabled: null, affirmative: false }, newsletter: { enabled: null, affirmative: false } };
  assert.equal(gateFor({ name: null, avatar: null, handle: 'plain', description: null, emailPreferences: unset }), 'ok');
  assert.equal(gateFor({ handle: 'plain', emailPreferences: unset }), 'ok');
  assert.equal(gateFor({ handle: 'plain' }), 'ok', 'a profile service without email choices');
  assert.equal(gateFor({ handle: null, emailPreferences: unset }), 'needed', 'no handle: asked again, whatever the choices are');
  assert.equal(gateFor({ handle: null }), 'needed');
  assert.equal(gateFor(null), 'ok', 'signed out');
  const source = readFileSync(new URL('./session-display.js', import.meta.url), 'utf8');
  assert.match(source, /export const gateFor = profile => \(profile && !profile\.handle \? 'needed' : 'ok'\);/, 'gateFor reads the handle only');
});
