import { BadgeCheck, GitFork } from 'lucide-react';
import { Tip } from '../ui.jsx';

// The pieces of a learning card's provenance (provenance.js cardModel). Secondary type
// throughout: provenance supports the title, it never competes with it.

// Created by the source repository's owner - not identity verification, quality or endorsement.
export function OwnerCheck() {
  return (
    <Tip label="Source owner" info="Created by the owner of the source repository">
      <span role="img" aria-label="Created by repository owner" className="inline-flex shrink-0 text-accent"><BadgeCheck size={14} strokeWidth={2} /></span>
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

// ponytail: not a link yet - forks and their source pages are not built. Link it to
// forkedFrom.id when they are.
export function ForkedFrom({ m }) {
  if (!m.forkedFrom) return null;
  const f = m.forkedFrom;
  return (
    <span data-forked-from className="flex min-w-0 items-start gap-1 text-xs text-ink-2">
      <GitFork size={12} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <span className="line-clamp-2 min-w-0">
        Forked from <span className="text-ink">{f.title}</span>{f.creator && ' · '}
        {/* the creator and their check wrap together */}
        {f.creator && <span className="whitespace-nowrap">{f.creator}{f.sourceOwner && <span className="ml-0.5 inline-flex align-[-3px]"><OwnerCheck /></span>}</span>}
      </span>
    </span>
  );
}

export function Forks({ m }) {
  if (!m.forks) return null;
  return <span data-fork-count className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-3"><GitFork size={12} strokeWidth={1.5} />{m.forks}</span>;
}
