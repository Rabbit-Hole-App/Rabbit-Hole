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

// Credits from integer micros (owner messages 32-33, 2026-10-21): people see credits, never dollars; 1 credit = $0.01, so
// 10,000 micros. Rounded to the nearest credit with thousands separators. Nonzero usage never reads "0 credits": a balance
// or a charge below half a credit reads "less than 1 credit".
export const creditCount = micros => Math.round(micros / 10_000).toLocaleString('en-US');
export function formatCredits(micros) {
  const credits = Math.round(micros / 10_000);
  if (credits === 0 && micros > 0) return 'less than 1 credit';
  return `${credits.toLocaleString('en-US')} credit${credits === 1 ? '' : 's'}`;
}

// The reset instant is the start of a UTC month; its date is shown in UTC so it never reads as the last day of the month.
export const formatReset = (iso, { year = true } = {}) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(year && { year: 'numeric' }), timeZone: 'UTC' });

// One response to one state. Anything but a well-formed 200 is neutral: a failed or odd request never shows red or a zero balance.
export function readUsage(status, body) {
  if (status === 401) return { status: 'signed_out' };
  if (status !== 200 || !body || typeof body !== 'object') return { status: 'unavailable', reason: body?.unavailable || 'error' };
  if (body.unavailable) return { status: 'unavailable', reason: String(body.unavailable) };
  // unknownAttempts: provider calls whose cost is not known yet (their bound, if any, is already inside reservedMicros). A missing
  // count is 0, as from a server before the field; a present one must be a whole number like every other field.
  const unknown = body.unknownAttempts ?? 0;
  const valid = AMOUNTS.every(key => Number.isSafeInteger(body[key]) && body[key] >= 0) && body.allowanceMicros > 0
    && Number.isSafeInteger(unknown) && unknown >= 0
    && typeof body.resetsAt === 'string' && !Number.isNaN(Date.parse(body.resetsAt));
  if (!valid) return { status: 'unavailable', reason: 'malformed' };
  // byFeature (Settings' "This month by feature"): kept only when every row is well formed; a server without it shows no split.
  const whole = value => Number.isSafeInteger(value) && value >= 0;
  const split = Array.isArray(body.byFeature) && body.byFeature.every(row => typeof row?.feature === 'string' && whole(row.usedMicros) && whole(row.reservedMicros) && whole(row.unknownAttempts ?? 0))
    ? { byFeature: body.byFeature.map(row => ({ feature: row.feature, used: row.usedMicros, reserved: row.reservedMicros, unknownAttempts: row.unknownAttempts ?? 0 })) } : {};
  return { status: 'ready', usage: {
    allowance: body.allowanceMicros, used: body.usedMicros, reserved: body.reservedMicros, remaining: body.remainingMicros,
    resetsAt: body.resetsAt, period: body.period ?? null, enforced: body.enforced === true, unknownAttempts: unknown, ...split,
  } };
}

// The server's feature names (control-plane learn-usage.js FEATURES) as a learner knows them. Rows with the same name are
// added together (the three Ctrl+K steps are one edit); a name not listed here is Other, never a raw id.
const FEATURE_LABELS = {
  ask: 'Chat', auto: 'Chat', shared_ask: 'Chat on shared canvases', home_ask: 'Home questions',
  tutor: 'Tutor', tutor_evaluate: 'Tutor', handoff: 'Tutor', next_steps: 'Next steps', shared_next_steps: 'Next steps',
  inline_route: 'Ctrl+K edits', inline_decide: 'Ctrl+K edits', inline_generate: 'Ctrl+K edits',
  journey: 'Learning paths', course: 'Courses', artifact: 'Generated cards', board: 'Generated cards', scene: '3D scenes',
  image: 'Images', video: 'Videos', transcribe: 'Transcription', tts: 'Narration', voice_tts: 'Voice mode', voice_scribe: 'Voice mode',
  search: 'Search', explore_find: 'Explore search', assess: 'Practice checks', grade: 'Practice checks',
};
export const featureLabel = feature => FEATURE_LABELS[feature] || 'Other';
export function featureRows(byFeature = []) {
  const rows = new Map();
  for (const { feature, used, reserved, unknownAttempts } of byFeature) {
    const label = featureLabel(feature), row = rows.get(label) || { label, used: 0, reserved: 0, unknownAttempts: 0 };
    rows.set(label, { label, used: row.used + used, reserved: row.reserved + reserved, unknownAttempts: row.unknownAttempts + unknownAttempts });
  }
  return [...rows.values()].sort((a, b) => b.used - a.used || b.reserved - a.reserved || a.label.localeCompare(b.label));
}

// The quiet line for requests whose cost is not known yet: a count, never an amount (unknown cost is never $0). Null at 0.
export const unknownLine = count => (count > 0 ? `${count} AI request${count === 1 ? '' : 's'} with cost not yet known` : null);

// What the gauge, its tooltip and its label say for a state. Red ('empty') only when the server reports remaining 0.
export function usageView(state) {
  if (state.status === 'ready') {
    const { usage } = state;
    const empty = usage.remaining === 0;
    const label = empty ? 'No AI allowance remaining' : `AI allowance: ${formatCredits(usage.remaining)} remaining`;
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
