// Public handles (docs/features/user-handles.md): the canonical form and the rules, pure so the server (profile.js,
// the authority) and the browser's hints share one definition. A handle is 3-30 of a-z, 0-9 and _, starting with a
// letter or digit, compared and stored lowercase. One leading @ is accepted as typed; surrounding whitespace is
// refused, never trimmed into someone else's handle.
export const HANDLE_MIN = 3, HANDLE_MAX = 30;
const SYNTAX = /^[a-z0-9][a-z0-9_]{2,29}$/;

// Product and system words nobody may claim: routes, roles and the product's own names. Generic on purpose; extend
// here, never per person.
export const RESERVED_HANDLES = Object.freeze([
  'about', 'account', 'admin', 'api', 'app', 'apps', 'auth', 'billing', 'blog', 'docs', 'explore', 'help', 'home',
  'library', 'login', 'logout', 'me', 'mod', 'moderator', 'null', 'official', 'privacy', 'rabbit', 'rabbithole',
  'root', 'security', 'settings', 'signin', 'signup', 'staff', 'support', 'system', 'team', 'terms', 'undefined', 'www',
]);

// What a handle field keeps of what was typed or pasted: its fixed "@" prefix is the one visible @, so a leading @
// never stays in the editable value (owner, 2026-10-06: never "@@handle"). The value keeps its case as typed; it is
// canonicalized only by normalizeHandle.
export const fieldHandle = value => String(value).replace(/^@+/, '');

// { handle } in canonical form, or { error } saying what to change.
export function normalizeHandle(value) {
  if (typeof value !== 'string') return { error: 'Choose a handle.' };
  if (value !== value.trim()) return { error: 'A handle has no spaces.' };
  const handle = value.replace(/^@/, '').toLowerCase();
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return { error: `A handle is ${HANDLE_MIN}-${HANDLE_MAX} characters.` };
  if (!SYNTAX.test(handle)) return { error: 'Use letters, numbers and _, starting with a letter or number.' };
  if (RESERVED_HANDLES.includes(handle)) return { error: `@${handle} is reserved. Choose another.` };
  return { handle };
}
