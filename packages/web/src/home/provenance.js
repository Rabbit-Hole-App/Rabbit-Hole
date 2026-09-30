// Provenance on a learning card (user, 2026-09-28): who made it, whether they own the source
// repository, what it was forked from, and how often it was forked. Pure, so the rules are tested.
// The check means "created by the source repository's owner", never identity verification, and it
// comes only from an explicit source_owner_verified relationship - never from matching names.

// 0 is omitted; 1 fork; 24 forks; 1.2k forks.
export function forkLabel(n) {
  if (!n) return null;
  if (n < 1000) return `${n} fork${n === 1 ? '' : 's'}`;
  return `${+(n / 1000).toFixed(1)}k forks`;
}

export function cardModel(a) {
  const title = a.title || (a.kind === 'repository' ? (a.repo || a.name).split('/').pop() : a.name);
  const creator = a.creator?.name ? { name: a.creator.name, sourceOwner: a.source_owner_verified === true } : null;
  const repo = a.kind === 'repository' ? a.repo : a.source_repo;
  const source = repo ? `${a.kind === 'repository' ? '' : 'From '}github.com/${repo}` : null;
  const sourceUrl = repo ? `https://github.com/${repo}` : null;
  const forkedFrom = a.forked_from_resource_id
    ? { id: a.forked_from_resource_id, title: a.forked_from_title, creator: a.forked_from_creator?.name, sourceOwner: a.forked_from_creator?.source_owner_verified === true }
    : null;
  return { title, creator, source, sourceUrl, summary: a.summary || null, forkedFrom, forks: forkLabel(a.fork_count) };
}
