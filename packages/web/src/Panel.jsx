import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, Loader2, X } from 'lucide-react';
import { api, cronHuman, fmtTime } from './api.js';
const Runbook = lazy(() => import('./RunbookEditor.jsx')); // BlockNote is heavy — its chunk loads only when a runbook opens
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from './ui.jsx';

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
function RunsTab({ app, liveRunId, onSettled }) {
  const [runs, setRuns] = useState(null);
  const [sel, setSel] = useState(liveRunId || null);
  const load = () => api(`/api/runs?app=${encodeURIComponent(app.name)}`).then((d) => setRuns(d.runs)).catch(() => setRuns([]));
  useEffect(() => { load(); }, [app.name]);
  useEffect(() => { if (liveRunId) setSel(liveRunId); }, [liveRunId]);

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

// The runbook tab IS the editor (Notion behavior): autosaves, Ctrl+Z undoes.
// Viewers without edit rights get the same render, read-only.
function RunbookTab({ app, onSaved }) {
  if (!app.canEdit && !app.runbook) return <div className="pt-2 text-ink-2">No runbook yet.</div>;
  return (
    <Suspense fallback={<div className="pt-2 text-ink-2">loading…</div>}>
      <Runbook app={app} canEdit={!!app.canEdit} onSaved={onSaved} />
    </Suspense>
  );
}

// Notion-style side peek: slides in from the right, faint shadow, no overlay dim.
export default function Panel({ app, tab, run, onTab, onRunbookSaved, onRunSettled, onClose }) {
  return (
    // modal={false}: BlockNote's slash/drag menus portal to <body>; a modal focus trap would make them unclickable
    <Dialog.Root open modal={false} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-y-0 right-0 flex w-[560px] max-w-full flex-col bg-white shadow-[-1px_0_0_#e9e9e7,-8px_0_24px_rgba(0,0,0,0.04)] outline-none animate-[slide-in-right_250ms_cubic-bezier(0.2,0,0,1)]"
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <Dialog.Title className="flex items-center gap-2 text-[15px] font-semibold">
              {app.name}
              {app.schedule && (
                <span className="text-xs font-normal text-ink-2" title={`cron ${app.schedule} (UTC)`}>
                  {cronHuman(app.schedule)}{app.schedule_paused ? ' · paused' : ''}
                </span>
              )}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button aria-label="Close" className="h-6 w-6 justify-center px-0"><X size={14} /></Button>
            </Dialog.Close>
          </div>
          <Tabs value={tab} onValueChange={onTab} className="flex min-h-0 flex-1 flex-col px-5">
            <TabsList>
              <TabsTrigger value="runbook">Runbook</TabsTrigger>
              {app.kind === 'job' && <TabsTrigger value="run">Logs</TabsTrigger>}
            </TabsList>
            <TabsContent value="runbook" className="flex min-h-0 flex-1 flex-col py-3">
              <RunbookTab app={app} onSaved={onRunbookSaved} />
            </TabsContent>
            {app.kind === 'job' && (
              <TabsContent value="run" className="flex min-h-0 flex-1 flex-col py-3">
                {run?.error
                  ? <div className="pt-2 text-ink-2">✗ {run.error}</div>
                  : <RunsTab app={app} liveRunId={run?.id} onSettled={onRunSettled} />}
              </TabsContent>
            )}
          </Tabs>
          <div className="h-4" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
