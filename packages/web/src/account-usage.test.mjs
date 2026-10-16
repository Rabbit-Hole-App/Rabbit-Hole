// The account AI usage state (owner D4 sections 2 and 5; C:/s/spec/credits-phase1-design.md "Summary endpoint"): one store
// for Settings and the canvas gauge, fed by GET /api/learn/usage. A mocked fetch stands in for the endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRACKING_NOTE, USAGE_PATH, barParts, createUsageStore, formatMicros, formatRemaining, formatReset, readUsage, usageView } from './account-usage.js';

const body = (over = {}) => ({ enforced: false, currency: 'USD', period: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z',
  allowanceMicros: 50_000_000, usedMicros: 17_400_000, reservedMicros: 0, estimatedMicros: 0, remainingMicros: 32_600_000, ...over });
const reply = (status, json) => ({ status, json: async () => (json instanceof Error ? Promise.reject(json) : json) });
// A store whose fetch answers from a queue and counts its calls.
const storeWith = (...answers) => {
  const calls = [];
  const load = async () => { calls.push(USAGE_PATH); const next = answers.length > 1 ? answers.shift() : answers[0]; if (next instanceof Error) throw next; return next; };
  return { store: createUsageStore({ load, target: null }), calls };
};
const settle = async store => { await store.refresh(); return store.getSnapshot(); };

test('positive: allowance left is green, says how much, and says it is not enforced yet', async () => {
  const { store } = storeWith(reply(200, body()));
  const state = await settle(store);
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.usage, { allowance: 50_000_000, used: 17_400_000, reserved: 0, remaining: 32_600_000, resetsAt: '2026-11-01T00:00:00.000Z', period: '2026-10', enforced: false });
  const view = usageView(state);
  assert.equal(view.tone, 'ok');
  assert.equal(view.label, 'AI allowance: $32.60 remaining');
  assert.equal(view.title, `AI allowance: $32.60 remaining. ${TRACKING_NOTE}`);
  assert.equal(TRACKING_NOTE, 'Tracking only - limits are not enforced yet.');
});

test('exhausted: red only when the server reports remaining 0', async () => {
  const { store } = storeWith(reply(200, body({ usedMicros: 50_000_000, remainingMicros: 0 })));
  const view = usageView(await settle(store));
  assert.equal(view.tone, 'empty');
  assert.equal(view.label, 'No AI allowance remaining');
  assert.match(view.title, /not enforced yet/);
  // A tiny balance is still a balance: green, and never shown as $0.00.
  const tiny = usageView(readUsage(200, body({ remainingMicros: 3_000 })));
  assert.equal(tiny.tone, 'ok');
  assert.equal(tiny.label, 'AI allowance: less than $0.01 remaining');
});

test('reserved: running work is held apart from what is used, and the remaining figure is the server\'s', async () => {
  const { store } = storeWith(reply(200, body({ reservedMicros: 500_000, remainingMicros: 32_100_000 })));
  const state = await settle(store);
  assert.equal(state.usage.reserved, 500_000);
  assert.equal(state.usage.used, 17_400_000, 'a reservation is never reported as spend');
  assert.equal(usageView(state).label, 'AI allowance: $32.10 remaining');
});

test('unavailable and errors are neutral, never red or a zero balance', async () => {
  const cases = [
    ['config', reply(200, { enforced: false, unavailable: 'config' })],
    ['accounting', reply(503, { unavailable: 'accounting' })],
    ['server error', reply(500, { error: 'boom' })],
    ['not found (endpoint not deployed)', reply(404, null)],
    ['unreadable body', reply(200, new Error('bad json'))],
    ['network failure', new Error('offline')],
    ['negative amount', reply(200, body({ remainingMicros: -1 }))],
    ['float amount', reply(200, body({ usedMicros: 0.1 + 0.2 }))],
    ['missing amount', reply(200, body({ remainingMicros: undefined }))],
    ['zero allowance', reply(200, body({ allowanceMicros: 0, remainingMicros: 0 }))],
    ['bad reset date', reply(200, body({ resetsAt: 'soon' }))],
  ];
  for (const [name, answer] of cases) {
    const { store } = storeWith(answer);
    const view = usageView(await settle(store));
    assert.equal(view.tone, 'neutral', name);
    assert.equal(view.label, 'AI usage unavailable', name);
    assert.equal(view.usage, null, name);
  }
});

test('signed out (401): no personal allowance, and no redirect to sign-in from a shared canvas', async () => {
  const { store } = storeWith(reply(401, { error: 'sign in' }));
  const state = await settle(store);
  assert.deepEqual(state, { status: 'signed_out' });
  const view = usageView(state);
  assert.equal(view.tone, 'neutral');
  assert.equal(view.label, 'Sign in to see your AI allowance');
  assert.equal(view.usage, null);
  // The store reads with fetch, not api(): api() sends any 401 to /login, which would yank a signed-out link viewer away.
  const source = readFileSync(new URL('./account-usage.js', import.meta.url), 'utf8');
  assert.match(source, /fetch\(USAGE_PATH, \{ credentials: 'same-origin'/);
  assert.doesNotMatch(source, /from '\.\/api\.js'/);
});

test('loading is neutral; a refresh keeps the last numbers until it answers; a failed refresh goes neutral, not red', async () => {
  assert.equal(usageView({ status: 'idle' }).tone, 'neutral');
  assert.equal(usageView({ status: 'loading' }).label, 'Loading AI usage');
  const { store } = storeWith(reply(200, body()), new Error('offline'));
  await settle(store);
  const pending = store.refresh();
  assert.equal(store.getSnapshot().status, 'ready', 'no Loading flash over known numbers');
  await pending;
  assert.equal(usageView(store.getSnapshot()).tone, 'neutral');
});

test('one request at a time; a refresh asked for mid-request runs once more after it, so a change is never missed', async () => {
  const { store, calls } = storeWith(reply(200, body()), reply(200, body({ usedMicros: 20_000_000, remainingMicros: 30_000_000 })));
  const first = store.refresh(), second = store.refresh(), third = store.refresh();
  await Promise.all([first, second, third]);
  assert.equal(calls.length, 2);
  assert.equal(store.getSnapshot().usage.remaining, 30_000_000);
});

test('the window regaining focus refreshes while a display is mounted, and not after the last one leaves; no polling', async () => {
  const listeners = {};
  const target = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type, fn) => { if (listeners[type] === fn) delete listeners[type]; } };
  let calls = 0;
  const store = createUsageStore({ load: async () => { calls += 1; return reply(200, body()); }, target });
  const offA = store.subscribe(() => {}), offB = store.subscribe(() => {});
  assert.equal(typeof listeners.focus, 'function');
  await listeners.focus();
  assert.equal(calls, 1);
  offA();
  assert.equal(typeof listeners.focus, 'function', 'still one display mounted');
  offB();
  assert.equal(listeners.focus, undefined);
  for (const file of ['./account-usage.js', './UsageGauge.jsx'])
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /setInterval|setTimeout\(.*refresh/, file);
});

test('dollars from integer micros: two decimals, half up, no float drift', () => {
  assert.equal(formatMicros(32_600_000), '$32.60');
  assert.equal(formatMicros(0), '$0.00');
  assert.equal(formatMicros(4_999), '$0.00');
  assert.equal(formatMicros(5_000), '$0.01');
  assert.equal(formatMicros(100_000 + 200_000), '$0.30', '0.1 + 0.2 in micros is exactly 0.30');
  assert.equal(formatMicros(1_234_567_890), '$1,234.57');
  assert.equal(formatRemaining(0), '$0.00');
  assert.equal(formatRemaining(4_999), 'less than $0.01');
});

test('the reset date is the UTC start of the month, whatever the local zone', () => {
  assert.equal(formatReset('2026-11-01T00:00:00.000Z'), 'November 1, 2026');
  assert.equal(formatReset('2027-01-01T00:00:00Z', { year: false }), 'January 1');
});

test('the usage bar: used then reserved, in whole percents of the allowance, never past 100', () => {
  assert.deepEqual(barParts({ allowance: 50_000_000, used: 17_400_000, reserved: 0 }), { usedPct: 34, reservedPct: 0 });
  assert.deepEqual(barParts({ allowance: 50_000_000, used: 17_400_000, reserved: 1 }), { usedPct: 34, reservedPct: 1 });
  // An allowance lowered below what was already used (D3): full, never over.
  assert.deepEqual(barParts({ allowance: 10_000_000, used: 17_400_000, reserved: 500_000 }), { usedPct: 100, reservedPct: 0 });
});

test('the allowance comes only from the server: no dollar amount is written into the client', () => {
  const changed = usageView(readUsage(200, body({ allowanceMicros: 75_000_000, usedMicros: 0, remainingMicros: 75_000_000 })));
  assert.equal(changed.label, 'AI allowance: $75.00 remaining');
  for (const file of ['./account-usage.js', './UsageGauge.jsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    // A bare 50 (not a class like z-50), $50, or 50 dollars in micros.
    assert.doesNotMatch(source, /\$50\b|(?<![-\w])50(\.0+)?(?![-\w%])|50_?000_?000/, file);
  }
});
