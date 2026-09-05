import { useState } from 'react';
import { ArrowUpRight, Clock, Folder as FolderIcon, Inbox, Loader2, PanelRight, Play, Search, Square } from 'lucide-react';
import { ago, api, cronHuman, cronList, fmtTime, navigate, sectionOf, wsName } from './api.js';
import Panel from './Panel.jsx';
import Shell from './Shell.jsx';
import { Avatar, EmptyState, IconBtn, Input, KindIcon, Pill, PillButton, SkeletonRows } from './ui.jsx';

const people = (a) => [a.owner_email, ...(a.members || []).map((m) => m.email).filter((e) => e !== a.owner_email)];

const td = 'h-8 border-b border-line px-2 text-sm whitespace-nowrap';
const th = 'h-8 border-b border-line px-2 text-left text-xs font-normal text-ink-2';

export default function App() {
  return <Shell>{(data, load) => <AppContent data={data} load={load} />}</Shell>;
}

function AppContent({ data, load }) {
  const [panel, setPanel] = useState(null); // { name, tab }
  const [run, setRun] = useState(null); // { appName, id?, error? }
  const [search, setSearch] = useState(null); // null = collapsed, string = open

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
  // ?s=shared / ?s=private — the sidebar section labels filter this overview;
  // ?f=<folder> — the breadcrumb's folder crumb shows just that folder's apps
  const params = new URLSearchParams(window.location.search);
  const section = params.get('s');
  const folder = params.get('f') ? (data?.folders || []).find((x) => x.name === params.get('f')) : null;
  const title = folder ? folder.name : section === 'shared' ? 'Shared' : section === 'private' ? 'Private' : 'Apps';
  const sectionApps = folder
    ? apps.filter((a) => a.folder_id === folder.id)
    : section ? apps.filter((a) => sectionOf(a, org, data?.email) === section) : apps;
  const rows = search ? sectionApps.filter((a) => a.name.toLowerCase().includes(search.toLowerCase())) : sectionApps;
  // the plain Apps view groups by folder, Notion-style; filtered/search views stay flat
  const folders = data?.folders || [];
  const flat = !folder && !section && !search
    ? [
        ...folders.flatMap((g) => {
          const list = rows.filter((a) => a.folder_id === g.id);
          return list.length ? [{ __folder: g, count: list.length }, ...list] : [];
        }),
        ...rows.filter((a) => !folders.some((g) => g.id === a.folder_id)),
      ]
    : rows;
  const panelApp = panel && apps.find((a) => a.name === panel.name);
  const runningId = (a) =>
    (run?.appName === a.name && !run.error && (run.id || 'starting')) ||
    (a.lastRun?.status === 'running' && a.lastRun.runId) || null;

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1150px] px-24 py-12 max-lg:px-8 max-md:px-4 max-md:py-6">
          <div className="pb-8 text-sm text-ink-2">
            <button onClick={() => navigate('/apps')} className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink">{wsName(org)}</button>
            <span className="px-1">/</span> <span className="text-ink">{title}</span>
          </div>
          <h1 className="pb-5 text-[40px] leading-[1.2] font-bold tracking-[-0.01em]">{title}</h1>

          {!data && <SkeletonRows rows={4} />}
          {data?.error && <div className="text-ink-2">✗ {data.error}</div>}
          {data && !data.error && apps.length === 0 && (
            <EmptyState icon={Inbox}>
              No apps yet — <code className="rounded-sm bg-hover px-1.5 py-0.5 text-xs">small deploy</code> ships the first one.{' '}
              <a className="text-accent hover:underline" href="https://www.npmjs.com/package/small-deploy" target="_blank" rel="noreferrer">
                Get the CLI
              </a>
            </EmptyState>
          )}

          {apps.length > 0 && (
            <>
              <div className="flex h-8 items-center justify-end">
                {search === null ? (
                  <IconBtn title="Search" onClick={() => setSearch('')}>
                    <Search size={16} strokeWidth={1.5} />
                  </IconBtn>
                ) : (
                  <div className="w-48">
                    <Input
                      autoFocus
                      value={search}
                      placeholder="Search apps…"
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setSearch(null)}
                      onBlur={() => !search && setSearch(null)}
                    />
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="whitespace-nowrap">
                    <th className={th}>Name</th>
                    <th className={th}>Kind</th>
                    <th className={th}>Access</th>
                    <th className={th}>People</th>
                    <th className={th}>Deployed</th>
                    <th className={th}>Last run</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {flat.map((a) => {
                    if (a.__folder) {
                      return (
                        <tr
                          key={`folder-${a.__folder.id}`}
                          onClick={() => navigate(`/apps?f=${encodeURIComponent(a.__folder.name)}`)}
                          className="cursor-pointer hover:bg-hover"
                        >
                          <td colSpan={7} className="border-b border-line px-2 pt-3 pb-1">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                              <FolderIcon size={14} strokeWidth={1.5} className="text-ink-3" />
                              {a.__folder.name}
                              <span className="font-normal text-ink-3">{a.count}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    }
                    const live = runningId(a);
                    return (
                      <tr
                        key={`${a.org}/${a.name}`}
                        onClick={() => setPanel({ name: a.name, tab: 'runbook' })}
                        className="group cursor-pointer hover:bg-hover"
                      >
                        <td className={td}>
                          <span className="flex items-center gap-1.5 font-medium">
                            <KindIcon kind={a.kind} schedule={a.schedule} />
                            <button
                              className="cursor-pointer hover:underline"
                              onClick={(e) => { e.stopPropagation(); navigate(`/apps/${a.name}`); }}
                            >
                              {a.name}
                            </button>
                          </span>
                        </td>
                        <td className={td}>
                          <span className="flex items-center gap-1.5">
                            <Pill color={a.kind === 'job' ? 'blue' : 'grey'}>{a.kind}</Pill>
                            {a.schedule && (
                              <Pill
                                className={a.schedule_paused ? 'opacity-60 line-through' : ''}
                                title={`cron ${a.schedule} (UTC)${a.schedule_paused ? ' — paused' : ''}`}
                              >
                                <Clock size={10} />
                                {cronList(a.schedule).map(cronHuman).join(' · ')}
                              </Pill>
                            )}
                          </span>
                        </td>
                        <td className={`${td} text-ink-2`}>
                          {a.visibility === 'private' ? 'only shared' : `anyone @${a.org.replace(/-/g, '.')}`}
                        </td>
                        <td className={td}>
                          <span className="flex items-center">
                            {people(a).slice(0, 4).map((e, i) => <Avatar key={e} email={e} className={i ? '-ml-1.5' : ''} />)}
                            {people(a).length > 4 && (
                              <span className="-ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-hover text-[10px] text-ink-2 ring-1 ring-white">
                                +{people(a).length - 4}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={`${td} text-ink-2`} title={fmtTime(a.deployed_at || a.created_at)}>
                          {ago(a.deployed_at || a.created_at)}
                        </td>
                        <td className={`${td} text-ink-2`}>
                          {a.kind !== 'job' || (!live && !a.lastRun) ? (a.kind === 'job' ? '—' : '') : live ? (
                            <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> running</span>
                          ) : (
                            `${a.lastRun.status === 'finished' ? '✓' : '✗'} ${ago(a.lastRun.startedAt)}`
                          )}
                        </td>
                        <td className={`${td} text-right`}>
                          <span className="inline-flex items-center gap-1">
                            <PillButton
                              title="Open in side peek"
                              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                              onClick={(e) => { e.stopPropagation(); setPanel({ name: a.name, tab: 'runbook' }); }}
                            >
                              <PanelRight size={11} /> Open
                            </PillButton>
                            {a.kind === 'job' ? (
                              live ? (
                                <PillButton
                                  disabled={live === 'starting'}
                                  title="Stop this run"
                                  onClick={(e) => { e.stopPropagation(); stopRun(live); }}
                                >
                                  <Square size={10} fill="currentColor" /> Stop
                                </PillButton>
                              ) : (
                                <PillButton title="Run now" onClick={(e) => { e.stopPropagation(); startRun(a); }}>
                                  <Play size={11} /> Run
                                </PillButton>
                              )
                            ) : (
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                title="Open the app"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-ink-2 hover:bg-white hover:text-ink"
                              >
                                <ArrowUpRight size={14} />
                              </a>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <div className="flex h-7 items-center px-2 text-xs text-ink-3">Count {rows.length}</div>
            </>
          )}
        </div>
      </main>

      {panelApp && (
        <Panel
          app={panelApp}
          tab={panel.tab}
          run={run?.appName === panelApp.name ? run : (panelApp.lastRun?.status === 'running' ? { appName: panelApp.name, id: panelApp.lastRun.runId } : null)}
          onTab={(t) => setPanel({ ...panel, tab: t })}
          onRunbookSaved={() => load()}
          onRunSettled={() => { setRun(null); load(); }}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  );
}
