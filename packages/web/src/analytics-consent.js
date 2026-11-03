// The visitor's analytics choice (docs/features/usage-analytics.md "Consent"): 'accepted', 'rejected' or none, per browser. Missing or
// unreadable means analytics stays off. A plain module with its window passed in, so node tests drive it without a browser.
// localStorage holds the choice and its storage event reaches other tabs. The cookie exists only while accepted: it is how a sign-in
// request tells the server (product-analytics.js), which sends nothing without it. It holds no identifier.
export const CONSENT_KEY = 'rh_analytics_consent';
export const CONSENT_COOKIE = 'rh_analytics_consent';
// The version of what acceptance covers. Version 2 added Creator Analytics; an acceptance stored without it was given for PostHog alone, which it
// keeps enabling, and the banner asks again. Its own key and cookie, so a saved acceptance is never bridged silently.
export const CONSENT_VERSION = '2';
export const CONSENT_VERSION_KEY = 'rh_analytics_consent_version';
export const CONSENT_VERSION_COOKIE = 'rh_analytics_consent_v';
export const CONSENT_EVENT = 'rh:analytics-consent';        // this tab's choice changed
export const PREFERENCES_EVENT = 'rh:analytics-preferences'; // someone asked to see the choice again
const ANALYTICS_PREFIXES = ['rh_ph_', 'rh-visitor-id', 'rh-own-board:']; // usage-analytics.js's and publication-analytics.js's localStorage
const SESSION_PREFIX = 'rh-pub:';                            // publication-analytics.js's visit, in sessionStorage; nothing else is ever cleared

// Do Not Track and Global Privacy Control turn collection off for that browser, whatever was chosen.
export const optedOut = navigator => navigator?.globalPrivacyControl === true || navigator?.doNotTrack === '1' || navigator?.doNotTrack === 'yes';
export const configured = config => typeof config?.token === 'string' && config.token.startsWith('phc_') && /^https:\/\/[a-z0-9.-]+$/i.test(config?.host || '');

export function consentOf(target) {
  try {
    const value = target.localStorage?.getItem(CONSENT_KEY);
    return value === 'accepted' || value === 'rejected' ? value : null;
  } catch { return null; }
}
// This version of the choice was accepted: what Creator Analytics needs (publication-analytics.js), on top of the privacy signals.
export function consentCurrent(target) {
  try { return consentOf(target) === 'accepted' && target.localStorage?.getItem(CONSENT_VERSION_KEY) === CONSENT_VERSION; } catch { return false; }
}
// No choice yet, or an acceptance of an earlier version: the banner asks.
export const needsConsentAnswer = target => !consentOf(target) || (consentOf(target) === 'accepted' && !consentCurrent(target));
export const allowed = (target, config) => configured(config) && !optedOut(target.navigator) && consentOf(target) === 'accepted';

export function mirrorConsentCookie(target) {
  try {
    if (!target.document) return;
    const secure = target.location?.protocol === 'https:' ? '; Secure' : '';
    const keep = consentOf(target) === 'accepted' && !optedOut(target.navigator);
    const current = keep && consentCurrent(target);
    target.document.cookie = `${CONSENT_VERSION_COOKIE}=${current ? CONSENT_VERSION : ''}; Path=/; SameSite=Lax; Max-Age=${current ? 31536000 : 0}${secure}`;
    target.document.cookie = `${CONSENT_COOKIE}=${keep ? 'accepted' : ''}; Path=/; SameSite=Lax; Max-Age=${keep ? 31536000 : 0}${secure}`;
  } catch { /* the server then sends nothing */ }
}
// Removes analytics identifiers only: sign-in, drafts, recovery and every other key stay.
export function clearAnalyticsStorage(target) {
  try {
    const storage = target.localStorage;
    if (storage) {
      const keys = [];
      for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (ANALYTICS_PREFIXES.some(prefix => key?.startsWith(prefix))) keys.push(key); }
      for (const key of keys) storage.removeItem(key);
    }
  } catch { /* nothing to clear */ }
  try {
    const visits = target.sessionStorage;
    if (visits) {
      const keys = [];
      for (let i = 0; i < visits.length; i++) { const key = visits.key(i); if (key?.startsWith(SESSION_PREFIX)) keys.push(key); }
      for (const key of keys) visits.removeItem(key);
    }
  } catch { /* nothing to clear */ }
}
export function setConsent(target, choice) {
  try {
    if (choice === 'accepted') target.localStorage?.setItem(CONSENT_VERSION_KEY, CONSENT_VERSION); else target.localStorage?.removeItem(CONSENT_VERSION_KEY);
    target.localStorage?.setItem(CONSENT_KEY, choice);
  } catch { /* unreadable stays off */ }
  mirrorConsentCookie(target);
  if (consentOf(target) !== 'accepted') clearAnalyticsStorage(target);
  try { target.dispatchEvent?.(new Event(CONSENT_EVENT)); } catch { /* no listeners to tell */ }
}
export const openAnalyticsPreferences = (target = globalThis) => { try { target.dispatchEvent(new Event(PREFERENCES_EVENT)); } catch { /* nothing to open */ } };
