import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, ArrowUpRight, CircleAlert, Download, GitFork, Info, Lock, PanelsTopLeft, Plus, ShieldCheck, Sprout, Star, X } from 'lucide-react';
import { Button, Tabs, TabsList, TabsTrigger, toast } from './ui.jsx';
import { api, apiFetch, navigate } from './api.js';
import { deviceId } from './home/canvas-local.js';
import { LAUNCH_COPY, PREFILL_KEY, RANGES, SOURCES, TABS, analyticsCsv, analyticsUrl, dateText, followUpPrompt, hidden, hiddenReason, metricText, noAudience, periodText } from './creator-analytics.js';

// Private creator analytics (docs/features/creator-analytics-contract.md "Analytics UI"; owner brief 2026-11-02, visual reference
// docs/features/creator-analytics-reference.html). One centered dialog for both entry points: the creator profile opens every
// public board (canvas null), an owned public board's Analytics action opens that board. Every number, its suppression and its
// coverage come from the server read (GET /api/analytics/creator or /publications/<canvas>); a hidden value is "—", never 0.

const ICON = { size: 16, strokeWidth: 1.75 };
const COARSE = '[@media(pointer:coarse)]:min-h-11';

// A hidden value: the dash, with its reason for a screen reader and as a tooltip.
function Value({ metric, kind }) {
  if (!hidden(metric)) return <>{metricText(metric, kind)}</>;
  const why = hiddenReason(metric);
  return <span title={why} data-metric-hidden={metric?.reason || 'unavailable'}><span aria-hidden="true">—</span><span className="sr-only">{why}</span></span>;
}

function Tile({ label, metric, kind, note, ...attrs }) {
  return (
    <div {...attrs} className="min-w-0 rounded-[10px] border border-line p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div data-metric-value className="my-2 text-[28px] leading-tight font-semibold tracking-tight tabular-nums text-ink max-[420px]:text-2xl"><Value metric={metric} kind={kind} /></div>
      <div className="min-h-4 text-[11px] text-ink-2">{note}</div>
    </div>
  );
}

function Notice({ icon: Icon = Info, title, children, error = false, action, ...attrs }) {
  return (
    <div {...attrs} role={error ? 'alert' : 'status'} className={`mb-5 flex items-start gap-2.5 rounded-lg border bg-code px-3.5 py-3 text-xs text-ink-2 ${error ? 'border-danger' : 'border-line'}`}>
      <Icon {...ICON} className="mt-px shrink-0" aria-hidden="true" />
      <div className="min-w-0"><strong className="mb-0.5 block font-semibold text-ink">{title}</strong>{children}{action && <div className="pt-2">{action}</div>}</div>
    </div>
  );
}

const Section = ({ title, note, children, action, ...attrs }) => (
  <section {...attrs} className="mt-6 min-w-0 first:mt-0">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="text-sm font-semibold text-ink">{title}</h3>{note && <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{note}</p>}</div>
      {action}
    </div>
    {children}
  </section>
);
const Explain = ({ children }) => <p className="mt-3 text-[11px] leading-relaxed text-ink-2">{children}</p>;
const Unavailable = ({ producer }) => <p className="text-xs text-ink-2">{producer?.note || 'Not collected yet.'}</p>;

// A table that scrolls in its own container on a narrow screen.
function Table({ head, rows, minWidth = 0, ...attrs }) {
  return (
    <div className="w-full overflow-x-auto">
      <table {...attrs} className="w-full border-collapse text-left text-xs" style={{ minWidth }}>
        <thead><tr>{head.map(([label, right], i) => <th key={i} scope="col" className={`border-b border-line px-2 py-2.5 text-[11px] font-medium text-ink-2 first:pl-0 last:pr-0 ${right ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
        <tbody>{rows.map((cells, r) => <tr key={r}>{cells.map((c, i) => <td key={i} className={`border-b border-line px-2 py-3 align-middle first:pl-0 last:pr-0 ${i ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Bar({ label, metric, share, kind = 'count' }) {
  const width = hidden(metric) ? 0 : Math.max(0, Math.min(100, share * 100));
  return (
    <div className="grid grid-cols-[135px_minmax(50px,1fr)_65px] items-center gap-3.5 border-b border-line py-3 text-xs max-[420px]:grid-cols-[110px_minmax(30px,1fr)_45px] max-[420px]:gap-2">
      <span className="min-w-0 truncate" title={label}>{label}</span>
      <div className="h-[7px] overflow-hidden rounded bg-code"><div className="h-full rounded bg-accent" style={{ width: `${width}%` }} /></div>
      <span className="text-right tabular-nums"><Value metric={metric} kind={kind} /></span>
    </div>
  );
}

// Daily opens (a public counter): a line over the range's days. A hidden day breaks the line, never draws a 0.
function Trend({ trend }) {
  const box = useRef(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(([entry]) => setW(Math.max(200, entry.contentRect.width)));
    watch.observe(box.current);
    return () => watch.disconnect();
  }, []);
  const h = 150, left = 32, right = 18, top = 14, bottom = 26;
  const values = trend.map(t => (hidden(t.opens) ? null : t.opens.value));
  const max = Math.max(4, ...values.filter(v => v !== null));
  const x = i => left + (trend.length > 1 ? i * (w - left - right) / (trend.length - 1) : (w - left - right) / 2);
  const y = v => h - bottom - v / max * (h - top - bottom);
  const path = values.map((v, i) => (v === null ? '' : `${i && values[i - 1] !== null ? 'L' : 'M'}${x(i)},${y(v)}`)).join(' ');
  const ticks = trend.length > 2 ? [0, Math.floor((trend.length - 1) / 2), trend.length - 1] : trend.map((_, i) => i);
  return (
    <div ref={box}>
      <svg data-analytics-trend role="img" aria-label={`Total opens per day, ${trend[0]?.day} to ${trend.at(-1)?.day}`} viewBox={`0 0 ${w} ${h}`} className="block h-[150px] w-full overflow-visible">
        {[0, max / 2, max].map(v => <g key={v}><line x1={left} x2={w - right} y1={y(v)} y2={y(v)} className="stroke-line" /><text x={left - 7} y={y(v) + 4} textAnchor="end" className="fill-ink-2 text-[11px]">{Math.round(v)}</text></g>)}
        <path d={path} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-accent" />
        {values.map((v, i) => v !== null && <circle key={i} cx={x(i)} cy={y(v)} r="3" className="fill-accent"><title>{`${v} opens on ${trend[i].day}`}</title></circle>)}
        {ticks.map((i, n) => <text key={i} x={x(i)} y={h - 3} textAnchor={n === 0 ? 'start' : n === ticks.length - 1 ? 'end' : 'middle'} className="fill-ink-2 text-[11px]">{trend[i].day.slice(5)}</text>)}
      </svg>
    </div>
  );
}

function Insights({ data, compact, onDraft, onReview }) {
  const list = (data.insights || []).filter(i => !compact || i.type === 'interest');
  if (!list.length) return (
    <div data-insights-empty className="rounded-[10px] border border-line bg-code px-4 py-6 text-center">
      <h3 className="text-sm font-semibold">{noAudience(data) ? 'Insights begin with your audience' : 'No clear signal yet'}</h3>
      <p className="mx-auto mt-2 max-w-[420px] text-xs leading-relaxed text-ink-2">Insights need recorded actions and at least 10 visitors in the exact concept or outcome cohort. We do not invent a recommendation. Time spent alone does not show understanding.</p>
    </div>
  );
  return list.map(i => (
    <div key={`${i.type}:${i.canvas}:${i.subject_id}`} data-insight={i.type} className="mb-3 rounded-[10px] border border-line p-4">
      <span className="mb-2 inline-flex rounded-[5px] bg-code px-1.5 py-0.5 text-[11px] text-ink-2">{i.type === 'interest' ? 'Interest · recorded exploration' : 'Friction · recorded incorrect results'}</span>
      <h3 className="text-sm font-semibold">{i.type === 'interest' ? `Go deeper on ${i.label}` : `Revisit ${i.label}`}</h3>
      <p className="my-2 text-xs leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">{i.numerator} of {i.denominator} visitors ({Math.round(100 * i.rate)}%)</span>
        {i.type === 'interest' ? ' who saw this went deeper from it. A focused follow-up may be useful.' : ' had an incorrect first answer on this card. Missing or incomplete evidence is not an incorrect answer. This is a signal to investigate, not a diagnosis.'}
      </p>
      {i.type === 'interest'
        ? <Button variant="secondary" size="sm" className={COARSE} data-draft-follow-up onClick={() => onDraft(i)}><Plus {...ICON} aria-hidden="true" />Draft a follow-up board</Button>
        : <Button variant="secondary" size="sm" className={COARSE} data-review-section onClick={() => onReview(i)}><ArrowUpRight {...ICON} aria-hidden="true" />Review the section</Button>}
    </div>
  ));
}

function BoardsTable({ data, full, onPick }) {
  const head = [['Learning board'], ['Visitors', true], ...(full ? [['Opens', true]] : []), ['Avg active', true], ['Started RH', true], ...(full ? [['Audience fork rate', true]] : []), ['Stars now', true], ['Canonical forks · all', true]];
  const rows = (data.boards || []).map(b => [
    <button type="button" data-board={b.canvas} onClick={() => onPick(b.canvas)} className={`text-left font-medium text-ink hover:text-accent ${COARSE}`}>{b.title}{!b.published && <span className="block text-[11px] font-normal text-ink-2">Not public now</span>}</button>,
    <Value metric={b.visitors} />, ...(full ? [<Value metric={b.opens} />] : []), <Value metric={b.avg_active_seconds} kind="seconds" />, <Value metric={b.start_rate} kind="rate" />,
    ...(full ? [<Value metric={b.audience_fork_rate} kind="rate" />] : []), <Value metric={b.stars_now} />, <Value metric={b.forks_all} />,
  ]);
  if (!rows.length) return <p className="text-xs text-ink-2">No public learning boards yet. Publish a canvas to Explore from its Share panel.</p>;
  return <><Table data-analytics-boards head={head} rows={rows} minWidth={full ? 640 : 530} /><Explain>A visitor can open more than one board, so board visitors do not add up to the unique audience. — means hidden for privacy or unavailable, never zero. Select a board to inspect it.</Explain></>;
}

function Overview({ data, onPick, onTab, onDraft, onReview }) {
  const o = data.overview, signed = o.signed_in_visitors;
  const strip = 'inline-flex items-center gap-1.5', strong = 'font-semibold text-ink tabular-nums';
  return (
    <>
      <div data-analytics-metrics className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[420px]:gap-2">
        <Tile data-metric="total_opens" label="Total opens" metric={o.total_opens} note="Visits to public boards" />
        <Tile data-metric="unique_visitors" label="Unique visitors" metric={o.unique_visitors} note={hidden(signed) ? 'Accounts and anonymous browsers, not people' : `${metricText(signed)} signed in`} />
        <Tile data-metric="avg_active_seconds" label="Avg active time" metric={o.avg_active_seconds} kind="seconds" note="Per visitor · per board" />
        <Tile data-metric="rabbit_holes_started" label="Rabbit Holes started" metric={o.rabbit_holes_started} note={hidden(o.start_rate) ? 'Successful starts only' : `${metricText(o.start_rate, 'rate')} of visitors started one`} />
      </div>
      <div data-analytics-summary className="mt-4 mb-6 flex flex-wrap items-center gap-x-4.5 gap-y-2 text-xs text-ink-2">
        <span className={strip}><Star {...ICON} aria-hidden="true" /><strong className={strong}><Value metric={o.stars_now} /></strong> Stars now</span>
        <span className={strip}><GitFork {...ICON} aria-hidden="true" /><strong className={strong}><Value metric={o.canonical_forks} /></strong> canonical forks · all time</span>
        <span className={strip}><PanelsTopLeft {...ICON} aria-hidden="true" /><strong className={strong}><Value metric={o.public_boards} /></strong> public {o.public_boards?.value === 1 ? 'board' : 'boards'}</span>
        <span className={strip}><strong className={strong}><Value metric={o.returning_visitors} /></strong> returning visitors</span>
      </div>
      {(data.trend || []).some(t => t.opens?.value > 0)
        ? <div className="mb-6 rounded-[10px] border border-line p-4.5"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Audience visits over time</h3><span className="text-[11px] text-ink-2">Total opens · daily</span></div><Trend trend={data.trend} /><p className="mt-1.5 text-[11px] text-ink-2">Opens are visits, not people. Visitor counts are deduplicated separately.</p></div>
        : <div data-trend-empty className="mb-6 rounded-[10px] border border-line bg-code px-4 py-8 text-center"><h3 className="text-sm font-semibold">No audience visits yet</h3><p className="mx-auto mt-2 max-w-[420px] text-xs text-ink-2">Your first public-board visits will appear here. Your own visits are excluded.</p></div>}
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 max-[900px]:grid-cols-1">
        <Section title={data.scope.canvas ? 'This learning board' : 'Your learning boards'} action={<Button size="sm" variant="ghost" className={COARSE} data-analytics-details onClick={() => onTab('boards')}>View details<ArrowRight {...ICON} aria-hidden="true" /></Button>}>
          <BoardsTable data={data} onPick={onPick} />
        </Section>
        <Section title="What to make next"><Insights data={data} compact onDraft={onDraft} onReview={onReview} /></Section>
      </div>
    </>
  );
}

const Mini = ({ metric, label }) => <div className="rounded-lg bg-code p-3.5"><b className="mb-0.5 block text-xl font-semibold tabular-nums"><Value metric={metric} /></b><span className="text-[11px] text-ink-2">{label}</span></div>;

function Boards({ data, onPick }) {
  const o = data.overview, s = data.stars;
  return (
    <>
      <Section title={data.scope.canvas ? data.scope.title : 'Compare your public boards'} note="One date range, consistent definitions. Current counters are labelled separately.">
        <BoardsTable data={data} full onPick={onPick} />
      </Section>
      <Section title="Saved and explored further" data-analytics-stars>
        <div className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">
          <Mini metric={s.additions} label="Star additions · selected range" />
          <Mini metric={s.removals} label="Voluntary star removals" />
          <Mini metric={s.net} label="Net star actions (additions − removals)" />
          <Mini metric={s.opens_from_stars} label="Opens from Stars" />
        </div>
        <Explain>Net star actions are not the change in Stars now. Stars now: <Value metric={o.stars_now} /> (<Value metric={o.stars_from_owner} /> from you, <Value metric={o.stars_from_audience} /> from others). Opens from Stars are counted at the visit, not at the star. Canonical forks may include forks made outside the measured public-board audience.</Explain>
      </Section>
      <Section title="Audience conversion" data-analytics-conversion>
        <Bar label="Started a Rabbit Hole" metric={o.start_rate} share={o.start_rate?.value ?? 0} kind="rate" />
        <Bar label="Forked from a visit" metric={o.audience_fork_rate} share={o.audience_fork_rate?.value ?? 0} kind="rate" />
        <Explain>Distinct visitors completing each action ÷ eligible visitors in this scope and range. Forks by this audience: <Value metric={o.audience_forks} />. Canonical forks · all time: <Value metric={o.canonical_forks} />. Stages are independent, not a required funnel.</Explain>
      </Section>
    </>
  );
}

function Learning({ data, onDraft, onReview }) {
  const l = data.learning, o = data.overview, p = data.producers || {}, steps = l.next_steps;
  return (
    <>
      {!data.scope.canvas && <div data-scope-callout className="mb-5 rounded-lg bg-code px-4 py-3.5 text-xs text-ink-2"><strong className="text-ink">Across your public boards.</strong> Select a board above for its card reach, Next Steps, resources and revision comparison.</div>}
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 max-[900px]:grid-cols-1">
        <Section title="Evidence you can act on"><Insights data={data} onDraft={onDraft} onReview={onReview} /></Section>
        <div className="min-w-0">
          <Section title="Engagement, not a learning score">
            <div className="grid grid-cols-2 gap-3">
              <Mini metric={o.engaged_visitors} label="Visitors active for more than 2 minutes" />
              <Mini metric={o.returning_visitors} label="Visitors on 2+ distinct days in this range" />
            </div>
            <Explain>These describe participation. They do not prove completion, mastery or a learning gain.</Explain>
          </Section>
          <Section title="Next Steps" data-analytics-next-steps>
            {p.next_steps?.readiness === 'unavailable' ? <Unavailable producer={p.next_steps} /> : <>
              <Bar label="Suggestions shown" metric={steps.impressions} share={0} />
              <Bar label="Selections" metric={steps.selections} share={0} />
              {steps.positions?.length > 0 && <Table head={[['Position'], ['Shown', true], ['Selected', true], ['Rate', true]]} rows={steps.positions.map(r => [`Position ${r.position}`, <Value metric={r.impressions} />, <Value metric={r.selections} />, <Value metric={r.rate} kind="rate" />])} />}
              <Explain>Impressions, selections and position are measured separately from the same suggestion. Suggestions appear only when a visitor asks for them.</Explain>
            </>}
          </Section>
        </div>
      </div>
      {l.concepts?.length > 0 && <Section title="Concepts explored further" note="Rates among visitors who saw a card carrying the concept.">
        <Table head={[['Concept'], ['Saw it', true], ['Explored', true], ['Went deeper', true]]} rows={l.concepts.map(c => [c.label || c.concept_id, <Value metric={c.seen} />, <Value metric={c.explored_rate} kind="rate" />, <Value metric={c.deeper_rate} kind="rate" />])} />
      </Section>}
      {l.cards && <Section title="Card reach and interaction" note="A free canvas has no fixed reading order. Lower reach is not proof that someone left." data-analytics-cards>
        {l.cards.length ? <Table head={[['Card'], ['Saw this card', true], ['Interacted', true]]} rows={l.cards.map(c => [c.label, <Value metric={c.seen} />, <Value metric={c.interacted} />])} /> : <p className="text-xs text-ink-2">No card was seen in this range.</p>}
        <Explain>Seen means at least half the card was visible for 2 seconds. One visitor may interact with several cards.</Explain>
      </Section>}
      {l.resources && <Section title="Resources opened from this board" data-analytics-resources>
        {l.resources.length ? l.resources.map(r => <Bar key={r.resource_id} label={r.label || r.resource_id} metric={r.opens} share={hidden(r.opens) || hidden(o.unique_visitors) ? 0 : r.opens.value / o.unique_visitors.value} />) : <p className="text-xs text-ink-2">No resource was opened in this range.</p>}
        <Explain>Distinct visitors opening a resource that is part of this board. Nothing is tracked after they leave.</Explain>
      </Section>}
      <Section title="Assessment-backed friction" data-analytics-friction>
        {p.outcomes?.readiness === 'unavailable' ? <Unavailable producer={p.outcomes} />
          : l.friction?.length ? <Table head={[['Card'], ['Assessed', true], ['Incorrect first answer', true], ['Rate', true]]} rows={l.friction.map(f => [f.label, <Value metric={f.assessed} />, <Value metric={f.incorrect} />, <Value metric={f.incorrect_rate} kind="rate" />])} />
          : <p className="text-xs text-ink-2">No recorded quiz answers in this range.</p>}
        {p.outcomes?.note && p.outcomes.readiness !== 'unavailable' && <Explain>{p.outcomes.note}</Explain>}
      </Section>
      {l.revisions && <Section title="Before / after a revision" data-analytics-revisions>
        {l.revisions.status === 'comparable' && <div className="grid grid-cols-2 gap-3 max-[420px]:grid-cols-1">
          {[['Before', l.revisions.before], ['After', l.revisions.after]].map(([name, side]) => (
            <div key={name} className="rounded-[10px] border border-line p-4"><h4 className="text-[13px] font-semibold">{name} · {side.from} to {side.to}</h4>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">Visitors: <b className="text-ink"><Value metric={side.visitors} /></b><br />Avg active: <b className="text-ink"><Value metric={side.avg_active_seconds} kind="seconds" /></b><br />Started a Rabbit Hole: <b className="text-ink"><Value metric={side.start_rate} kind="rate" /></b></p></div>
          ))}
        </div>}
        <Explain>{l.revisions.note || 'No comparable revision pair in this range.'} Different audiences and dates: a comparison is descriptive and does not establish that an edit caused a change.</Explain>
      </Section>}
    </>
  );
}

function Sources({ data }) {
  const s = data.sources || {}, total = data.overview.unique_visitors;
  return (
    <>
      <Section title="Where your audience finds you" note="First observed source per visitor in the selected scope and range. Unknown referrers remain unknown." data-analytics-sources>
        {(s.visitors || []).map(r => <Bar key={r.source} label={SOURCES[r.source] || r.source} metric={r.visitors} share={hidden(r.visitors) || hidden(total) ? 0 : r.visitors.value / total.value} />)}
        <Explain>Each source needs at least 10 visitors. Another category may be hidden so a small group cannot be worked out by subtraction. Counts exclude your own visits.</Explain>
      </Section>
      <Section title="Links and campaigns" note="Tagged links compared by recorded arrivals and later actions. This does not measure impressions or click-through on other sites.">
        {s.campaigns?.length ? <Table head={[['Campaign'], ['Visitors', true], ['Started RH', true]]} rows={s.campaigns.map(c => [c.campaign, <Value metric={c.visitors} />, <Value metric={c.start_rate} kind="rate" />])} /> : <p className="text-xs text-ink-2">No tagged arrivals in this range. Add utm_source and utm_campaign to a board link to compare campaigns.</p>}
      </Section>
      {s.referrers?.length > 0 && <Section title="Other referrers" note="Hostname only, never the full address.">
        <Table head={[['Site'], ['Visitors', true]]} rows={s.referrers.map(r => [r.host, <Value metric={r.visitors} />])} />
      </Section>}
    </>
  );
}

const FOOTER_COPY = [
  ['Visitors', 'Signed-in accounts and anonymous browsers. Not an exact count of people. Deduplicated across your boards and days.'],
  ['Opens', 'Distinct visits to a public board. Reloads and returns within the visit add nothing. Your own signed-in visits are excluded.'],
  ['Average active time', 'Visible, recently active time per visitor and board, with a 60-second inactivity threshold. It estimates engagement, not learning.'],
  ['Privacy', 'Audience counts, rates and detailed segments need at least 10 visitors in that exact range and filter. Hidden values are never zero. Exports apply the same rule.'],
  ['Coverage', 'All time begins when each measure\'s collection starts. Earlier periods are not collected, never backfilled as zero.'],
];

// opener: the element to give focus back to when the one that opened the dialog is gone (a closed menu's row).
export function CreatorAnalyticsDialog({ canvas = null, opener: givenOpener = null, onClose }) {
  const [scope, setScope] = useState(canvas);
  const [range, setRange] = useState('30d');
  const [tab, setTab] = useState('overview');
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState({ data: null, error: null, loading: true, staleAt: null });
  const [scopes, setScopes] = useState([]); // the creator read's boards, for the scope select
  const cache = useRef(new Map()); // `${scope}|${range}` -> { data, at }: the last good read, kept when a refetch fails
  const request = useRef(0);
  const dialog = useRef(null), close = useRef(null), opener = useRef(null);

  useEffect(() => {
    const id = ++request.current, key = `${scope}|${range}`, ctl = new AbortController();
    const kept = cache.current.get(key);
    setView({ data: kept?.data || null, error: null, loading: true, staleAt: null });
    apiFetch(analyticsUrl(scope, range), { signal: ctl.signal })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body) throw new Error(body?.error || `HTTP ${response.status}`);
        return body;
      })
      .then(data => {
        if (id !== request.current) return; // an outdated scope or range is disregarded
        cache.current.set(key, { data, at: new Date().toISOString() });
        if (!scope) setScopes(data.boards.map(b => ({ canvas: b.canvas, title: b.title })));
        setView({ data, error: null, loading: false, staleAt: null });
      }, error => {
        if (id !== request.current || error.name === 'AbortError') return;
        setView({ data: kept?.data || null, error: error.message, loading: false, staleAt: kept?.at || null });
      });
    return () => ctl.abort();
  }, [scope, range, retry]);
  // Opened on one board: one creator read, for the select's other boards.
  useEffect(() => {
    if (!canvas) return undefined;
    const ctl = new AbortController();
    apiFetch(analyticsUrl(null, '7d'), { signal: ctl.signal }).then(response => (response.ok ? response.json() : null)).then(all => all && setScopes(all.boards.map(b => ({ canvas: b.canvas, title: b.title }))), () => {});
    return () => ctl.abort();
  }, [canvas]);

  // Focus: the close control first; the opener gets it back. The page behind is inert while the dialog is open.
  useEffect(() => {
    opener.current = givenOpener || document.activeElement;
    const root = document.getElementById('root'), was = !!root?.inert;
    if (root) root.inert = true;
    close.current?.focus();
    return () => { if (root) root.inert = was; opener.current?.focus?.({ preventScroll: true }); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onKeyDown = event => {
    event.stopPropagation(); // the dialog is a portal: its keys never reach the card or page it was opened from
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const stops = [...dialog.current.querySelectorAll('button:not([disabled]), select, a[href], summary')].filter(el => el.tabIndex >= 0 && el.offsetParent !== null);
    if (!stops.length) return;
    if (event.shiftKey && document.activeElement === stops[0]) { event.preventDefault(); stops.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === stops.at(-1)) { event.preventDefault(); stops[0].focus(); }
  };

  const { data, error, loading, staleAt } = view;
  const pick = name => { setScope(name); setTab('learning'); };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([analyticsCsv(data)], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `creator-analytics-${data.scope.canvas || 'all'}-${data.range}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // A private canvas with the composer prefilled: nothing is sent, spent or published.
  const draft = async insight => {
    const board = data.boards.find(b => b.canvas === insight.canvas)?.title || data.scope.title;
    try {
      const made = await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Next: ${insight.label}`.slice(0, 120), device_id: deviceId(localStorage) }) });
      try { sessionStorage.setItem(PREFILL_KEY(made.name), followUpPrompt(insight.label, board)); } catch { /* blocked storage: the canvas opens with an empty composer */ }
      onClose();
      navigate(`/apps/${made.name}?tab=learn`);
    } catch (problem) { toast(problem.message, { tone: 'error' }); }
  };
  const review = insight => { onClose(); navigate(`/apps/${insight.canvas}?tab=learn`); };

  const status = error ? 'failure' : !data ? 'checking' : data.collection?.status === 'active' ? 'active' : 'failure';
  const boards = scopes.length ? scopes : (data?.boards || []).map(b => ({ canvas: b.canvas, title: b.title }));
  const retryButton = <Button variant="secondary" size="sm" className={COARSE} data-analytics-retry onClick={() => setRetry(n => n + 1)}>Retry</Button>;
  const stop = event => event.stopPropagation();
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 sm:p-6" onClick={stop} onPointerDown={stop} onMouseDown={event => { stop(event); if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="analytics-title" aria-describedby="analytics-description" onKeyDown={onKeyDown}
        data-analytics-dialog data-analytics-scope={scope || 'all'} data-analytics-state={error && !data ? 'failed' : !data ? 'loading' : noAudience(data) ? 'no_audience' : 'ready'}
        className="flex h-full w-full flex-col overflow-hidden bg-white text-sm text-ink shadow-pop sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[1120px] sm:rounded-2xl sm:border sm:border-line">
        <header className="shrink-0 px-7 pt-6 max-[900px]:px-4.5 max-[900px]:pt-5">
          <div className="flex items-start justify-between gap-5 max-[900px]:gap-2">
            <div className="min-w-0">
              <h2 id="analytics-title" className="text-[22px] leading-snug font-semibold tracking-tight max-[420px]:text-[19px]">{scope ? 'Learning board analytics' : 'Creator analytics'}</h2>
              <p id="analytics-description" className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-2"><Lock size={13} strokeWidth={1.75} aria-hidden="true" />Private to you · aggregated audience activity</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 max-[900px]:gap-0.5">
              <Button variant="secondary" size="sm" className={COARSE} data-analytics-export disabled={!data || loading} onClick={exportCsv} aria-label="Export aggregate metrics as CSV"><Download {...ICON} aria-hidden="true" /><span className="max-[900px]:hidden">Export CSV</span></Button>
              <Button ref={close} variant="ghost" size="sm" className={`w-8 justify-center px-0 ${COARSE} [@media(pointer:coarse)]:min-w-11`} data-analytics-close aria-label="Close analytics" onClick={onClose}><X {...ICON} aria-hidden="true" /></Button>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 max-[420px]:mt-4.5">
            <label className="flex min-w-0 items-center gap-2 max-[420px]:w-full">
              <PanelsTopLeft {...ICON} className="shrink-0 text-ink-2" aria-hidden="true" />
              <select data-analytics-board-scope aria-label="Learning board scope" value={scope || ''} onChange={event => setScope(event.target.value || null)}
                className={`h-8 max-w-[280px] min-w-0 rounded-lg border border-line-strong bg-surface pr-7 pl-2.5 text-[13px] text-ink max-[420px]:w-full max-[420px]:max-w-full max-[420px]:text-base ${COARSE}`}>
                <option value="">All public learning boards</option>
                {boards.map(b => <option key={b.canvas} value={b.canvas}>{b.title}</option>)}
                {scope && !boards.some(b => b.canvas === scope) && <option value={scope}>{data?.scope?.title || 'This learning board'}</option>}
              </select>
            </label>
            <Tabs value={range} onValueChange={setRange} className="max-[420px]:w-full">
              <TabsList pill aria-label="Date range" data-analytics-range={range} className="max-[420px]:w-full">
                {RANGES.map(r => <TabsTrigger key={r.id} pill value={r.id} className={`h-7 px-3 text-xs max-[420px]:flex-1 max-[420px]:justify-center ${COARSE}`}>{r.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
          <div className="mt-3 mb-4.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-2">
            <span data-analytics-period>{data ? periodText(data.period) : 'Dates pending'}</span>
            <span data-analytics-status={status} className={`inline-flex items-center gap-1.5 ${status === 'failure' ? 'text-danger' : status === 'active' ? 'text-success' : ''}`}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
              {status === 'failure' ? (data?.collection?.status === 'degraded' ? 'Collection needs attention: recent events were not recorded' : 'Collection status unavailable') : status === 'checking' ? 'Checking collection' : 'Collection active · own visits excluded'}
            </span>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Analytics views" className="-mx-7 gap-5.5 px-7 max-[900px]:-mx-4.5 max-[900px]:px-4.5 max-[420px]:justify-between max-[420px]:gap-0">
              {TABS.map(t => <TabsTrigger key={t.id} value={t.id} data-analytics-tab={t.id} className={`h-10 text-[13px] max-[420px]:text-xs ${COARSE}`}>{t.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </header>
        <div data-analytics-body role="tabpanel" aria-label={TABS.find(t => t.id === tab).label} aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto px-7 pt-5.5 pb-6.5 [scrollbar-gutter:stable] max-[900px]:px-4.5">
          {error && !data && <Notice data-analytics-error error icon={CircleAlert} title="Analytics are temporarily unavailable" action={retryButton}>We could not read your analytics. Missing values are not zero. Your public boards still work.</Notice>}
          {error && data && <Notice data-analytics-stale error icon={CircleAlert} title="Showing the last good read" action={retryButton}>The latest read failed{staleAt ? `; these numbers are from ${dateText(staleAt)}` : ''}. They may be out of date.</Notice>}
          {loading && !data && !error && <><p role="status" className="sr-only">Loading analytics</p><div data-analytics-loading aria-hidden="true" className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-[120px] animate-pulse rounded-[10px] bg-code" />)}</div></>}
          {data && <>
            {noAudience(data) && <Notice data-analytics-launch icon={Sprout} title="Ready for your first audience">{LAUNCH_COPY.replace('Ready for your first audience. ', '')}</Notice>}
            {!noAudience(data) && data.overview.unique_visitors?.reason === 'insufficient_cohort' && <Notice data-analytics-small icon={ShieldCheck} title="Activity is arriving. Detailed insights need a larger audience.">Visitor metrics and each detailed segment appear after at least 10 visitors. Public counters remain visible.</Notice>}
            {data.period.partial && <Notice data-analytics-partial title="Partial coverage">Coverage starts {data.collection.started_at ? dateText(data.collection.started_at) : 'with the first visit'}; earlier days in this range were not collected.</Notice>}
            {tab === 'overview' && <Overview data={data} onPick={pick} onTab={setTab} onDraft={draft} onReview={review} />}
            {tab === 'boards' && <Boards data={data} onPick={pick} />}
            {tab === 'learning' && <Learning data={data} onDraft={draft} onReview={review} />}
            {tab === 'sources' && <Sources data={data} />}
          </>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-start justify-between gap-3.5 border-t border-line px-7 py-3 text-[11px] text-ink-2 max-[900px]:px-4.5">
          <details data-analytics-definitions className="max-h-[40dvh] max-w-[620px] overflow-y-auto">
            <summary className={`flex cursor-pointer list-none items-center gap-1.5 ${COARSE}`}><Info {...ICON} aria-hidden="true" />How these numbers work</summary>
            <div className="mt-2.5 grid gap-2 leading-relaxed">
              {FOOTER_COPY.map(([k, v]) => <p key={k}><strong className="text-ink">{k}:</strong> {v}</p>)}
              {Object.entries(data?.definitions || {}).map(([k, v]) => <p key={k}><strong className="text-ink">{k.replaceAll('_', ' ')}:</strong> {v}</p>)}
              {data && <div data-analytics-coverage><strong className="text-ink">Coverage by measure:</strong>
                <ul className="mt-1 list-disc pl-4">{Object.entries(data.producers || {}).map(([k, p]) => <li key={k}>{k.replaceAll('_', ' ')}: {p.readiness === 'unavailable' ? 'unavailable' : `${p.readiness} since ${dateText(p.started_at) || 'its first event'}`}{p.note ? `. ${p.note}` : ''}</li>)}</ul></div>}
            </div>
          </details>
          <span data-analytics-freshness>
            {data ? `Read ${dateText(data.collection.checked_at)}${data.collection.started_at ? ` · collecting since ${dateText(data.collection.started_at)}` : ''}${data.collection.synthetic_excluded > 0 ? ` · ${data.collection.synthetic_excluded} synthetic ${data.collection.synthetic_excluded === 1 ? 'check' : 'checks'} excluded` : ''}` : error ? 'Freshness unavailable' : 'Freshness pending'}
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
