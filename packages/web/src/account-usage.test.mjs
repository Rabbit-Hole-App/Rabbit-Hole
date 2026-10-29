// The account AI usage state (owner D4 sections 2 and 5; C:/s/spec/credits-phase1-design.md "Summary endpoint"): one store
// for Settings and the canvas gauge, fed by GET /api/learn/usage. A mocked fetch stands in for the endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRACKING_NOTE, USAGE_PATH, barParts, checkoutCredits, createUsageStore, creditCount, formatCredits, formatReset, purchaseAmount, readUsage, unknownLine, usageView } from './account-usage.js';

// The server's answer: AI credits only (no dollars, micros or currency on the wire).
const body = (over = {}) => ({ enforced: false, period: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z',
  allowanceCredits: 5000, usedCredits: 1740, reservedCredits: 0, estimatedCredits: 0, remainingCredits: 3260, ...over });
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
  assert.deepEqual(state.usage, { allowance: 50_000_000, used: 17_400_000, reserved: 0, remaining: 32_600_000, resetsAt: '2026-11-01T00:00:00.000Z', period: '2026-10', enforced: false, unknownAttempts: 0 });
  const view = usageView(state);
  assert.equal(view.tone, 'ok');
  assert.equal(view.label, 'AI credits: 3,260 credits remaining');
  assert.equal(view.title, `AI credits: 3,260 credits remaining. ${TRACKING_NOTE}`);
  assert.equal(TRACKING_NOTE, 'Tracking only - limits are not enforced yet.');
});

test('exhausted: red only when the server reports remaining 0', async () => {
  const { store } = storeWith(reply(200, body({ usedCredits: 5000, remainingCredits: 0 })));
  const view = usageView(await settle(store));
  assert.equal(view.tone, 'empty');
  assert.equal(view.label, 'No AI credits remaining');
  assert.match(view.title, /not enforced yet/);
  // A tiny balance is still a balance: green, and never shown as 0 credits.
  const tiny = usageView(readUsage(200, body({ remainingCredits: 0.3 })));
  assert.equal(tiny.tone, 'ok');
  assert.equal(tiny.label, 'AI credits: less than 1 credit remaining');
});

test('reserved: running work is held apart from what is used, and the remaining figure is the server\'s', async () => {
  const { store } = storeWith(reply(200, body({ reservedCredits: 50, remainingCredits: 3210 })));
  const state = await settle(store);
  assert.equal(state.usage.reserved, 500_000);
  assert.equal(state.usage.used, 17_400_000, 'a reservation is never reported as spend');
  assert.equal(usageView(state).label, 'AI credits: 3,210 credits remaining');
});

test('unavailable and errors are neutral, never red or a zero balance', async () => {
  const cases = [
    ['config', reply(200, { enforced: false, unavailable: 'config' })],
    ['accounting', reply(503, { unavailable: 'accounting' })],
    ['server error', reply(500, { error: 'boom' })],
    ['not found (endpoint not deployed)', reply(404, null)],
    ['unreadable body', reply(200, new Error('bad json'))],
    ['network failure', new Error('offline')],
    ['negative amount', reply(200, body({ remainingCredits: -1 }))],
    ['text amount', reply(200, body({ usedCredits: 'ten' }))],
    ['missing amount', reply(200, body({ remainingCredits: undefined }))],
    ['zero allowance', reply(200, body({ allowanceCredits: 0, remainingCredits: 0 }))],
    ['an old dollar-micros body', reply(200, { enforced: true, currency: 'USD', allowanceMicros: 50_000_000, usedMicros: 0, reservedMicros: 0, remainingMicros: 50_000_000, resetsAt: '2026-11-01T00:00:00.000Z' })],
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
  assert.equal(view.label, 'Sign in to see your AI credits');
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
  const { store, calls } = storeWith(reply(200, body()), reply(200, body({ usedCredits: 2000, remainingCredits: 3000 })));
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

test('requests that ended without a confirmed cost: a count, never an amount; a missing count is 0; a bad one is unavailable', () => {
  assert.equal(readUsage(200, body()).usage.unknownAttempts, 0, 'a server without the field');
  assert.equal(readUsage(200, body({ unknownAttempts: null })).usage.unknownAttempts, 0);
  const some = readUsage(200, body({ unknownAttempts: 3, reservedCredits: 40, remainingCredits: 3220 }));
  assert.equal(some.usage.unknownAttempts, 3);
  assert.equal(some.usage.reserved, 400_000, 'their bound is already inside reservedMicros: not added twice');
  for (const bad of [-1, 1.5, '2']) assert.equal(readUsage(200, body({ unknownAttempts: bad })).status, 'unavailable', String(bad));
  assert.equal(unknownLine(0), null);
  assert.equal(unknownLine(undefined), null);
  assert.equal(unknownLine(1), '1 AI request ended without a confirmed cost and was not charged');
  assert.equal(unknownLine(3), '3 AI requests ended without a confirmed cost and were not charged');
  assert.doesNotMatch(unknownLine(3), /\$/);
  assert.equal(usageView(some).tone, 'ok', 'unknown cost alone never turns the gauge red');
});

test('credits from integer micros (owner messages 32-33): 1 credit = $0.01, nearest credit, never 0 for nonzero usage', () => {
  assert.equal(formatCredits(46_440_000), '4,644 credits');
  assert.equal(formatCredits(3_560_000), '356 credits');
  assert.equal(creditCount(50_000_000), '5,000');
  assert.equal(formatCredits(50_000_000), '5,000 credits');
  assert.equal(formatCredits(10_000), '1 credit');
  assert.equal(formatCredits(14_999), '1 credit');
  assert.equal(formatCredits(15_000), '2 credits', 'half a credit rounds up');
  assert.equal(formatCredits(0), '0 credits', 'exactly 0 is the only 0');
  for (const tiny of [1, 4_000, 4_999]) assert.equal(formatCredits(tiny), 'less than 1 credit', String(tiny));
  assert.equal(formatCredits(5_000), '1 credit');
  assert.equal(formatCredits(100_000 + 200_000), '30 credits', '0.1 + 0.2 in micros is exactly 30');
  assert.equal(formatCredits(1_234_567_890), '123,457 credits');
});

test('the reset instant is one wording everywhere, in the viewer zone with the zone named, pinned at the Nov 1 cutover and at a month and year boundary', () => {
  const LA = { timeZone: 'America/Los_Angeles' };
  assert.equal(formatReset('2026-11-01T00:00:00.000Z', LA), 'October 31, 5:00 PM PDT', 'the cutover');
  assert.equal(formatReset('2026-12-01T00:00:00.000Z', LA), 'November 30, 4:00 PM PST', 'the next month, after daylight time ends');
  assert.equal(formatReset('2027-01-01T00:00:00Z', LA), 'December 31, 4:00 PM PST', 'the year boundary');
  assert.equal(formatReset('2026-11-01T00:00:00.000Z', { timeZone: 'UTC' }), 'November 1, 12:00 AM UTC');
  assert.equal(formatReset('2026-11-01T00:00:00.000Z', { timeZone: 'Europe/London' }), 'November 1, 12:00 AM GMT');
});

test('the usage bar: used then reserved, in whole percents of the allowance, never past 100', () => {
  assert.deepEqual(barParts({ allowance: 50_000_000, used: 17_400_000, reserved: 0 }), { usedPct: 34, reservedPct: 0 });
  assert.deepEqual(barParts({ allowance: 50_000_000, used: 17_400_000, reserved: 1 }), { usedPct: 34, reservedPct: 1 });
  // An allowance lowered below what was already used (D3): full, never over.
  assert.deepEqual(barParts({ allowance: 10_000_000, used: 17_400_000, reserved: 500_000 }), { usedPct: 100, reservedPct: 0 });
});

test('the allowance comes only from the server: no dollar amount is written into the client', () => {
  const changed = usageView(readUsage(200, body({ allowanceCredits: 7500, usedCredits: 0, remainingCredits: 7500 })));
  assert.equal(changed.label, 'AI credits: 7,500 credits remaining');
  for (const file of ['./account-usage.js', './UsageGauge.jsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    // A bare 50 (not a class like z-50), $50, or 50 dollars in micros.
    assert.doesNotMatch(source, /\$50\b|(?<![-\w])50(\.0+)?(?![-\w%])|50_?000_?000/, file);
  }
});

test('by feature: well-formed rows pass through with learner names, same names add up, odd rows drop the split only', async () => {
  const { featureLabel, featureRows } = await import('./account-usage.js');
  const rows = [{ feature: 'tutor', usedCredits: 0.4, reservedCredits: 0, unknownAttempts: 0 }, { feature: 'inline_route', usedCredits: 0.01, reservedCredits: 0, unknownAttempts: 0 },
    { feature: 'inline_generate', usedCredits: 0.09, reservedCredits: 0.03, unknownAttempts: 1 }, { feature: 'mystery', usedCredits: 0.0005, reservedCredits: 0, unknownAttempts: 0 }];
  const ready = readUsage(200, body({ byFeature: rows }));
  assert.equal(ready.status, 'ready');
  assert.deepEqual(featureRows(ready.usage.byFeature), [
    { label: 'Tutor', used: 4000, reserved: 0, unknownAttempts: 0 },
    { label: 'Ctrl+K edits', used: 1000, reserved: 300, unknownAttempts: 1 },
    { label: 'Other', used: 5, reserved: 0, unknownAttempts: 0 },
  ]);
  assert.equal(featureLabel('ask'), 'Chat');
  // A malformed split never hides the totals: the usage stays ready, just without byFeature.
  for (const bad of [[{ feature: 'ask', usedCredits: -1, reservedCredits: 0 }], [{ usedCredits: 1, reservedCredits: 0 }], 'x']) {
    const state = readUsage(200, body({ byFeature: bad }));
    assert.equal(state.status, 'ready');
    assert.equal('byFeature' in state.usage, false, JSON.stringify(bad));
  }
  assert.equal('byFeature' in readUsage(200, body()).usage, false, 'a server before the field');
});

test('Buy credits (owner, 2026-10-29): Other amount is a positive USD number with up to two decimals; checkout only says coming soon', () => {
  for (const [text, amount] of [['20', 20], ['0.5', 0.5], ['12.34', 12.34], [' 7 ', 7]]) assert.equal(purchaseAmount(text), amount, JSON.stringify(text));
  for (const text of ['', '0', '-1', '1.234', 'abc', '1e3', ' ', 'Infinity', '0.00', '12.', '+5', '1,000', 'NaN'])
    assert.equal(purchaseAmount(text), null, JSON.stringify(text));
  assert.equal(checkoutCredits(50), 'Credit purchases are coming soon.');
});
