import { useState } from 'react';
import { ArrowDownToLine, Clock, GitFork, Info, Lock, Shapes, Sparkles, Users } from 'lucide-react';
import { Button, SlidePanel, Tabs, TabsList, TabsTrigger } from './ui.jsx';
import { CREATOR_TOTALS, EXPLAINER_SECTIONS, INSUFFICIENT, NOT_COLLECTED, RANGES, THRESHOLD, TRAFFIC_SOURCES, creatorAnalytics, explainerAnalytics, metricText } from './creator-analytics.js';

// Private creator analytics (owner briefs: analytics UI, feedback loop; docs/features/creator-analytics-contract.md).
// Two levels, never one dashboard: one explainer (the owned public canvas's ⋮ → Analytics) and the creator (their own
// profile's Analytics). Only the owner opens either. Storage is not approved, so both show their typed `not_collected`
// state (creator-analytics.js): the sections and labels the contract defines, the range control, and the public
// counters that already exist. No number is estimated, and no insight appears without evidence.

const ROW = 'flex min-h-8 items-center justify-between gap-4 border-b border-line py-1.5 text-sm last:border-b-0';

function Metric({ label, metric, all }) {
  const known = metric && !metric.suppressed;
  return (
    <div data-metric={metric?.reason || 'value'} className={ROW}>
      <span className="min-w-0 text-ink">{label}{all && <span className="text-ink-3"> · all time</span>}</span>
      <span className={`shrink-0 text-right ${known ? 'font-medium tabular-nums text-ink' : 'text-xs text-ink-3'}`}>{metricText(metric)}</span>
    </div>
  );
}

function Section({ title, note, children, ...attrs }) {
  return (
    <section {...attrs} className="pt-5">
      <h3 className="pb-1 text-xs font-medium text-ink-2">{title}</h3>
      {note && <p className="pb-1.5 text-xs text-ink-3">{note}</p>}
      <div>{children}</div>
    </section>
  );
}

// The two typed states, explained once at the end of every view (owner panel H: the suppressed state for < 10 learners).
function HowToRead() {
  return (
    <Section title="How to read this" data-analytics-legend>
      <Metric label="Nothing is recorded for this yet" metric={NOT_COLLECTED} />
      <Metric label={`Hidden until at least ${THRESHOLD} learners are in the exact range and filter`} metric={INSUFFICIENT} />
      <p className="pt-2 text-xs text-ink-3">Neither is ever shown as 0 or as an estimate. You never see who a learner is.</p>
    </Section>
  );
}

function Frame({ title, scope, onClose, children, ...attrs }) {
  const [range, setRange] = useState('30d');
  return (
    <SlidePanel title={title} width={560} onClose={onClose}>
      <div {...attrs} data-analytics-state="not_collected" className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
        <div className="flex items-center justify-between gap-3 pb-3">
          <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Lock size={12} strokeWidth={1.75} />Private · only you see this. {scope}</span>
          <Tabs value={range} onValueChange={setRange}>
            <TabsList pill data-analytics-range={range}>{RANGES.map(r => <TabsTrigger key={r.id} pill value={r.id} className="h-6 px-2.5 text-xs">{r.label}</TabsTrigger>)}</TabsList>
          </Tabs>
        </div>
        <div data-analytics-banner className="flex gap-2 rounded-md bg-code px-3 py-2.5 text-xs leading-5 text-ink-2">
          <Info size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span><span className="font-medium text-ink">Not collected yet.</span> Rabbit Hole does not record what learners do on public learning boards yet, so nothing here is counted or estimated. Counters that already exist publicly are shown.</span>
        </div>
        {children}
        <HowToRead />
      </div>
    </SlidePanel>
  );
}

const Traffic = ({ traffic }) => (
  <Section title="Traffic sources" note="Where learners came from, counted per source." data-analytics-traffic>
    {TRAFFIC_SOURCES.map(([key, label]) => <Metric key={key} label={label} metric={traffic[key]} />)}
  </Section>
);

// Per explainer (⋮ → Analytics on your own public canvas). `a` is the Library row: its title and canonical fork count.
export function ExplainerAnalytics({ a, onClose }) {
  const view = explainerAnalytics({ forkCount: a.fork_count });
  return (
    <Frame title={`Analytics · ${a.title || 'Untitled'}`} scope="This learning board." onClose={onClose} data-explainer-analytics={a.name}>
      <Section title="What your audience is telling you" data-analytics-insights>
        <p data-insights-empty className="py-1.5 text-sm text-ink-3">No insights yet. They come only from what learners do here - a concept they dig into, where they get stuck or leave, a comparison they keep asking for - and that is not collected yet.</p>
        <div className="flex items-center gap-3 pt-1">
          <Button size="sm" variant="secondary" disabled data-create-next title="Needs a real learner signal first"><Sparkles size={13} strokeWidth={1.8} />Create next learning board</Button>
          <span className="text-xs text-ink-3">Available once learners show what they want next.</span>
        </div>
      </Section>
      {EXPLAINER_SECTIONS.map(s => (
        <Section key={s.title} title={s.title}>{s.rows.map(([key, label, all]) => <Metric key={key} label={label} metric={view.metrics[key]} all={all} />)}</Section>
      ))}
      <Traffic traffic={view.traffic} />
      <Section title="Revision comparison" note="Before and after an update you made, side by side. Descriptive only: it never claims why." data-analytics-revisions>
        <Metric label="Before / after" metric={view.revisions} />
      </Section>
    </Frame>
  );
}

// Creator analytics (Analytics on your own profile): across your public explainers, from the profile you are looking at.
const TH = 'py-1.5 pr-2 text-left text-xs font-normal text-ink-2';
const head = (Icon, label, right) => <th className={`${TH} ${right ? 'text-right' : 'w-[34%]'}`}><span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}><Icon size={12} strokeWidth={1.75} />{label}</span></th>;
const cell = (metric) => <td className={`truncate py-1.5 pl-2 text-right ${metric.suppressed ? 'text-xs text-ink-3' : 'text-sm tabular-nums text-ink'}`}>{metric.suppressed ? 'Not collected' : metricText(metric)}</td>;

export function CreatorDashboard({ profile, onClose }) {
  const view = creatorAnalytics({ explainerCount: profile.explainer_count, forkCount: profile.fork_count, explainers: profile.explainers });
  return (
    <Frame title="Creator analytics" scope="All your public learning boards." onClose={onClose} data-creator-analytics>
      <Section title="Totals">{CREATOR_TOTALS.map(([key, label, all]) => <Metric key={key} label={label} metric={view.totals[key]} all={all} />)}</Section>
      <Section title="Audience wants next" note="Concepts learners went deeper on, across your learning boards.">
        <Metric label="Most-requested next topics" metric={view.wants_next} />
      </Section>
      <Section title="Highest-friction concepts"><Metric label="Where learners get stuck" metric={view.friction} /></Section>
      <Section title="Learning Board comparison" note="One range for every row. A hidden cell is never 0." data-analytics-comparison>
        {view.explainers.length ? (
          <table className="w-full table-fixed">
            <thead className="border-b border-line"><tr>{head(Shapes, 'Learning Board')}{head(Users, 'Learners', true)}{head(Clock, 'Avg active', true)}{head(ArrowDownToLine, 'Started RH', true)}{head(GitFork, 'Forks', true)}</tr></thead>
            <tbody>
              {view.explainers.map(e => (
                <tr key={e.url} className="border-b border-line last:border-b-0">
                  <td className="max-w-0 truncate py-1.5 pr-2 text-sm text-ink" title={e.title}>{e.title}</td>
                  {cell(e.learners)}{cell(e.avg_active_seconds)}{cell(e.rabbit_hole_start_rate)}{cell(e.fork_count)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="py-1.5 text-sm text-ink-3">No public learning boards yet.</p>}
      </Section>
      <Traffic traffic={view.traffic} />
      <Section title="Recent trend"><Metric label="Daily opens and visitors" metric={view.trend} /></Section>
    </Frame>
  );
}
