import { useEffect, useRef, useState } from 'react';
import { ArrowRight, GitFork, Shapes, Star } from 'lucide-react';
import { CreatorAvatar } from './PublicCards.jsx';
import { openedFields, readWeekly, sendWeeklyEvent, starsSinceLabel, viewedFields, viewedOnce, weekLabel, weeklyList, WEEKLY_TOP_URL } from './weekly-top.js';

// Weekly Top 5 (docs/features/explore-weekly-top.md; owner brief 2026-10-23 sections 3-6): "Top canvases this week" on the Canvases tab,
// "Top creators this week" on Creators - always open with nothing to fold, up to five rows, site-wide (Filters, Sort and Size never change it).
// One request per page load answers both tabs; a failure hides the section and never touches Recommended or the results.

// { data, ms, failed, once }: data is null while loading and after a failure. ms is the request time, kept for weekly_top.viewed;
// once is the viewed-once rule, kept here because a search unmounts the section and restoring it must not count a second view.
export function useWeeklyTop() {
  const [state, setState] = useState({ data: null, ms: 0, failed: false });
  const once = useRef(null);
  if (!once.current) once.current = viewedOnce();
  useEffect(() => {
    let live = true;
    const t0 = performance.now();
    fetch(WEEKLY_TOP_URL, { credentials: 'same-origin' }).then(readWeekly, () => ({ failure: { status: 0, code: 'network' } })).then(({ data, failure }) => {
      const ms = Math.round(performance.now() - t0);
      if (failure) sendWeeklyEvent('weekly_top.request_failed', { ...failure, duration_ms: ms });
      if (live) setState({ data: data || null, ms, failed: !!failure });
    });
    return () => { live = false; };
  }, []);
  return { ...state, once: once.current };
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
const LINK = `rounded-sm ${FOCUS}`;
const TITLE = `block w-fit max-w-full truncate text-[13px] leading-5 font-medium text-ink hover:underline ${LINK}`;
const SUB = `block w-fit max-w-full truncate text-xs leading-4 text-ink-2 hover:underline ${LINK}`;
const ROW = 'group flex min-w-0 cursor-default items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-hover focus-within:bg-hover motion-reduce:transition-none';
// The Open / View profile action keeps its space at all times (no shift) and shows on row hover or focus, always on touch (brief 6.5, 6.6).
const ACTION = `inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium whitespace-nowrap text-accent opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 ${FOCUS}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function Count({ icon: Icon, n, label }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-ink-2" title={label}>
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" /><span aria-hidden="true">{n}</span><span className="sr-only">{label}</span>
    </span>
  );
}

// The rounded-square picture; the placeholder icon stays when there is none (the endpoint answers 404 without a custom cover).
function Thumbnail({ src }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-code text-ink-3">
      <Shapes size={16} strokeWidth={1.5} aria-hidden="true" />
      {src && !broken && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full bg-white object-cover" />}
    </span>
  );
}

function CanvasRow({ e }) {
  return (
    <li data-weekly-row={e.rank} className={ROW}>
      <span className="w-4 shrink-0 text-center text-xs tabular-nums text-ink-3">{e.rank}</span>
      <a href={e.url} data-weekly-target="canvas" tabIndex={-1} aria-hidden="true" className="shrink-0"><Thumbnail src={e.thumbnail_url} /></a>
      <div className="min-w-0 flex-1">
        <a href={e.url} data-weekly-target="canvas" data-weekly-title title={e.title} className={TITLE}>{e.title}</a>
        <a href={e.creator.url} data-weekly-target="profile" className={SUB}>@{e.creator.handle}</a>
      </div>
      <span className="flex shrink-0 items-center gap-3">
        <Count icon={Star} n={e.weekly_star_count} label={`${plural(e.weekly_star_count, 'new star', 'new stars')} this week`} />
        <Count icon={GitFork} n={e.weekly_fork_count} label={`${plural(e.weekly_fork_count, 'fork', 'forks')} this week`} />
      </span>
      <a href={e.url} data-weekly-target="canvas" data-weekly-action aria-label={`Open ${e.title}`} className={ACTION}><span className="max-sm:hidden">Open</span><ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" /></a>
    </li>
  );
}

// Name and @handle never repeat: without a saved name the @handle is the title.
function CreatorRow({ e }) {
  return (
    <li data-weekly-row={e.rank} className={ROW}>
      <span className="w-4 shrink-0 text-center text-xs tabular-nums text-ink-3">{e.rank}</span>
      <a href={e.url} data-weekly-target="profile" tabIndex={-1} aria-hidden="true" className="shrink-0"><CreatorAvatar c={{ name: e.name, handle: e.handle, avatar: e.avatar_url }} className="h-10 w-10 text-base!" /></a>
      <div className="min-w-0 flex-1">
        {e.name
          ? <><a href={e.url} data-weekly-target="profile" data-weekly-title title={e.name} className={TITLE}>{e.name}</a><a href={e.url} data-weekly-target="profile" className={SUB}>@{e.handle}</a></>
          : <a href={e.url} data-weekly-target="profile" data-weekly-title className={TITLE}>@{e.handle}</a>}
      </div>
      <span className="flex shrink-0 items-center gap-3">
        <Count icon={Star} n={e.weekly_star_supporter_count} label={`${plural(e.weekly_star_supporter_count, 'person', 'people')} starred this week`} />
        <Count icon={GitFork} n={e.weekly_fork_supporter_count} label={`${plural(e.weekly_fork_supporter_count, 'person', 'people')} forked this week`} />
      </span>
      <a href={e.url} data-weekly-target="profile" data-weekly-action aria-label={`View profile of @${e.handle}`} className={ACTION}><span className="max-sm:hidden">View profile</span><ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" /></a>
    </li>
  );
}

// `weekly` is useWeeklyTop()'s state, `tab` the Explore tab id. Renders nothing while loading and after a failure; the caller hides it while searching.
export default function WeeklyTop({ weekly, tab }) {
  const { data, ms, failed, once } = weekly;
  const list = failed || !data ? null : weeklyList(data, tab);
  useEffect(() => {
    if (list && once(tab, data)) sendWeeklyEvent('weekly_top.viewed', viewedFields(tab, data, list, ms));
  }, [tab, data, !!list]);
  if (!list) return null;
  const creators = tab === 'creators';
  const week = weekLabel(data), since = starsSinceLabel(data);
  // weekly_top.opened: a click or middle click on a link inside a row. The row itself is not a link and reports nothing.
  const opened = (event) => {
    const link = event.target.closest?.('a[data-weekly-target]');
    const row = link?.closest('[data-weekly-row]');
    if (link && row) sendWeeklyEvent('weekly_top.opened', openedFields(tab, data, Number(row.dataset.weeklyRow), link.dataset.weeklyTarget));
  };
  return (
    <section data-weekly-top={creators ? 'creators' : 'canvases'} aria-labelledby="weekly-top-heading" className="max-w-[760px] pb-6">
      <h2 id="weekly-top-heading" className="text-sm font-semibold text-ink">{creators ? 'Top creators this week' : 'Top canvases this week'}</h2>
      <p data-weekly-note className="pb-2 pt-0.5 text-xs text-ink-3">Across all of Rabbit Hole{week ? `, ${week}` : ''}.{creators ? '' : ' Filters, Sort and Size apply to the results below.'}{since && ` ${since}`}</p>
      {list.entries.length === 0
        ? <p data-weekly-empty className="rounded-[10px] border border-line px-4 py-3 text-sm text-ink-3">{list.message}</p>
        : <ol data-weekly-list onClick={opened} onAuxClick={opened} className="m-0 list-none divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-white p-0">
          {list.entries.map((e) => (creators ? <CreatorRow key={e.handle} e={e} /> : <CanvasRow key={e.url} e={e} />))}
        </ol>}
    </section>
  );
}
