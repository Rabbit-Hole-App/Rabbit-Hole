import { useEffect, useState } from 'react';
import { BarChart3, Compass, UserRound, UserPen } from 'lucide-react';
import { CreatorDashboard } from './CreatorAnalytics.jsx';
import { PRODUCT } from './flags.js';
import { SortMenu } from './home/LearningCard.jsx';
import PublicCards, { CopyProfileLink, CreatorAvatar } from './home/PublicCards.jsx';
import { OwnerCheck } from './home/Provenance.jsx';
import { forkNumber } from './home/provenance.js';
import { loadProfile, useProfile } from './session-display.js';
import Shell from './Shell.jsx';
import { Button, EmptyState, SkeletonRows, Toasts } from './ui.jsx';

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
  useEffect(() => {
    let live = true;
    fetch(`/api/learn/creators/${encodeURIComponent(handle)}?sort=${sort}`, { credentials: 'same-origin' })
      .then(async r => { const body = await r.json().catch(() => ({})); if (live) setP(r.ok ? body : { missing: true }); })
      .catch(() => { if (live) setP({ missing: true }); });
    return () => { live = false; };
  }, [handle, sort]);
  // The address carries the canonical handle (case-insensitive lookup, lowercase handle).
  useEffect(() => { if (p?.handle && p.handle !== handle) window.history.replaceState(null, '', `/@${p.handle}`); }, [p?.handle]);
  const own = !!me?.handle && me.handle === p?.handle;
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
        <header className="flex flex-wrap items-start gap-5 pb-8">
          <CreatorAvatar c={p} className="h-20 w-20 text-3xl!" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
            <h1 data-profile-name className="break-words text-[32px] font-bold leading-[1.15] tracking-[-0.01em] text-ink">{p.name || `@${p.handle}`}</h1>
            {/* The blue owner check only on your own profile, meaning "this is yours" - never verification (owner rule). */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
              {p.name && <span data-profile-handle>@{p.handle}</span>}
              {own && <span data-own-profile className="inline-flex items-center gap-1 text-xs text-ink-2"><OwnerCheck owned />Your profile</span>}
              {/* Beside the name and handle, for everyone - signed out too (owner, 2026-10-08). */}
              <CopyProfileLink handle={p.handle} />
            </div>
            <p data-profile-stats className="pt-2 text-sm text-ink-2">{plural(p.explainer_count, 'public explainer')} · {plural(p.fork_count, 'fork')}</p>
          </div>
          {own && (
            <div className="flex shrink-0 gap-2 pt-1">
              <Button size="sm" variant="secondary" data-edit-profile onClick={() => window.dispatchEvent(new CustomEvent('small:settings', { detail: { tab: 'profile' } }))}><UserPen size={13} strokeWidth={1.8} />Edit profile</Button>
              <Button size="sm" variant="secondary" data-creator-analytics-open onClick={() => setAnalytics(true)}><BarChart3 size={13} strokeWidth={1.8} />Analytics</Button>
            </div>
          )}
        </header>
        <div className="flex items-end justify-between gap-3 pb-4">
          <h2 className="text-xs text-ink-2">Public explainers</h2>
          {p.explainers.length > 1 && <SortMenu options={SORTS} value={sort} onChange={setSort} />}
        </div>
        {p.explainers.length ? <PublicCards cards={p.explainers} me={me?.handle || null} attr="data-profile-card" />
          : <div data-profile-empty><EmptyState icon={Compass}>{own ? 'You have no public explainers yet. Publish a canvas to Explore from its Share panel.' : `@${p.handle} has no public explainers yet.`}</EmptyState></div>}
      </div>
      {own && analytics && <CreatorDashboard profile={p} onClose={() => setAnalytics(false)} />}
    </main>
  );
}
