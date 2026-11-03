// The browser side of creator analytics (docs/features/creator-analytics-contract.md): what a consenting visitor does on a public /e
// publication, sent in bounded batches to POST /api/learn/boards/shared/<token>/events. The server decides who is viewing, refuses anything
// without the consent signal, drops the owner's visits, validates every id against the published board and credits active time.
// Before the visitor accepts analytics (analytics-consent.js), and under Do Not Track or Global Privacy Control, nothing here runs: no
// identifier is created or read and nothing is sent. Withdrawal, in this tab or another, discards what is queued and sends nothing.
// Starts and forks are recorded by the server on their success paths, never from here. No text the visitor typed is sent.
import { CONSENT_EVENT, CONSENT_KEY, CONSENT_VERSION_KEY, clearAnalyticsStorage, consentCurrent, mirrorConsentCookie, optedOut } from './analytics-consent.js';
import { approvedCampaign } from './analytics-campaigns.js';

const IDLE_MS = 60_000, FLUSH_MS = 15_000, SESSION_IDLE_MS = 30 * 60_000, SEEN_MS = 2_000, BATCH = 50, QUEUE = 500;

// An acceptance of the current version only: one given for PostHog alone does not start this.
export const collectionAllowed = win => !optedOut(win.navigator) && consentCurrent(win);

// One source per visit, from the arrival only. The referrer is read here for its category and never leaves this function; a campaign is
// sent only if it is an approved id (analytics-campaigns.js).
export function classifySource({ referrer = '', origin = '', search = '' }) {
  const query = new URLSearchParams(search);
  const tag = approvedCampaign(query.get('utm_campaign'));
  const campaign = tag ? { campaign: tag } : {};
  let from = null;
  try { from = referrer ? new URL(referrer) : null; } catch { /* an unreadable referrer is no referrer */ }
  const host = from?.hostname.toLowerCase();
  if (query.get('utm_source')?.toLowerCase() === 'linkedin' || host === 'linkedin.com' || host?.endsWith('.linkedin.com') || host === 'lnkd.in') return { source: 'linkedin', ...campaign };
  if (from && from.origin === origin) {
    if (from.pathname === '/explore') return { source: 'explore', ...campaign };
    if (from.pathname === '/library' && from.searchParams.get('view') === 'stars') return { source: 'stars', ...campaign };
    if (from.pathname.startsWith('/@')) return { source: from.searchParams.get('tab') === 'stars' ? 'stars' : 'creator_profile', ...campaign };
    return { source: 'direct', ...campaign };
  }
  return from ? { source: 'other_referrer', ...campaign } : { source: 'direct', ...campaign };
}

// The published resource a card stands for, in the server's boardSources key; null for any other card.
export function resourceOf(block) {
  if (block?.type === 'video' && block.videoId) return `video:${String(block.videoId).trim().slice(0, 64)}`;
  if (block?.type === 'paper' && block.paper?.id) return `paper:${String(block.paper.id).trim().slice(0, 64)}`;
  if (block?.type === 'wiki' && block.title) return `wiki:${String(block.title).trim()}`;
  return null;
}

// The active-time clock: a second counts only while the tab is visible and an activity signal came within the last 60 s.
export const isActive = ({ visible, now, lastActivity }) => visible && now - lastActivity < IDLE_MS;

const safe = read => { try { return read(); } catch { return null; } };
const NOOP = { observe() {}, stepsShown() {}, stepSelected() {}, stop() {}, discard() {} };

function startCollector({ token, blocks, win, uuid, now }) {
  const doc = win.document, url = `/api/learn/boards/shared/${encodeURIComponent(token)}/events`;
  // This browser's own board, as the server said once: its later visits send nothing. It can only leave a visit out, never count it wrongly.
  const ownKey = `rh-own-board:${token}`;
  if (safe(() => win.localStorage.getItem(ownKey))) return NOOP;
  const key = `rh-pub:${token}`;
  const kept = safe(() => JSON.parse(win.sessionStorage.getItem(key)));
  const resumed = kept && now() - kept.last < SESSION_IDLE_MS;
  const session = resumed ? kept : { id: uuid(), last: now(), active: 0, arrival: classifySource({ referrer: doc.referrer, origin: win.location.origin, search: win.location.search }), seen: [], acted: [], synthetic: new URLSearchParams(win.location.search).get('rh_synthetic') === '1' };
  const remember = () => safe(() => win.sessionStorage.setItem(key, JSON.stringify(session)));
  // A random id this browser keeps, never derived from anything about it. No storage: the visit stands in, and the next visit is a new browser.
  const visitor = safe(() => {
    const held = win.localStorage.getItem('rh-visitor-id');
    if (held) return held;
    const fresh = uuid();
    win.localStorage.setItem('rh-visitor-id', fresh);
    return win.localStorage.getItem('rh-visitor-id');
  }) || session.id;
  const byId = new Map(blocks.filter(b => b?.id).map(b => [b.id, b]));
  const queue = [], seen = new Set(session.seen), acted = new Set(session.acted), timers = new Map(), watched = new WeakSet();
  const inFlight = new AbortController();
  let lastActivity = now(), reported = session.active, stopped = false;
  const push = (type, fields = {}) => { if (!stopped && queue.length < QUEUE) queue.push({ id: uuid(), type, ...fields }); };
  const bodyOf = events => JSON.stringify({ visitor_id: visitor, session_id: session.id, ...(session.synthetic ? { synthetic: true } : {}), events });
  const take = () => {
    if (session.active !== reported) { push('active', { active_seconds: session.active }); reported = session.active; }
    return queue.splice(0, BATCH);
  };
  // Failed events go back with the same ids, so a retry cannot count twice. Consent is read again before anything leaves.
  const flush = async () => {
    if (stopped || !collectionAllowed(win)) return;
    const events = take();
    if (!events.length) return;
    try {
      const response = await win.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyOf(events), keepalive: true, signal: inFlight.signal });
      if (stopped) return;
      if (response.status >= 500 || response.status === 429) { queue.unshift(...events); return; }
      const answer = await response.clone?.().json().catch(() => null);
      if (answer?.dropped === 'own_visit') { safe(() => win.localStorage.setItem(ownKey, '1')); end(); }
    } catch { if (!stopped) queue.unshift(...events); }
  };
  const beacon = () => {
    if (stopped || !collectionAllowed(win)) return;
    remember();
    const events = take();
    if (!events.length) return;
    const sent = safe(() => win.navigator.sendBeacon(url, new win.Blob([bodyOf(events)], { type: 'application/json' })));
    if (!sent) queue.unshift(...events);
  };
  const activity = () => { lastActivity = now(); };
  const pressed = event => {
    activity();
    const id = event.target?.closest?.('[data-block-id]')?.getAttribute('data-block-id');
    if (id && !acted.has(id)) { acted.add(id); session.acted = [...acted]; push('acted', { material_id: id }); }
  };
  const clicked = event => {
    const link = event.target?.closest?.('a[href]');
    const id = link?.closest('[data-block-id]')?.getAttribute('data-block-id');
    const resource = id ? resourceOf(byId.get(id)) : null;
    if (resource) push('resource', { resource_id: resource, material_id: id });
  };
  // At least half of a card in view for 2 seconds, once per card per visit. Hiding the tab cancels a running count.
  const observer = win.IntersectionObserver ? new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      const id = entry.target.getAttribute('data-block-id');
      if (!id || seen.has(id)) continue;
      clearTimeout(timers.get(id));
      if (entry.isIntersecting) timers.set(id, setTimeout(() => {
        if (stopped || doc.visibilityState !== 'visible' || seen.has(id)) return;
        seen.add(id); session.seen = [...seen]; push('seen', { material_id: id });
      }, SEEN_MS));
    }
  }, { threshold: 0.5 }) : null;
  const watch = () => { if (observer) for (const card of doc.querySelectorAll('[data-block-id]')) if (!watched.has(card)) { watched.add(card); observer.observe(card); } };
  const tick = setInterval(() => {
    if (!collectionAllowed(win)) return; // another tab withdrew and its storage event has not arrived yet: count and keep nothing
    if (isActive({ visible: doc.visibilityState === 'visible', now: now(), lastActivity })) { session.active += 1; session.last = now(); }
    watch();
    remember();
  }, 1000);
  const flusher = setInterval(flush, FLUSH_MS);
  const hidden = () => { if (doc.visibilityState === 'hidden') beacon(); };
  const SIGNALS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  for (const name of SIGNALS) win.addEventListener(name, name === 'pointerdown' ? pressed : activity, { capture: true, passive: true });
  win.addEventListener('scroll', activity, { capture: true, passive: true });
  win.addEventListener('click', clicked, true);
  doc.addEventListener('visibilitychange', hidden);
  win.addEventListener('pagehide', beacon);
  // Everything off and nothing more sent; what is queued is dropped.
  function end() {
    stopped = true;
    queue.length = 0;
    clearInterval(tick); clearInterval(flusher);
    timers.forEach(clearTimeout); observer?.disconnect();
    for (const name of SIGNALS) win.removeEventListener(name, name === 'pointerdown' ? pressed : activity, { capture: true });
    win.removeEventListener('scroll', activity, { capture: true });
    win.removeEventListener('click', clicked, true);
    doc.removeEventListener('visibilitychange', hidden);
    win.removeEventListener('pagehide', beacon);
  }
  // A reload or a return inside the visit sends this too, with the visit's first source; the server adds no second open.
  push('open', session.arrival);
  remember();
  watch();
  flush();
  const answered = new Map(blocks.filter(b => b?.type === 'quiz').map(b => [b.id, b.choice ?? null]));
  const shownSets = new Set();
  return {
    // Next Steps as shown and chosen: the set on screen, never asked for by analytics.
    stepsShown(set_id, options) {
      if (shownSets.has(set_id)) return;
      shownSets.add(set_id);
      push('steps_shown', { suggestions: options.slice(0, 3).map((o, i) => ({ id: o.id, position: i + 1 })) });
    },
    stepSelected(options, hook) {
      const position = options.findIndex(o => o.id === hook.id) + 1;
      if (position) push('step_selected', { suggestion_id: hook.id, position, concept_ids: hook.selected_next_step?.concept_ids || [] });
    },
    // The visitor's copy changed: a quiz newly answered reports the option's key; the server decides right or wrong.
    observe(state) {
      for (const block of state?.blocks || []) {
        if (block?.type !== 'quiz' || !block.choice || answered.get(block.id) === block.choice) continue;
        answered.set(block.id, block.choice);
        push('quiz', { material_id: block.id, choice: block.choice });
      }
    },
    // Leaving the page with consent in place: the last batch goes as a beacon.
    stop() { if (!stopped) { beacon(); end(); } },
    // Withdrawal: nothing more leaves. A request already on its way is aborted, and no retry follows.
    discard() { end(); inFlight.abort(); },
  };
}

// The page's handle: follows the visitor's choice for as long as the page is open. It starts when they accept (the banner can be answered on
// this page), and on a rejection, a withdrawal here or in another tab, or a new privacy signal it discards and clears analytics storage only.
export function publicationAnalytics({ token, blocks = [], win = window, uuid = () => crypto.randomUUID(), now = () => Date.now() }) {
  let collector = null;
  const apply = () => {
    if (collectionAllowed(win)) {
      if (collector) return;
      mirrorConsentCookie(win); // the server's signal, restored if it expired or was cleared
      collector = startCollector({ token, blocks, win, uuid, now });
    } else if (collector) {
      collector.discard();
      collector = null;
      clearAnalyticsStorage(win);
    }
  };
  const fromOtherTab = event => { if (event.key === null || event.key === CONSENT_KEY || event.key === CONSENT_VERSION_KEY) apply(); };
  win.addEventListener(CONSENT_EVENT, apply);
  win.addEventListener('storage', fromOtherTab);
  apply();
  return {
    stepsShown: (...args) => collector?.stepsShown(...args),
    stepSelected: (...args) => collector?.stepSelected(...args),
    observe: state => collector?.observe(state),
    stop() {
      win.removeEventListener(CONSENT_EVENT, apply);
      win.removeEventListener('storage', fromOtherTab);
      collector?.stop();
      collector = null;
    },
  };
}
