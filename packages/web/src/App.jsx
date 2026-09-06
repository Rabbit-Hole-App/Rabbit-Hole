import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, ChevronDown, ChevronRight, Clock, EyeOff, Folder as FolderIcon, Inbox, ListFilter, Loader2, PanelRight, Play, Search, Settings2, Square, X } from 'lucide-react';
import { ago, api, cronHuman, cronList, fmtTime, navigate, sectionOf, wsName } from './api.js';
import Panel from './Panel.jsx';
import Shell from './Shell.jsx';
import { Avatar, Chk, cn, EmptyState, IconBtn, Input, KindIcon, Mark, Menu, MenuItem, Pill, PillButton, SkeletonRows, SubMenu, Tip, useHeaderDrag, ValuePicker } from './ui.jsx';

const people = (a) => [a.owner_email, ...(a.members || []).map((m) => m.email).filter((e) => e !== a.owner_email)];

const td = 'h-8 border-b border-line px-2 text-sm whitespace-nowrap';
const th = 'h-8 border-b border-line px-2 text-left text-xs font-normal text-ink-2';

// Notion-lite database controls: column order/visibility, one sort, one filter.
const COLS = { name: 'Name', kind: 'Kind', access: 'Access', people: 'People', watch: 'Watch', deployed: 'Deployed', lastrun: 'Last run' };
const DEFAULT_ORDER = Object.keys(COLS);
const COL_INFO = {
  name: 'The app. Click a row to open it',
  kind: 'server (always on) or job (runs on demand)',
  access: 'Who can open it',
  people: 'Owner and members',
  watch: 'Open findings from the nightly Watch pass',
  deployed: 'When it last shipped',
  lastrun: 'Latest run and its outcome',
};
const sortVal = (a, key) =>
  key === 'name' ? a.name
  : key === 'kind' ? a.kind
  : key === 'access' ? a.visibility
  : key === 'people' ? people(a).length
  : key === 'watch' ? (a.watch_count || 0)
  : key === 'deployed' ? (a.deployed_at || a.created_at || '')
  : key === 'lastrun' ? (a.lastRun?.startedAt || '')
  : '';
// enumerable columns get an equals-filter; free-text ones don't
const FILTERS = {
  kind: (a) => a.kind,
  access: (a) => (a.visibility === 'private' ? 'only shared' : 'anyone in org'),
  watch: (a) => (a.watch_count > 0 ? 'has findings' : 'none'),
};

export default function App() {
  return <Shell>{(data, load) => <AppContent data={data} load={load} />}</Shell>;
}

function AppContent({ data, load }) {
  const [panel, setPanel] = useState(null); // { name, tab }
  const [run, setRun] = useState(null); // { appName, id?, error? }
  const [search, setSearch] = useState(null); // null = collapsed, string = open

  // RUN opens the peek on its Run tab (the [inputs] form); the form's own Run
  // button starts the run and flips the peek to Logs.
  const startRun = (app) => {
    setRun(null);
    setPanel({ name: app.name, tab: 'form' });
  };

  const stopRun = async (id) => {
    try { await api(`/api/runs/${id}/stop`, { method: 'POST' }); } catch { /* poll shows the outcome */ }
    setRun(null);
    load();
  };

  // folder groups in the table collapse like the sidebar's, remembered per device
  const [closedGroups, setClosedGroups] = useState(() => JSON.parse(localStorage.getItem('small.tblFolders') || '{}'));
  const toggleGroup = (id) => setClosedGroups((s) => {
    const next = { ...s, [id]: !s[id] };
    localStorage.setItem('small.tblFolders', JSON.stringify(next));
    return next;
  });

  // table controls, remembered per device
  const persisted = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const [cols, setCols] = useState(() => persisted('small.tblCols', { order: DEFAULT_ORDER, hidden: {} }));
  const saveCols = (next) => { setCols(next); localStorage.setItem('small.tblCols', JSON.stringify(next)); };
  const [sort, setSort] = useState(() => persisted('small.tblSort', null));
  const saveSort = (s) => { setSort(s); localStorage.setItem('small.tblSort', JSON.stringify(s)); };
  const [filter, setFilter] = useState(() => persisted('small.tblFilter', null)); // { key, value }
  const saveFilter = (f) => { setFilter(f); localStorage.setItem('small.tblFilter', JSON.stringify(f)); };
  const [colMenu, setColMenu] = useState(null); // column key with its header menu open
  const [colSub, setColSub] = useState(null); // 'sort' | 'filter' flyout inside it
  const [toolMenu, setToolMenu] = useState(null); // 'filter' | 'sort' | 'props'
  const order = [...cols.order.filter((k) => DEFAULT_ORDER.includes(k)), ...DEFAULT_ORDER.filter((k) => !cols.order.includes(k))];
  const visibleCols = order.filter((k) => !cols.hidden[k]);
  const moveCol = (from, to, after = false) => {
    if (from === to) return;
    const next = order.filter((k) => k !== from);
    next.splice(next.indexOf(to) + (after ? 1 : 0), 0, from);
    saveCols({ ...cols, order: next });
  };
  // shared pointer drag with the FLIP slide (ui.jsx) - <5px still counts as a click
  const { down: headerDown, dragCol, squelch: clickSquelch } = useHeaderDrag(moveCol);

  const apps = data?.apps || [];
  const org = data?.org || 'small';
  // ?s=shared / ?s=private - the sidebar section labels filter this overview;
  // ?f=<folder> - the breadcrumb's folder crumb shows just that folder's apps
  const params = new URLSearchParams(window.location.search);
  const section = params.get('s');
  const folder = params.get('f') ? (data?.folders || []).find((x) => x.name === params.get('f')) : null;
  const title = folder ? folder.name : section === 'shared' ? 'Shared' : section === 'private' ? 'Private' : 'Apps';
  const sectionApps = folder
    ? apps.filter((a) => a.folder_id === folder.id)
    : section ? apps.filter((a) => sectionOf(a, org, data?.email) === section) : apps;
  // the inline search is agent-backed too: sentence queries ask the model, which
  // picks apps by description; short strings stay instant name matching
  const [aiFind, setAiFind] = useState(null); // null | 'loading' | { names, note }
  useEffect(() => {
    if (!search || search.trim().split(/\s+/).length < 4) { setAiFind(null); return; }
    setAiFind('loading');
    const t = setTimeout(() => {
      api('/api/apps/find', { method: 'POST', body: JSON.stringify({ q: search }) })
        .then((d) => setAiFind({ names: d.apps || [], note: d.note || '' }))
        .catch(() => setAiFind(null));
    }, 600);
    return () => clearTimeout(t);
  }, [search]);

  let rows = sectionApps;
  if (search) {
    rows = aiFind && aiFind !== 'loading'
      ? aiFind.names.map((n) => sectionApps.find((a) => a.name === n)).filter(Boolean)
      : sectionApps.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
  }
  if (filter && FILTERS[filter.key]) rows = rows.filter((a) => FILTERS[filter.key](a) === filter.value);
  if (sort) {
    rows = [...rows].sort((a, b) => {
      const x = sortVal(a, sort.key); const y = sortVal(b, sort.key);
      const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'desc' ? -c : c;
    });
  }
  // the plain Apps view groups by folder, Notion-style; filtered/search views stay flat
  const folders = data?.folders || [];
  const flat = !folder && !section && !search
    ? [
        ...folders.flatMap((g) => {
          const list = rows.filter((a) => a.folder_id === g.id);
          if (!list.length) return [];
          const isClosed = !!closedGroups[g.id];
          return [{ __folder: g, count: list.length, closed: isClosed }, ...(isClosed ? [] : list.map((a) => ({ ...a, __grouped: true })))];
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
            <EmptyState icon={Mark}>
              No apps yet - <code className="rounded-sm bg-hover px-1.5 py-0.5 text-xs">small deploy</code> ships the first one.{' '}
              <a className="text-accent hover:underline" href="https://www.npmjs.com/package/small-deploy" target="_blank" rel="noreferrer">
                Get the CLI
              </a>
            </EmptyState>
          )}

          {apps.length > 0 && (
            <>
              <div className="flex h-8 items-center justify-end gap-1">
                {/* active filter/sort read back as chips; the buttons open Notion-style menus */}
                {filter && (
                  <Pill color="blue">
                    {COLS[filter.key]}: {filter.value}
                    <button aria-label="Clear filter" className="cursor-pointer" onClick={() => saveFilter(null)}><X size={10} /></button>
                  </Pill>
                )}
                {sort && (
                  <Pill>
                    {COLS[sort.key]} {sort.dir === 'desc' ? '↓' : '↑'}
                    <button aria-label="Clear sort" className="cursor-pointer" onClick={() => saveSort(null)}><X size={10} /></button>
                  </Pill>
                )}
                <div className="relative">
                  <IconBtn title="Filter" className={cn('rounded-full!', toolMenu === 'filter' && 'bg-active')} onClick={() => setToolMenu(toolMenu === 'filter' ? null : 'filter')}>
                    <ListFilter size={16} strokeWidth={1.5} />
                  </IconBtn>
                  <Menu open={toolMenu === 'filter'} onClose={() => setToolMenu(null)} className="top-8 right-0 w-56">
                    {Object.keys(FILTERS).flatMap((k) =>
                      [...new Set(sectionApps.map((a) => FILTERS[k](a)))].sort().map((v) => (
                        <MenuItem key={`${k}:${v}`} onClick={() => { saveFilter({ key: k, value: v }); setToolMenu(null); }}>
                          {COLS[k]} · {v}
                        </MenuItem>
                      )))}
                    {filter && <MenuItem className="text-ink-2" onClick={() => { saveFilter(null); setToolMenu(null); }}>Clear filter</MenuItem>}
                  </Menu>
                </div>
                <div className="relative">
                  <IconBtn title="Sort" className={cn('rounded-full!', toolMenu === 'sort' && 'bg-active')} onClick={() => setToolMenu(toolMenu === 'sort' ? null : 'sort')}>
                    <ArrowUp size={16} strokeWidth={1.5} />
                  </IconBtn>
                  <Menu open={toolMenu === 'sort'} onClose={() => setToolMenu(null)} className="top-8 right-0 w-56">
                    {visibleCols.map((k) => (
                      <MenuItem key={k} onClick={() => { saveSort({ key: k, dir: sort?.key === k && sort.dir === 'asc' ? 'desc' : 'asc' }); setToolMenu(null); }}>
                        {COLS[k]}{sort?.key === k ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                      </MenuItem>
                    ))}
                    {sort && <MenuItem className="text-ink-2" onClick={() => { saveSort(null); setToolMenu(null); }}>Clear sort</MenuItem>}
                  </Menu>
                </div>
                <div className="relative">
                  <IconBtn title="Properties" className={cn('rounded-full!', toolMenu === 'props' && 'bg-active')} onClick={() => setToolMenu(toolMenu === 'props' ? null : 'props')}>
                    <Settings2 size={16} strokeWidth={1.5} />
                  </IconBtn>
                  <Menu open={toolMenu === 'props'} onClose={() => setToolMenu(null)} className="top-8 right-0 w-48">
                    {order.map((k) => (
                      <MenuItem
                        key={k}
                        onClick={() => k !== 'name' && saveCols({ ...cols, hidden: { ...cols.hidden, [k]: !cols.hidden[k] } })}
                        className={k === 'name' ? 'opacity-50' : ''}
                      >
                        <Chk on={!cols.hidden[k]} /> {COLS[k]}
                      </MenuItem>
                    ))}
                  </Menu>
                </div>
                {search === null ? (
                  <IconBtn title="Search" className="rounded-full!" onClick={() => setSearch('')}>
                    <Search size={16} strokeWidth={1.5} />
                  </IconBtn>
                ) : (
                  <div className="w-72">
                    <Input
                      autoFocus
                      value={search}
                      placeholder="Describe what you are looking for"
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
                    {visibleCols.map((k) => (
                      <th
                        key={k}
                        data-col={k}
                        onPointerDown={headerDown(k)}
                        className={cn(th, 'relative cursor-pointer touch-none select-none hover:bg-hover', dragCol === k && 'bg-active opacity-60')}
                        onClick={() => {
                          if (clickSquelch.current) { clickSquelch.current = false; return; }
                          setColSub(null);
                          setColMenu(colMenu === k ? null : k);
                        }}
                      >
                        <Tip label={COLS[k]} info={COL_INFO[k]}>
                          <span>{COLS[k]}{sort?.key === k ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}</span>
                        </Tip>
                        <Menu open={colMenu === k} onClose={() => { setColMenu(null); setColSub(null); }} className="top-8 left-0 w-44 cursor-default font-normal normal-case">
                          <SubMenu icon={ArrowUp} label="Sort" open={colSub === 'sort'} onOpen={() => setColSub('sort')} width="w-44">
                            <MenuItem onClick={(e) => { e.stopPropagation(); saveSort({ key: k, dir: 'asc' }); setColMenu(null); }}>Sort ascending</MenuItem>
                            <MenuItem onClick={(e) => { e.stopPropagation(); saveSort({ key: k, dir: 'desc' }); setColMenu(null); }}>Sort descending</MenuItem>
                          </SubMenu>
                          {FILTERS[k] && (
                            <SubMenu icon={ListFilter} label="Filter" open={colSub === 'filter'} onOpen={() => setColSub('filter')}>
                              <ValuePicker
                                values={[...new Set(sectionApps.map((a) => FILTERS[k](a)))].sort()}
                                onPick={(v) => { saveFilter({ key: k, value: v }); setColMenu(null); setColSub(null); }}
                              />
                            </SubMenu>
                          )}
                          {k !== 'name' && (
                            <MenuItem icon={EyeOff} onClick={(e) => { e.stopPropagation(); saveCols({ ...cols, hidden: { ...cols.hidden, [k]: true } }); setColMenu(null); }}>Hide column</MenuItem>
                          )}
                        </Menu>
                      </th>
                    ))}
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
                          <td colSpan={visibleCols.length + 1} className="border-b border-line px-2 pt-3 pb-1">
                            <span className="flex items-center gap-1 text-sm font-medium">
                              <button
                                aria-label={a.closed ? `Expand ${a.__folder.name}` : `Collapse ${a.__folder.name}`}
                                onClick={(e) => { e.stopPropagation(); toggleGroup(a.__folder.id); }}
                                className="cursor-pointer rounded-sm p-0.5 text-ink-3 hover:bg-active hover:text-ink"
                              >
                                {a.closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                              </button>
                              <FolderIcon size={15} strokeWidth={1.5} className="text-ink-2" />
                              {a.__folder.name}
                            </span>
                          </td>
                        </tr>
                      );
                    }
                    const live = runningId(a);
                    const CELLS = {
                      name: (
                        <td key="name" className={td}>
                          {/* grouped rows indent under their folder header */}
                          <span className={`flex items-center gap-1.5 font-medium${a.__grouped ? ' pl-6' : ''}`}>
                            <KindIcon kind={a.kind} schedule={a.schedule} />
                            <button
                              className="cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); navigate(`/apps/${a.name}`); }}
                            >
                              {a.name}
                            </button>
                          </span>
                        </td>
                      ),
                      kind: (
                        <td key="kind" className={td}>
                          <span className="flex items-center gap-1.5">
                            <Pill color={a.kind === 'job' ? 'blue' : 'grey'}>{a.kind}</Pill>
                            {a.schedule && (
                              <Pill
                                className={a.schedule_paused ? 'opacity-60 line-through' : ''}
                                title={`cron ${a.schedule} (UTC)${a.schedule_paused ? ' - paused' : ''}`}
                              >
                                <Clock size={10} />
                                {cronList(a.schedule).map(cronHuman).join(' · ')}
                              </Pill>
                            )}
                          </span>
                        </td>
                      ),
                      access: (
                        <td key="access" className={`${td} text-ink-2`}>
                          {a.visibility === 'private' ? 'only shared' : `anyone @${a.org.replace(/-/g, '.')}`}
                        </td>
                      ),
                      people: (
                        <td key="people" className={td}>
                          <span className="flex items-center">
                            {people(a).slice(0, 4).map((e, i) => <Avatar key={e} email={e} className={i ? '-ml-1.5' : ''} />)}
                            {people(a).length > 4 && (
                              <span className="-ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-hover text-[10px] text-ink-2 ring-1 ring-white">
                                +{people(a).length - 4}
                              </span>
                            )}
                          </span>
                        </td>
                      ),
                      watch: (
                        <td key="watch" className={td}>
                          {a.watch_count > 0
                            ? <Pill color="orange" title={`${a.watch_count} open observation${a.watch_count > 1 ? 's' : ''}`}>{a.watch_count}</Pill>
                            : <span className="text-ink-3">-</span>}
                        </td>
                      ),
                      deployed: (
                        <td key="deployed" className={`${td} text-ink-2`} title={fmtTime(a.deployed_at || a.created_at)}>
                          {ago(a.deployed_at || a.created_at)}
                        </td>
                      ),
                      lastrun: (
                        <td key="lastrun" className={`${td} text-ink-2`}>
                          {a.kind !== 'job' || (!live && !a.lastRun) ? (a.kind === 'job' ? '-' : '') : live ? (
                            <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> running</span>
                          ) : (
                            `${a.lastRun.status === 'finished' ? '✓' : '✗'} ${ago(a.lastRun.startedAt)}`
                          )}
                        </td>
                      ),
                    };
                    return (
                      <tr
                        key={`${a.org}/${a.name}`}
                        onClick={() => navigate(`/apps/${a.name}`)} // row = the full app page; the OPEN pill = side peek
                        className="group cursor-pointer hover:bg-hover"
                      >
                        {visibleCols.map((k) => CELLS[k])}
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
              {aiFind === 'loading' && <div className="flex h-7 items-center px-2 text-xs text-ink-3">Thinking…</div>}
              {aiFind?.names?.length === 0 && (
                <div className="flex h-7 items-center px-2 text-sm text-ink-2">{aiFind.note || 'Nothing here does that yet.'}</div>
              )}
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
          onRunStarted={(id) => { setRun({ appName: panelApp.name, id }); setPanel({ name: panelApp.name, tab: 'run' }); }}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  );
}
