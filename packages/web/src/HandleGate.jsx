import { useEffect, useState } from 'react';
import { HANDLE_MAX, normalizeHandle } from '../../control-plane/src/handle.js';
import { gateFor, loadProfile, saveProfile } from './session-display.js';
import { PRODUCT } from './flags.js';
import { Button } from './ui.jsx';

// Every Rabbit Hole user has a public @handle (docs/features/user-handles.md). A signed-in person without one chooses
// it here, in place, before anything else: the URL stays as it is, so whatever they came for - a shared canvas, a
// fork or a Rabbit Hole resumed after sign-in, a canvas of their own - carries on as soon as it is claimed. Signed out,
// or with no profile service, the page renders as before. The server is the authority on the handle; the rules shown
// here are the same module's.
export default function HandleGate({ children }) {
  const [state, setState] = useState('checking'); // checking | needed | ok
  useEffect(() => {
    let live = true;
    loadProfile().then(profile => { if (live) setState(gateFor(profile)); });
    return () => { live = false; };
  }, []);
  if (state === 'checking') return null;
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
  return (
    <main data-handle-setup className="grid min-h-screen place-items-center bg-white p-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <img src="/landing/favicon-32-v1.png" alt="" width="28" height="28" className="h-7 w-7 rounded-sm" />
        <h1 className="mt-4 text-xl font-semibold text-ink">Choose your handle</h1>
        <p className="mt-1.5 text-sm text-ink-2">It is how people see you on {PRODUCT}: on canvases you share, publish or that others fork. You can change it later in Settings.</p>
        <label className="mt-5 flex h-10 items-center rounded-lg border border-line-strong bg-white px-3 focus-within:outline-2 focus-within:outline-accent/35">
          <span className="text-sm text-ink-3">@</span>
          <input autoFocus aria-label="Handle" value={value} maxLength={HANDLE_MAX + 1} spellCheck={false} autoCapitalize="none" autoComplete="off"
            onChange={event => { setValue(event.target.value); setError(''); }} className="ml-0.5 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" placeholder="yourname" />
        </label>
        <p data-handle-hint role={error ? 'alert' : undefined} className={`mt-2 min-h-5 text-xs ${error || checked?.error ? 'text-red-700' : 'text-ink-3'}`}>
          {error || checked?.error || (checked?.handle ? `You will be @${checked.handle}` : '3-30 letters, numbers or _.')}
        </p>
        <Button type="submit" variant="primary" disabled={!checked?.handle || busy} className="mt-3 w-full justify-center">{busy ? 'Saving…' : 'Continue'}</Button>
      </form>
    </main>
  );
}
