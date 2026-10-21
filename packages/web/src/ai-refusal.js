// The one answer to a refused AI request (owner D4 section 4; enforcement L12 2026-10-20). The server refuses before any
// provider call and says why in one body (learn-spend-ledger.js refusalBody): code 'allowance_limited' is the person's
// monthly allowance (reason exhausted / insufficient / reserved / unavailable, with resetsAt), 'spend_limited' the platform's
// temporary limit. This only explains it, once per attempt; the caller keeps the prompt, attachments, selection and canvas.
import { formatReset, refreshAccountUsage } from './account-usage.js';

// ui.jsx toast(), without importing JSX into this plain module (its node tests load it directly).
const toast = (message, options) => window.dispatchEvent(new CustomEvent('small:toast', { detail: { message, ...options } }));

export const isAiRefusal = body => !!body && (body.code === 'allowance_limited' || body.code === 'spend_limited');

// The person's sentence for a refusal: the allowance's four states each read differently, and never like the platform's.
export function refusalMessage(body) {
  if (body?.code !== 'allowance_limited') return body?.error || 'AI is paused for now. Try again later.';
  const resets = body.resetsAt && !Number.isNaN(Date.parse(body.resetsAt)) ? ` It resets on ${formatReset(body.resetsAt)}.` : '';
  switch (body.reason) {
    case 'exhausted': return `You've used your monthly AI allowance.${resets}`;
    case 'insufficient': return `This action needs more than your remaining AI allowance.${resets}`;
    case 'reserved': return 'Your remaining AI allowance is reserved by AI work that is still running. Try again when it finishes.';
    default: return 'AI is temporarily unavailable: your AI allowance cannot be checked right now. Your work is saved; try again shortly.';
  }
}

// Settings lives in the Shell (UsageGauge.jsx openUsageSettings); a shared, published or member canvas page has none, so
// it opens Home's Settings in a new tab and the canvas, its draft and its selection stay put.
export function viewUsage(location = globalThis.location) {
  const outside = /^\/[bec]\//.test(location?.pathname || '');
  if (outside) window.open('/apps?settings=usage', '_blank', 'noopener');
  else window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'usage' } }));
}

// One toast per refusal: the same sentence again within a few seconds is the same attempt seen twice (a JSON reply and the
// composer reading it), never a second toast.
const SAME_ATTEMPT_MS = 5000;
let last = { message: '', at: 0 };
export function handleAiRefusal(body, { show = toast, now = Date.now(), refresh = refreshAccountUsage } = {}) {
  if (!isAiRefusal(body)) return false;
  const message = refusalMessage(body);
  if (message !== last.message || now - last.at > SAME_ATTEMPT_MS) {
    show(message, { tone: 'error', ...(body.code === 'allowance_limited' ? { action: { label: 'View usage', run: () => viewUsage() } } : {}) });
  }
  last = { message, at: now };
  if (body.code === 'allowance_limited') refresh();
  return true;
}

// Requests the app makes on its own (Next Steps hooks when a canvas opens, Explore's find as the learner types): their refusal
// shows in their own place, never as a toast during rendering or navigation (D4 section 4).
const AUTOMATIC = /\/next-steps$|\/boards\/published\/find$/;

// Every AI entry point goes through fetch, so one hook sees every refused request, whatever its own error handling: a JSON
// 429/503 from /api/ carrying a refusal body. It reads a clone; the caller's response is untouched.
export function installAiRefusalHook(target = globalThis) {
  const original = target.fetch?.bind(target);
  if (!original || original.aiRefusalHook) return;
  const hooked = async (...args) => {
    const response = await original(...args);
    try {
      const path = new URL(response.url, target.location?.href).pathname;
      if ((response.status === 429 || response.status === 503) && path.startsWith('/api/') && !AUTOMATIC.test(path) && (response.headers.get('content-type') || '').includes('json')) {
        response.clone().json().then(body => handleAiRefusal(body), () => {});
      }
    } catch { /* never in the way of the request */ }
    return response;
  };
  hooked.aiRefusalHook = true;
  target.fetch = hooked;
}
