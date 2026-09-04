import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Clock, Globe, Link as LinkIcon, Loader2, Lock, Play, X } from 'lucide-react';
import { ago, api, cronHuman, navigate } from './api.js';
import Panel from './Panel.jsx';
import { Avatar, Button, Pill, cn } from './ui.jsx';

const Runbook = lazy(() => import('./RunbookEditor.jsx'));

// Notion-style share popover: visibility toggle, people list (no borders), email field.
// Viewers get the same popover read-only.
function SharePopover({ app, onChanged }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('view');
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const call = async (fn) => {
    setErr(null);
    try { await fn(); onChanged(); } catch (e) { setErr(e.message); }
  };
  const add = (e) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    call(() => api('/api/share', { method: 'POST', body: JSON.stringify({ app: app.name, email, role }) }));
    setEmail('');
  };
  const setVis = (visibility) =>
    visibility !== app.visibility && call(() => api(`/api/apps/${app.name}`, { method: 'PATCH', body: JSON.stringify({ visibility }) }));
  const remove = (m) => call(() => api('/api/unshare', { method: 'POST', body: JSON.stringify({ app: app.name, email: m }) }));
  const domain = app.org.replace(/-/g, '.'); // orgOf is lossy; close enough for display

  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen(!open)}>Share</Button>
      {open && (
        <div className="absolute top-8 right-0 z-10 w-80 rounded-md bg-white p-2 shadow-[0_0_0_1px_#e9e9e7,0_8px_24px_rgba(0,0,0,0.08)]">
          {app.canEdit && (
            <form onSubmit={add} className="flex items-center gap-1 px-1 pb-2">
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Add people by email…"
                className="h-7 min-w-0 flex-1 rounded-sm bg-hover px-2 text-sm outline-none placeholder:text-ink-2"
              />
              <select value={role} onChange={(e) => setRole(e.target.value)} className="h-7 rounded-sm text-xs text-ink-2 outline-none">
                <option value="view">view</option>
                <option value="edit">edit</option>
              </select>
            </form>
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

export default function SharePage({ slug }) {
  const [app, setApp] = useState(null);
  const [error, setError] = useState(null);
  const [run, setRun] = useState(null); // { appName, id?, error? } — same shape Panel expects
  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => api(`/api/apps/${slug}`).then((d) => { setApp(d); setError(null); }).catch(setError);
  useEffect(() => { setApp(null); setError(null); load(); }, [slug]);

  const startRun = async () => {
    setPanelOpen(true);
    setRun({ appName: slug });
    try {
      const { runId } = await api('/api/runs', { method: 'POST', body: JSON.stringify({ app: slug }) });
      setRun({ appName: slug, id: runId });
    } catch (e) {
      setRun({ appName: slug, error: e.message });
    }
  };

  const running = run?.id || (app?.lastRun?.status === 'running' && app.lastRun.runId);

  return (
    <main className="h-screen overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-24 py-12 max-lg:px-8 max-md:px-4 max-md:py-6">
        <div className="pb-8 text-sm text-ink-2">
          {app?.org || ''} <span className="px-1">/</span>
          <button className="cursor-pointer hover:text-ink" onClick={() => navigate('/apps')}>Apps</button>
          <span className="px-1">/</span> <span className="text-ink">{slug}</span>
        </div>

        {error && (error.status === 403 ? (
          <Denied slug={slug} error={error} />
        ) : error.status === 404 ? (
          // 404 also covers ex-members from another org — existence is not revealed to them
          <div className="mx-auto max-w-md pt-[20vh] text-center">You don’t have access, or this app doesn’t exist.</div>
        ) : (
          <div className="text-ink-2">✗ {error.message}</div>
        ))}
        {!error && !app && <div className="text-ink-2"> </div>}

        {app && (
          <>
            <div className="flex items-center gap-2 pb-1">
              <h1 className="text-[18px] font-semibold">{app.name}</h1>
              <Pill>{app.kind}</Pill>
              {app.schedule && (
                <Pill className={cn('gap-1', app.schedule_paused && 'opacity-60 line-through')} title={`cron ${app.schedule} (UTC)`}>
                  <Clock size={10} />{cronHuman(app.schedule)}
                </Pill>
              )}
              <span className="flex-1" />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/apps/${app.name}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <LinkIcon size={13} /> {copied ? 'Copied' : 'Copy link'}
              </Button>
              <SharePopover app={app} onChanged={load} />
            </div>
            <div className="pb-5 text-sm text-ink-2">Owned by {app.owner_email}</div>

            <div className="pb-6">
              {app.kind === 'job' ? (
                running ? (
                  <Button variant="accent" onClick={() => setPanelOpen(true)}>
                    <Loader2 size={13} className="animate-spin" /> Running — view log
                  </Button>
                ) : (
                  <Button variant="accent" onClick={startRun}><Play size={13} /> Run</Button>
                )
              ) : (
                <a href={app.url} target="_blank" rel="noreferrer"
                   className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-sm font-medium text-accent hover:bg-accent/10">
                  Open <ArrowUpRight size={13} />
                </a>
              )}
            </div>

            <Suspense fallback={<div className="text-ink-2">loading…</div>}>
              <div className="min-h-[200px]">
                <Runbook app={app} canEdit={!!app.canEdit} onSaved={(name, text) => setApp((a) => ({ ...a, runbook: text }))} />
              </div>
            </Suspense>

            {app.lastOpened && (
              <div className="pt-6 text-sm text-ink-2">
                Last opened by {app.lastOpened.email} · {ago(app.lastOpened.ts)}
              </div>
            )}

            {panelOpen && (
              <Panel
                app={app}
                tab="run"
                run={run?.appName === app.name ? run : (app.lastRun?.status === 'running' ? { appName: app.name, id: app.lastRun.runId } : null)}
                onTab={() => {}}
                onRunbookSaved={(name, text) => setApp((a) => ({ ...a, runbook: text }))}
                onRunSettled={() => { setRun(null); load(); }}
                onClose={() => setPanelOpen(false)}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
