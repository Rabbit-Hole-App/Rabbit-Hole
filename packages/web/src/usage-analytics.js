// Product usage analytics (docs/features/usage-analytics.md): who signs in and comes back, their visits (PostHog sessions), an
// estimate of active minutes, and a short allowlist of feature events, sent to PostHog. A plain module with its window, clock,
// storage and transport injected, so node tests drive it without a browser (as client-telemetry.js does).
//
// No SDK: nothing loads from PostHog, and nothing leaves the page that this file does not name. No autocapture, no session
// recording, no page titles, no query strings or fragments, no ids or tokens from the path (routeTemplate), only the origin of
// another site's referrer, and no free text in any property. The account is users.id from GET /api/me (32 hex characters),
// never an email, a handle or a .rabbithole.invalid principal. RH's accounting and operational telemetry stay authoritative;
// this is an engagement view only. Every public function swallows its own failures: analytics never blocks the app.
import { routeTemplate } from '../../control-plane/src/telemetry-contract.js';
import { browserClass, hash16 } from './client-telemetry.js';

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
  rh_generation_failed: ['feature', 'action_id', 'reason'],
  rh_share_changed: ['access'],
  rh_canvas_forked: [],
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
// Do Not Track and Global Privacy Control turn collection off for that browser (the Privacy Policy's analytics choice).
export const optedOut = navigator => navigator?.globalPrivacyControl === true || navigator?.doNotTrack === '1' || navigator?.doNotTrack === 'yes';

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

// config: { token, host, env } from the build; no token or host, or an opted-out browser, and every method does nothing.
export function createAnalytics(target, { token, host, env = 'unknown', send = null, now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), random = target.crypto || globalThis.crypto } = {}) {
  const enabled = typeof token === 'string' && token.startsWith('phc_') && /^https:\/\/[a-z0-9.-]+$/i.test(host || '') && !optedOut(target.navigator);
  const s = store(target);
  const origin = target.location?.origin || '';
  const windowId = uuidv7(now(), random);
  const classes = browserClass(target.navigator?.userAgent);
  const post = send || ((body, { keepalive }) => target.fetch(`${host}/batch/`, { method: 'POST', body, keepalive, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit' }).then(r => r.status));
  const queue = [];
  let timer = null, sending = false, stopped = false, lastPath = null;

  const anonId = () => s.get(KEY.anon) || (s.set(KEY.anon, random.randomUUID()), s.get(KEY.anon));
  const distinctId = () => s.get(KEY.account) || anonId();
  function sessionId(t) {
    let session = null;
    try { session = JSON.parse(s.get(KEY.session) || 'null'); } catch { /* a new one */ }
    if (!session?.id || t - session.last > SESSION_IDLE_MS || t - session.start > SESSION_MAX_MS) session = { id: uuidv7(t, random), start: t };
    s.set(KEY.session, JSON.stringify({ ...session, last: t }));
    return session.id;
  }
  function enqueue(event, properties, distinct = distinctId()) {
    const t = now();
    if (queue.length >= QUEUE_MAX) queue.shift();
    queue.push({ attempts: 0, body: { event, uuid: random.randomUUID(), timestamp: new Date(t).toISOString(), properties: {
      distinct_id: distinct, $session_id: sessionId(t), $window_id: windowId, $lib: 'rh-web', $browser: classes.browser, $device_type: classes.device,
      rh_env: env, rh_internal: s.get(KEY.internal) === '1', ...properties } } });
    if (!timer) timer = schedule(() => { timer = null; api.flush(); }, FLUSH_MS);
  }
  const pageProps = path => ({ $current_url: origin + path, $host: target.location?.host || '', $pathname: path });

  // Active time: counted only while this tab is visible and focused (one tab at a time) and within IDLE_MS of real input.
  // Network activity (heartbeats, model polling) is never input. Ticks cap each step, so a suspended device adds nothing.
  let lastInput = -Infinity, lastTick = now(), activeMs = 0;
  const eligible = () => target.document?.visibilityState !== 'hidden' && target.document?.hasFocus?.() !== false;
  function credit(t) {
    const until = Math.min(t, lastInput + IDLE_MS);
    if (eligible() && until > lastTick) activeMs += Math.min(until - lastTick, TICK_MS * 2);
    lastTick = t;
  }
  function reportActive(min) {
    if (activeMs < min) return;
    const seconds = Math.min(Math.floor(activeMs / 1000), 3600);
    activeMs -= seconds * 1000;
    if (seconds > 0) enqueue('rh_active_time', { active_seconds: seconds, idle_threshold_seconds: IDLE_MS / 1000 });
  }

  const api = {
    enabled,
    // One $pageview per change of the sanitized path (a reload is a new page load, so it counts again).
    pageview(pathname = target.location?.pathname) {
      if (!enabled) return;
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
      if (!enabled) return false;
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
      if (!enabled || !ACCOUNT_ID.test(accountId || '')) return;
      try {
        const current = s.get(KEY.account), flag = internal ? '1' : '';
        if (current === accountId) {
          if ((s.get(KEY.internal) || '') !== flag) { s.set(KEY.internal, flag); enqueue('$set', { $set: { rh_internal: !!internal } }); }
          return;
        }
        if (current) api.reset();
        const anon = anonId();
        s.set(KEY.account, accountId);
        s.set(KEY.internal, flag);
        enqueue('$identify', { $anon_distinct_id: anon, $set: { rh_internal: !!internal } }, accountId);
      } catch { /* never blocks */ }
    },
    // Logout or a signed-out page: a fresh anonymous id and session, no account, no internal mark.
    reset() {
      try {
        for (const key of [KEY.account, KEY.internal, KEY.session]) s.remove(key);
        s.set(KEY.anon, random.randomUUID());
      } catch { /* never blocks */ }
    },
    // Signed out (the sign-in page every logout lands on, or GET /api/me answering 401): clear an identified account. An anonymous
    // visitor keeps their anonymous id, so the visit before sign-in joins the account it becomes.
    signedOut() { if (enabled && s.get(KEY.account)) api.reset(); },
    input(t = now()) { credit(t); lastInput = t; },
    tick(t = now()) { credit(t); reportActive(ACTIVE_REPORT_MS); },
    // Hidden, frozen or leaving: count up to now, report what is left, send it with keepalive. Visible again starts a new span.
    hide(t = now()) { credit(t); reportActive(1000); return api.flush({ keepalive: true }); },
    show(t = now()) { lastTick = t; },
    async flush({ keepalive = false } = {}) {
      if (!enabled || stopped || !queue.length || (sending && !keepalive)) return;
      const batch = queue.slice(0, 50);
      sending = true;
      let status = 0;
      try { status = await post(JSON.stringify({ api_key: token, batch: batch.map(e => e.body) }), { keepalive }); } catch { status = 0; }
      finally { sending = false; }
      const done = (status >= 200 && status < 300) || (status >= 400 && status < 500 && status !== 429);
      if (status === 401 || status === 403) stopped = true; // a refused token: stop for this page
      for (const e of batch) e.attempts++;
      const keep = queue.filter(e => !batch.includes(e) || (!done && e.attempts < ATTEMPTS));
      queue.length = 0; queue.push(...keep);
      if (queue.length && !timer && !keepalive) timer = schedule(() => { timer = null; api.flush(); }, FLUSH_MS * (1 + Math.max(...queue.map(e => e.attempts))));
    },
    stats: () => ({ queued: queue.length, activeMs, distinct: distinctId(), session: s.get(KEY.session) }),
    pending: () => queue.map(e => e.body),
  };
  return api;
}

let installed = null;
const noop = { enabled: false, pageview() {}, track: () => false, identify() {}, reset() {}, signedOut() {}, flush: async () => {} };
// Wires one instance into a window: the first pageview, navigation (navigate() and Back both fire popstate), input, the tick,
// and hide/leave. options.signedOut: this page is signed out (the sign-in page, where every logout lands). Returns the instance.
export function installUsageAnalytics(target, config, { signedOut = false } = {}) {
  if (installed) return installed;
  try {
    const a = createAnalytics(target, config);
    installed = a;
    if (!a.enabled) return a;
    if (signedOut) a.signedOut();
    a.pageview();
    target.addEventListener('popstate', () => a.pageview());
    for (const type of INPUT_EVENTS) target.addEventListener(type, () => a.input(), { capture: true, passive: true });
    target.setInterval(() => a.tick(), TICK_MS);
    target.document?.addEventListener('visibilitychange', () => (target.document.visibilityState === 'hidden' ? a.hide() : a.show()));
    target.addEventListener('pagehide', () => a.hide());
    target.addEventListener('blur', () => a.tick());
    return a;
  } catch { installed = noop; return noop; }
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
export const resetUsageAnalyticsForTests = () => { installed = null; };
