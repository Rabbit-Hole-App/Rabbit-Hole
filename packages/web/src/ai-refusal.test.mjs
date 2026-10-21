// The shared refusal handler (ai-refusal.js; owner D4 section 4, L12): one sentence per allowance state, distinct from the
// platform limit, one toast per attempt, and a hook that reads refusals without touching the caller's response.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= new EventTarget();
const { handleAiRefusal, installAiRefusalHook, isAiRefusal, refusalMessage, viewUsage } = await import('./ai-refusal.js');

const resetsAt = '2026-11-01T00:00:00.000Z';
const refusal = reason => ({ code: 'allowance_limited', reason, resetsAt, error: 'server text' });

test('each allowance state reads differently, names the reset where it applies, and never reads like the platform limit', () => {
  assert.equal(refusalMessage(refusal('exhausted')), "You've used your monthly AI allowance. It resets on November 1, 2026.");
  assert.equal(refusalMessage(refusal('insufficient')), 'This action needs more than your remaining AI allowance. It resets on November 1, 2026.');
  assert.match(refusalMessage(refusal('reserved')), /reserved by AI work that is still running/);
  assert.match(refusalMessage(refusal('unavailable')), /temporarily unavailable.*Your work is saved/);
  const platform = { code: 'spend_limited', reason: 'daily_cap_reached', error: 'Paid Learn calls are paused because the platform daily dollar cap has been reached.' };
  assert.equal(refusalMessage(platform), platform.error);
  assert.ok(isAiRefusal(platform) && isAiRefusal(refusal('exhausted')));
  assert.equal(isAiRefusal({ error: 'Generation failed.', code: 'error' }), false);
});

test('one toast per attempt: the same refusal seen twice in a moment shows once; View usage only on the allowance', () => {
  const shown = [], refreshed = [];
  const deps = now => ({ show: (message, options) => shown.push({ message, options }), now, refresh: () => refreshed.push(now) });
  assert.equal(handleAiRefusal(refusal('exhausted'), deps(1_000_000)), true);
  assert.equal(handleAiRefusal(refusal('exhausted'), deps(1_001_000)), true);
  assert.equal(shown.length, 1, 'the JSON reply and the composer reading it are one attempt');
  assert.equal(shown[0].options.tone, 'error');
  assert.equal(shown[0].options.action.label, 'View usage');
  handleAiRefusal(refusal('exhausted'), deps(1_020_000));
  assert.equal(shown.length, 2, 'a later attempt is told again');
  handleAiRefusal({ code: 'spend_limited', reason: 'daily_cap_reached', error: 'Platform paused.' }, deps(1_021_000));
  assert.equal(shown.at(-1).options.action, undefined, 'the platform limit offers no usage action');
  assert.deepEqual(refreshed, [1_000_000, 1_001_000, 1_020_000], 'the usage display refreshes after each allowance refusal');
  assert.equal(handleAiRefusal({ error: 'other' }, deps(1_030_000)), false);
});

test('View usage opens Settings in the Shell, or a new tab from a page without one (the canvas and its draft stay put)', () => {
  const events = [], opened = [];
  const listener = event => events.push(event.detail);
  window.addEventListener('small:settings', listener);
  const open = window.open; window.open = (...args) => opened.push(args);
  try {
    viewUsage({ pathname: '/apps/canvas-1' });
    viewUsage({ pathname: '/b/abcdefghijklmnopqrstuv' });
  } finally { window.open = open; window.removeEventListener('small:settings', listener); }
  assert.deepEqual(events, [{ tab: 'usage' }]);
  assert.deepEqual(opened, [['/apps?settings=usage', '_blank', 'noopener']]);
});

test('the fetch hook reads a refused /api/ reply from a clone, leaves the caller its response, and never toasts the app\'s own background requests', async () => {
  const replies = { '/api/learn/ask': () => Response.json(refusal('reserved'), { status: 429 }), '/api/other': () => Response.json({ error: 'x' }, { status: 500 }),
    '/api/learn/tutor/next-steps': () => Response.json(refusal('insufficient'), { status: 429 }) };
  const target = { location: { href: 'https://app.test/apps/x' }, fetch: async path => Object.defineProperty(replies[path](), 'url', { value: `https://app.test${path}` }) };
  installAiRefusalHook(target);
  installAiRefusalHook(target); // once only
  const toasts = [];
  const listener = event => toasts.push(event.detail.message);
  window.addEventListener('small:toast', listener);
  try {
    const refused = await target.fetch('/api/learn/ask');
    assert.equal((await refused.json()).reason, 'reserved', 'the caller still reads its body');
    await target.fetch('/api/other');
    await target.fetch('/api/learn/tutor/next-steps'); // the app's own hook request on canvas open: no toast
    await new Promise(resolve => setTimeout(resolve, 10));
  } finally { window.removeEventListener('small:toast', listener); }
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /reserved by AI work/);
});
