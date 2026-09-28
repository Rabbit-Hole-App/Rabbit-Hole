import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { titleOf } from './agent/catalog.js';
import { navigate } from './api.js';
import { openHref, readContinue, readRecent, recentCard, recentItems } from './home/continue.js';
import { BANNER, DEMO, readSaved, toggleSaved } from './home/explore.js';
import Shell from './Shell.jsx';
import { Button, KindIcon, Pill, SkeletonRows } from './ui.jsx';

// Home (T02 §3, preview build only): Continue, Recent, Start - three blocks, no others.
// Styled to design/notion.md: a left-aligned 900px column, section labels at 12px, Continue as a
// borderless callout block, Recent as 36px list rows with hover-revealed actions. Nothing is a card.
// ponytail: the Authored path card (§3.1.3) is left out - learn_courses keeps no learner
// step pointer, so 'Step 3 of 7' has no source yet; add it once that source is decided.
const KIND = { repository: 'Project', canvas: 'Canvas', job: 'Job', server: 'Server' };
const HEADING = 'pb-1 text-xs text-ink-2';
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
                <ul>{items.map((a) => <RecentRow key={`${a.org}/${a.name}`} app={a} card={recentCard(a, cardCtx)} />)}</ul>
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

// One 36px list row: icon, title, kind, the per-kind metadata on one line, the next action on hover.
function RecentRow({ app, card }) {
  const { action } = card;
  return (
    <li className="group flex min-h-9 items-center gap-2 rounded-sm px-2 hover:bg-hover max-md:flex-wrap max-md:gap-y-0.5 max-md:py-1.5">
      <KindIcon kind={app.kind} schedule={app.schedule} />
      <span className="max-w-[40%] shrink-0 truncate text-sm font-medium">{titleOf(app)}</span>
      <Pill kind={app.kind}>{KIND[app.kind] || app.kind}</Pill>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-2 max-md:order-last max-md:basis-full max-md:whitespace-normal max-md:pl-6">
        {card.meta.join(' · ')}{!action && ' · Its content is stored only in the browser that created it.'}
      </span>
      {action?.to && <Button size="sm" className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100" onClick={() => navigate(action.to)}>{action.label}</Button>}
      {action?.href && (
        <a href={action.href} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-[13px] font-medium text-ink-2 opacity-0 hover:bg-hover hover:text-ink group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
          {action.label} <ArrowUpRight size={12} />
        </a>
      )}
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
        <h1 className="pb-5 text-[40px] font-bold leading-[1.2] tracking-[-0.01em]">Explore</h1>
        <ul>
          {DEMO.map((d) => {
            const on = saved.includes(d.id);
            return (
              <li key={d.id} className="flex h-9 items-center gap-2 rounded-sm px-2 hover:bg-hover">
                <span className="max-w-[40%] shrink-0 truncate text-sm font-medium">{d.title}</span>
                <Pill kind={d.kind.toLowerCase()}>{d.kind}</Pill>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{d.blurb}</span>
                <Button size="sm" aria-pressed={on} onClick={() => setSaved(toggleSaved(localStorage, d.id))}>{on ? 'Saved' : 'Save'}</Button>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
