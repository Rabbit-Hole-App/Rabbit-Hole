// Provenance on a learning card (user, 2026-09-28): who made it, whether they own the source
// repository, what it was forked from, and how often it was forked. Pure, so the rules are tested.
// The check means "created by the source repository's owner", never identity verification, and it
// comes only from an explicit source_owner_verified relationship - never from matching names.

// The number alone, as the shared header's Fork button shows it: 0, 12, 1.2k.
export const forkNumber = n => (n < 1000 ? String(n) : `${+(n / 1000).toFixed(1)}k`);

// 0 is omitted; 1 fork; 24 forks; 1.2k forks.
export function forkLabel(n) {
  if (!n) return null;
  return `${forkNumber(n)} fork${n === 1 ? '' : 's'}`;
}

// The canonical creator attribution (docs/features/user-handles.md): @handle, with the display name before it when
// there is one ("Ada Lovelace · @ada"). No handle, no line: never an email or anything made from one. A review
// fixture's creator is a name only.
export const creatorLabel = c => (c?.handle ? `${c.name ? `${c.name} · ` : ''}@${c.handle}` : c?.name || null);

export function cardModel(a) {
  const title = a.title || (a.kind === 'repository' ? (a.repo || a.name).split('/').pop() : a.name);
  // A real canvas or project names its owner by handle, read by reference on the server (owner_handle, owner_name).
  // Every @handle opens its creator's profile (owner, 2026-10-08: "always able to click on @handles").
  const creator = a.owner_handle ? { name: creatorLabel({ handle: a.owner_handle, name: a.owner_name }), sourceOwner: false, url: `/@${a.owner_handle}` }
    : a.creator?.name ? { name: a.creator.name, sourceOwner: a.source_owner_verified === true } : null;
  const repo = a.kind === 'repository' ? a.repo : a.source_repo;
  const source = repo ? `${a.kind === 'repository' ? '' : 'From '}github.com/${repo}` : null;
  const sourceUrl = repo ? `https://github.com/${repo}` : null;
  // A real fork (docs/features/canvas-forking.md) carries the source's title as it was when forked and a
  // url only while the original still opens for this person; review fixtures carry a resource id instead.
  const forkedFrom = a.forked_from_title || a.forked_from_resource_id
    ? { id: a.forked_from_resource_id || null, url: a.forked_from_url || null, title: a.forked_from_title, creator: a.forked_from_handle ? `@${a.forked_from_handle}` : a.forked_from_creator?.name, sourceOwner: a.forked_from_creator?.source_owner_verified === true,
      // The original creator's public profile (docs/features/creator-profile.md), whenever the fork names a @handle
      // (owner, 2026-10-08); the profile shows only what they published.
      creatorUrl: a.forked_from_handle ? `/@${a.forked_from_handle}` : null }
    : null;
  // The card redesign (docs/features/card-redesign.md): the owner's own description (canvas-metadata.md), never generated -
  // a project's server `description` is a placeholder ("Learn from <repo>"), so a project shows only a fixture's summary;
  // the canonical fork count as a number (null where the row has none: projects); updated_at, else created_at (0009).
  const description = (a.kind === 'repository' ? a.summary : a.description || a.summary) || null;
  const forkCount = typeof a.fork_count === 'number' ? a.fork_count : null;
  return { title, creator, source, sourceUrl, description, forkedFrom, forks: forkLabel(a.fork_count), forkCount, updated: a.updated_at || a.created_at || null };
}
