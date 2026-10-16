// The signed-in person's monthly AI allowance (owner D3, D4; C:/s/spec/credits-phase1-design.md "Summary endpoint"): one shared
// state for Settings > AI usage and the canvas top bar's gauge (D4 section 5). It is the person's own account allowance across
// every canvas, never the canvas owner's: GET /api/learn/usage takes no user id and answers for the session only.
// Every amount is integer micro-USD from the server; the allowance itself is the server's AI_MONTHLY_ALLOWANCE_USD, never a
// number in this file. Phase 1 is accounting only: the server says `enforced: false` and every display says so.
// ponytail: the shared Sonner refusal handler (D4 section 4: exhausted / insufficient / reserved, View usage, dedupe) ships with
// enforcement in stage 2; it reads this store and calls refreshAccountUsage() after a refusal.
export const USAGE_PATH = '/api/learn/usage';
export const TRACKING_NOTE = 'Tracking only - limits are not enforced yet.';
const AMOUNTS = ['allowanceMicros', 'usedMicros', 'reservedMicros', 'remainingMicros'];

// Dollars with two decimals from integer micros, rounded half up on integers, so no float sums ever reach the screen.
export function formatMicros(micros) {
  const cents = Math.floor((micros + 5000) / 10000);
  return `$${Math.floor(cents / 100).toLocaleString('en-US')}.${String(cents % 100).padStart(2, '0')}`;
}
// A balance above zero never reads $0.00: that would look exhausted while the gauge is green.
export const formatRemaining = micros => (micros > 0 && micros < 5000 ? 'less than $0.01' : formatMicros(micros));

// The reset instant is the start of a UTC month; its date is shown in UTC so it never reads as the last day of the month.
export const formatReset = (iso, { year = true } = {}) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(year && { year: 'numeric' }), timeZone: 'UTC' });

// One response to one state. Anything but a well-formed 200 is neutral: a failed or odd request never shows red or a zero balance.
export function readUsage(status, body) {
  if (status === 401) return { status: 'signed_out' };
  if (status !== 200 || !body || typeof body !== 'object') return { status: 'unavailable', reason: body?.unavailable || 'error' };
  if (body.unavailable) return { status: 'unavailable', reason: String(body.unavailable) };
  const valid = AMOUNTS.every(key => Number.isSafeInteger(body[key]) && body[key] >= 0) && body.allowanceMicros > 0
    && typeof body.resetsAt === 'string' && !Number.isNaN(Date.parse(body.resetsAt));
  if (!valid) return { status: 'unavailable', reason: 'malformed' };
  return { status: 'ready', usage: {
    allowance: body.allowanceMicros, used: body.usedMicros, reserved: body.reservedMicros, remaining: body.remainingMicros,
    resetsAt: body.resetsAt, period: body.period ?? null, enforced: body.enforced === true,
  } };
}

// What the gauge, its tooltip and its label say for a state. Red ('empty') only when the server reports remaining 0.
export function usageView(state) {
  if (state.status === 'ready') {
    const { usage } = state;
    const empty = usage.remaining === 0;
    const label = empty ? 'No AI allowance remaining' : `AI allowance: ${formatRemaining(usage.remaining)} remaining`;
    const note = usage.enforced ? null : TRACKING_NOTE;
    return { tone: empty ? 'empty' : 'ok', label, note, title: note ? `${label}. ${note}` : label, usage };
  }
  const label = state.status === 'signed_out' ? 'Sign in to see your AI allowance'
    : state.status === 'unavailable' || state.status === 'error' ? 'AI usage unavailable' : 'Loading AI usage';
  return { tone: 'neutral', label, note: null, title: label, usage: null };
}

// The usage bar's fill: used, then reserved, each a whole percent of the allowance, together never past 100.
export function barParts({ allowance, used, reserved }) {
  const usedPct = Math.min(100, Math.floor((used * 100) / allowance));
  const reservedPct = Math.min(100 - usedPct, Math.ceil((reserved * 100) / allowance));
  return { usedPct, reservedPct };
}

const fetchUsage = () => fetch(USAGE_PATH, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });

// The store. refresh() runs one request at a time; a refresh asked for while one is out runs again after it, so a change
// made mid-request is never missed. While any display is mounted, the window regaining focus refreshes it (other devices).
// No polling loop and no AI call.
export function createUsageStore({ load = fetchUsage, target = globalThis.window } = {}) {
  let state = { status: 'idle' };
  let running = null, again = false;
  const listeners = new Set();
  const set = next => { state = next; listeners.forEach(listener => listener()); };
  const once = async () => {
    try {
      const response = await load();
      let body = null;
      try { body = await response.json(); } catch { /* an unreadable body is unavailable */ }
      return readUsage(response.status, body);
    } catch { return { status: 'error' }; }
  };
  function refresh() {
    if (running) { again = true; return running; }
    // A refresh keeps the last good numbers on screen until the answer lands; only a first load shows Loading.
    if (state.status !== 'ready') set({ status: 'loading' });
    running = (async () => { do { again = false; set(await once()); } while (again); })().finally(() => { running = null; });
    return running;
  }
  const onFocus = () => { refresh(); };
  return {
    getSnapshot: () => state,
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) target?.addEventListener?.('focus', onFocus);
      return () => { listeners.delete(listener); if (!listeners.size) target?.removeEventListener?.('focus', onFocus); };
    },
  };
}

export const usageStore = createUsageStore();
// For the flows that reserve, settle, release or adjust usage (D4 section 5): call after their request answers.
export const refreshAccountUsage = () => usageStore.refresh();
