import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { titleOf } from './agent/catalog.js';
import { navigate } from './api.js';
import { openHref, readContinue, readRecent, recentCard, recentItems } from './home/continue.js';
import { BANNER, DEMO, readSaved, toggleSaved } from './home/explore.js';
import Shell from './Shell.jsx';
import { Button, KindIcon, Pill, SkeletonRows } from './ui.jsx';

// Home (T02 §3, preview build only): Continue, Recent, Start - three blocks, no others.
// Composition follows Gate B (Figma F1): Continue as a callout, Recent as a gallery of compact
// resource cards. Styling (6px radius, 1px line border, no shadow, 12px labels) is design/notion.md.
// ponytail: the Authored path card (§3.1.3) is left out - learn_courses keeps no learner
// step pointer, so 'Step 3 of 7' has no source yet; add it once that source is decided.
const KIND = { repository: 'Project', canvas: 'Canvas', job: 'Job', server: 'Server' };
const HEADING = 'pb-1 text-xs text-ink-2';
const CARD = 'rounded-lg border border-line bg-white';
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3';
// The Start dialog lives once in main.jsx Root (StartHost); pages only ask for it.
const start = () => window.dispatchEvent(new CustomEvent('small:start', { detail: { path: 'repository' } }));

export default function Home() {
  return <Shell>{(data, load) => <HomeContent data={data} load={load} />}</Shell>;
}

function HomeContent({ data, load }) {
  const ready = data && !data.error;
  const apps = ready ? data.apps : [];
  const recent = readRecent(localStorage);
  const cont = ready ? readContinue({ org: data.org, email: data.email, recent, catalog: apps, storage: localStorage }) : null;
  const items = recentItems(recent, apps);
  const cardCtx = { catalog: apps, email: data?.email, storage: localStorage };
  const startButton = <Button variant="primary" onClick={start}>Start a rabbit hole</Button>;
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-[900px] space-y-8 px-24 pb-12 pt-12 max-lg:px-8 max-md:px-4 max-md:pt-6">
        {!data && [2, 3, 1].map((rows, i) => <SkeletonRows key={i} rows={rows} />)}
        {data?.error && (
          <div className="flex items-center gap-3 text-sm text-ink-2">✗ {data.error} <Button variant="secondary" size="sm" onClick={load}>Retry</Button></div>
        )}
        {ready && !apps.length && (
          <section>
            {startButton}
            <p className="pt-3 text-sm text-ink-2">Start from a repository, sources, a question, or a blank canvas.</p>
          </section>
        )}
        {ready && apps.length > 0 && (
          <>
            {cont && <Continue item={cont} />}
            {items.length > 0 && (
              <section aria-label="Recent">
                <h2 className={HEADING}>Recent</h2>
                <ul className={GRID}>{items.map((a) => <RecentCard key={`${a.org}/${a.name}`} app={a} card={recentCard(a, cardCtx)} />)}</ul>
              </section>
            )}
            <section>
              {startButton}
              {!cont && !items.length && <p className="pt-3 text-sm text-ink-2">Start from a repository, sources, a question, or a blank canvas.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Continue({ item }) {
  return (
    <section aria-label="Continue">
      <h2 className={HEADING}>Continue — on this device</h2>
      <div className="rounded-md bg-code p-4">
        <div className="flex items-center gap-2">
          <KindIcon kind={item.kind} />
          <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
          <Pill kind={item.kind}>{KIND[item.kind] || item.kind}</Pill>
        </div>
        {item.lastExplored && <p className="truncate pt-2 text-sm text-ink-2">Last explored: <span className="text-ink">{item.lastExplored}</span></p>}
        {item.next && <p className="truncate pt-1 text-sm text-ink-2">Next: <span className="text-ink">{item.next}</span></p>}
        <div className="flex gap-2 pt-3">
          <Button variant="secondary" onClick={() => navigate(openHref(item))}>{item.canvas ? 'Continue learning' : 'Open'}</Button>
          {item.canvas && item.kind === 'repository' && <Button onClick={() => navigate(`/apps/${item.slug}`)}>Open project</Button>}
        </div>
      </div>
    </section>
  );
}

// Gate B Resource Card: icon, title and kind; the per-kind metadata (secondary, then tertiary);
// the next action as a text link that shows on hover (always shown on phones, which have no hover).
function RecentCard({ app, card }) {
  const { action, meta } = card;
  // Secondary line: what happened; tertiary line: the last fact (visibility, access, storage).
  // Titles wrap to two lines; owner/repo breaks after the slash (zero-width space), not mid-name.
  const [lead, last] = meta.length > 1 ? [meta.slice(0, -1), meta.at(-1)] : [meta, ''];
  const link = 'inline-flex items-center gap-1 self-start text-xs font-medium text-accent hover:underline opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100';
  return (
    <li data-recent-card className={`${CARD} group flex min-w-0 flex-col gap-1 p-3`}>
      <div className="flex min-w-0 items-start gap-2">
        <span className="pt-0.5"><KindIcon kind={app.kind} schedule={app.schedule} /></span>
        <span className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-medium leading-snug">{titleOf(app).replace('/', '/\u200b')}</span>
        <Pill kind={app.kind}>{KIND[app.kind] || app.kind}</Pill>
      </div>
      <span className="truncate text-xs text-ink-2">{lead.join(' · ')}</span>
      <span className="truncate text-xs text-ink-3">{action ? last : 'Its content is stored only in the browser that created it.'}</span>
      {action?.to && <button type="button" className={link} onClick={() => navigate(action.to)}>{action.label}</button>}
      {action?.href && <a href={action.href} target="_blank" rel="noreferrer" className={link}>{action.label} <ArrowUpRight size={12} /></a>}
    </li>
  );
}

// Explore preview (T02 §11): demo data behind a banner; Save stays in this browser.
export function ExplorePreview() {
  return <Shell>{() => <Explore />}</Shell>;
}

function Explore() {
  const [saved, setSaved] = useState(() => readSaved(localStorage));
  return (
    <main className="flex-1 overflow-y-auto">
      <div role="note" className="sticky top-0 z-10 border-b border-line bg-code px-4 py-2 text-sm text-ink-2">{BANNER}</div>
      <div className="max-w-[900px] px-24 pb-12 pt-12 max-lg:px-8 max-md:px-4 max-md:pt-6">
        <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.01em]">Explore</h1>
        <p className="pb-8 pt-1 text-sm text-ink-2">Discover rabbit holes, projects, and learning resources shared beyond your library.</p>
        <section aria-label="Examples">
          <h2 className={HEADING}>Examples</h2>
          <ul className={GRID}>
            {DEMO.map((d) => {
              const on = saved.includes(d.id);
              return (
                <li key={d.id} data-explore-card className={`${CARD} flex min-h-[120px] min-w-0 flex-col gap-1 p-3`}>
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="pt-0.5"><KindIcon kind={d.kind === 'Project' ? 'repository' : 'canvas'} /></span>
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{d.title}</span>
                    <Pill kind={d.kind.toLowerCase()}>{d.kind}</Pill>
                  </div>
                  <p className="text-xs text-ink-2">{d.blurb}</p>
                  <Button size="sm" variant="secondary" className="mt-auto self-start" aria-pressed={on} onClick={() => setSaved(toggleSaved(localStorage, d.id))}>{on ? 'Saved' : 'Save'}</Button>
                </li>
              );
            })}
          </ul>
          <p className="pt-3 text-xs text-ink-3">These are examples. Nothing is shared beyond a workspace yet.</p>
        </section>
      </div>
    </main>
  );
}
