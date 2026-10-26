// /owner/telemetry: the owner's telemetry dashboard, increment-1 scaffold (docs/features/telemetry.md). Every number comes
// from /api/owner/telemetry/*, which answers 404 to anyone but the configured owner; this page holds no secret and no check of
// its own. Dollar amounts appear only here, for the owner. Measured, estimated, unknown and reserved amounts are separate rows
// and are never added together.
import { useEffect, useState } from 'react';
import { Activity, Bug, CircleDollarSign, GraduationCap, Hash, Layers, Route, Search, Tag, Timer, Users } from 'lucide-react';
import Shell from './Shell.jsx';
import { Button, ExpandedPageFrame, Input } from './ui.jsx';

const API = '/api/owner/telemetry';
const STATES = { settled: 'Measured', estimated: 'Estimated', unknown: 'Unknown provider cost, learner not charged', reserved: 'Running, learner credits reserved' };
// Provider spend (the platform ledger) has its own states: its unknown and reserved rows carry a bound, never a cost.
const PROVIDER_STATES = { settled: 'Provider cost measured', estimated: 'Provider cost estimated', unknown: 'Provider cost unknown', reserved: 'Running, reservation only' };
const usd = micros => (micros == null ? 'none' : `$${(micros / 1e6).toFixed(4)}`);
const time = value => (value == null ? 'never' : new Date(value > 1e12 ? value : value * 1000).toLocaleString());
async function get(path, init) {
  const response = await fetch(`${API}${path}`, { credentials: 'same-origin', ...init });
  if (response.status === 404) return { hidden: true };
  return { status: response.status, body: await response.json().catch(() => null) };
}

function Head({ icon: Icon, children }) {
  return <th className="py-1.5 pr-4 text-left text-xs font-medium text-ink-2"><span className="inline-flex items-center gap-1.5"><Icon size={13} strokeWidth={1.5} />{children}</span></th>;
}
function Section({ title, children }) {
  return <section className="pb-8"><h2 className="pb-2 text-sm font-semibold">{title}</h2>{children}</section>;
}

export default function OwnerTelemetryPage() {
  return <Shell>{() => <main className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto"><ExpandedPageFrame wide><OwnerTelemetry /></ExpandedPageFrame></main>}</Shell>;
}

function OwnerTelemetry() {
  const [state, setState] = useState({ loading: true });
  const [days, setDays] = useState(1);
  const load = async () => {
    setState(s => ({ ...s, loading: true }));
    const access = await get('/access');
    if (access.hidden) return setState({ hidden: true });
    if (!access.body?.configured) return setState({ access: access.body });
    await get('/project', { method: 'POST' }); // one bounded catch-up of the accounting projection before reading
    const [overview, health, clientErrors, learning] = await Promise.all([get(`/overview?days=${days}`), get('/health'), get(`/client-errors?days=${days}`), get(`/learning?days=${days}`)]);
    setState({ access: access.body, overview: overview.body, health: health.body, clientErrors: clientErrors.body, learning: learning.body });
  };
  useEffect(() => { load(); }, [days]);
  return <TelemetryView state={state} days={days} setDays={setDays} />;
}

// The page as pure markup for a given state, so a unit test can render it over fixtures (owner-telemetry-view.test.mjs).
export function TelemetryView({ state, days, setDays }) {
  if (state.hidden) return <p className="text-sm text-ink-2">Not found.</p>;
  if (state.loading && !state.access) return <p className="text-sm text-ink-2">Loading telemetry</p>;
  const { access, overview, health, clientErrors, learning } = state;
  return (
    <>
      <div className="flex items-baseline gap-3 pb-6">
        <h1 className="text-lg font-semibold">Telemetry</h1>
        <span className="text-xs text-ink-2">{access?.environment || 'no environment'}</span>
        {overview && <span className="text-xs text-ink-2">Accounting projected {time(overview.projectedAt)}</span>}
        <div className="ml-auto flex items-center gap-1">
          {[1, 7, 30].map(d => <Button key={d} size="sm" variant={d === days ? 'secondary' : 'ghost'} onClick={() => setDays(d)}>{d === 1 ? '24 hours' : `${d} days`}</Button>)}
        </div>
      </div>
      {!access?.configured
        ? <p className="text-sm text-ink-2">Telemetry storage is not configured on this deployment. Accounting records can still be looked up below.</p>
        : <>
          <Section title="Paid attempts by cost state">
            <p className="pb-2 text-xs text-ink-2">From the accounting projection. Each cost state is its own row; they are not added together.</p>
            <table className="w-full text-sm"><thead><tr><Head icon={Layers}>Cost state</Head><Head icon={Tag}>Charge class</Head><Head icon={Hash}>Attempts</Head><Head icon={CircleDollarSign}>Cost</Head><Head icon={CircleDollarSign}>Reserved</Head></tr></thead>
              <tbody>{(overview?.attempts || []).map(row => <tr key={`${row.cost_state}-${row.charge_class}`} className="border-t border-line">
                <td className="py-1.5 pr-4">{STATES[row.cost_state] || row.cost_state}</td><td className="pr-4">{row.charge_class || 'unknown'}</td><td className="pr-4">{row.attempts}</td>
                <td className="pr-4">{['settled', 'estimated'].includes(row.cost_state) ? usd(row.cost_micros) : 'none'}</td><td className="pr-4">{usd(row.reserved_micros)}</td></tr>)}</tbody></table>
            {!overview?.attempts?.length && <p className="pt-2 text-xs text-ink-2">No paid attempts in this window.</p>}
          </Section>
          <Section title="Provider spend by cost state">
            <p className="pb-2 text-xs text-ink-2">From the platform ledger, live. What the provider billed us, apart from what the learner was charged above. A failure of ours costs the provider and charges the learner nothing. Each state is its own row; a bound is a ceiling, not a cost; nothing is added together.</p>
            {overview?.providerSpend == null
              ? <p className="text-xs text-ink-2">The platform ledger cannot be read on this deployment.</p>
              : <table className="w-full text-sm"><thead><tr><Head icon={Layers}>Cost state</Head><Head icon={Tag}>Operation status</Head><Head icon={Hash}>Operations</Head><Head icon={CircleDollarSign}>Provider cost</Head><Head icon={CircleDollarSign}>Bound</Head><Head icon={CircleDollarSign}>Learner-side attempt</Head></tr></thead>
                <tbody>{overview.providerSpend.map(row => <tr key={`${row.state}-${row.status}`} className="border-t border-line">
                  <td className="py-1.5 pr-4">{PROVIDER_STATES[row.state] || row.state}</td><td className="pr-4">{row.status}</td><td className="pr-4">{row.operations}</td>
                  <td className="pr-4">{usd(row.provider_cost_micros)}</td><td className="pr-4">{usd(row.bound_micros)}</td><td className="pr-4">{usd(row.attempt_micros)}</td></tr>)}</tbody></table>}
            {overview?.providerSpend?.length === 0 && <p className="pt-2 text-xs text-ink-2">No paid operations in this window.</p>}
          </Section>
          <Section title="Events">
            <table className="w-full text-sm"><thead><tr><Head icon={Activity}>Event</Head><Head icon={Tag}>Outcome</Head><Head icon={Hash}>Count</Head></tr></thead>
              <tbody>{(overview?.events || []).map(row => <tr key={`${row.event_name}-${row.outcome}`} className="border-t border-line"><td className="py-1.5 pr-4">{row.event_name}</td><td className="pr-4">{row.outcome || 'none'}</td><td>{row.n}</td></tr>)}</tbody></table>
            {!overview?.events?.length && <p className="pt-2 text-xs text-ink-2">No events in this window.</p>}
          </Section>
          <Section title="Browser errors">
            <p className="pb-2 text-xs text-ink-2">Grouped by fingerprint, route and release. Occurrences count repeats a page folded together; accounts count signed-in people affected (anonymous pages are not counted). Delivery is best effort: a page that hit its limits says how many it dropped.</p>
            <table className="w-full text-sm"><thead><tr><Head icon={Bug}>Kind</Head><Head icon={Route}>Route</Head><Head icon={Tag}>Release</Head><Head icon={Hash}>Occurrences</Head><Head icon={Users}>Accounts</Head><Head icon={Timer}>Last seen</Head></tr></thead>
              <tbody>{(clientErrors?.groups || []).map(g => <tr key={`${g.fingerprint}-${g.kind}-${g.route}-${g.release_sha}`} className="border-t border-line">
                <td className="py-1.5 pr-4" title={g.fingerprint}>{g.kind}</td><td className="pr-4 font-mono text-xs">{g.route}</td><td className="pr-4 font-mono text-xs">{g.release_sha ? g.release_sha.slice(0, 8) : 'unknown'}</td>
                <td className="pr-4">{g.occurrences}</td><td className="pr-4">{g.accounts}</td><td>{time(g.last_seen)}</td></tr>)}</tbody></table>
            {!clientErrors?.groups?.length && <p className="pt-2 text-xs text-ink-2">No browser errors in this window.</p>}
          </Section>
          <Section title="Tutor and learning"><LearningView learning={learning} /></Section>
          <Section title="Telemetry health">
            <p className="text-xs text-ink-2">Last event ingested {time(health?.lastIngestedAt)}. This server instance: {health?.isolate?.delivered ?? 0} delivered, {health?.isolate?.rejected ?? 0} refused, {health?.isolate?.dropped ?? 0} dropped.</p>
            <table className="mt-2 w-full text-sm"><thead><tr><Head icon={Activity}>Source</Head><Head icon={Timer}>Observed</Head><Head icon={Hash}>Pending</Head><Head icon={Hash}>Dead</Head><Head icon={Timer}>Oldest</Head></tr></thead>
              <tbody>{(health?.delivery || []).map(row => <tr key={`${row.source}-${row.observed_at}`} className="border-t border-line"><td className="py-1.5 pr-4">{row.source}</td><td className="pr-4">{time(row.observed_at)}</td><td className="pr-4">{row.pending ?? 'none'}</td><td className="pr-4">{row.dead ?? 'none'}</td><td>{row.oldest_age_ms == null ? 'none' : `${Math.round(row.oldest_age_ms / 1000)} s`}</td></tr>)}</tbody></table>
          </Section>
        </>}
      <ActionExplorer />
    </>
  );
}

// A metric is always shown with what it is a rate of: its count, its denominator and the basis it rests on. The definition is the
// row's tooltip. AI-assessed outcomes are labelled as assessments, never as verified outcomes.
const rate = m => (m.denominator ? `${m.numerator} of ${m.denominator} (${Math.round((m.numerator / m.denominator) * 100)} percent)` : `${m.numerator} of ${m.denominator}`);
function MetricTable({ rows }) {
  if (!rows?.length) return <p className="text-xs text-ink-2">No data in this window.</p>;
  return <table className="w-full text-sm"><thead><tr><Head icon={Tag}>Metric</Head><Head icon={Hash}>Count of total</Head></tr></thead>
    <tbody>{rows.map(m => <tr key={m.label} className="border-t border-line" title={m.definition}><td className="py-1.5 pr-4">{m.label}</td><td>{rate(m)}</td></tr>)}</tbody></table>;
}
function LearningView({ learning }) {
  if (!learning) return <p className="text-xs text-ink-2">Not loaded.</p>;
  const funnel = learning.hookFunnel, milestone = learning.milestone;
  return <>
    <p className="pb-2 text-xs text-ink-2">Outcomes are grouped by how they were assessed (keyed rubric match, or an AI evaluator and its version). An AI assessment is not a verified outcome. Hover a row for its definition and denominator.</p>
    <MetricTable rows={[...(learning.independentSuccess || []), ...(learning.assistedSuccess || []), ...(learning.retention || []), ...(learning.transfer || [])]} />
    <p className="pb-1 pt-4 text-xs font-medium">Tutor decisions ({learning.decisions} in this window{learning.truncated ? ', truncated' : ''})</p>
    <MetricTable rows={[learning.stalls, learning.explanationLoops, learning.repeatedMisconceptions, learning.prematureProgression, learning.adaptationAfterFailure, learning.adaptationAfterMisconception]} />
    <p className="pt-3 text-xs text-ink-2">Help offered by decisions: {Object.entries(learning.assistanceOffered || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}. Help used in assessed attempts: {(learning.assistanceUsed || []).map(a => `${a.assistance} ${a.attempts}`).join(', ') || 'none'}.</p>
    <p className="pt-3 text-xs text-ink-2" title={funnel.definition}>Hook sets: {funnel.generated} generated ({funnel.cached} cached, {funnel.discarded} discarded), {funnel.shown} shown: {funnel.selected} selected, {funnel.superseded} replaced by a later set, {funnel.unknown} unknown.</p>
    <p className="pt-3 text-xs text-ink-2" title={milestone.cost.definition}>Milestones in this window: {milestone.milestones}; median {milestone.medianElapsedSeconds ?? 'none'} seconds and {milestone.medianObservations ?? 'none'} observations to reach one. Tutor AI cost in those spans: measured ${(milestone.cost.measuredMicros / 1e6).toFixed(4)}, estimated ${(milestone.cost.estimatedMicros / 1e6).toFixed(4)}, {milestone.cost.unknownAttempts} unknown attempts. Not added together.</p>
    <ul className="pt-3 text-xs text-ink-2">{(learning.unavailable || []).map(u => <li key={u.id}><GraduationCap size={11} className="mr-1 inline" />Unavailable, {u.id.replaceAll('_', ' ')}: {u.reason}</li>)}</ul>
  </>;
}

function ActionExplorer() {
  const [id, setId] = useState('');
  const [result, setResult] = useState(null);
  const [support, setSupport] = useState(null);
  const lookup = async value => {
    const key = value.trim();
    setResult(null); setSupport(null);
    if (/^RH-/i.test(key)) {
      const found = await get(`/support/${encodeURIComponent(key.toUpperCase())}`);
      setSupport(found.hidden ? { error: 'Not found.' } : found.body);
      return;
    }
    const found = await get(`/actions/${encodeURIComponent(key)}`);
    setResult(found.hidden ? { error: 'Not found.' } : found.body);
  };
  const look = event => { event.preventDefault(); lookup(id); };
  const open = actionId => { setId(actionId); lookup(actionId); };
  return (
    <Section title="Action explorer">
      <form onSubmit={look} className="flex gap-2 pb-3">
        <Input aria-label="Action id or support reference" placeholder="act- or RH-" value={id} onChange={e => setId(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!id.trim()}><Search size={14} strokeWidth={1.5} />Look up</Button>
      </form>
      {(result?.error || support?.error) && <p className="text-sm text-ink-2">{result?.error || support?.error}</p>}
      {support?.report && <div className="pb-4 text-sm">
        <p className="pb-2">Report {support.report.ref}, {support.report.kind}, from {support.report.route || 'an unknown page'}, account {support.report.account || 'none'}, {time(support.report.at)}</p>
        <ol className="pb-2 text-xs text-ink-2">{support.clientErrors.map(e => <li key={e.event_id}>{time(e.occurred_at)} browser {e.payload.kind} {e.payload.route} {e.payload.status_code ?? ''} {e.payload.fingerprint}</li>)}
          {support.serverEvents.map(e => <li key={e.event_id}>{time(e.occurred_at)} server {e.event_name} {e.outcome || ''} {e.error_code || ''}</li>)}</ol>
        {support.actionIds.map(a => <Button key={a} size="sm" variant="secondary" onClick={() => open(a)}>Open {a}</Button>)}
        {!support.clientErrors.length && !support.serverEvents.length && <p className="text-xs text-ink-2">The report carried no matching browser errors or requests.</p>}
      </div>}
      {result?.action && <div className="text-sm">
        <p className="pb-2">{result.action.feature}, {result.action.status}, {result.action.charge_class}, period {result.action.period}, started {time(result.action.started_at)}</p>
        <table className="w-full"><thead><tr><Head icon={Hash}>Attempt</Head><Head icon={Layers}>Kind</Head><Head icon={Tag}>Model</Head><Head icon={Layers}>State</Head><Head icon={CircleDollarSign}>Cost</Head><Head icon={CircleDollarSign}>Reserved</Head></tr></thead>
          <tbody>{result.attempts.map(a => <tr key={a.attempt_id} className="border-t border-line"><td className="py-1.5 pr-4 font-mono text-xs">{a.attempt_id}</td><td className="pr-4">{a.kind}</td><td className="pr-4">{a.model || 'none'}</td>
            <td className="pr-4">{STATES[a.cost_state] || a.cost_state}</td><td className="pr-4">{usd(a.cost_micros)}</td><td>{usd(a.reserved_micros)}</td></tr>)}</tbody></table>
        {!!result.events?.length && <ol className="pt-3 text-xs text-ink-2">{result.events.map(e => <li key={e.event_id}>{time(e.occurred_at)} {e.event_name} {e.outcome || ''} {e.error_code || ''}</li>)}</ol>}
      </div>}
    </Section>
  );
}
