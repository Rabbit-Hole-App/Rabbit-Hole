import { useEffect, useRef, useState } from 'react';
import { Bug, Check, Lightbulb, Loader2, MessageSquareWarning, X } from 'lucide-react';
import { api } from './api.js';

// Report a bug or suggest a feature (docs/features/learn-feedback.md): from
// the Learn canvas's lower left (app set, panel opens up) or a left sidebar
// rail on Home, Library and Explore (no app, placement 'right': the panel
// opens beside the button, bottom-aligned). The report carries where it was
// sent from; the confirmation stays on the button, never a corner toast.
// trigger: the sidebar draws its own row in place of the square button (docs/features/sidebar-polish.md),
// given the open state, the icon (a check once sent) and the toggle.
export default function FeedbackButton({ app = null, board = null, placement = 'up', trigger = null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('bug');
  const [text, setText] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');
  const box = useRef(null);
  // Close on a press outside or Esc, like the canvas's other popovers.
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => { if (state !== 'sent') return; const timer = setTimeout(() => setState('idle'), 2500); return () => clearTimeout(timer); }, [state]);

  const submit = async event => {
    event.preventDefault();
    if (!text.trim() || state === 'sending') return;
    setState('sending'); setError('');
    try {
      await api('/api/learn/feedback', { method: 'POST', body: JSON.stringify({ app, kind, text: text.trim(), context: { board: app ? board || 'main' : null, path: window.location.pathname + window.location.search, viewport: `${window.innerWidth}x${window.innerHeight}`, userAgent: navigator.userAgent } }) });
      setText(''); setOpen(false); setState('sent');
    } catch (problem) { setState('error'); setError(problem.message || 'Could not send. Try again.'); }
  };
  const Icon = state === 'sent' ? Check : MessageSquareWarning;
  return (
    <div ref={box} className="relative shrink-0">
      {trigger ? trigger({ open, sent: state === 'sent', icon: Icon, toggle: () => setOpen(value => !value) }) : <button type="button" data-feedback aria-label="Report a bug or suggest a feature" title={state === 'sent' ? 'Sent, thank you' : 'Report a bug or suggest a feature'}
        aria-expanded={open} onClick={() => setOpen(value => !value)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white shadow-sm hover:bg-hover ${state === 'sent' ? 'text-green-700' : 'text-ink-2 hover:text-ink'}`}>
        <Icon size={15} />
      </button>}
      {open && (
        <form data-feedback-panel onSubmit={submit} aria-label="Feedback"
          className={`absolute z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line bg-white p-3 shadow-pop ${placement === 'right' ? 'bottom-0 left-full ml-2' : 'bottom-full left-0 mb-2'}`}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Send feedback</p>
            <button type="button" aria-label="Close feedback" onClick={() => setOpen(false)} className="rounded p-1 text-ink-3 hover:bg-hover hover:text-ink"><X size={14} /></button>
          </div>
          <div role="radiogroup" aria-label="Feedback type" className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-hover p-0.5">
            {[['bug', 'Report a bug', Bug], ['idea', 'Suggest a feature', Lightbulb]].map(([value, label, KindIcon]) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${kind === value ? 'bg-white font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}>
                <KindIcon size={13} />{label}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={event => setText(event.target.value)} rows={4} maxLength={2000} autoFocus aria-label={kind === 'bug' ? 'What went wrong' : 'Your idea'}
            placeholder={kind === 'bug' ? 'What went wrong, and what did you expect?' : 'What would you like Rabbit Hole to do?'}
            className="w-full resize-y rounded-lg border border-line p-2 text-sm outline-none focus:border-ink-3" />
          {state === 'error' && <p className="mt-1 text-xs text-red-700">{error}</p>}
          <div className="mt-2 flex items-center justify-end">
            <button type="submit" data-feedback-submit disabled={!text.trim() || state === 'sending'}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-white disabled:opacity-40">
              {state === 'sending' && <Loader2 size={13} className="animate-spin" />}Submit
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
