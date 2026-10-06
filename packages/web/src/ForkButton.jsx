import { useEffect, useRef, useState } from 'react';
import { Check, GitFork, Loader2 } from 'lucide-react';
import { forkAction } from './canvas-fork.js';
import { forkLabel, forkNumber } from './home/provenance.js';
import { Button, toast } from './ui.jsx';

// The one Fork control (docs/features/canvas-forking.md). `source` is { canvas } or { token };
// `snapshot()` returns this browser's copy of your own canvas, or null; `onForked(fork)` says where to go
// next. `iconOnly` sits in the canvas top bar beside Share; `auto` finishes a fork begun before sign-in.
// `count` (the shared header) is the source's canonical direct-fork count, shown on the button even at 0;
// after a fork the button takes the server's new count from the reply, never a guess, so a failed fork
// leaves it as it was. The result shows on the button itself, never in a far corner.
export default function ForkButton({ source, snapshot = null, onForked, auto = false, iconOnly = false, count = null, variant = 'secondary', size, className = '' }) {
  const fork = useRef(null);
  fork.current ||= forkAction();
  const busy = useRef(false);
  const [phase, setPhase] = useState('idle'); // idle | busy | done
  const [counted, setCounted] = useState(null);
  const run = async event => {
    event?.stopPropagation();
    if (busy.current) return; // a double click is one action
    busy.current = true;
    setPhase('busy');
    try {
      const made = await fork.current({ source, state: snapshot?.() || null });
      if (typeof made.source_fork_count === 'number') setCounted(made.source_fork_count);
      setPhase('done');
      setTimeout(() => setPhase('idle'), 1600);
      onForked?.(made);
    } catch (error) {
      setPhase('idle');
      if (error.status === 401 && error.data?.signIn) { window.location.href = `/login?next=${encodeURIComponent(`${window.location.pathname}?fork=1`)}`; return; }
      toast(error.message, { tone: 'error' });
    } finally { busy.current = false; }
  };
  useEffect(() => { if (auto) run(); }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = phase === 'busy' ? Loader2 : phase === 'done' ? Check : GitFork;
  const icon = <Icon size={iconOnly ? 15 : 13} strokeWidth={1.8} className={phase === 'busy' ? 'animate-spin' : ''} />;
  const title = phase === 'done' ? 'Forked: your copy is in your Library' : 'Fork: make your own editable copy in your Library';
  if (iconOnly) {
    return <button type="button" data-fork-button title={title} aria-label={phase === 'done' ? 'Forked' : 'Fork'} aria-busy={phase === 'busy'} onClick={run}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 hover:bg-hover hover:text-ink ${className}`}>{icon}</button>;
  }
  const label = phase === 'busy' ? 'Forking…' : phase === 'done' ? 'Forked' : 'Fork';
  const n = counted ?? count;
  const counts = typeof n === 'number';
  return <Button type="button" data-fork-button variant={variant} size={size} title={title} aria-busy={phase === 'busy'} onClick={run} className={className}
    aria-label={counts ? `${label}, ${forkLabel(n) || '0 forks'}` : undefined}>
    {icon}{label}
    {counts && <span data-fork-count-value className="ml-0.5 border-l border-line pl-2 tabular-nums text-ink-2">{forkNumber(n)}</span>}
  </Button>;
}
