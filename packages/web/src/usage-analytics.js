// Product usage analytics (docs/features/usage-analytics.md): who signs in and comes back, their visits (PostHog sessions), an
// estimate of active minutes, and a short allowlist of feature events, sent to PostHog. A plain module with its window, clock,
// storage and transport injected, so node tests drive it without a browser (as client-telemetry.js does).
//
// No SDK: nothing loads from PostHog, and nothing leaves the page that this file does not name. No autocapture, no session
// recording, no page titles, no query strings or fragments, no ids or tokens from the path (routeTemplate), only the origin of
// another site's referrer, and no free text in any property. The account is users.id from GET /api/me (32 hex characters),
// never an email, a handle or a .rabbithole.invalid principal. RH's accounting and operational telemetry stay authoritative;
// this is an engagement view only. Every public function swallows its own failures: analytics never blocks the app.
// Nothing runs without the visitor's acceptance (analytics-consent.js): before it, no identifier is created or read and nothing is
// queued; every operation checks again, so a withdrawal stops it at once, whichever tab it came from.
import { routeTemplate } from '../../control-plane/src/telemetry-contract.js';
import { browserClass, hash16 } from './client-telemetry.js';
import { CONSENT_EVENT, CONSENT_KEY, allowed, clearAnalyticsStorage, configured, consentOf, mirrorConsentCookie, optedOut } from './analytics-consent.js';

export { optedOut };

export const IDLE_MS = 60_000;                         // active time stops this long after the last input (estimate, not attention)
export const SESSION_IDLE_MS = 30 * 60_000;            // PostHog's session rules: a new $session_id after 30 idle minutes
export const SESSION_MAX_MS = 24 * 3600_000;           // or after 24 hours
export const TICK_MS = 5_000;
export const FLUSH_MS = 5_000;
export const ACTIVE_REPORT_MS = 60_000;                // one rh_active_time event per minute of active time, or on hide/leave
export const QUEUE_MAX = 100;
export const ATTEMPTS = 3;                             // a batch is sent at most this many times, always with the same event uuids
// Real input only. Not 'scroll': it also fires for programmatic scrolling, such as a streaming answer following its text, and
// generation must not keep someone active. Wheel, touch and the keyboard are how a person scrolls.
export const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'touchmove'];
const KEY = { anon: 'rh_ph_anon', account: 'rh_ph_account', internal: 'rh_ph_internal', session: 'rh_ph_session', once: 'rh_ph_once' };
const ACCOUNT_ID = /^[0-9a-f]{32}$/;                   // users.id (auth.js randomHex(16))
const TOKEN = /^[a-z0-9_]{1,40}$/;

// The events this page may send and the properties each may carry; anything else is dropped before it is queued.
// Values: a token (lowercase word), a non-negative integer or a boolean. action_id is hashed here (hash16), never sent raw.
export const EVENTS = {
  rh_active_time: ['active_seconds', 'idle_threshold_seconds'],
  rh_canvas_created: ['source'],
  rh_canvas_opened: [],
  rh_tutor_used: [],
  rh_planning_requested: ['feature', 'action_id'],
  rh_generation_requested: ['feature', 'action_id'],
  rh_generation_completed: ['feature', 'action_id'],
  rh_generation_failed: ['feature', 'action_id', 'reason', 'stage', 'stop_reason'],
  rh_share_changed: ['access'],
  rh_canvas_forked: [],
  // Tutor R4 roadmap (D21): the action and the step state as tokens, never a title, a source or a learner's words. ui.md section 7 lists the actions.
  rh_roadmap_step: ['action', 'step_state'],
};
// Static pages kept as they are; every other path goes through routeTemplate (ids, tokens and handles become placeholders).
const PAGES = new Set(['/', '/blog', '/features', '/pricing', '/manifesto', '/sign-in', '/sign-up', '/check-email', '/privacy', '/terms', '/404', '/home']);
export const pagePath = pathname => {
  const path = String(pathname || '/').split(/[?#]/)[0].replace(/(.)\/$/, '$1');
  return PAGES.has(path) ? path : routeTemplate(path);
};
// The referrer as it may leave: this site's own page as a sanitized path, another site as its origin only.
export function referrerOf(referrer, origin) {
  try {
    const url = new URL(referrer);
    return url.origin === origin ? { $referrer: origin + pagePath(url.pathname), $referring_domain: url.host } : { $referrer: url.origin, $referring_domain: url.host };
  } catch { return { $referrer: '$direct', $referring_domain: '$direct' }; }
}
export function sanitize(name, props = {}) {
  const allowed = EVENTS[name];
  if (!allowed) return null;
  const out = {};
  for (const key of allowed) {
    const value = props[key];
    if (key === 'action_id') { if (value != null && value !== '') out.action_id = hash16(String(value)); }
    else if (typeof value === 'boolean' || (Number.isSafeInteger(value) && value >= 0) || (typeof value === 'string' && TOKEN.test(value))) out[key] = value;
  }
  return out;
}
// A UUIDv7 (time-ordered): PostHog derives a session's start from its $session_id.
export function uuidv7(ms, random = globalThis.crypto) {
  const b = new Uint8Array(16);
  random.getRandomValues(b);
  for (let i = 5, t = ms; i >= 0; i--, t = Math.floor(t / 256)) b[i] = t % 256;
  b[6] = (b[6] & 0x0f) | 0x70; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
// The person mark for an account. rh_internal is this code's own; $internal_or_test_user is the person property the PostHog project's
// existing test-account filter reads (cohort 612497, exact true; PostHog's setInternalOrTestUser sets the same property).
export const personMark = internal => ({ rh_internal: !!internal, $internal_or_test_user: !!internal });

// Storage shared by every tab of the site, read on every use so a logout or account change in one tab reaches the others.
// Unavailable storage (private mode, blocked) falls back to this page's memory.
function store(target) {
  const memory = new Map();
  const local = () => { try { return target.localStorage || null; } catch { return null; } };
  return {
    get: key => { try { const s = local(); return s ? s.getItem(key) : memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
    set: (key, value) => { memory.set(key, value); try { local()?.setItem(key, value); } catch { /* memory only */ } },
    remove: key => { memory.delete(key); try { local()?.removeItem(key); } catch { /* memory only */ } },
  };
}

// config: { token, host, env } from the build; no token or host, an opted-out browser or no accepted choice, and every method does nothing.
export function createAnalytics(target, { token, host, env = 'unknown', send = null, now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = clearTimeout, random = target.crypto || globalThis.crypto } = {}) {
  const enabled = allowed(target, { token, host });
  const sends = new AbortController();
  const s = store(target);
  const origin = target.location?.origin || '';
  const windowId = uuidv7(now(), random);
  const classes = browserClass(target.navigator?.userAgent);
  const post = send || ((body, { keepalive }) => target.fetch(`${host}/batch/`, { method: 'POST', body, keepalive, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit', signal: sends.signal }).then(r => r.status));
  const queue = [];
  let timer = null, sending = false, stopped = false, lastPath = null;
  // Checked by every operation: consent is read again, so this tab stops even before another tab's storage event arrives.
  const on = () => enabled && !stopped && consentOf(target) === 'accepted';

  const anonId = () => s.get(KEY.anon) || (s.set(KEY.anon, random.randomUUID()), s.get(KEY.anon));
  const distinctId = () => s.get(KEY.account) || anonId();
  function sessionId(t) {
    let session = null;
    try { session = JSON.parse(s.get(KEY.session) || 'null'); } catch { /* a new one */ }
    if (!session?.id || t - session.last > SESSION_IDLE_MS || t - session.start > SESSION_MAX_MS) session = { id: uuidv7(t, random), start: t };
    s.set(KEY.session, JSON.stringify({ ...session, last: t }));
    return session.id;
  }
  // owner: the identity and session an event belongs to when that is not the current one (accrued active time). Everything is fixed
  // here at enqueue, so an event queued under one account keeps it whenever it is sent.
  function enqueue(event, properties, distinct = distinctId(), owner = null) {
    const t = owner?.at ?? now();
    if (queue.length >= QUEUE_MAX) queue.shift();
    queue.push({ attempts: 0, body: { event, uuid: random.randomUUID(), timestamp: new Date(t).toISOString(), properties: {
      distinct_id: distinct, $session_id: owner?.session ?? sessionId(t), $window_id: windowId, $lib: 'rh-web', $browser: classes.browser, $device_type: classes.device,
      rh_env: env, rh_internal: owner ? owner.internal : s.get(KEY.internal) === '1', ...properties } } });
    if (!timer) timer = schedule(() => { timer = null; api.flush(); }, FLUSH_MS);
  }
  const pageProps = path => ({ $current_url: origin + path, $host: target.location?.host || '', $pathname: path });

  // Active time: counted only while this tab is visible and focused (one tab at a time) and within IDLE_MS of real input.
  // Network activity (heartbeats, model polling) is never input.
  // Accrued time belongs to the identity and session it accrued in (owner), never to whoever is current when it is reported: it is
  // settled under its owner before a logout or account change, here or seen from another tab, and when its session has ended.
  let lastInput = -Infinity, lastTick = now(), activeMs = 0, owner = null, creditedAt = 0;
  const eligible = () => target.document?.visibilityState !== 'hidden' && target.document?.hasFocus?.() !== false;
  let wasEligible = eligible();
  const storedSession = () => { try { return JSON.parse(s.get(KEY.session) || 'null'); } catch { return null; } };
  const identity = () => ({ distinct: distinctId(), account: s.get(KEY.account), internal: s.get(KEY.internal) === '1', session: storedSession()?.id || null });
  let seen = enabled ? identity() : null;
  // stale: the identity already changed elsewhere, so the time since the last step goes to the one it replaced, in that one's session.
  // leaving: the page is hiding or losing focus, and the browser has already changed the state, so the step just ended counts if it
  // began eligible. A step must otherwise be eligible at both ends, so time before focus returned is not counted.
  function credit(t, stale = false, leaving = false) {
    const until = Math.min(t, lastInput + IDLE_MS);
    const counted = wasEligible && (leaving || eligible());
    wasEligible = eligible();
    // A gap longer than two ticks means the page was not running (a suspended device): it earns nothing.
    if (counted && until > lastTick && t - lastTick <= TICK_MS * 2) {
      owner ||= { ...seen, session: stale ? seen.session || uuidv7(t, random) : sessionId(t) };
      activeMs += until - lastTick;
      creditedAt = until;
    }
    lastTick = t;
  }
  function reportActive(min) {
    if (!owner || activeMs < min) return;
    const seconds = Math.floor(activeMs / 1000);
    activeMs -= seconds * 1000;
    if (seconds > 0) enqueue('rh_active_time', { active_seconds: seconds, idle_threshold_seconds: IDLE_MS / 1000 }, owner.distinct, { ...owner, at: creditedAt });
    if (!activeMs) owner = null;
  }
  // clearInput: an account's input never earns time for the next one. A remainder under a second is dropped.
  function settle(t, { stale = false, clearInput = false } = {}) {
    credit(t, stale);
    reportActive(1);
    activeMs = 0; owner = null;
    if (clearInput) lastInput = -Infinity;
  }
  function sessionEnded(t) {
    const session = storedSession();
    return !!owner && (session?.id !== owner.session || t - session.last > SESSION_IDLE_MS || t - session.start > SESSION_MAX_MS);
  }
  // Notices what changed since this tab last looked: another tab's logout or sign-in, or the end of the session.
  function sync(t) {
    const current = identity();
    if (current.distinct !== seen.distinct) { settle(t, { stale: true, clearInput: !!seen.account }); seen = identity(); return; }
    if (sessionEnded(t)) { reportActive(1); activeMs = 0; owner = null; }
    seen = current;
  }

  const api = {
    enabled,
    // One $pageview per change of the sanitized path (a reload is a new page load, so it counts again).
    pageview(pathname = target.location?.pathname) {
      if (!on()) return;
      try {
        const path = pagePath(pathname);
        if (path === lastPath) return;
        const first = lastPath === null;
        lastPath = path;
        enqueue('$pageview', { ...pageProps(path), ...(first ? referrerOf(target.document?.referrer, origin) : {}) });
      } catch { /* never blocks */ }
    },
    // An allowlisted feature event. once: an id (job, generation) recorded per browser, so a poll that sees the same finished job
    // again after a reload does not count it twice.
    track(name, props = {}, { once = null } = {}) {
      if (!on()) return false;
      try {
        const clean = sanitize(name, props);
        if (!clean) return false;
        if (once != null) {
          const key = hash16(`${name}|${once}`), seen = (s.get(KEY.once) || '').split(',').filter(Boolean);
          if (seen.includes(key)) return false;
          s.set(KEY.once, [...seen, key].slice(-200).join(','));
        }
        enqueue(name, { ...clean, ...pageProps(lastPath || pagePath(target.location?.pathname)) });
        return true;
      } catch { return false; }
    },
    // The signed-in account. A different account than the one this browser last identified is never merged into it: its
    // identity is cleared first, so the new account starts from a fresh anonymous id.
    identify(accountId, { internal = false } = {}) {
      if (!on() || !ACCOUNT_ID.test(accountId || '')) return;
      try {
        const t = now();
        sync(t);
        const current = s.get(KEY.account), flag = internal ? '1' : '';
        if (current === accountId) {
          if ((s.get(KEY.internal) || '') !== flag) { settle(t); s.set(KEY.internal, flag); seen = identity(); enqueue('$set', { $set: personMark(internal) }); }
          return;
        }
        if (current) api.reset();
        else settle(t); // anonymous time stays on the anonymous id, which this identify joins to the account
        const anon = anonId();
        s.set(KEY.account, accountId);
        s.set(KEY.internal, flag);
        seen = identity();
        enqueue('$identify', { $anon_distinct_id: anon, $set: personMark(internal) }, accountId);
      } catch { /* never blocks */ }
    },
    // Logout or a signed-out page: a fresh anonymous id and session, no account, no internal mark.
    reset() {
      if (!on()) return;
      try {
        const t = now();
        sync(t);
        settle(t, { clearInput: true });
        for (const key of [KEY.account, KEY.internal, KEY.session]) s.remove(key);
        s.set(KEY.anon, random.randomUUID());
        seen = identity();
      } catch { /* never blocks */ }
    },
    // Signed out (the sign-in page every logout lands on, or GET /api/me answering 401): clear an identified account. An anonymous
    // visitor keeps their anonymous id, so the visit before sign-in joins the account it becomes.
    signedOut() { if (on() && s.get(KEY.account)) api.reset(); },
    // Another tab changed the identity (its storage event), so what this tab accrued is settled at once.
    sync(t = now()) { if (on()) sync(t); },
    input(t = now()) { if (!on()) return; sync(t); credit(t); lastInput = t; },
    // Past the idle window nothing more can accrue, so the remainder goes out rather than waiting for a later visit or session.
    tick(t = now()) { if (!on()) return; sync(t); credit(t); reportActive(t - lastInput > IDLE_MS ? 1000 : ACTIVE_REPORT_MS); },
    // Hidden, frozen or leaving: count up to now, report what is left, send it with keepalive. Visible again starts a new span.
    hide(t = now()) { if (!on()) return undefined; sync(t); credit(t, false, true); reportActive(1000); return api.flush({ keepalive: true }); },
    blur(t = now()) { if (on()) { sync(t); credit(t, false, true); } },
    show(t = now()) { if (!on()) return; sync(t); lastTick = t; wasEligible = eligible(); },
    async flush({ keepalive = false } = {}) {
      if (!on() || !queue.length || (sending && !keepalive)) return;
      const batch = queue.slice(0, 50);
      sending = true;
      let status = 0;
      try { status = await post(JSON.stringify({ api_key: token, batch: batch.map(e => e.body) }), { keepalive }); } catch { status = 0; }
      finally { sending = false; }
      const done = (status >= 200 && status < 300) || (status >= 400 && status < 500 && status !== 429);
      if (status === 401 || status === 403) stopped = true; // a refused token: stop for this page
      if (!on()) { queue.length = 0; return; }
      for (const e of batch) e.attempts++;
      const keep = queue.filter(e => !batch.includes(e) || (!done && e.attempts < ATTEMPTS));
      queue.length = 0; queue.push(...keep);
      if (queue.length && !timer && !keepalive) timer = schedule(() => { timer = null; api.flush(); }, FLUSH_MS * (1 + Math.max(...queue.map(e => e.attempts))));
    },
    // Withdrawal or a closed page: what is pending, in flight or accrued is dropped, never sent.
    stop() { stopped = true; queue.length = 0; activeMs = 0; owner = null; if (timer) cancel(timer); timer = null; sends.abort(); },
    stats: () => ({ queued: queue.length, activeMs, distinct: on() ? distinctId() : null, session: on() ? s.get(KEY.session) : null }),
    pending: () => queue.map(e => e.body),
  };
  return api;
}

let installed = null, uninstall = null;
const noop = { enabled: false, sync() {}, pageview() {}, track: () => false, identify() {}, reset() {}, signedOut() {}, stop() {}, flush: async () => {} };
// Starts collection when it is allowed and stops it when it no longer is, for as long as the page lives: on load, on this tab's choice and on
// another tab's. Not allowed: analytics storage is removed, and nothing else is touched. Running: the first pageview, navigation (navigate() and
// Back both fire popstate), input, the tick and hide/leave. options.signedOut: this page is signed out (the sign-in page, where every logout
// lands). options.account: ask /api/me who this is, each time collection starts. Returns the running instance, if any.
export function installUsageAnalytics(target, config, { signedOut = false, account = false } = {}) {
  if (uninstall) return installed || noop;
  let stopRunning = null;
  const start = () => {
    const a = createAnalytics(target, config);
    if (!a.enabled) return;
    const running = new AbortController(), on = { signal: running.signal };
    installed = a;
    if (signedOut) a.signedOut();
    a.pageview();
    target.addEventListener('popstate', () => a.pageview(), on);
    for (const type of INPUT_EVENTS) target.addEventListener(type, () => a.input(), { capture: true, passive: true, ...on });
    const interval = target.setInterval(() => a.tick(), TICK_MS);
    target.document?.addEventListener('visibilitychange', () => (target.document.visibilityState === 'hidden' ? a.hide() : a.show()), on);
    target.addEventListener('pagehide', () => a.hide(), on);
    target.addEventListener('blur', () => a.blur(), on);
    target.addEventListener('storage', event => { if (event.key === null || event.key === KEY.account || event.key === KEY.anon) a.sync(); }, on);
    stopRunning = () => { a.stop(); running.abort(); target.clearInterval?.(interval); installed = null; stopRunning = null; };
    if (account) syncAnalyticsAccount();
  };
  const apply = () => {
    try {
      if (configured(config)) mirrorConsentCookie(target);
      if (allowed(target, config)) { if (!stopRunning) start(); return; }
      stopRunning?.();
      // By the visitor's choice, not by whether PostHog is configured: other analytics share this storage (publication-analytics.js).
      if (consentOf(target) !== 'accepted' || optedOut(target.navigator)) clearAnalyticsStorage(target);
    } catch { /* never blocks */ }
  };
  const listening = new AbortController();
  target.addEventListener(CONSENT_EVENT, apply, { signal: listening.signal });
  target.addEventListener('storage', event => { if (event.key === null || event.key === CONSENT_KEY) apply(); }, { signal: listening.signal });
  uninstall = () => { stopRunning?.(); listening.abort(); uninstall = null; };
  apply();
  return installed || noop;
}
// The app's account, from GET /api/me (users.id and the internal mark the control plane sets): identify when signed in,
// clear when the server says signed out. Any other failure leaves the identity as it was.
export async function syncAnalyticsAccount(fetcher = globalThis.fetch) {
  if (!installed?.enabled) return;
  try {
    const response = await fetcher('/api/me', { credentials: 'same-origin' });
    if (response.status === 401) return installed.signedOut();
    if (!response.ok) return;
    const me = await response.json();
    if (me?.user_id) installed.identify(me.user_id, { internal: me.analytics_internal === true });
  } catch { /* never blocks */ }
}
export const track = (name, props, options) => (installed ? installed.track(name, props, options) : false);
// A canvas's sharing as one word for rh_share_changed: private, link (anyone with the link) or public (Explore).
export const shareAccess = sharing => (!sharing?.shared ? 'private' : sharing.public_view ? 'public' : 'link');
export const currentAnalytics = () => installed;
export const resetUsageAnalyticsForTests = () => { uninstall?.(); installed = null; };
