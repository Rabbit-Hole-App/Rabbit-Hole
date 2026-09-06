import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Calendar as CalendarIcon, Check, Circle, Clock, Copy, GitBranch, Globe, Link as LinkIcon, Lock, Maximize2, MoreHorizontal, Plus, Trash2, User as UserIcon, Users, X } from 'lucide-react';

// lucide dropped brand icons - the GitHub mark, inline
const Github = ({ size = 14 }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);
import { ago, api, cronHuman, cronList, fmtTime, navigate, wsName } from './api.js';
import { AskPanel } from './ask.jsx';
import { RunForm, RunPeek, RunsDb, RunView } from './run.jsx';
import Shell from './Shell.jsx';
import { Avatar, Button, Chk, ConfirmDialog, EmptyState, IconBtn, Input, KindIcon, Mark, Menu, MenuItem, Pill, Select, ShareInput, SkeletonRows, Tabs, TabsContent, TabsList, TabsTrigger, Tip, cn, toast } from './ui.jsx';

const Runbook = lazy(() => import('./RunbookEditor.jsx'));

const TH = 'h-8 border-b border-line px-2 text-left text-xs font-normal text-ink-2';
const TD = 'h-8 border-b border-line px-2 text-sm whitespace-nowrap';

// Schedule a job from the dashboard: presets (minute/hour/day/specific days) or raw
// cron, all UTC. Existing schedule can be paused, resumed, or removed.
const DOW = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
const FREQ = ['every minute', 'every hour', 'every day', 'specific days', 'custom cron'];

function ScheduleDialog({ app, onClose, onChanged }) {
  const [freq, setFreq] = useState('every day');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState(() => new Set([1, 2, 3, 4, 5]));
  const [custom, setCustom] = useState('');
  const [err, setErr] = useState(null);
  const parts = cronList(app.schedule);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const cron = () => {
    const [h, m] = time.split(':').map((x) => parseInt(x, 10));
    if (freq === 'every minute') return '* * * * *';
    if (freq === 'every hour') return `${m || 0} * * * *`;
    if (freq === 'every day') return `${m || 0} ${h || 0} * * *`;
    if (freq === 'specific days') {
      if (!days.size) return null;
      return `${m || 0} ${h || 0} * * ${[...days].sort((a, b) => a - b).join(',')}`;
    }
    return custom.trim() || null;
  };

  const post = async (body, note) => {
    setErr(null);
    try {
      await api('/api/schedule', { method: 'POST', body: JSON.stringify({ app: app.name, ...body }) });
      toast(note);
      onChanged();
      onClose();
    } catch (e) { setErr(e.message); }
  };
  // "+": a new cron appends to the existing ones; removing a row posts the rest.
  const save = () => {
    const c = cron();
    if (!c) { setErr(freq === 'specific days' ? 'pick at least one day' : 'enter a cron like "0 9 * * 1-5"'); return; }
    post({ schedule: [...parts, c].join('; ') }, `Scheduled ${cronHuman(c)}`);
  };
  const removePart = (i) => {
    const rest = parts.filter((_, j) => j !== i);
    post({ schedule: rest.length ? rest.join('; ') : null }, rest.length ? 'Schedule removed' : 'All schedules removed');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 animate-[fade-in_100ms_ease-out]" onMouseDown={onClose}>
      {/* text-ink: this dialog mounts inside the breadcrumb row (text-ink-2) and would inherit its pale color */}
      <div className="mt-[22vh] w-[380px] max-w-[90vw] rounded-2xl bg-white p-4 text-ink shadow-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pb-3 text-sm font-semibold">Schedule {app.name}</div>
        {parts.length > 0 && (
          <div className="pb-1.5 text-xs font-medium text-ink-2">Scheduled</div>
        )}
        {parts.length > 0 && (
          <div className="flex flex-col gap-1 rounded-sm bg-code px-2.5 py-2">
            {parts.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Pill color="orange" className={cn(app.schedule_paused && 'line-through opacity-60')} title={`cron ${c} (UTC)`}>{cronHuman(c)}</Pill>
                <span className="flex-1" />
                <IconBtn aria-label={`Remove ${cronHuman(c)}`} onClick={() => removePart(i)}><X size={14} /></IconBtn>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              {/* schedule_paused is 0/1 from D1 - a bare && would render the 0 */}
              {!!app.schedule_paused && <span className="text-xs text-ink-2">paused</span>}
              <span className="flex-1" />
              <Button
                size="sm"
                onClick={() => post({ paused: !app.schedule_paused }, app.schedule_paused ? 'Schedule resumed' : 'Schedule paused')}
              >
                {app.schedule_paused ? 'Resume all' : 'Pause all'}
              </Button>
            </div>
          </div>
        )}
        {parts.length > 0 && <div className="my-3 border-t border-line" />}
        <div className={cn('pb-1.5 text-xs font-medium text-ink-2', !parts.length && 'pt-0')}>
          {parts.length ? 'Add another' : 'New schedule'}
        </div>
        <div className="flex flex-col gap-2">
          <Select value={freq} options={FREQ} onChange={setFreq} />
          {(freq === 'every hour' || freq === 'every day' || freq === 'specific days') && (
            <div className="flex items-center gap-2">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-[110px]" aria-label="time" />
              <span className="text-xs text-ink-2">{freq === 'every hour' ? `at :${(time.split(':')[1] || '00')} past each hour · UTC` : 'UTC'}</span>
            </div>
          )}
          {freq === 'specific days' && (
            <div className="flex gap-3 pt-1">
              {DOW.map(([label, n]) => (
                <label key={n} className="flex cursor-pointer flex-col items-center gap-1 text-xs text-ink-2" onClick={() => setDays((s) => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; })}>
                  <Chk on={days.has(n)} />
                  {label}
                </label>
              ))}
            </div>
          )}
          {freq === 'custom cron' && <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder='5-field cron, UTC - "0 9 * * 1-5"' aria-label="cron" />}
          {err && <div className="text-xs text-danger">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {parts.length ? <><Plus size={14} strokeWidth={1.5} /> Add schedule</> : 'Schedule'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Notion-style share popover: visibility toggle, people list (no borders), email field.
// Viewers get the same popover read-only.
function SharePopover({ app, onChanged }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('view');
  const [confirmShare, setConfirmShare] = useState(null); // pending share body on a private app
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
  // First share on a private app moves it from Private to Shared - confirm that.
  const firstShare = app.visibility === 'private' && app.owner_email === app.email
    && !app.members.length && !(app.teams || []).length;
  const doAdd = (body) => { share(body); setEmail(''); };
  const request = (body) => (firstShare ? setConfirmShare(body) : doAdd(body));
  const add = (e) => {
    e.preventDefault();
    const v = email.trim();
    if (v.startsWith('#')) {
      if (v.length < 2) return;
      request({ team: v, role });
    } else {
      if (!v.includes('@')) return;
      request({ email: v, role });
    }
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
      {confirmShare && (
        <ConfirmDialog
          title={`Share ${app.name}?`}
          body={`${app.name} is private. Sharing it with ${confirmShare.team || confirmShare.email} moves it from Private to Shared in the sidebar - they'll be able to ${confirmShare.role === 'edit' ? 'edit' : 'view'} it.`}
          confirmLabel="Share"
          confirmVariant="primary"
          onConfirm={() => { const b = confirmShare; setConfirmShare(null); doAdd(b); }}
          onCancel={() => setConfirmShare(null)}
        />
      )}
      {open && (
        <div className="absolute top-9 right-0 z-10 w-80 rounded-md bg-white p-2 shadow-pop">
          {app.canEdit && (
            <>
              <form onSubmit={add} className="flex items-start gap-1 px-1 pb-2">
                <ShareInput
                  autoFocus
                  value={email}
                  onChange={setEmail}
                  onPick={(it) => request({ ...(it.team ? { team: `#${it.team}` } : { email: it.email }), role })}
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
                {/* implicit form submission is unreliable with multiple fields - Enter must always work */}
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
          {asked.err ? `✗ ${asked.err}` : asked.sent ? `✓ asked ${owner}` : `✓ noted - email isn’t configured on this control plane, ping ${owner} directly`}
        </div>
      )}
    </div>
  );
}

const Person = ({ email }) => (email
  ? <span className="inline-flex items-center gap-1.5"><Avatar email={email} />{email}</span>
  : '-');

// "next in 3h" for the schedule row; nextRun is a ms epoch from the worker.
const until = (ms) => {
  const s = Math.max(0, (ms - Date.now()) / 1000);
  if (s < 90) return 'in a minute';
  if (s < 3600) return `in ${Math.round(s / 60)}m`;
  if (s < 86400) return `in ${Math.round(s / 3600)}h`;
  return `in ${Math.round(s / 86400)}d`;
};

// One Watch observation: warn icon, the sentence, Dismiss ▾ (30 days / forever).
function ObservationRow({ obs, canEdit, onChanged }) {
  const [open, setOpen] = useState(false);
  const dismiss = async (days) => {
    setOpen(false);
    try {
      await api(`/api/watch/${obs.id}/dismiss`, { method: 'POST', body: JSON.stringify({ days }) });
      onChanged();
    } catch (e) { toast(`✗ ${e.message}`); }
  };
  return (
    <div className="flex items-start gap-2 rounded-sm bg-code px-3 py-2 text-sm">
      <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warn" />
      <span className="min-w-0 flex-1" title={`${obs.check} · since ${obs.first_seen}`}>{obs.text}</span>
      {canEdit && (
        <div className="relative shrink-0">
          <button
            onMouseDown={(e) => { e.stopPropagation(); setOpen(!open); }}
            className="cursor-pointer rounded-sm px-1.5 py-0.5 text-xs text-ink-2 hover:bg-hover hover:text-ink"
          >
            Dismiss ▾
          </button>
          <Menu open={open} onClose={() => setOpen(false)} className="top-6 right-0 w-32">
            <MenuItem onClick={() => dismiss(30)}>30 days</MenuItem>
            <MenuItem onClick={() => dismiss(null)}>Forever</MenuItem>
          </Menu>
        </div>
      )}
    </div>
  );
}

// Property-list row halves (design/components.html .plist): grey key w/ icon, value beside.
const PropKey = ({ icon: Icon, info, children }) => (
  <div className="flex h-8 items-center gap-1.5 text-ink-2">
    <Icon size={16} strokeWidth={1.5} className="text-ink-3" />
    {info ? <Tip label={children} info={info}><span>{children}</span></Tip> : children}
  </div>
);
const PropVal = ({ children }) => <div className="flex h-8 min-w-0 items-center gap-1.5 truncate">{children}</div>;

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
  // flow.md §1: sidebar is always present - the app page included.
  return <Shell>{(data, reloadShell) => <AppPage slug={slug} runId={runId} reloadShell={reloadShell} />}</Shell>;
}

function AppPage({ slug, runId, reloadShell }) {
  const [app, setApp] = useState(null);
  const [error, setError] = useState(null);
  const [peek, setPeek] = useState(null); // runId shown in the side peek
  const [tab, setTab] = useState(null); // null until the app's kind picks the default
  const [prefill, setPrefill] = useState(null); // Run-again inputs for the form
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [editTitle, setEditTitle] = useState(null); // string while renaming
  const [editDesc, setEditDesc] = useState(null); // string while editing the blurb

  const saveDesc = async () => {
    const next = (editDesc || '').trim();
    setEditDesc(null);
    if (next === (app.description || '')) return;
    try {
      await api(`/api/apps/${slug}/description`, { method: 'POST', body: JSON.stringify({ description: next }) });
      load();
    } catch (e) { toast(`✗ ${e.message}`); }
  };
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
  // AppPage survives sidebar navigation (same element position) - per-app state
  // must reset with the slug or app A's peek/tab/prefill leak into app B.
  useEffect(() => { setApp(null); setError(null); setPeek(null); setTab(null); setPrefill(null); load(); }, [slug]);

  // Run again (peek footer, table hover ▶): prefill the form, land on the Run tab.
  const runAgain = (inputs) => { setPeek(null); setPrefill({ ...inputs }); setTab('run'); };

  const source = app?.repo_branch && app?.repo_commit
    ? `${app.repo_branch} · ${app.repo_commit.slice(0, 7)}${app.repo_dirty ? ' · dirty' : ''}`
    : null;

  // Agent tab: the page must NOT scroll - the pane fills to the viewport bottom so
  // the textbox sits static (level with the sidebar's New chat), only messages scroll.
  const agentFull = !runId && (tab ?? (app?.kind === 'job' ? 'run' : 'runbook')) === 'agent';
  return (
    <main className={cn('flex-1', agentFull ? 'overflow-hidden' : 'overflow-y-auto')}>
      {/* run pages carve out the fixed 400px chat panel and center in what's left */}
      <div className={cn(
        'py-12 max-lg:px-8 max-md:px-4 max-md:py-6',
        runId ? 'mx-auto max-w-[860px] px-12 lg:mr-[416px]' : 'mx-auto max-w-[900px] px-24',
        agentFull && 'flex h-full min-h-0 flex-col pb-4',
      )}>
        <div className="flex items-center gap-1 pb-8 text-sm text-ink-2">
          <button className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink" onClick={() => navigate('/apps')}>{wsName(app?.org)}</button>
          <span>/</span>
          <button className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink" onClick={() => navigate('/apps')}>Apps</button>
          <span>/</span>
          {app?.folder && (
            <>
              <button className="rounded-sm px-1 py-0.5 hover:bg-hover hover:text-ink" onClick={() => navigate(`/apps?f=${encodeURIComponent(app.folder)}`)}>{app.folder}</button>
              <span>/</span>
            </>
          )}
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
              <SharePopover app={app} onChanged={load} />
              <div className="relative">
                <IconBtn title="More" onMouseDown={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}><MoreHorizontal size={16} strokeWidth={1.5} /></IconBtn>
                <Menu open={menuOpen} onClose={() => setMenuOpen(false)} className="top-8 right-0">
                  <MenuItem
                    icon={LinkIcon}
                    onClick={() => { setMenuOpen(false); navigator.clipboard.writeText(`${window.location.origin}/apps/${app.name}`); toast('Link copied'); }}
                  >
                    Copy link
                  </MenuItem>
                  <MenuItem
                    icon={Copy}
                    onClick={async () => {
                      setMenuOpen(false);
                      try {
                        const r = await api(`/api/apps/${slug}/duplicate`, { method: 'POST' });
                        toast(`Duplicated as ${r.name}`);
                        reloadShell?.();
                        navigate(`/apps/${r.name}`);
                      } catch (e) { toast(`✗ ${e.message}`); }
                    }}
                  >
                    Duplicate
                  </MenuItem>
                  {app.kind === 'job' && app.canEdit && (
                    <MenuItem icon={Clock} onClick={() => { setMenuOpen(false); setScheduling(true); }}>
                      Schedule
                    </MenuItem>
                  )}
                  {app.owner_email === app.email && (
                    <MenuItem icon={Trash2} className="text-danger" onClick={() => { setMenuOpen(false); setConfirmDel(true); }}>
                      Move to Trash
                    </MenuItem>
                  )}
                </Menu>
              </div>
            </>
          )}
          {scheduling && app && (
            <ScheduleDialog
              app={app}
              onClose={() => setScheduling(false)}
              onChanged={() => { load(); reloadShell?.(); }}
            />
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
          // 404 also covers ex-members from another org - existence is not revealed to them
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 pt-[20vh] text-center"><Mark size={24} className="text-ink-2" />You don’t have access, or this app doesn’t exist.</div>
        ) : (
          <div className="text-ink-2">✗ {error.message}</div>
        ))}
        {!error && !app && <SkeletonRows rows={3} className="pt-8" />}

        {app && runId && (
          <>
            <h1 className="pb-4 text-[32px] leading-[1.2] font-bold tracking-[-0.01em]">Run {runId.replace(/^r-/, '').slice(0, 7)}</h1>
            {/* split view: run content left; the chat is a real right panel pinned to
                the window edge, full height - messages scroll inside it, textbox stays put */}
            <div className="min-w-0">
              <RunView
                runId={runId}
                app={app}
                onRunAgain={(inputs) => {
                  sessionStorage.setItem(`small.runPrefill.${slug}`, JSON.stringify(inputs || {}));
                  setPeek(null);
                  setTab('run'); // AppPage stays mounted across this navigate - land on the form
                  navigate(`/apps/${slug}`);
                }}
              />
            </div>
            <div className="fixed inset-y-0 right-0 z-10 flex w-[400px] flex-col border-l border-line bg-white px-5 pt-4 pb-4 max-lg:hidden">
              <AskPanel scope={{ run: runId }} appName={app.name} placeholder="Ask about this run…" />
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
              {app.kind !== 'job' && (
                <span className="ml-auto">
                  <Button variant="primary" size="sm" onClick={() => window.open(app.url, '_blank', 'noopener')}>
                    Open <ArrowUpRight size={14} strokeWidth={1.5} />
                  </Button>
                </span>
              )}
            </div>

            {/* model-written blurb (first deploy), click to edit - edits stick across deploys */}
            {editDesc !== null ? (
              <textarea
                autoFocus
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                onBlur={saveDesc}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditDesc(null);
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveDesc();
                }}
                rows={3}
                className="mb-3 w-full max-w-[720px] resize-none rounded-sm bg-hover/60 px-1 py-0.5 text-sm text-ink-2 outline-none"
              />
            ) : (app.description || app.canEdit) && (
              <p
                title={app.canEdit ? 'Click to edit' : undefined}
                onClick={() => app.canEdit && setEditDesc(app.description || '')}
                className={cn('mb-3 max-w-[720px] text-sm leading-relaxed text-ink-2', app.canEdit && 'cursor-text rounded-sm px-1 -mx-1 hover:bg-hover/60', !app.description && 'text-ink-3 italic')}
              >
                {app.description || 'Add a description…'}
              </p>
            )}

            {/* Notion-style vertical property list: icon + grey label at 160px, value
                beside, 32px rows. Access has no row - the Share popover owns that. */}
            <div className="grid max-w-[560px] grid-cols-[160px_1fr] text-sm">
              <PropKey icon={Circle} info="server (always on) or job (runs on demand)">Type</PropKey>
              <PropVal><Pill color={app.kind === 'job' ? 'blue' : 'grey'}>{app.kind}</Pill></PropVal>
              <PropKey icon={CalendarIcon} info="When this app last shipped">Deployed</PropKey>
              <PropVal><span title={fmtTime(app.deployed_at || app.created_at)}>{ago(app.deployed_at || app.created_at)}</span></PropVal>
              {source && (
                <>
                  <PropKey icon={GitBranch} info="Branch, commit and repo it was deployed from">Source</PropKey>
                  <PropVal>
                    {/* public repo → branch·sha links the exact commit, the url links the repo; private → plain text */}
                    {app.repo_public && app.repo_url
                      ? <a href={app.repo_commit ? `${app.repo_url}/commit/${app.repo_commit}` : app.repo_url} target="_blank" rel="noreferrer" className="shrink-0 text-accent hover:underline">{source}</a>
                      : <span className="shrink-0">{source}</span>}
                    {app.repo_url && (
                      // just the GitHub mark: public → links the repo, private → grey with a tooltip
                      app.repo_public
                        ? <a href={app.repo_url} target="_blank" rel="noreferrer" title={app.repo_url.replace(/^https?:\/\//, '').replace(/\.git$/, '')} className="shrink-0 text-ink-2 hover:text-ink"><Github size={14} /></a>
                        : <span title={`${app.repo_url.replace(/^https?:\/\//, '').replace(/\.git$/, '')} · private repo`} className="shrink-0 text-ink-3"><Github size={14} /></span>
                    )}
                  </PropVal>
                </>
              )}
              <PropKey icon={UserIcon} info="Who deployed and owns this app">Owner</PropKey>
              <PropVal><Avatar email={app.owner_email} />{app.owner_email}</PropVal>
              {app.schedule && (
                <>
                  <PropKey icon={Clock} info="Cron schedule, all times UTC">Schedule</PropKey>
                  <PropVal>
                    {cronList(app.schedule).map((c) => (
                      <Pill key={c} color="orange" className={cn(app.schedule_paused && 'line-through opacity-60')} title={`cron ${c} (UTC)`}>{cronHuman(c)}</Pill>
                    ))}
                    {app.schedule_paused
                      ? <span className="text-xs text-ink-2">paused</span>
                      : app.nextRun && <span className="text-xs text-ink-2" title={new Date(app.nextRun).toLocaleString()}>next {until(app.nextRun)}</span>}
                  </PropVal>
                </>
              )}
            </div>

            {/* Watch: one quiet row per open observation */}
            {(app.observations || []).length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {app.observations.map((o) => (
                  <ObservationRow key={o.id} obs={o} canEdit={!!app.canEdit} onChanged={load} />
                ))}
              </div>
            )}

            <Tabs value={tab ?? (app.kind === 'job' ? 'run' : 'runbook')} onValueChange={setTab} className={cn(agentFull && 'flex min-h-0 flex-1 flex-col')}>
              <TabsList className="mt-5 shrink-0">
                <TabsTrigger value="runbook"><Tip label="Runbook" info="Notes and docs for this app"><span>Runbook</span></Tip></TabsTrigger>
                {app.kind === 'job' && <TabsTrigger value="run"><Tip label="Run" info="Start a run from the input form"><span>Run</span></Tip></TabsTrigger>}
                <TabsTrigger value="logs"><Tip label="Logs" info="Table view of this app's runs and requests"><span>Logs</span></Tip></TabsTrigger>
                <TabsTrigger value="agent"><Tip label="Agent" info="Chat with the AI about this app"><span>Agent</span></Tip></TabsTrigger>
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
                  ? <RunsDb app={app} openId={peek} onOpen={setPeek} onNewRun={() => setTab('run')} onRunAgain={runAgain} />
                  : <RequestLog slug={slug} />}
              </TabsContent>

              <TabsContent value="agent" className="flex min-h-0 flex-1 flex-col pt-4">
                {/* the page itself is scroll-locked on this tab; the pane flexes to the
                    viewport bottom so the input is static and only messages scroll */}
                <div className="flex min-h-0 flex-1 flex-col">
                  <AskPanel
                    scope={{ app: app.name }}
                    email={app.email}
                    placeholder={`Ask about ${app.name}…`}
                    autoFocus
                    headerExtra={
                      <button
                        aria-label="Open as page"
                        title="Open as page"
                        onClick={() => navigate(`/chat?app=${encodeURIComponent(app.name)}`)}
                        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"
                      >
                        <Maximize2 size={13} strokeWidth={1.5} />
                      </button>
                    }
                  />
                </div>
              </TabsContent>
            </Tabs>

            {app.lastOpened && (tab ?? (app.kind === 'job' ? 'run' : 'runbook')) !== 'agent' && (
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
