import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, GitFork, Loader2 } from 'lucide-react';
import { forkAction } from './canvas-fork.js';
import { forkLabel, forkNumber } from './home/provenance.js';
import { Button, ConfirmDialog, Input, toast } from './ui.jsx';

// The one Fork control (docs/features/canvas-forking.md), only on someone else's canvas: the shared header and their
// Explore cards. Your own canvas has no Fork; Duplicate in its ⋮ copies it (owner, 2026-10-08). `source` is { token };
// `title` is the source's, which the dialog prefills; `onForked(fork)` says where to go next. A press opens a small
// dialog, "Fork this canvas": Cancel or Escape forks nothing, Fork forks with the name as typed (blank: the source's).
// `auto` (back from sign-in, ?fork=1) opens the same dialog; `resume` is the page that finishes it (default: this one).
// `count` is the source's canonical direct-fork count, inside the button the GitHub way, [Fork | N], 0 included;
// after a fork the button takes the server's new count from the reply, never a guess, so a failed fork
// leaves it as it was. The result shows on the button itself, never in a far corner.
export default function ForkButton({ source, title = '', resume = null, onForked, auto = false, count = null, variant = 'secondary', size, className = '' }) {
  const fork = useRef(null);
  fork.current ||= forkAction();
  const busy = useRef(false);
  const [phase, setPhase] = useState('idle'); // idle | busy | done
  const [counted, setCounted] = useState(null);
  const [naming, setNaming] = useState(null); // the dialog's name while it is open
  const ask = () => { if (!busy.current) setNaming(title || ''); };
  const run = async () => {
    const name = naming;
    setNaming(null);
    if (busy.current) return; // a double click is one action
    busy.current = true;
    setPhase('busy');
    try {
      const made = await fork.current({ source, title: name.trim() });
      if (typeof made.source_fork_count === 'number') setCounted(made.source_fork_count);
      setPhase('done');
      setTimeout(() => setPhase('idle'), 1600);
      onForked?.(made);
    } catch (error) {
      setPhase('idle');
      if (error.status === 401 && error.data?.signIn) { window.location.href = `/login?next=${encodeURIComponent(`${resume || window.location.pathname}?fork=1`)}`; return; }
      toast(error.message, { tone: 'error' });
    } finally { busy.current = false; }
  };
  useEffect(() => { if (auto) ask(); }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = phase === 'busy' ? Loader2 : phase === 'done' ? Check : GitFork;
  const tip = phase === 'done' ? 'Forked: your copy is in your Library' : 'Fork: make your own editable copy in your Library';
  const label = phase === 'busy' ? 'Forking…' : phase === 'done' ? 'Forked' : 'Fork';
  const n = counted ?? count;
  const counts = typeof n === 'number';
  return <>
    <Button type="button" data-fork-button variant={variant} size={size} title={tip} aria-busy={phase === 'busy'} onClick={event => { event.stopPropagation(); ask(); }} className={className}
      aria-label={counts ? `${label}, ${forkLabel(n) || '0 forks'}` : undefined}>
      <Icon size={13} strokeWidth={1.8} className={phase === 'busy' ? 'animate-spin' : ''} />{label}
      {counts && <span data-fork-count-value className="ml-0.5 border-l border-line pl-2 tabular-nums text-ink-2">{forkNumber(n)}</span>}
    </Button>
    {/* Portaled: a hovered card's lift transform would trap a fixed overlay inside the card. */}
    {naming !== null && createPortal(
      <ConfirmDialog title="Fork this canvas" confirmLabel="Fork" confirmVariant="primary" onCancel={() => setNaming(null)} onConfirm={run}
        body={<Input autoFocus aria-label="Name" maxLength={120} value={naming} onChange={event => setNaming(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') run(); }} />} />, document.body)}
  </>;
}
