import { useEffect, useState } from 'react';
import { HANDLE_MAX, fieldHandle, normalizeHandle } from '../../control-plane/src/handle.js';
import { gateFor, loadProfile, saveProfile } from './session-display.js';
import { PRODUCT } from './flags.js';
import logoBlack from './assets/rabbit-hole-black.png';
import logoWhite from './assets/rabbit-hole-white.png';

// Every Rabbit Hole user has a public @handle (docs/features/user-handles.md). A signed-in person without one chooses
// it here, in place, before anything else: the URL stays as it is, so whatever they came for - a shared canvas, a
// fork or a Rabbit Hole resumed after sign-in, a canvas of their own - carries on as soon as it is claimed. Signed out,
// or with no profile service, the page renders as before. The server is the authority on the handle; the rules shown
// here are the same module's. fallback: what shows while the profile is checked (a canvas route's loading shell).
export default function HandleGate({ children, fallback = null }) {
  const [state, setState] = useState('checking'); // checking | needed | ok
  useEffect(() => {
    let live = true;
    loadProfile().then(profile => { if (live) setState(gateFor(profile)); });
    return () => { live = false; };
  }, []);
  if (state === 'checking') return fallback;
  return state === 'needed' ? <ChooseHandle onDone={() => setState('ok')} /> : children;
}

export function ChooseHandle({ onDone }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const checked = value ? normalizeHandle(value) : null;
  const submit = async event => {
    event.preventDefault();
    if (!checked?.handle || busy) return;
    setBusy(true); setError('');
    try { await saveProfile({ handle: checked.handle }); onDone(); }
    catch (problem) { setError(problem.message); setBusy(false); }
  };
  const problem = error || checked?.error || '';
  return (
    <main data-handle-setup className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 pt-10 pb-[calc(2.5rem+10vh)]">
      <form onSubmit={submit} className="w-full max-w-[400px]">
        <div data-handle-brand className="flex items-center gap-1.5">
          <img src={logoBlack} alt="" width="32" height="32" className="h-8 w-8 dark:hidden" />
          <img src={logoWhite} alt="" width="32" height="32" className="hidden h-8 w-8 dark:block" />
          <span className="text-sm font-semibold text-ink">{PRODUCT}</span>
        </div>
        <h1 className="mt-6 text-[26px] leading-8 font-semibold text-ink">Choose your handle</h1>
        <p className="mt-2 text-[15px] leading-6 text-ink-2">Your public name on {PRODUCT}.</p>
        <label htmlFor="handle-input" className="mt-6 block text-sm font-medium text-ink">Handle</label>
        <div className="relative mt-1.5">
          <span data-handle-prefix aria-hidden className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base text-ink-3">@</span>
          <input id="handle-input" autoFocus value={value} maxLength={HANDLE_MAX + 1} spellCheck={false} autoCapitalize="none" autoComplete="off"
            aria-describedby="handle-help handle-feedback" aria-invalid={problem ? true : undefined}
            onChange={event => { setValue(fieldHandle(event.target.value)); setError(''); }} placeholder="yourname"
            className={`h-12 w-full rounded-lg border bg-white pr-3.5 pl-8 text-base text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-accent/60 ${problem ? 'border-fail' : 'border-line-strong focus-visible:border-accent'}`} />
        </div>
        <p id="handle-help" className="mt-2 text-[13px] leading-5 text-ink-3">3–30 letters, numbers, or underscores.</p>
        <p id="handle-feedback" data-handle-hint role={problem ? 'alert' : undefined} className="min-h-5 text-[13px] leading-5 text-fail">{problem}</p>
        <button type="submit" disabled={!checked?.handle || busy}
          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-lg border-0 bg-primary-fill text-[15px] font-medium text-white transition-colors duration-100 select-none hover:bg-primary-fill-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 disabled:cursor-default disabled:bg-active disabled:text-ink-2 disabled:hover:bg-active">{busy ? 'Saving' : 'Continue'}</button>
        <p className="mt-3 text-[13px] leading-5 text-ink-3">You can change this later in Settings.</p>
      </form>
    </main>
  );
}
