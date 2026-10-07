import { ArrowUpRight, GitFork } from 'lucide-react';
import { Tip } from '../ui.jsx';

// The pieces of a learning card's provenance (provenance.js cardModel). Secondary type
// throughout: provenance supports the title, it never competes with it.

// Created by the owner of the source repository - never identity verification, quality,
// endorsement or popularity. A solid scalloped badge with a white check, our own drawing.
// `owned` (card redesign, owner 2026-10-06 §20): the same drawing beside your own @handle on your own cards - "Owned by
// you", which says whose card it is and never verifies anyone's identity.
export function OwnerCheck({ size = 15, owned = false }) {
  return (
    <Tip label={owned ? 'Owned by you' : 'Source owner'} info={owned ? 'This is yours. It does not verify identity.' : 'Created by the owner of the source repository'}>
      <svg data-owner-badge data-owned-badge={owned || undefined} role="img" aria-label={owned ? 'Owned by you' : 'Created by repository owner'} width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
        <path className="fill-accent" d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
        <path d="m8.5 12.2 2.4 2.4 4.6-4.9" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Tip>
  );
}

export function Creator({ m }) {
  if (!m.creator) return null;
  return (
    <span data-creator className="flex min-w-0 items-center gap-1 text-xs text-ink-2">
      <span className="truncate">{m.creator.name}</span>
      {m.creator.sourceOwner && <OwnerCheck />}
    </span>
  );
}

// Keyboard-visible, and a link only on hover or focus: the cards stay quiet at rest. Focus is a tint
// plus underline, not an outline: these lines truncate (overflow hidden), which would clip a ring.
const LINK = 'rounded-sm underline-offset-2 outline-none hover:text-ink hover:underline focus-visible:bg-accent/15 focus-visible:text-ink focus-visible:underline';

// The repository on GitHub, in a new tab. The click never reaches the card's Open.
export function SourceLink({ m, suffix = '' }) {
  if (!m.source) return null;
  const from = m.source.startsWith('From ') ? 'From ' : '';
  return (
    <span className="min-w-0 truncate text-xs text-ink-2">
      {from}
      <a data-source-link href={m.sourceUrl} target="_blank" rel="noreferrer" title="Open the repository on GitHub" onClick={(e) => e.stopPropagation()} className={LINK}>{m.source.slice(from.length)}</a>
      {suffix}
    </span>
  );
}

// Forked from "<title>" ↗ opens the original Rabbit Hole resource, never GitHub: a real fork by its url
// while the original still opens for this person (docs/features/canvas-forking.md), a review fixture by
// onOpen. Otherwise the title stays - it is the fork's own record - and the original reads unavailable.
export function ForkedFrom({ m, onOpen, className = '' }) {
  if (!m.forkedFrom) return null;
  const f = m.forkedFrom;
  // A no-break space: the ↗ wraps with the title, never alone on the next line.
  const title = <>&ldquo;{f.title}&rdquo;&nbsp;<ArrowUpRight size={11} strokeWidth={1.8} className="inline align-[-1px]" /></>;
  const gone = !f.url && !f.id;
  return (
    <span data-forked-from title={gone ? `Forked from “${f.title}”. The original was deleted, or is private or no longer shared with you.` : undefined} className={`flex min-w-0 items-start gap-1 text-xs text-ink-2 ${className}`}>
      <GitFork size={12} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <span className="line-clamp-3 min-w-0">
        Forked from{' '}
        {f.url ? <a data-forked-from-link href={f.url} title="Open the original" onClick={(e) => e.stopPropagation()} className={`text-ink ${LINK}`}>{title}</a>
          : f.id ? <button type="button" title="Open the original" onClick={(e) => { e.stopPropagation(); onOpen?.(f.id); }} className={`cursor-pointer text-ink ${LINK}`}>{title}</button>
          : <><span className="text-ink">&ldquo;{f.title}&rdquo;</span> <span data-forked-from-unavailable className="text-ink-3">· original unavailable</span></>}
        {f.creator && ' · '}
        {/* the creator and their badge wrap together */}
        {f.creator && <span className="whitespace-nowrap">{f.creator}{f.sourceOwner && <span className="ml-0.5 inline-flex align-[-3px]"><OwnerCheck /></span>}</span>}
      </span>
    </span>
  );
}

export function Forks({ m }) {
  if (!m.forks) return null;
  return <span data-fork-count className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-3"><GitFork size={12} strokeWidth={1.5} />{m.forks}</span>;
}
