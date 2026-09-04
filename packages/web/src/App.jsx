import { useEffect, useState } from 'react';
import { AppWindow, ArrowUpRight, Clock, Loader2, Play, Square, SquareTerminal } from 'lucide-react';
import { ago, api, cronHuman, navigate } from './api.js';
import Panel from './Panel.jsx';
import { Avatar, Button, Pill } from './ui.jsx';

const KindIcon = ({ kind }) =>
  kind === 'job' ? <SquareTerminal size={14} className="shrink-0 text-ink-2" /> : <AppWindow size={14} className="shrink-0 text-ink-2" />;

const people = (a) => [a.owner_email, ...(a.members || []).map((m) => m.email).filter((e) => e !== a.owner_email)];

export default function App() {
  const [data, setData] = useState(null); // { org, email, apps } | { error }
  const [panel, setPanel] = useState(null); // { name, tab }
  const [run, setRun] = useState(null); // { appName, id?, error? }

  const load = () => api('/api/apps').then(setData).catch((e) => setData({ error: e.message }));
  useEffect(() => { load(); }, []);

  const startRun = async (app) => {
    setPanel({ name: app.name, tab: 'run' });
    setRun({ appName: app.name });
    try {
      const { runId } = await api('/api/runs', { method: 'POST', body: JSON.stringify({ app: app.name }) });
      setRun({ appName: app.name, id: runId });
    } catch (e) {
      setRun({ appName: app.name, error: e.message });
    }
  };

  const stopRun = async (id) => {
    try { await api(`/api/runs/${id}/stop`, { method: 'POST' }); } catch { /* poll shows the outcome */ }
    setRun(null);
    load();
  };

  const apps = data?.apps || [];
  const org = data?.org || 'small';
  const panelApp = panel && apps.find((a) => a.name === panel.name);
  const runningId = (a) =>
    (run?.appName === a.name && !run.error && (run.id || 'starting')) ||
    (a.lastRun?.status === 'running' && a.lastRun.runId) || null;

  return (
    <div className="flex h-screen">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-line bg-side px-2 py-3 max-md:hidden">
        <div className="px-2 pb-4 text-sm font-semibold">{org}</div>
        <div className="px-2 pb-1 text-xs font-medium text-ink-2">Apps</div>
        {apps.map((a) => (
          <button
            key={a.name}
            onClick={() => navigate(`/apps/${a.name}`)}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-left text-sm hover:bg-hover"
          >
            <KindIcon kind={a.kind} />
            <span className="truncate">{a.name}</span>
          </button>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[900px] px-24 py-12 max-lg:px-8 max-md:px-4 max-md:py-6">
          <div className="pb-8 text-sm text-ink-2">
            {org} <span className="px-1">/</span> <span className="text-ink">Apps</span>
          </div>
          <h1 className="pb-4 text-[18px] font-semibold">Apps</h1>

          {data?.error && <div className="text-ink-2">✗ {data.error}</div>}
          {data && !data.error && apps.length === 0 && (
            <div className="text-ink-2">
              No apps yet — <code className="rounded-sm bg-hover px-1.5 py-0.5 text-xs">small deploy</code> ships the first one.{' '}
              <a className="text-accent hover:underline" href="https://www.npmjs.com/package/small-deploy" target="_blank" rel="noreferrer">
                Get the CLI
              </a>
            </div>
          )}

          {apps.length > 0 && (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line text-left text-xs whitespace-nowrap text-ink-2">
                  <th className="h-8 pr-3 pl-1 font-normal">Name</th>
                  <th className="h-8 pr-3 font-normal">Kind</th>
                  <th className="h-8 pr-3 font-normal">Schedule</th>
                  <th className="h-8 pr-3 font-normal">Visibility</th>
                  <th className="h-8 pr-3 font-normal">Members</th>
                  <th className="h-8 pr-3 font-normal">Last deployed</th>
                  <th className="h-8 pr-3 font-normal">Last run</th>
                  <th className="h-8 pr-1 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => {
                  const live = runningId(a);
                  return (
                    <tr
                      key={a.name}
                      onClick={() => setPanel({ name: a.name, tab: 'runbook' })}
                      className="group h-9 cursor-pointer whitespace-nowrap hover:bg-hover"
                    >
                      <td className="rounded-l-sm pr-3 pl-1">
                        <span className="flex items-center gap-1.5 font-medium">
                          <KindIcon kind={a.kind} />
                          <button
                            className="cursor-pointer hover:underline"
                            onClick={(e) => { e.stopPropagation(); navigate(`/apps/${a.name}`); }}
                          >
                            {a.name}
                          </button>
                        </span>
                      </td>
                      <td className="pr-3"><Pill>{a.kind}</Pill></td>
                      <td className="pr-3">
                        {a.schedule ? (
                          <Pill
                            className={a.schedule_paused ? 'gap-1 opacity-60 line-through' : 'gap-1'}
                            title={`cron ${a.schedule} (UTC)${a.schedule_paused ? ' — paused' : ''}`}
                          >
                            <Clock size={10} />
                            {cronHuman(a.schedule)}
                          </Pill>
                        ) : (
                          <span className="text-ink-2">{a.kind === 'job' ? '—' : ''}</span>
                        )}
                      </td>
                      <td className="pr-3"><Pill>{a.visibility}</Pill></td>
                      <td className="pr-3">
                        <span className="flex items-center">
                          {people(a).slice(0, 4).map((e, i) => <Avatar key={e} email={e} className={i ? '-ml-1.5' : ''} />)}
                          {people(a).length > 4 && (
                            <span className="-ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-hover text-[10px] text-ink-2 ring-1 ring-white">
                              +{people(a).length - 4}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="pr-3 text-ink-2">{ago(a.deployed_at || a.created_at)}</td>
                      <td className="pr-3 text-ink-2">
                        {a.kind !== 'job' || (!live && !a.lastRun) ? (a.kind === 'job' ? '—' : '') : live ? (
                          <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> running</span>
                        ) : (
                          `${a.lastRun.status === 'finished' ? '✓' : '✗'} ${ago(a.lastRun.startedAt)}`
                        )}
                      </td>
                      <td className="rounded-r-sm pr-1 text-right">
                        {a.kind === 'job' ? (
                          live ? (
                            <Button
                              disabled={live === 'starting'}
                              title="stop this run"
                              onClick={(e) => { e.stopPropagation(); stopRun(live); }}
                            >
                              <Square size={11} fill="currentColor" /> Stop
                            </Button>
                          ) : (
                            <Button onClick={(e) => { e.stopPropagation(); startRun(a); }}>
                              <Play size={13} /> Run
                            </Button>
                          )
                        ) : (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-ink-2 hover:bg-white hover:text-ink"
                          >
                            Open <ArrowUpRight size={13} />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </main>

      {panelApp && (
        <Panel
          app={panelApp}
          tab={panel.tab}
          run={run?.appName === panelApp.name ? run : (panelApp.lastRun?.status === 'running' ? { appName: panelApp.name, id: panelApp.lastRun.runId } : null)}
          onTab={(t) => setPanel({ ...panel, tab: t })}
          onRunbookSaved={(name, text) =>
            setData((d) => ({ ...d, apps: d.apps.map((x) => (x.name === name ? { ...x, runbook: text } : x)) }))}
          onRunSettled={() => { setRun(null); load(); }}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
