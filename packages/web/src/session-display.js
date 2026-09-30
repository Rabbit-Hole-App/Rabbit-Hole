// Who is signed in, as the UI may show it (docs/features/rabbit-hole-auth-backend.md "Display identity"):
// only what GET /auth/session returns, never the internal principal. A Google or GitHub user's principal
// is user@<id>.rabbithole.invalid (auth.js); its workspace slug is <id>-rabbithole-invalid.
import { useEffect, useState } from 'react';

export const isInternalPrincipal = value => /rabbithole[.-]invalid/i.test(String(value || ''));

let session = null;
export const loadSessionDisplay = () => (session ||= fetch('/auth/session', { credentials: 'same-origin' })
  .then(response => (response.ok ? response.json() : null)).catch(() => null));

// { label, email[, avatar] }: the name the person chose in Profile first; then the /auth/session display;
// otherwise the account email, unless it is an internal principal, which is never shown (the dev worker's
// barrier refuses /auth/*, for one). avatar is present only when they uploaded a picture.
export function shownIdentity(email, display, profile = null) {
  const base = display?.signedIn && display.display ? { label: display.display.label, email: display.display.email || null }
    : isInternalPrincipal(email) ? { label: 'Signed in', email: null }
    : { label: email || '', email: email || null };
  return { ...base, ...(profile?.name ? { label: profile.name } : {}), ...(profile?.avatar ? { avatar: profile.avatar } : {}) };
}

// GET /auth/session as it came back (null when unreachable): { signedIn, provider, display }.
export function useSessionDisplay() {
  const [display, setDisplay] = useState(null);
  useEffect(() => { let live = true; loadSessionDisplay().then(value => { if (live) setDisplay(value); }); return () => { live = false; }; }, []);
  return display;
}

// The person's own Profile (GET /api/profile, served by the app's origin): { name, avatar } or null.
let profile = null;
export const loadProfile = () => (profile ||= fetch('/api/profile', { credentials: 'same-origin' })
  .then(response => (response.ok ? response.json() : null)).catch(() => null));
// Saves a { name } or { avatar } change and tells every mounted identity to re-read it.
export async function saveProfile(patch) {
  const response = await fetch('/api/profile', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  profile = Promise.resolve(body);
  window.dispatchEvent(new CustomEvent('small:profile'));
  return body;
}
export function useProfile() {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let live = true;
    const read = () => loadProfile().then(next => { if (live) setValue(next); });
    read();
    window.addEventListener('small:profile', read);
    return () => { live = false; window.removeEventListener('small:profile', read); };
  }, []);
  return value;
}

export const useShownIdentity = email => shownIdentity(email, useSessionDisplay(), useProfile());

// Another person's address as a label (members, shares, "last opened by"): their principal is never shown.
export const personLabel = email => (isInternalPrincipal(email) ? 'Rabbit Hole user' : email);
