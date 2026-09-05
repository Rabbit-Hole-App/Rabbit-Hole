import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Globe, Link as LinkIcon, Lock, MoreHorizontal, Trash2, Users, X } from 'lucide-react';
import { ago, api, cronHuman, fmtTime, navigate, wsName } from './api.js';
import { RunForm, RunPeek, RunsDb, RunView } from './run.jsx';
import Shell from './Shell.jsx';
import { Avatar, Button, ConfirmDialog, EmptyState, IconBtn, Input, KindIcon, Menu, MenuItem, Pill, ShareInput, SkeletonRows, Tabs, TabsContent, TabsList, TabsTrigger, cn, toast } from './ui.jsx';

const Runbook = lazy(() => import('./RunbookEditor.jsx'));

const TH = 'h-8 border-b border-line px-2 text-left text-xs font-normal text-ink-2';
const TD = 'h-8 border-b border-line px-2 text-sm whitespace-nowrap';

// Notion-style share popover: visibility toggle, people list (no borders), email field.
// Viewers get the same popover read-only.
function SharePopover({ app, onChanged }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('view');
  const [err, setErr] = useState(null);
  const [orgTeams, setOrgTeams] = useState([]);
  const [pool, setPool] = useState([]);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    if (app.canEdit) {
      api('/api/teams').then((d) => setOrgTeams(d.teams)).catch(() => {});
      api('/api/members').then((d) => setPool(d.members)).catch(() => {});
    }
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const call = async (fn) => {
    setErr(null);
    try { await fn(); onChanged(); } catch (e) { setErr(e.message); }
  };
  const share = (body) => call(() => api('/api/share', { method: 'POST', body: JSON.stringify({ app: app.name, ...body }) }));
  const add = (e) => {
    e.preventDefault();
    const v = email.trim();
    if (v.startsWith('#')) {
      if (v.length < 2) return;
      share({ team: v, role });
    } else {
      if (!v.includes('@')) return;
      share({ email: v, role });
    }
    setEmail('');
  };
  const exclude = [
    app.owner_email,
    ...app.members.map((m) => m.email),
    ...(app.teams || []).map((t) => `#${t.name}`),
  ];
  const setVis = (visibility) =>
    visibility !== app.visibility && call(() => api(`/api/apps/${app.name}`, { method: 'PATCH', body: JSON.stringify({ visibility }) }));
  const remove = (m) => call(() => api('/api/unshare', { method: 'POST', body: JSON.stringify({ app: app.name, email: m }) }));
  const domain = app.org.replace(/-/g, '.'); // orgOf is lossy; close enough for display

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" onClick={() => setOpen(!open)}>Share</Button>
      {open && (
        <div className="absolute top-9 right-0 z-10 w-80 rounded-md bg-white p-2 shadow-pop">
          {app.canEdit && (
            <>
              <form onSubmit={add} className="flex items-start gap-1 px-1 pb-2">
                <ShareInput
                  autoFocus
                  value={email}
                  onChange={setEmail}
                  onPick={(it) => { share({ ...it, role }); setEmail(''); }}
                  people={pool}
                  teams={orgTeams}
                  exclude={exclude}
                  placeholder="Add people by email, teams by #…"
                  className="min-w-0 flex-1"
                />
                <select value={role} onChange={(e) => setRole(e.target.value)} className="h-7 rounded-sm text-xs text-ink-2 outline-none">
                  <option value="view">view</option>
                  <option value="edit">edit</option>
                </select>
                {/* implicit form submission is unreliable with multiple fields — Enter must always work */}
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
              </form>
            </>
          )}
          {[
            { v: 'domain', icon: Globe, label: `Anyone at ${domain} can view` },
            { v: 'private', icon: Lock, label: 'Only people added below' },
          ].map(({ v, icon: Icon, label }) => (
            <button
              key={v}
              disabled={!app.canEdit}
              onClick={() => setVis(v)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                app.canEdit && 'cursor-pointer hover:bg-hover',
              )}
            >
              <Icon size={14} className="shrink-0 text-ink-2" />
              <span className="flex-1">{label}</span>
              {app.visibility === v && <Check size={14} className="shrink-0 text-accent" />}
            </button>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            <div className="group/p flex items-center gap-2 rounded-sm px-2 py-1.5">
              <Avatar email={app.owner_email} />
              <span className="min-w-0 flex-1 truncate text-sm">{app.owner_email}</span>
              <span className="text-xs text-ink-2">owner</span>
            </div>
            {(app.teams || []).map((t) => (
              <div key={t.name} className="group/p flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-hover">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hover ring-1 ring-white">
                  <Users size={12} className="text-ink-2" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  #{t.name} <span className="text-xs text-ink-2">· {t.count} people</span>
                </span>
                {app.canEdit ? (
                  <>
                    <select
                      value={t.role}
                      onChange={(e) => share({ team: t.name, role: e.target.value })}
                      className="cursor-pointer rounded-sm text-xs text-ink-2 outline-none"
                    >
                      <option value="view">view</option>
                      <option value="edit">edit</option>
                    </select>
                    <button
                      aria-label={`Remove #${t.name}`}
                      onClick={() => call(() => api('/api/unshare', { method: 'POST', body: JSON.stringify({ app: app.name, team: t.name }) }))}
                      className="cursor-pointer rounded-sm p-0.5 text-ink-2 opacity-0 group-hover/p:opacity-100 hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-ink-2">{t.role}</span>
                )}
              </div>
            ))}
            {app.members.map((m) => (
              <div key={m.email} className="group/p flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-hover">
                <Avatar email={m.email} />
                <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
                {app.canEdit ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) => call(() => api('/api/share', { method: 'POST', body: JSON.stringify({ app: app.name, email: m.email, role: e.target.value }) }))}
                      className="cursor-pointer rounded-sm text-xs text-ink-2 outline-none"
                    >
                      <option value="view">view</option>
                      <option value="edit">edit</option>
                    </select>
                    <button
                      aria-label={`Remove ${m.email}`}
                      onClick={() => remove(m.email)}
                      className="cursor-pointer rounded-sm p-0.5 text-ink-2 opacity-0 group-hover/p:opacity-100 hover:text-ink"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-ink-2">{m.role}</span>
                )}
              </div>
            ))}
          </div>
          {err && <div className="px-2 pt-1 text-xs text-ink-2">✗ {err}</div>}
        </div>
      )}
    </div>
  );
}

function Denied({ slug, error }) {
  const [asked, setAsked] = useState(null); // { sent }
  const owner = error.data?.owner;
  const ask = async () => {
    try { setAsked(await api(`/api/apps/${slug}/request-access`, { method: 'POST' })); } catch (e) { setAsked({ err: e.message }); }
  };
  return (
    <div className="mx-auto max-w-md pt-[20vh] text-center">
      <div className="pb-3">You don’t have access.{owner ? ` Ask ${owner}` : ''}</div>
      {owner && !asked && <Button variant="accent" className="mx-auto" onClick={ask}>Request access</Button>}
      {asked && (
        <div className="text-sm text-ink-2">
          {asked.err ? `✗ ${asked.err}` : asked.sent ? `✓ asked ${owner}` : `✓ noted — email isn’t configured on this control plane, ping ${owner} directly`}
        </div>
      )}
    </div>
  );
}

const Person = ({ email }) => (email
  ? <span className="inline-flex items-center gap-1.5"><Avatar email={email} />{email}</span>
  : '—');

// 2xx green, 3xx blue, 403 with no user = guard rejection, other 4xx yellow, 5xx red.
const ReqStatus = ({ status, user }) => (status === 403 && user == null
  ? <Pill color="grey">rejected</Pill>
  : <Pill color={status < 300 ? 'green' : status < 400 ? 'blue' : status < 500 ? 'yellow' : 'red'}>{status}</Pill>);

// Servers → request log, newest first.
function RequestLog({ slug }) {
  const [lines, setLines] = useState(null);
  useEffect(() => { api(`/api/request-logs?app=${encodeURIComponent(slug)}`).then((d) => setLines(d.lines)).catch(() => setLines([])); }, [slug]);
  if (!lines) return <SkeletonRows />;
  if (!lines.length) return <EmptyState>No requests yet.</EmptyState>;
  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={TH}>Time</th>
            <th className={TH}>Method</th>
            <th className={TH}>Path</th>
            <th className={TH}>Status</th>
            <th className={cn(TH, 'text-right')}>ms</th>
            <th className={TH}>Person</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="hover:bg-hover">
              <td className={TD} title={fmtTime(l.ts)}>{ago(l.ts)}</td>
              <td className={TD}>{l.method}</td>
              <td className={TD}><span className="block max-w-72 truncate" title={l.path}>{l.path}</span></td>
              <td className={TD}><ReqStatus status={l.status} user={l.user} /></td>
              <td className={cn(TD, 'text-right tabular-nums')}>{l.ms}</td>
              <td className={TD}><Person email={l.user} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex h-7 items-center px-2 text-xs text-ink-3">Count {lines.length}</div>
    </>
  );
}

export default function SharePage({ slug, runId }) {
  // flow.md §1: sidebar is always present — the app page included.
  return <Shell>{(data, reloadShell) => <AppPage slug={slug} runId={runId} reloadShell={reloadShell} />}</Shell>;
}

function AppPage({ slug, runId, reloadShell }) {
  const [app, setApp] = useState(null);
  const [error, setError] = useState(null);
  const [peek, setPeek] = useState(null); // runId shown in the side peek
  const [tab, setTab] = useState(null); // null until the app's kind picks the default
  const [prefill, setPrefill] = useState(null); // Run-again inputs for the form
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editTitle, setEditTitle] = useState(null); // string while renaming

  const rename = async () => {
    const next = (editTitle || '').trim().toLowerCase();
    setEditTitle(null);
    if (!next || next === slug) return;
    try {
      await api(`/api/apps/${slug}/rename`, { method: 'POST', body: JSON.stringify({ name: next }) });
      toast(`Renamed to ${next}`);
      reloadShell?.(); // the sidebar shows the old name otherwise
      navigate(`/apps/${next}`);
    } catch (e) {
      toast(`✗ ${e.message}`);
    }
  };

  const load = () => api(`/api/apps/${slug}`).then((d) => {
    setApp(d);
    setError(null);
    try {
      const r = JSON.parse(localStorage.getItem('small.recent') || '[]');
      localStorage.setItem('small.recent', JSON.stringify([slug, ...r.filter((x) => x !== slug)].slice(0, 5)));
    } catch { /* recents are best-effort */ }
  }).catch(setError);
  // AppPage survives sidebar navigation (same element position) — per-app state
  // must reset with the slug or app A's peek/tab/prefill leak into app B.
  useEffect(() => { setApp(null); setError(null); setPeek(null); setTab(null); setPrefill(null); load(); }, [slug]);

  // Run again (peek footer, table hover ▶): prefill the form, land on the Run tab.
  const runAgain = (inputs) => { setPeek(null); setPrefill({ ...inputs }); setTab('run'); };

  const domain = app?.org.replace(/-/g, '.');
  const source = app?.repo_branch && app?.repo_commit
    ? `${app.repo_branch} · ${app.repo_commit.slice(0, 7)}${app.repo_dirty ? ' · dirty' : ''}`
    : null;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-24 py-12 max-lg:px-8 max-md:px-4 max-md:py-6">
        <div className="flex items-center gap-1 pb-8 text-sm text-ink-2">
          <button className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink" onClick={() => navigate('/apps')}>{wsName(app?.org)}</button>
          <span>/</span>
          <button className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink" onClick={() => navigate('/apps')}>Apps</button>
          <span>/</span>
          {runId ? (
            <>
              <button className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink" onClick={() => navigate(`/apps/${slug}`)}>{slug}</button>
              <span>/</span>
              <span className="px-1 text-ink">Run {runId.replace(/^r-/, '').slice(0, 7)}</span>
            </>
          ) : (
            <span className="px-1 text-ink">{slug}</span>
          )}
          <span className="flex-1" />
          {app && (
            <>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/apps/${app.name}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <LinkIcon size={16} strokeWidth={1.5} /> {copied ? 'Copied' : 'Copy link'}
              </Button>
              {/* Private-section apps (mine, private, unshared) have no Share — drag to Apps in the sidebar to open one up. */}
              {!(app.visibility === 'private' && app.owner_email === app.email && !app.members?.length && !app.teams?.length) && (
                <SharePopover app={app} onChanged={load} />
              )}
              {app.owner_email === app.email && (
                <div className="relative">
                  <IconBtn title="More" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={16} strokeWidth={1.5} /></IconBtn>
                  <Menu open={menuOpen} onClose={() => setMenuOpen(false)} className="top-8 right-0">
                    <MenuItem icon={Trash2} className="text-danger" onClick={() => { setMenuOpen(false); setConfirmDel(true); }}>
                      Move to Trash
                    </MenuItem>
                  </Menu>
                </div>
              )}
            </>
          )}
          {confirmDel && (
            <ConfirmDialog
              title={`Move ${slug} to Trash?`}
              body="It stops being reachable. Restore it from Trash within 30 days; after that it's gone for good."
              confirmLabel="Move to Trash"
              onConfirm={async () => {
                setConfirmDel(false);
                try { await api(`/api/apps/${slug}`, { method: 'DELETE' }); toast(`Deleted ${slug}`); navigate('/apps'); }
                catch (e) { toast(`✗ ${e.message}`); }
              }}
              onCancel={() => setConfirmDel(false)}
            />
          )}
        </div>

        {error && (error.status === 403 ? (
          <Denied slug={slug} error={error} />
        ) : error.status === 404 ? (
          // 404 also covers ex-members from another org — existence is not revealed to them
          <div className="mx-auto max-w-md pt-[20vh] text-center">You don’t have access, or this app doesn’t exist.</div>
        ) : (
          <div className="text-ink-2">✗ {error.message}</div>
        ))}
        {!error && !app && <SkeletonRows rows={3} className="pt-8" />}

        {app && runId && (
          <>
            <h1 className="pb-4 text-[32px] leading-[1.2] font-bold tracking-[-0.01em]">Run {runId.replace(/^r-/, '').slice(0, 7)}</h1>
            <div className="max-w-[640px]">
              <RunView
                runId={runId}
                app={app}
                onRunAgain={(inputs) => {
                  sessionStorage.setItem(`small.runPrefill.${slug}`, JSON.stringify(inputs || {}));
                  setPeek(null);
                  setTab('run'); // AppPage stays mounted across this navigate — land on the form
                  navigate(`/apps/${slug}`);
                }}
              />
            </div>
          </>
        )}

        {app && !runId && (
          <>
            <div className="flex items-center gap-2.5 pb-2">
              <KindIcon kind={app.kind} schedule={app.schedule} size={20} />
              {editTitle !== null ? (
                <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); rename(); }}>
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={rename}
                    onKeyDown={(e) => e.key === 'Escape' && setEditTitle(null)}
                    className="w-full bg-transparent text-[40px] leading-[1.2] font-bold tracking-[-0.01em] outline-none"
                  />
                </form>
              ) : (
                <h1
                  title={app.canEdit ? 'Click to rename' : undefined}
                  onClick={() => app.canEdit && setEditTitle(app.name)}
                  className={cn('text-[40px] leading-[1.2] font-bold tracking-[-0.01em]', app.canEdit && 'cursor-text rounded-sm hover:bg-hover/60')}
                >
                  {app.name}
                </h1>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="inline-flex items-center"><span className="mr-1.5 text-ink-2">Kind</span><Pill color={app.kind === 'job' ? 'blue' : 'grey'}>{app.kind}</Pill></span>
              <span><span className="mr-1.5 text-ink-2">Access</span>{app.visibility === 'domain' ? `anyone @${domain}` : 'only shared'}</span>
              <span><span className="mr-1.5 text-ink-2">Deployed</span>{ago(app.deployed_at || app.created_at)}</span>
              {app.schedule && (
                <span className="inline-flex items-center">
                  <span className="mr-1.5 text-ink-2">Schedule</span>
                  <Pill className={cn(app.schedule_paused && 'line-through opacity-60')} title={`cron ${app.schedule} (UTC)`}>{cronHuman(app.schedule)}</Pill>
                </span>
              )}
              {source && (
                <span>
                  <span className="mr-1.5 text-ink-2">Source</span>
                  {app.repo_public && app.repo_url
                    ? <a href={app.repo_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{source}</a>
                    : source}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5"><span className="text-ink-2">Owner</span><Avatar email={app.owner_email} />{app.owner_email}</span>
            </div>

            <Tabs value={tab ?? (app.kind === 'job' ? 'run' : 'runbook')} onValueChange={setTab}>
              <TabsList className="mt-5">
                <TabsTrigger value="runbook">Runbook</TabsTrigger>
                {app.kind === 'job' && <TabsTrigger value="run">Run</TabsTrigger>}
                <TabsTrigger value="logs">Logs</TabsTrigger>
                {app.kind !== 'job' && (
                  <span className="ml-auto self-center">
                    <Button variant="primary" size="sm" onClick={() => window.open(app.url, '_blank', 'noopener')}>
                      Open <ArrowUpRight size={14} strokeWidth={1.5} />
                    </Button>
                  </span>
                )}
              </TabsList>

              <TabsContent value="runbook" className="min-h-[200px] pt-4">
                <Suspense fallback={<div className="text-ink-2">loading…</div>}>
                  <Runbook app={app} canEdit={!!app.canEdit} onSaved={(name, text) => setApp((a) => ({ ...a, runbook: text }))} />
                </Suspense>
              </TabsContent>

              {app.kind === 'job' && (
                <TabsContent value="run" className="pt-5">
                  <RunForm app={app} prefill={prefill} onStarted={(id) => { setPeek(id); load(); }} />
                </TabsContent>
              )}

              <TabsContent value="logs" className="pt-4">
                {app.kind === 'job'
                  ? <RunsDb app={app} onOpen={setPeek} onNewRun={() => setTab('run')} onRunAgain={runAgain} />
                  : <RequestLog slug={slug} />}
              </TabsContent>
            </Tabs>

            {app.lastOpened && (
              <div className="pt-6 text-sm text-ink-2">
                Last opened by {app.lastOpened.email} · {ago(app.lastOpened.ts)}
              </div>
            )}

            {peek && <RunPeek runId={peek} app={app} onClose={() => { setPeek(null); load(); }} onRunAgain={runAgain} />}
          </>
        )}
      </div>
    </main>
  );
}
