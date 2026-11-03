// Email preferences, the pure part (docs/features/signup-email-preferences.md, owner 2026-11-03): "Rabbit Hole Updates" and
// "Newsletter", two independent optional choices. The server (profile.js, email-preferences-store.js) is the authority; the
// browser (HandleGate, Settings) imports the same wording, defaults and view. No imports: web and the Workers both bundle it.
export const CATEGORIES = Object.freeze(['updates', 'newsletter']);
export const SOURCES = Object.freeze(['onboarding', 'settings', 'unsubscribe']);
// How a value was obtained. A box shown checked and submitted unchanged is signup_preselected: stored as submitted, never an opt-in.
export const METHODS = Object.freeze(['signup_preselected', 'signup_user_checked', 'signup_user_unchecked', 'settings_user_set', 'unsubscribe_link']);

// The wording shown next to the boxes, by version. Changing a word means a new version here, never an edit in place: each stored
// preference names the version the person saw. Owner to confirm the descriptions (the product had none before this).
export const DISCLOSURE_VERSION = 'v1';
export const DISCLOSURES = Object.freeze({
  v1: Object.freeze({
    updates: Object.freeze({ label: 'Rabbit Hole Updates', description: 'Product news: new features and changes to Rabbit Hole.' }),
    newsletter: Object.freeze({ label: 'Newsletter', description: 'Our newsletter: articles and ideas about learning with Rabbit Hole.' }),
  }),
});
export const wording = (version = DISCLOSURE_VERSION) => DISCLOSURES[version] || DISCLOSURES[DISCLOSURE_VERSION];

// Which categories may be sent only on an AFFIRMATIVE opt-in (a box the person actively ticked, or switched on in Settings),
// not on a preselected default. OWNER DECISION PENDING: newsletter is marketing; updates is treated as product news.
export const AFFIRMATIVE_REQUIRED = Object.freeze({ updates: false, newsletter: true });

// Providers whose stored provider_email auth.js has verified: Google (kept only when email_verified is true) and the emailed
// link (the address itself, proven by the single-use link). GitHub is absent on purpose: auth.js keeps the public profile
// email from GET /user with no scope and no verified flag, so a GitHub address stays "pending" until sign-in asks GitHub for
// the primary verified email (owner decision).
export const VERIFIED_PROVIDERS = Object.freeze(['email', 'google']);

const ADDRESS = /^[a-z0-9._%+-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
// The one address mail may go to for these identity rows ({ provider, provider_email, last_login_at }), or null. Never the
// internal principal (user@<id>.rabbithole.invalid) and never an address from a provider that does not verify it.
export function deliverableEmail(identities) {
  const usable = (identities || [])
    .filter(i => VERIFIED_PROVIDERS.includes(i.provider) && typeof i.provider_email === 'string')
    .map(i => ({ address: i.provider_email.trim().toLowerCase(), at: i.last_login_at || 0 }))
    .filter(i => i.address.length <= 254 && ADDRESS.test(i.address) && !i.address.endsWith('.invalid'))
    .sort((a, b) => b.at - a.at);
  return usable[0]?.address ?? null;
}

// The method a submitted value gets. onboarding: touched says the person changed the box (the client sends it; the server never
// infers it). settings and unsubscribe are always an act of the person.
export function methodFor(source, { enabled, touched }) {
  if (source === 'settings') return 'settings_user_set';
  if (source === 'unsubscribe') return 'unsubscribe_link';
  if (!touched) return 'signup_preselected';
  return enabled ? 'signup_user_checked' : 'signup_user_unchecked';
}
export const isAffirmative = (method, enabled) => enabled === true && (method === 'signup_user_checked' || method === 'settings_user_set');

// { value: { source, disclosure, choices: { category: { enabled, method, affirmative } } } } or { error }. Only what the person
// sent is in choices: a category left out is not touched. There is no account in the input: the caller supplies it from the session.
export function validateEmailPreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'emailPreferences must be an object' };
  const { source, disclosure } = input;
  if (source !== 'onboarding' && source !== 'settings') return { error: 'emailPreferences.source must be onboarding or settings' };
  if (typeof disclosure !== 'string' || !Object.hasOwn(DISCLOSURES, disclosure)) return { error: 'emailPreferences.disclosure is not a known wording version' };
  const choices = {};
  for (const category of CATEGORIES) {
    if (!Object.hasOwn(input, category)) continue;
    const choice = input[category];
    if (!choice || typeof choice !== 'object' || typeof choice.enabled !== 'boolean') return { error: `${category}.enabled must be true or false` };
    if (source === 'onboarding' && typeof choice.touched !== 'boolean') return { error: `${category}.touched must be true or false` };
    if (source === 'onboarding' && !choice.touched && !choice.enabled) return { error: `${category} is shown checked, so an untouched box cannot be off` };
    const method = methodFor(source, { enabled: choice.enabled, touched: choice.touched });
    choices[category] = { enabled: choice.enabled, method, affirmative: isAffirmative(method, choice.enabled) };
  }
  if (!Object.keys(choices).length) return { error: 'emailPreferences names no category' };
  return { value: { source, disclosure, choices } };
}

// What the browser may know: per category true / false / null (no preference recorded), whether it is an active opt-in, and
// whether there is a verified address to send to. Never the address, the method or a time.
export function preferenceView(rows, deliverable) {
  const view = { disclosure: DISCLOSURE_VERSION, deliverable: !!deliverable };
  for (const category of CATEGORIES) {
    const row = (rows || []).find(r => r.category === category);
    view[category] = row ? { enabled: !!row.enabled, affirmative: !!row.affirmative } : { enabled: null, affirmative: false };
  }
  return view;
}

// The one gate for a marketing-style send: current preference, the owner's affirmative-consent rule, a verified address and the
// suppression list. { send: true, address } or { send: false, reason }. A preference with no verified address is pending.
export function sendDecision({ category, preference, address, suppressed }) {
  if (!CATEGORIES.includes(category)) return { send: false, reason: 'unknown_category' };
  if (!preference) return { send: false, reason: 'no_preference' };
  if (!preference.enabled) return { send: false, reason: 'opted_out' };
  if (AFFIRMATIVE_REQUIRED[category] && !preference.affirmative) return { send: false, reason: 'needs_affirmative_consent' };
  if (!address) return { send: false, reason: 'no_verified_email' };
  if (suppressed) return { send: false, reason: 'suppressed' };
  return { send: true, address };
}

// The onboarding boxes, as the form holds them: both checked, neither touched. toggleChoice flips one and marks only it touched.
export const initialChoices = () => ({ updates: { enabled: true, touched: false }, newsletter: { enabled: true, touched: false } });
export const toggleChoice = (choices, category) => ({ ...choices, [category]: { enabled: !choices[category].enabled, touched: true } });
// The body sent with the handle when the person presses Continue (displaying the boxes sends nothing).
export const onboardingSubmission = (choices, disclosure = DISCLOSURE_VERSION) => ({ source: 'onboarding', disclosure, updates: { ...choices.updates }, newsletter: { ...choices.newsletter } });
