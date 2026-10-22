// A visitor's temporary copy of a shared canvas (SHARE-02, C:/s/spec/share/contract-guest-draft.md): their local edits,
// kept in this tab's sessionStorage so they survive a reload, sign-in and the way back to Fork. Never sent anywhere but
// inside a Fork request, never written to the source and never an account save.
import { useCallback, useState } from 'react';

export const draftKey = token => `rh.guest-draft:${token}`;

export function loadGuestDraft(storage, token) {
  try {
    const draft = JSON.parse(storage().getItem(draftKey(token)) || 'null');
    return draft && typeof draft.state === 'object' && draft.state && !Array.isArray(draft.state) ? draft : null;
  } catch { return null; }
}

// false: storage full or blocked; the edit stays on screen only.
export function saveGuestDraft(storage, token, version, state) {
  try { storage().setItem(draftKey(token), JSON.stringify({ base_version: version ?? null, state, edited_at: new Date().toISOString() })); return true; } catch { return false; }
}

export function clearGuestDraft(storage, token) {
  try { storage().removeItem(draftKey(token)); } catch { /* blocked storage: nothing kept */ }
}

// The Fork request's `draft` field.
export const forkDraft = draft => (draft ? { base_version: draft.base_version ?? null, state: draft.state } : null);

// The page's handle on it. `state`: the draft board to mount (null: mount the source); `edited`: an edit was made in this
// tab (also a kept draft back after sign-in or a reload); `save`: AdaptiveCanvas onSave; `forDraft`: ForkButton draft.
export function useGuestDraft(token, version, { enabled = true, storage = () => sessionStorage } = {}) {
  const [kept] = useState(() => (enabled ? loadGuestDraft(storage, token) : null));
  const [edited, setEdited] = useState(!!kept);
  const save = useCallback(state => { if (enabled) { saveGuestDraft(storage, token, version, state); setEdited(true); } }, [enabled, token, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const forDraft = useCallback(() => (enabled ? forkDraft(loadGuestDraft(storage, token)) : null), [enabled, token]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback(() => { clearGuestDraft(storage, token); setEdited(false); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state: kept?.state || null, edited: enabled && edited, save, forDraft, clear };
}
