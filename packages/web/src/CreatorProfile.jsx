import { useEffect, useState } from 'react';
import { BarChart3, Compass, FolderGit2, Search, UserRound, UserPen } from 'lucide-react';
import { CreatorDashboard } from './CreatorAnalytics.jsx';
import { PRODUCT } from './flags.js';
import { SortMenu } from './home/LearningCard.jsx';
import PublicCards, { CopyProfileLink, CreatorAvatar } from './home/PublicCards.jsx';
import { OwnerCheck } from './home/Provenance.jsx';
import { forkNumber, matchingProjects } from './home/provenance.js';
import { loadProfile, useProfile } from './session-display.js';
import Shell from './Shell.jsx';
import { Button, EmptyState, Input, SkeletonRows, Toasts } from './ui.jsx';

// /@handle: a creator's public profile (owner 2026-10-06 #63, docs/features/creator-profile.md) - identity, public
// explainers and the public-safe counters, for discovery and reputation; not a social network. Everyone sees the same
// page; the owner also gets Edit profile and their private Analytics, opened beside it, never mixed in. Signed in, it
// sits in the app's Shell; signed out, it stands alone, as /e/<token> does.
const SORTS = [{ id: 'newest', label: 'Newest' }, { id: 'forks', label: 'Most forked' }];
const plural = (n, word) => `${forkNumber(n)} ${word}${n === 1 ? '' : 's'}`;

export default function CreatorProfilePage({ handle }) {
  const [viewer, setViewer] = useState(undefined); // undefined: checking; null: signed out; else their profile
  useEffect(() => { let live = true; loadProfile().then(p => { if (live) setViewer(p); }); return () => { live = false; }; }, []);
  if (viewer === undefined) return null;
  if (viewer) return <Shell>{() => <Profile handle={handle} />}</Shell>;
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="flex shrink-0 items-center border-b border-line px-4 py-2">
        <a href="/" data-shared-brand className="flex items-center gap-2 no-underline" aria-label={`${PRODUCT} home`}>
          <img src="/landing/favicon-32-v1.png" alt="" width="20" height="20" className="h-5 w-5 rounded-sm" />
          <span className="text-sm font-semibold text-ink">{PRODUCT}</span>
        </a>
      </header>
      <Profile handle={handle} />
      <Toasts />
    </div>
  );
}

function Profile({ handle }) {
  const me = useProfile(); // re-read when Settings saves, so a changed handle follows
  const [sort, setSort] = useState('newest');
  const [p, setP] = useState(null); // null: loading; { missing }; the profile
  const [analytics, setAnalytics] = useState(false);
  // Search this creator's projects and canvases (owner 2026-10-08), as Explore's field: the server filters (the list is
  // capped), a pause after typing; Esc clears. The answer keeps the term it was asked for (p.q).
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(typed.trim()), 250); return () => clearTimeout(t); }, [typed]);
  useEffect(() => {
    let live = true;
    fetch(`/api/learn/creators/${encodeURIComponent(handle)}?sort=${sort}${term ? `&q=${encodeURIComponent(term)}` : ''}`, { credentials: 'same-origin' })
      .then(async r => { const body = await r.json().catch(() => ({})); if (live) setP(r.ok ? { ...body, q: term } : { missing: true }); })
      .catch(() => { if (live) setP({ missing: true }); });
    return () => { live = false; };
  }, [handle, sort, term]);
  // The address carries the canonical handle (case-insensitive lookup, lowercase handle).
  useEffect(() => { if (p?.handle && p.handle !== handle) window.history.replaceState(null, '', `/@${p.handle}`); }, [p?.handle]);
  const own = !!me?.handle && me.handle === p?.handle;
  // Your own description follows Settings at once (useProfile re-reads on save); everyone else's is the profile's.
  const description = own ? me.description : p?.description;
  // Your own handle changed in Settings while you are here: the profile follows it.
  const [was, setWas] = useState(null);
  useEffect(() => {
    if (was && me?.handle && was !== me.handle && p?.handle === was) window.location.replace(`/@${me.handle}`);
    setWas(me?.handle || null);
  }, [me?.handle]);
  const wrap = 'mx-auto max-w-[1150px] px-24 pb-12 pt-12 max-lg:px-8 max-md:px-4 max-md:pt-6';
  if (!p) return <main className="flex-1 overflow-y-auto"><div className={wrap}><SkeletonRows rows={3} /></div></main>;
  if (p.missing) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div data-profile-missing className={wrap}><EmptyState icon={UserRound}>No creator @{handle.toLowerCase()}. The handle may have changed.</EmptyState></div>
      </main>
    );
  }
  return (
    <main className="flex-1 overflow-y-auto">
      <div data-creator-profile={p.handle} className={wrap}>
        <header className="flex flex-wrap items-start gap-x-6 gap-y-4 pb-8">
          {/* The picture and the identity never wrap apart; on a phone your own Edit profile and Analytics wrap below them,
              never squeezing the name and description. 96px on a phone, 128px from md up (owner brief 2026-10-23). */}
          <div className="flex min-w-0 flex-1 basis-80 items-start gap-4 md:gap-6">
            <CreatorAvatar c={p} className="h-24 w-24 text-4xl! md:h-32 md:w-32 md:text-5xl!" />
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
              {/* The blue owner check sits right after the @handle, only on your own profile, meaning "this is yours" - never
                  verification (owner rule). With a display name the name is the heading and the @handle follows in its own
                  row; with none the @handle is the heading and carries the check, never repeated beneath. */}
              {p.name ? <h1 data-profile-name className="break-words text-[32px] font-bold leading-[1.15] tracking-[-0.01em] text-ink">{p.name}</h1>
                : (
                  <div data-profile-handle-group className="flex min-w-0 items-center gap-2">
                    <h1 data-profile-name className="min-w-0 break-words text-[32px] font-bold leading-[1.15] tracking-[-0.01em] text-ink">@{p.handle}</h1>
                    {own && <span className="inline-flex shrink-0"><OwnerCheck owned size={22} /></span>}
                  </div>
                )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
                {p.name && (
                  <span data-profile-handle-group className="inline-flex min-w-0 max-w-full items-center gap-1.5">
                    <span data-profile-handle className="min-w-0 [overflow-wrap:anywhere]">@{p.handle}</span>
                    {/* shrink-0: Tip is min-w-0 and would squeeze the badge */}
                    {own && <span className="inline-flex shrink-0"><OwnerCheck owned size={16} /></span>}
                  </span>
                )}
                {/* Beside the name and handle, for everyone - signed out too (owner, 2026-10-08). */}
                <CopyProfileLink handle={p.handle} />
              </div>
              {/* The profile description (Settings > Profile): plain text, rendered as text - never HTML or a link. */}
              {description && <p data-profile-description className="max-w-[60ch] break-words pt-1 text-sm text-ink">{description}</p>}
              <p data-profile-stats className="pt-2 text-sm text-ink-2">{plural(p.explainer_count, 'public learning board')} · {plural(p.fork_count, 'fork')}</p>
            </div>
          </div>
          {own && (
            <div className="flex shrink-0 gap-2 pt-1">
              <Button size="sm" variant="secondary" data-edit-profile onClick={() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'profile' } }))}><UserPen size={13} strokeWidth={1.8} />Edit profile</Button>
              <Button size="sm" variant="secondary" data-creator-analytics-open onClick={() => setAnalytics(true)}><BarChart3 size={13} strokeWidth={1.8} />Analytics</Button>
            </div>
          )}
        </header>
        <div className="flex flex-wrap items-center gap-3 pb-4">
          <h2 className="mr-auto text-xs text-ink-2">Public Learning Boards</h2>
          {/* Explore's search field, compact beside Sort; full width under them on a phone. Signed out too. */}
          {p.explainer_count > 0 && (
            <label className="relative block w-72 min-w-0 max-md:order-last max-md:w-full">
              <Search size={15} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input type="search" data-profile-search aria-label="Search projects and canvases" placeholder="Search projects and canvases" value={typed}
                onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setTyped(''); setTerm(''); } }} className="h-9 w-full pl-9" />
            </label>
          )}
          {p.explainer_count > 1 && <SortMenu options={SORTS} value={sort} onChange={setSort} />}
        </div>
        {/* While searching: the projects named, then the canvases - each labelled, so which is which is plain. */}
        {p.q && <ProjectMatches projects={matchingProjects(p.explainers, p.q)} />}
        {p.q && p.explainers.length > 0 && <h3 className="pb-2 text-xs text-ink-2">Canvases</h3>}
        {p.explainers.length ? <PublicCards cards={p.explainers} me={me?.handle || null} attr="data-profile-card" />
          : p.q ? <p data-profile-search-empty className="text-sm text-ink-3">No canvases or projects match &ldquo;{p.q}&rdquo;.</p>
          : <div data-profile-empty><EmptyState icon={Compass}>{own ? 'You have no public learning boards yet. Publish a canvas to Explore from its Share panel.' : `@${p.handle} has no public learning boards yet.`}</EmptyState></div>}
      </div>
      {own && analytics && <CreatorDashboard profile={p} onClose={() => setAnalytics(false)} />}
    </main>
  );
}

// The public projects a profile search names, each as the card's project label is: Explore filtered to that project.
function ProjectMatches({ projects }) {
  if (!projects.length) return null;
  return (
    <section data-profile-projects aria-label="Projects" className="pb-6">
      <h3 className="pb-2 text-xs text-ink-2">Projects</h3>
      <div className="flex flex-wrap gap-2">
        {projects.map(([label, n]) => (
          <a key={label} data-profile-project={label} href={`/explore?project=${encodeURIComponent(label)}`} title="Explore published canvases from this project"
            className="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs text-ink hover:bg-hover">
            <FolderGit2 size={12} strokeWidth={1.75} className="shrink-0" /><span className="truncate">{label}</span>
            <span className="shrink-0 text-ink-3">· {forkNumber(n)} canvas{n === 1 ? '' : 'es'}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
