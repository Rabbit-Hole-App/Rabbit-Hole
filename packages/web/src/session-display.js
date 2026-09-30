// Who is signed in, as the UI may show it (docs/features/rabbit-hole-auth-backend.md "Display identity"):
// only what GET /auth/session returns, never the internal principal. A Google or GitHub user's principal
// is user@<id>.rabbithole.invalid (auth.js); its workspace slug is <id>-rabbithole-invalid.
import { useEffect, useState } from 'react';

export const isInternalPrincipal = value => /rabbithole[.-]invalid/i.test(String(value || ''));

let session = null;
export const loadSessionDisplay = () => (session ||= fetch('/auth/session', { credentials: 'same-origin' })
  .then(response => (response.ok ? response.json() : null)).catch(() => null));

// { label, email }: the /auth/session display when there is one; otherwise the account email, unless it is
// an internal principal, which is never shown (the dev worker's barrier refuses /auth/*, for one).
export function shownIdentity(email, display) {
  if (display?.signedIn && display.display) return { label: display.display.label, email: display.display.email || null };
  if (isInternalPrincipal(email)) return { label: 'Signed in', email: null };
  return { label: email || '', email: email || null };
}

export function useShownIdentity(email) {
  const [display, setDisplay] = useState(null);
  useEffect(() => { let live = true; loadSessionDisplay().then(value => { if (live) setDisplay(value); }); return () => { live = false; }; }, []);
  return shownIdentity(email, display);
}

// Another person's address as a label (members, shares, "last opened by"): their principal is never shown.
export const personLabel = email => (isInternalPrincipal(email) ? 'Rabbit Hole user' : email);
