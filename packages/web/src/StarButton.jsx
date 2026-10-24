import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Loader2, Star } from 'lucide-react';
import { starLabel, starNumber, starSignInUrl, starStore } from './canvas-star.js';
import { Button, toast } from './ui.jsx';

// The one Star control (docs/features/stars.md), for a canvas a shared link opens. Visible at rest, a plain toggle: outlined
// "Star" or filled "Starred", and the canvas's star count inside it, 0 included. It says what it is asking for while a request
// is in flight (the spinner, aria-busy) and shows only the server's answer after; a failure puts the confirmed state back
// and says so beside the button. A press is its own: it never reaches a card's navigation, selection, Fork or drag.
// `initial` is { starred, count } from the page's own answer. `signedIn` false: a press goes to sign-in, which returns to this
// canvas with ?star=1; `auto` (that return) stars once, and the server re-checks access like any press. Presses made while a
// request is in flight collapse to the last one (canvas-star.js). It re-reads when the tab comes back, so another tab's
// change shows. A card passes its own `api` (canvas-star.js: the owner route, or the shared route with its surface), `signInMark` (its
// token, so the return stars that card), and `pending` while the list's starred state is still loading (a disabled, named button).
export default function StarButton({ token, initial, signedIn, auto = false, variant = 'secondary', size, className = '', tight = false, api, signInMark = '1', pending = false }) {
  const store = useMemo(() => starStore(token, initial, api), [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useSyncExternalStore(store.subscribe, store.get);
  const toSignIn = () => { window.location.href = starSignInUrl(window.location.pathname, window.location.search, signInMark); };
  const press = async next => {
    if (signedIn === false) { toSignIn(); return; }
    await store.set(next);
    const { error } = store.get();
    if (!error) return;
    if (error.status === 401 && error.data?.signIn && !auto) { toSignIn(); return; } // back from sign-in and still refused: no loop
    toast(error.message, { tone: 'error' });
  };
  const once = useRef(false);
  useEffect(() => { if (auto && signedIn !== false && !pending && !once.current) { once.current = true; press(true); } }, [auto, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const again = () => { if (document.visibilityState === 'visible') store.refresh(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, [store]);
  const shown = state.saving ? state.desired : state.starred;
  const label = shown ? 'Starred' : 'Star';
  const counts = typeof state.count === 'number';
  return (
    <Button type="button" data-star-button data-starred={shown ? 'true' : 'false'} variant={variant} size={size} aria-pressed={shown} aria-busy={state.saving} disabled={pending}
      title={shown ? 'Starred: saved to your Stars. Press to remove it' : 'Star: save this canvas to your Stars'} className={`${className} ${tight ? 'px-2 @6xl:px-3' : ''}`}
      aria-label={counts ? `${label}, ${starLabel(state.count)}` : label}
      onClick={event => { event.stopPropagation(); press(!shown); }} onPointerDown={event => event.stopPropagation()}>
      {state.saving ? <Loader2 size={13} strokeWidth={1.8} className="animate-spin" aria-hidden /> : <Star size={13} strokeWidth={1.8} fill={shown ? 'currentColor' : 'none'} aria-hidden />}
      <span className={tight ? 'sr-only @6xl:not-sr-only' : 'max-sm:sr-only'}>{label}</span>
      {counts && <span data-star-count-value className={`${tight ? '@6xl:ml-0.5 @6xl:border-l @6xl:pl-2' : 'ml-0.5 border-l pl-2'} tabular-nums ${variant === 'primary' ? 'border-white/40 text-white' : 'border-line text-ink-2'}`}>{starNumber(state.count)}</span>}
    </Button>
  );
}
