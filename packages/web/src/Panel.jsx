import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { api, cronHuman, cronList, fmtTime } from './api.js';
import { appApi, loadApp } from './app-data.js';
const Runbook = lazy(() => import('./RunbookEditor.jsx')); // BlockNote is heavy - its chunk loads only when a runbook opens
import { RunForm, RunView } from './run.jsx';
import { Button, SlidePanel, Tabs, TabsContent, TabsList, TabsTrigger } from './ui.jsx';

// Polls /api/runs/<id> every second until the run leaves 'running'.
function useRunLog(runId) {
  const [s, setS] = useState({ lines: [], status: null, exitCode: null, startedAt: null, finishedAt: null, error: null });
  useEffect(() => {
    if (!runId) return;
    setS({ lines: [], status: 'running', exitCode: null, startedAt: null, finishedAt: null, error: null });
    let cursor = -1, stopped = false, timer;
    const tick = async () => {
      try {
        const d = await api(`/api/runs/${runId}?after=${cursor}`);
        if (stopped) return;
        cursor = d.cursor;
        setS((p) => ({ ...p, lines: [...p.lines, ...d.lines], status: d.status, exitCode: d.exitCode, startedAt: d.startedAt, finishedAt: d.finishedAt }));
        if (d.status === 'running') timer = setTimeout(tick, 1000);
      } catch (e) {
        if (!stopped) setS((p) => ({ ...p, status: 'failed', error: e.message }));
      }
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [runId]);
  return s;
}

const secs = (a, b) => {
  if (!a || !b) return null;
  const d = (new Date(b.replace(' ', 'T') + 'Z') - new Date(a.replace(' ', 'T') + 'Z')) / 1000;
  return d >= 0 ? Math.round(d) : null;
};

const fmtDur = (s) =>
  s == null ? null : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

function RunDetail({ runId, onBack, onSettled }) {
  const log = useRunLog(runId);
  const box = useRef(null);
  const settled = useRef(false);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [log.lines.length]);
  useEffect(() => {
    if (!settled.current && (log.status === 'finished' || log.status === 'failed')) {
      settled.current = true;
      onSettled();
    }
  }, [log.status]);

  const dur = secs(log.startedAt, log.finishedAt);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button className="-ml-2" onClick={onBack}><ChevronLeft size={13} /> Logs</Button>
        <span className="text-xs text-ink-2">
          started {fmtTime(log.startedAt)}{log.finishedAt ? ` · finished ${fmtTime(log.finishedAt)}` : ''}
        </span>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto rounded-sm bg-side p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {log.lines.length ? log.lines.join('\n') : 'waiting for output…'}
      </div>
      <div className="flex items-center gap-1.5 text-sm text-ink-2">
        {log.status === 'running' && (<><Loader2 size={13} className="animate-spin" /> running</>)}
        {log.status === 'finished' && `✓ finished (exit ${log.exitCode})${dur != null ? ` · ${fmtDur(dur)}` : ''}`}
        {log.status === 'stopped' && `✗ stopped${dur != null ? ` · ${fmtDur(dur)}` : ''}`}
        {log.status === 'failed' && (log.error
          ? `✗ ${log.error}`
          : `✗ failed${log.exitCode != null ? ` (exit ${log.exitCode})` : ''}${dur != null ? ` · ${fmtDur(dur)}` : ''}`)}
      </div>
    </div>
  );
}

// Past runs of the job: newest first, click one for its log.
function RunsTab({ app, liveRunId, onSettled, onRunAgain }) {
  const request = appApi(app);
  const [runs, setRuns] = useState(null);
  const [sel, setSel] = useState(liveRunId || null);
  const load = () => request(`/api/runs?app=${encodeURIComponent(app.name)}`).then((d) => setRuns(d.runs)).catch(() => setRuns([]));
  useEffect(() => { load(); }, [app.name]);
  useEffect(() => { if (liveRunId) setSel(liveRunId); }, [liveRunId]);

  if (sel && app.hosting === 'aws') return <div className="min-h-0 flex-1 overflow-y-auto">
    <Button onClick={() => { setSel(null); load(); }}><ChevronLeft size={13} /> Logs</Button>
    <RunView runId={sel} app={app} onRunAgain={onRunAgain} />
  </div>;
  if (sel) return <RunDetail runId={sel} onBack={() => { setSel(null); load(); }} onSettled={() => { load(); onSettled(); }} />;
  if (!runs) return null;
  if (!runs.length) return <div className="pt-2 text-ink-2">No runs yet.</div>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {runs.map((r) => {
        const dur = secs(r.started_at, r.finished_at);
        return (
          <button
            key={r.run_id}
            onClick={() => setSel(r.run_id)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-hover"
          >
            {r.status === 'running'
              ? <Loader2 size={13} className="shrink-0 animate-spin text-ink-2" />
              : <span className="w-3.5 shrink-0">{r.status === 'finished' ? '✓' : '✗'}</span>}
            <span className="shrink-0">{fmtTime(r.started_at)}</span>
            <span className="min-w-0 truncate text-xs text-ink-2">{r.started_by}</span>
            <span className="ml-auto shrink-0 text-xs text-ink-2">
              {r.status === 'running' ? 'running' : fmtDur(dur) || ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// The Run tab in the peek is the same form as the app page - the list payload has
// no [inputs] schema, so fetch the app detail first.
function RunFormTab({ app, onStarted }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => { loadApp(app.name, app).then(setDetail).catch(() => setDetail({ error: true })); }, [app.name]);
  if (!detail) return <div className="pt-2 text-ink-2">loading…</div>;
  if (detail.error) return <div className="pt-2 text-ink-2">✗ could not load the form.</div>;
  return <RunForm app={detail} onStarted={onStarted} />;
}

// The runbook tab IS the editor (Notion behavior): autosaves, Ctrl+Z undoes.
// Viewers without edit rights get the same render, read-only.
function RunbookTab({ app, onSaved }) {
  if (app.hosting === 'aws') return <div className="pt-2 text-ink-2">Runbooks are not connected for AWS jobs yet.</div>;
  if (!app.canEdit && !app.runbook) return <div className="pt-2 text-ink-2">No runbook yet.</div>;
  return (
    <Suspense fallback={<div className="pt-2 text-ink-2">loading…</div>}>
      <Runbook app={app} canEdit={!!app.canEdit} onSaved={onSaved} />
    </Suspense>
  );
}

// Notion-style side peek: slides in from the right, faint shadow, no overlay dim.
export default function Panel({ app, tab, run, onTab, onRunbookSaved, onRunSettled, onRunStarted, onClose }) {
  return (
    <SlidePanel
      onClose={onClose}
      title={
        <>
          <span className="truncate">{app.name}</span>
          {app.schedule && (
            <span className="text-xs font-normal text-ink-2" title={`cron ${app.schedule} (UTC)`}>
              {cronList(app.schedule).map(cronHuman).join(' · ')}{app.schedule_paused ? ' · paused' : ''}
            </span>
          )}
        </>
      }
    >
      <Tabs value={tab} onValueChange={onTab} className="flex min-h-0 flex-1 flex-col px-5">
        <TabsList>
          <TabsTrigger value="runbook">Runbook</TabsTrigger>
          {app.kind === 'job' && <TabsTrigger value="form">Run</TabsTrigger>}
          {app.kind === 'job' && <TabsTrigger value="run">Logs</TabsTrigger>}
        </TabsList>
        <TabsContent value="runbook" className="flex min-h-0 flex-1 flex-col py-3">
          <RunbookTab app={app} onSaved={onRunbookSaved} />
        </TabsContent>
        {app.kind === 'job' && (
          <TabsContent value="form" className="min-h-0 flex-1 overflow-y-auto py-3">
            <RunFormTab app={app} onStarted={onRunStarted} />
          </TabsContent>
        )}
        {app.kind === 'job' && (
          <TabsContent value="run" className="flex min-h-0 flex-1 flex-col py-3">
            {run?.error
              ? <div className="pt-2 text-ink-2">✗ {run.error}</div>
              : <RunsTab app={app} liveRunId={run?.id} onSettled={onRunSettled} onRunAgain={() => onTab('form')} />}
          </TabsContent>
        )}
      </Tabs>
      <div className="h-4" />
    </SlidePanel>
  );
}
