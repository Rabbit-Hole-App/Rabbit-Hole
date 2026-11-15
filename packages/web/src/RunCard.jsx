import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Loader2, MoreHorizontal, Play, Square, X } from 'lucide-react';
import CardHeader from './CardHeader.jsx';
import { CardActionRows } from './CanvasMenu.jsx';
import { api } from './api.js';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, toast } from './ui.jsx';
import { resultsToRuns, runFromStored, storedCell, storedResult } from './rehearsal-cards.js';
import { EXPECTED_HEADING, HISTORY_TAB, RUN_POLL_MS, cellTabTitle, expectedView, initialFlags, paneText, progressOf, runLabel, runTone, seconds, sendFlags, sessionEnded, sessionLabel, sessionReady } from './run-card-view.js';

// The Run card (packages/rehearsal-runtime/RUN_CARD.md): the rehearsal's route as notebook-shaped cells, run one at a time in one
// sandbox through POST /api/learn/run. One tab per cell, the knob cell as the Custom Run tab, and a History tab with what the rehearsal
// produced (owner 2026-11-14). Tabs and their colours: green while running and on success, red on an error, a timeout or a stop.
// The shell and header are the Notebook card's (CardHeader.jsx, its action buttons); tabs are the ui.jsx kit; the output pane is the
// code block of ask.jsx; notices are toast(). The browser polls every RUN_POLL_MS; nothing is polled once a run completes, the session
// is stopped, or the card unmounts. It is a canvas card now (type 'run', rehearsal-cards.js; owner 2026-11-14): the card keeps the record reference
// (block.run: app, board, commit, hardware), the cells, each cell's last output with its time and the flag values typed; it never keeps a session id. On load it
// shows Start session; Stop, a stopped or expired session and a hard timeout return it to Start with the last outputs still shown. A viewer who cannot edit sees
// the card and the last outputs with Run and Start disabled (a session is the owner's; POST /api/learn/run refuses anyone else).
// Buttons are the ui.jsx kit: Run secondary, Stop ghost (grey) until its cell is running and then danger (the app's filled red Stop), the session
// control ghost. Status text uses the --color-pass and --color-fail tokens.
const PRE = 'rounded-sm bg-code p-3 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap break-words';
const TONE = { running: 'text-pass', success: 'text-pass', error: 'text-fail', idle: '' }; // the app's own status text tokens (index.css --color-pass, --color-fail: contrast-safe in light and dark)
const wait = (timer, ms) => new Promise(resolve => { timer.current = setTimeout(resolve, ms); });

// A run's state mark: a spinner while it runs, a tick on success, a cross on an error, a timeout or a stop.
function Mark({ tone }) {
  if (tone === 'running') return <Loader2 aria-hidden="true" size={14} className="shrink-0 motion-safe:animate-spin" />;
  if (tone === 'success') return <Check aria-hidden="true" size={14} className="shrink-0" />;
  if (tone === 'error') return <X aria-hidden="true" size={14} className="shrink-0" />;
  return null;
}

// The progress of a running cell: a filled bar when the output says how far it is (iter N of M), an animated bar when it cannot.
function Progress({ progress }) {
  return (
    <div data-run-progress className="flex flex-col gap-1">
      <div role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct === null ? undefined : Math.round(progress.pct * 100)} className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
        <div className={`h-full rounded-full bg-success ${progress.pct === null ? 'w-2/5 motion-safe:animate-pulse' : 'transition-[width] duration-200'}`} style={progress.pct === null ? undefined : { width: `${Math.round(progress.pct * 100)}%` }} />
      </div>
      {progress.text && <p className="text-xs text-ink-2">{progress.text}</p>}
    </div>
  );
}

// The output pane keeps the newest line in view: it scrolls to the bottom whenever the text grows, and once more when the run ends.
function OutputPane({ text, running }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [text, running]);
  return <pre ref={ref} data-run-pane className={`${PRE} max-h-64 overflow-y-auto`}>{text}</pre>;
}

// onSave(run): the card's stored run after a change (a quiet patch on the block, AdaptiveCanvas RunNode); saved when cells arrive, when a run ends or is stopped, and when a
// flag value is left, never on a poll. Nothing of the session is saved.
export default function RunCard({ block, readOnly, onSave }) {
  const saved = block.run || {}, { app, board } = saved;
  const [session, setSession] = useState(null), [runs, setRuns] = useState(() => resultsToRuns(saved.results)), [logs, setLogs] = useState({}), [flags, setFlags] = useState(saved.flags || {});
  const [active, setActive] = useState(null); // the cellId whose run is in progress: one run at a time
  const [tab, setTab] = useState(null), [menu, setMenu] = useState(false);
  const live = useRef(true), timer = useRef(null), startGen = useRef(0), runGen = useRef(0), logsOpen = useRef({}), runsRef = useRef(runs), store = useRef(saved);
  logsOpen.current = logs; runsRef.current = runs;
  useEffect(() => { live.current = true; return () => { live.current = false; startGen.current++; runGen.current++; clearTimeout(timer.current); }; }, []);

  // Each save builds on the last, so two before a render never drop one; the canvas applies only this patch to the block.
  const save = patch => { if (readOnly) return; store.current = { ...store.current, ...patch }; onSave?.(store.current); };
  const call = body => api('/api/learn/run', { method: 'POST', body: JSON.stringify({ app, board, ...body }) });
  const fail = error => { if (live.current) toast(error.data?.error || error.message, { tone: 'error' }); };

  // action start is idempotent (a second start returns the existing session), so it is repeated every poll until status is ready.
  // The last outputs stay: they are what the card kept, labelled with their time.
  async function begin() {
    const mine = ++startGen.current;
    setSession({ status: 'starting' }); setActive(null);
    try {
      for (;;) {
        const state = await call({ action: 'start' });
        if (!live.current || startGen.current !== mine) return;
        setSession(state);
        if (state.status !== 'starting') {
          setFlags(old => ({ ...Object.fromEntries((state.cells || []).map(cell => [cell.cellId, initialFlags(cell)])), ...old }));
          const cells = (state.cells || []).map(storedCell);
          if (cells.length && JSON.stringify(cells) !== JSON.stringify(store.current.cells)) save({ cells });
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
    save({ flags });
    setRuns(old => ({ ...old, [cellId]: { status: 'queued', complete: false, sec: 0, stdoutTail: '', stderrTail: '' } }));
    try {
      const { runId } = await call({ action: 'run', sessionId, cellId, flags: sendFlags(cell, flags[cellId]) });
      for (;;) {
        const status = await call({ action: 'poll', sessionId, runId });
        if (!live.current || runGen.current !== mine) return;
        const done = status.complete ? storedResult(status, paneText(status)) : null;
        setRuns(old => ({ ...old, [cellId]: { ...status, runId, ...(done ? { at: done.at } : {}) } }));
        if (done) save({ results: { ...store.current.results, [cellId]: done } });
        if (logsOpen.current[cellId] !== undefined) { const { log } = await call({ action: 'log', sessionId, runId }); if (live.current && runGen.current === mine) setLogs(old => ({ ...old, [cellId]: log })); }
        if (status.complete) break;
        await wait(timer, RUN_POLL_MS);
        if (!live.current || runGen.current !== mine) return;
      }
    } catch (error) {
      if (live.current && runGen.current === mine) {
        // The run is gone, so the cell shows what it last kept; a session the controller no longer has (idle or hard timeout) sends the card back to Start.
        setRuns(old => { const { [cellId]: _gone, ...rest } = old; const prior = store.current.results?.[cellId]; return prior ? { ...rest, [cellId]: runFromStored(prior) } : rest; });
        if ([404, 410].includes(error.status)) setSession(old => ({ ...old, status: 'expired' }));
      }
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
      const results = { ...store.current.results };
      const next = Object.fromEntries(Object.entries(runsRef.current).map(([id, r]) => {
        if (r.complete) return [id, r];
        const stopped = { ...r, status: 'stopped', complete: true }, done = storedResult(stopped, paneText(stopped));
        results[id] = done;
        return [id, { ...stopped, at: done.at }];
      }));
      setRuns(next); setActive(null);
      save({ results, flags });
    } catch (error) { fail(error); }
  }

  async function toggleLog(cellId) {
    if (logs[cellId] !== undefined) return setLogs(({ [cellId]: _gone, ...rest }) => rest);
    try { const { log } = await call({ action: 'log', sessionId: session.sessionId, runId: runs[cellId].runId }); if (live.current) setLogs(old => ({ ...old, [cellId]: log })); } catch (error) { fail(error); }
  }

  const ready = sessionReady(session), ended = sessionEnded(session), idle = !session || ended, cells = (session?.cells?.length ? session.cells : saved.cells) || [];
  const current = tab ?? cells[0]?.cellId ?? HISTORY_TAB;
  const sessionTone = session?.status === 'ready' ? 'success' : ended ? 'error' : 'idle';
  const action = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';
  const stopPress = event => event.stopPropagation();

  // One cell: its status, Run and Stop, a progress bar while it runs, the command with its editable flags, the output pane.
  const renderCell = cell => {
    const r = runs[cell.cellId], tone = runTone(r), editable = initialFlags(cell), full = logs[cell.cellId], progress = progressOf(r);
    return (
      <div data-run-cell={cell.cellId} className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium text-ink">{cell.title}</p>
          <span data-run-status data-run-tone={tone} className={`flex items-center gap-1 text-xs font-medium ${TONE[tone] || 'text-ink-2'}`}><Mark tone={tone} />{[runLabel(r), seconds(r?.sec)].filter(Boolean).join(' · ')}</span>
          <Button type="button" variant="secondary" size="sm" data-run-run disabled={readOnly || !ready || !!active} onClick={() => run(cell)}><Play size={12} aria-hidden="true" />Run</Button>
          <Button type="button" variant={active === cell.cellId ? 'danger' : 'ghost'} size="sm" data-run-stop disabled={readOnly || active !== cell.cellId} onClick={stop}><Square size={12} aria-hidden="true" />Stop</Button>
        </div>
        {progress && <Progress progress={progress} />}
        <pre data-run-cmd className={PRE}>{r?.cmd || cell.cmd}</pre>
        {cell.flags.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {cell.flags.map(f => (
            <label key={f.flag} className="flex items-center gap-1.5 text-xs text-ink-2">
              <span className="font-mono">{f.flag}</span>
              <input data-run-flag={f.flag} aria-label={f.flag} readOnly={!f.editable || readOnly} disabled={active === cell.cellId} value={f.flag in editable ? flags[cell.cellId]?.[f.flag] ?? f.value : f.value}
                onChange={event => setFlags(old => ({ ...old, [cell.cellId]: { ...old[cell.cellId], [f.flag]: event.target.value } }))} onBlur={() => save({ flags })}
                className="w-32 rounded-lg border border-line px-2 py-1 text-xs text-ink read-only:bg-code read-only:text-ink-2" />
            </label>
          ))}
        </div>}
        {r && <div data-run-output className="flex flex-col gap-1">
          {r.at && <p data-run-at className="text-xs text-ink-2">Last run {new Date(r.at).toLocaleString()}</p>}
          <OutputPane running={!r.complete} text={(full !== undefined ? full : paneText(r)) || (r.complete ? 'No output' : 'Waiting for output')} />
          {r.runId && <Button type="button" variant="ghost" size="sm" data-run-log className="w-fit" onClick={() => toggleLog(cell.cellId)}>{full !== undefined ? 'Show the latest lines' : 'Show the full log'}</Button>}
        </div>}
      </div>
    );
  };

  return (
    <>
      <CardHeader block={block} className="relative px-4 pt-3 pb-2" meta="Run card · sandbox" trailing={<>
        <Button type="button" variant={idle ? 'secondary' : 'ghost'} size="sm" data-run-session disabled={readOnly || (!idle && !session?.sessionId)} onPointerDown={stopPress} onClick={idle ? begin : stop}>
          {idle ? <Play size={12} aria-hidden="true" /> : <Square size={12} aria-hidden="true" />}{idle ? 'Start session' : 'Stop session'}
        </Button>
        <button type="button" aria-label="More run card actions" className={action} onPointerDown={stopPress} onClick={() => setMenu(open => !open)}><MoreHorizontal size={14} /></button>
        {menu && (
          // The card's own rows from the canvas action registry, run like the right-click menu's (CanvasMenu.jsx), as the Notebook card's. A generated card shows no Delete (rehearsal-cards.js).
          <div role="menu" aria-label="Run card actions" data-card-menu className="absolute top-8 right-3 z-30 w-60 rounded-lg border border-line bg-white p-1 shadow-md" onPointerDown={stopPress}>
            <CardActionRows id={block.id} groups={['primary', 'clipboard', 'lock', 'delete']} onDone={() => setMenu(false)} />
          </div>
        )}
      </>} />
      <div data-run-card aria-label="Run card" className="flex min-h-0 flex-1 flex-col rounded-b-xl border-t border-line">
        <div className="flex items-center gap-2 px-4 py-2" data-run-session-status={session?.status || 'idle'}>
          {session?.status === 'starting' && <Loader2 aria-hidden="true" size={16} className="shrink-0 text-pass motion-safe:animate-spin" />}
          {session?.status === 'starting' && <div role="progressbar" aria-label="Starting sandbox" className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-hover"><div className="h-full w-2/5 rounded-full bg-success motion-safe:animate-pulse" /></div>}
          <p aria-live="polite" className={`text-sm ${session?.status === 'starting' ? 'shimmer' : `font-medium ${TONE[sessionTone] || 'text-ink-2'}`}`}>{session ? sessionLabel(session) : 'Session not started'}</p>
        </div>
        {cells.length === 0
          ? <p className="px-4 pb-3 text-sm text-ink-2">Start a session to see the cells of this route and run them.</p>
          : <Tabs value={current} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0 overflow-x-auto px-4" aria-label="Run cells">
              {cells.map(cell => {
                const tone = runTone(runs[cell.cellId]);
                return (
                  <TabsTrigger key={cell.cellId} value={cell.cellId} data-run-tab={cell.cellId} data-run-tone={tone} title={cell.title} className="shrink-0 whitespace-nowrap">
                    <span className={`flex items-center gap-1 ${TONE[tone]}`}><Mark tone={tone} />{cellTabTitle(cell)}</span>
                  </TabsTrigger>
                );
              })}
              <TabsTrigger value={HISTORY_TAB} data-run-tab="history" className="shrink-0 whitespace-nowrap">History</TabsTrigger>
            </TabsList>
            {cells.map(cell => <TabsContent key={cell.cellId} value={cell.cellId} data-scroll className="min-h-0 flex-1 overflow-y-auto">{renderCell(cell)}</TabsContent>)}
            <TabsContent value={HISTORY_TAB} data-run-history data-scroll className="min-h-0 flex-1 overflow-y-auto">
              <ol className="flex flex-col">
                {cells.map(cell => {
                  const expected = expectedView(cell.expected);
                  if (!expected.facts.length && !expected.output) return null;
                  return (
                    <li key={cell.cellId} data-run-expected={cell.cellId} className="flex flex-col gap-1 border-t border-line px-4 py-3 text-xs text-ink-2 first:border-t-0">
                      <p className="text-sm font-medium text-ink">{cellTabTitle(cell)}</p>
                      <p className="font-medium">{EXPECTED_HEADING}</p>
                      {expected.facts.length > 0 && <ul className="list-disc pl-5">{expected.facts.map((line, i) => <li key={i}>{line}</li>)}</ul>}
                      {expected.output && <pre className={PRE}>{expected.output}</pre>}
                    </li>
                  );
                })}
              </ol>
            </TabsContent>
          </Tabs>}
      </div>
    </>
  );
}
