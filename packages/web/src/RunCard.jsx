import { useEffect, useRef, useState } from 'react';
import { Loader2, Play, Square } from 'lucide-react';
import CardHeader from './CardHeader.jsx';
import { api } from './api.js';
import { toast } from './ui.jsx';
import { EXPECTED_HEADING, RUN_POLL_MS, expectedView, initialFlags, paneText, runLabel, seconds, sendFlags, sessionEnded, sessionLabel, sessionReady } from './run-card-view.js';

// The Run card (packages/rehearsal-runtime/RUN_CARD.md): the rehearsal's route as notebook-shaped cells, run one at a time in one
// sandbox through POST /api/learn/run. The shell and header are the Notebook card's (CardHeader.jsx, its action buttons); the
// output pane is the code block of ask.jsx; notices are toast(). The browser polls every RUN_POLL_MS; nothing is polled once a run
// completes, the session is stopped, or the card unmounts. Self-contained on purpose: it takes only the canvas and board, so it
// can be mounted in a Tutor panel today and as a canvas card later.
const ACTION = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';
const PRE = 'rounded-sm bg-code p-3 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap break-words';
const HEADER = { id: 'run-card', type: 'notebook', title: 'Run the codebase' };
const wait = (timer, ms) => new Promise(resolve => { timer.current = setTimeout(resolve, ms); });

export default function RunCard({ app, board }) {
  const [session, setSession] = useState(null), [runs, setRuns] = useState({}), [logs, setLogs] = useState({}), [flags, setFlags] = useState({});
  const [active, setActive] = useState(null); // the cellId whose run is in progress: one run at a time
  const live = useRef(true), timer = useRef(null), startGen = useRef(0), runGen = useRef(0), logsOpen = useRef({});
  logsOpen.current = logs;
  useEffect(() => { live.current = true; begin(); return () => { live.current = false; startGen.current++; runGen.current++; clearTimeout(timer.current); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const call = body => api('/api/learn/run', { method: 'POST', body: JSON.stringify({ app, board, ...body }) });
  const fail = error => { if (live.current) toast(error.data?.error || error.message, { tone: 'error' }); };

  // action start is idempotent (a second start returns the existing session), so it is repeated every poll until status is ready.
  async function begin() {
    const mine = ++startGen.current;
    setSession({ status: 'starting' }); setRuns({}); setLogs({}); setActive(null);
    try {
      for (;;) {
        const state = await call({ action: 'start' });
        if (!live.current || startGen.current !== mine) return;
        setSession(state);
        if (state.status !== 'starting') {
          setFlags(old => ({ ...Object.fromEntries((state.cells || []).map(cell => [cell.cellId, initialFlags(cell)])), ...old }));
          return;
        }
        await wait(timer, RUN_POLL_MS);
        if (!live.current || startGen.current !== mine) return;
      }
    } catch (error) {
      if (live.current && startGen.current === mine) { setSession({ status: 'failed', error: error.data?.error || error.message }); fail(error); }
    }
  }

  async function run(cell) {
    const mine = ++runGen.current, sessionId = session.sessionId, cellId = cell.cellId;
    setActive(cellId);
    setRuns(old => ({ ...old, [cellId]: { status: 'queued', complete: false, sec: 0, stdoutTail: '', stderrTail: '' } }));
    try {
      const { runId } = await call({ action: 'run', sessionId, cellId, flags: sendFlags(cell, flags[cellId]) });
      for (;;) {
        const status = await call({ action: 'poll', sessionId, runId });
        if (!live.current || runGen.current !== mine) return;
        setRuns(old => ({ ...old, [cellId]: { ...status, runId } }));
        if (logsOpen.current[cellId] !== undefined) { const { log } = await call({ action: 'log', sessionId, runId }); if (live.current && runGen.current === mine) setLogs(old => ({ ...old, [cellId]: log })); }
        if (status.complete) break;
        await wait(timer, RUN_POLL_MS);
        if (!live.current || runGen.current !== mine) return;
      }
    } catch (error) {
      if (live.current && runGen.current === mine) setRuns(old => { const { [cellId]: _gone, ...rest } = old; return rest; });
      fail(error);
    } finally { if (live.current && runGen.current === mine) setActive(null); }
  }

  // The contract has one stop: the session. It ends the sandbox and so the run in it.
  async function stop() {
    startGen.current++; runGen.current++; clearTimeout(timer.current);
    try {
      const state = await call({ action: 'stop', sessionId: session.sessionId });
      if (!live.current) return;
      setSession(old => ({ ...old, ...state }));
      setRuns(old => Object.fromEntries(Object.entries(old).map(([id, r]) => [id, r.complete ? r : { ...r, status: 'stopped', complete: true }])));
      setActive(null);
    } catch (error) { fail(error); }
  }

  async function toggleLog(cellId) {
    if (logs[cellId] !== undefined) return setLogs(({ [cellId]: _gone, ...rest }) => rest);
    try { const { log } = await call({ action: 'log', sessionId: session.sessionId, runId: runs[cellId].runId }); if (live.current) setLogs(old => ({ ...old, [cellId]: log })); } catch (error) { fail(error); }
  }

  const ready = sessionReady(session), ended = sessionEnded(session), cells = session?.cells || [];
  return (
    <section data-run-card aria-label="Run card" className="mb-2 flex max-h-[70vh] flex-col rounded-xl border border-line bg-white shadow-sm">
      <CardHeader block={HEADER} className="px-4 pt-3 pb-2" meta="Run card · sandbox" trailing={
        <button type="button" data-run-session className={ACTION} disabled={!session?.sessionId && !ended} onClick={ended ? begin : stop}>
          {ended ? <Play size={12} /> : <Square size={12} />}{ended ? 'Start session' : 'Stop session'}
        </button>} />
      <div className="flex items-center gap-2 px-4 pb-2" data-run-session-status={session?.status}>
        {session?.status === 'starting' && <Loader2 aria-hidden="true" size={16} className="shrink-0 text-claude motion-safe:animate-spin" />}
        <p aria-live="polite" className={`text-sm ${session?.status === 'starting' ? 'shimmer' : session?.status === 'failed' ? 'text-red-700' : 'text-ink-2'}`}>{sessionLabel(session)}</p>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {cells.map(cell => {
          const r = runs[cell.cellId], expected = expectedView(cell.expected), editable = initialFlags(cell), full = logs[cell.cellId];
          return (
            <li key={cell.cellId} data-run-cell={cell.cellId} className="flex flex-col gap-2 border-t border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium text-ink">{cell.title}</p>
                <span data-run-status className="text-xs text-ink-2">{[runLabel(r), seconds(r?.sec)].filter(Boolean).join(' · ')}</span>
                <button type="button" data-run-run className={ACTION} disabled={!ready || !!active} onClick={() => run(cell)}><Play size={12} />Run</button>
                <button type="button" data-run-stop className={ACTION} disabled={active !== cell.cellId} onClick={stop}><Square size={12} />Stop</button>
              </div>
              <pre data-run-cmd className={PRE}>{r?.cmd || cell.cmd}</pre>
              {cell.flags.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {cell.flags.map(f => (
                  <label key={f.flag} className="flex items-center gap-1.5 text-xs text-ink-2">
                    <span className="font-mono">{f.flag}</span>
                    <input data-run-flag={f.flag} aria-label={f.flag} readOnly={!f.editable} disabled={active === cell.cellId} value={f.flag in editable ? flags[cell.cellId]?.[f.flag] ?? f.value : f.value}
                      onChange={event => setFlags(old => ({ ...old, [cell.cellId]: { ...old[cell.cellId], [f.flag]: event.target.value } }))}
                      className="w-32 rounded-lg border border-line px-2 py-1 text-xs text-ink read-only:bg-code read-only:text-ink-2" />
                  </label>
                ))}
              </div>}
              {r && <div data-run-output className="flex flex-col gap-1">
                <pre className={`${PRE} max-h-64 overflow-y-auto`}>{(full !== undefined ? full : paneText(r)) || (r.complete ? 'No output' : 'Waiting for output')}</pre>
                {r.runId && <button type="button" data-run-log className="w-fit cursor-pointer text-xs font-medium text-ink underline-offset-2 hover:underline" onClick={() => toggleLog(cell.cellId)}>{full !== undefined ? 'Show the tail' : 'Show the full log'}</button>}
              </div>}
              {(expected.facts.length > 0 || expected.output) && <div data-run-expected className="flex flex-col gap-1 text-xs text-ink-2">
                <p className="font-medium">{EXPECTED_HEADING}</p>
                {expected.facts.length > 0 && <ul className="list-disc pl-5">{expected.facts.map((line, i) => <li key={i}>{line}</li>)}</ul>}
                {expected.output && <pre className={PRE}>{expected.output}</pre>}
              </div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
