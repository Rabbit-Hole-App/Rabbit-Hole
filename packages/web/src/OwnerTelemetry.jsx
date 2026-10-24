// /owner/telemetry: the owner's telemetry dashboard, increment-1 scaffold (docs/features/telemetry.md). Every number comes
// from /api/owner/telemetry/*, which answers 404 to anyone but the configured owner; this page holds no secret and no check of
// its own. Dollar amounts appear only here, for the owner. Measured, estimated, unknown and reserved amounts are separate rows
// and are never added together.
import { useEffect, useState } from 'react';
import { Activity, CircleDollarSign, Hash, Layers, Search, Tag, Timer } from 'lucide-react';
import Shell from './Shell.jsx';
import { Button, ExpandedPageFrame, Input } from './ui.jsx';

const API = '/api/owner/telemetry';
const STATES = { settled: 'Measured', estimated: 'Estimated', unknown: 'Unknown, reservation held', reserved: 'Outstanding reservation' };
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
    const [overview, health] = await Promise.all([get(`/overview?days=${days}`), get('/health')]);
    setState({ access: access.body, overview: overview.body, health: health.body });
  };
  useEffect(() => { load(); }, [days]);

  if (state.hidden) return <p className="text-sm text-ink-2">Not found.</p>;
  if (state.loading && !state.access) return <p className="text-sm text-ink-2">Loading telemetry</p>;
  const { access, overview, health } = state;
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
          <Section title="Events">
            <table className="w-full text-sm"><thead><tr><Head icon={Activity}>Event</Head><Head icon={Tag}>Outcome</Head><Head icon={Hash}>Count</Head></tr></thead>
              <tbody>{(overview?.events || []).map(row => <tr key={`${row.event_name}-${row.outcome}`} className="border-t border-line"><td className="py-1.5 pr-4">{row.event_name}</td><td className="pr-4">{row.outcome || 'none'}</td><td>{row.n}</td></tr>)}</tbody></table>
            {!overview?.events?.length && <p className="pt-2 text-xs text-ink-2">No events in this window.</p>}
          </Section>
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

function ActionExplorer() {
  const [id, setId] = useState('');
  const [result, setResult] = useState(null);
  const look = async event => {
    event.preventDefault();
    const found = await get(`/actions/${encodeURIComponent(id.trim())}`);
    setResult(found.hidden ? { error: 'Not found.' } : found.body);
  };
  return (
    <Section title="Action explorer">
      <form onSubmit={look} className="flex gap-2 pb-3">
        <Input aria-label="Action id" placeholder="act-" value={id} onChange={e => setId(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!id.trim()}><Search size={14} strokeWidth={1.5} />Look up</Button>
      </form>
      {result?.error && <p className="text-sm text-ink-2">{result.error}</p>}
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
