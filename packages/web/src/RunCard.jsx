import { useEffect, useRef, useState } from 'react';
import { Loader2, MoreHorizontal, Play, Square } from 'lucide-react';
import CardHeader from './CardHeader.jsx';
import { CardActionRows } from './CanvasMenu.jsx';
import { api, apiFetch } from './api.js';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, toast } from './ui.jsx';
import { resultsToRuns, runFromStored, storedCell, storedResult } from './rehearsal-cards.js';
import { tutorLine } from './tutor-lines.js';
import { SENTENCES, cellFailedLine, flagRefusedLine, flagRejectedLine, valueRuleLine } from './tutor-rehearsal-text.js';
import { CUSTOM_KEY, EXPECTED_HEADING, REHEARSAL_OUTPUT, RUN_POLL_MS, TABS, cellTone, expectedView, failedStepOf, paneText, progressOf, runLabel, seconds, sessionEnded, sessionLabel, sessionReady } from './run-card-view.js';
import { cellRunBody, cleanOverrides, customRunBody, knobFields, lastStepId, openSourceLine, stepCells, stepIdOf } from './run-card-knobs.js';
import { addHistory, addPreset, deletePreset, historyEntry, presetFromDraft, presetFromEntry, runAgainSpec, sessionLabelOf } from './run-card-history.js';
import { fileQuery } from './run-card-outputs.js';
import { KnobFields, Mark, OutputPane, PRE, Progress, TONE } from './RunParts.jsx';
import RunOutputs from './RunOutputs.jsx';
import RunCustom from './RunCustom.jsx';
import RunHistory from './RunHistory.jsx';

// The Run card (packages/rehearsal-runtime/RUN_CARD.md, Run card v1.1): the rehearsal's route as notebook-shaped cells, run in one sandbox through POST /api/learn/run. Three card-level
// tabs, Run | Custom run | History (owner 2026-11-15), serve one session: Run stacks the cells as sections (each with its parameters, Run and Stop, status, progress, output and outputs),
// Custom run composes a run from the route's steps and knobs and keeps presets, History lists the last 50 runs. Status colours: green while running and on success, red on an error, a
// timeout or a stop. The shell and header are the Notebook card's (CardHeader.jsx, its action buttons); tabs are the ui.jsx kit; the output pane is the code block of ask.jsx; notices are toast().
// The browser polls every RUN_POLL_MS; nothing is polled once a run completes, the session is stopped, or the card unmounts. It is a canvas card (type 'run', rehearsal-cards.js): the card keeps
// the record reference (block.run: app, board, commit, hardware), the cells, each cell's last output, the typed flag values, and since v1.1 its tab, the Tutor-added knobs, the presets and the
// History (run-card-state.json); it never keeps a session id. On load it shows Start session; Stop, a stopped or expired session and a hard timeout return it to Start with the last outputs still
// shown. A viewer who cannot edit sees the card, its History and its presets with Run, Start and every field disabled (a session is the owner's; POST /api/learn/run refuses anyone else).
// Buttons are the ui.jsx kit: Run secondary, Stop ghost (grey) until its run is in progress and then danger (the app's filled red Stop), the session control ghost.
const wait = (timer, ms) => new Promise(resolve => { timer.current = setTimeout(resolve, ms); });

// onSave(run): the card's stored run after a change (a quiet patch on the block, AdaptiveCanvas RunNode); saved when cells arrive, when a run ends or is stopped, when a flag value is left,
// when a preset or a tab changes, never on a poll. Nothing of the session is saved.
export default function RunCard({ block, readOnly, onSave }) {
  const saved = block.run || {}, { app, board } = saved, repo = block.generated?.repo, added = saved.addedKnobs || [];
  const [session, setSession] = useState(null), [runs, setRuns] = useState(() => resultsToRuns(saved.results)), [logs, setLogs] = useState({}), [flags, setFlags] = useState(saved.flags || {});
  const [active, setActive] = useState(null); // the key (a cellId, or CUSTOM_KEY) whose run is in progress: one run at a time
  const [tab, setTabNow] = useState(TABS.some(([id]) => id === saved.tab) ? saved.tab : 'run'), [menu, setMenu] = useState(false), [filter, setFilter] = useState('All');
  const [draft, setDraft] = useState({ steps: [], values: {}, name: '' });
  // "Make it yours" is the Custom run tab (owner 2026-11-15): the route's last step, with its parameters, is the tab's first pick, once; the Run tab no longer draws that cell.
  const seeded = useRef(false);
  const live = useRef(true), timer = useRef(null), startGen = useRef(0), runGen = useRef(0), logsOpen = useRef({}), runsRef = useRef(runs), store = useRef(saved);
  const seen = useRef({}), specs = useRef({}), sess = useRef({ id: null, n: saved.sessionSeq || 0 }); // seen: runId -> last status (this page); specs: key -> what is running; sess: this page's session counter
  logsOpen.current = logs; runsRef.current = runs;
  store.current = { ...store.current, addedKnobs: saved.addedKnobs }; // the Tutor adds knobs from outside (AdaptiveCanvas RunNode): a save must build on them
  useEffect(() => { live.current = true; return () => { live.current = false; startGen.current++; runGen.current++; clearTimeout(timer.current); }; }, []);

  // Each save builds on the last, so two before a render never drop one; the canvas applies only this patch to the block.
  const save = patch => { if (readOnly) return; store.current = { ...store.current, ...patch }; onSave?.(store.current); };
  const setTab = next => { setTabNow(next); save({ tab: next }); };
  // routeId rides on every action (initial pipeline): the record of that route; absent is the record made before the catalogue.
  const call = body => api('/api/learn/run', { method: 'POST', body: JSON.stringify({ app, board, ...(saved.routeId ? { routeId: saved.routeId } : {}), ...body }) });
  // A failure is a Tutor line in the chat, never a stack trace or a bare notice (cannot-run-edge-cases.md section 1a); tutor-lines.js shows it as a notice where no chat flow is mounted.
  const tell = text => { if (live.current) tutorLine(app, text); };
  const fail = error => { if (live.current) toast(error.data?.error || error.message, { tone: 'error' }); };
  // A knob's file:line opens the Files panel at those lines, as a Runbook citation does (small:open-code), else GitHub at the commit.
  const openSource = source => openSourceLine(source, { app: block.generated?.app, repo, commit: saved.commit || block.generated?.commit });

  // action start is idempotent (a second start returns the existing session), so it is repeated every poll until status is ready.
  // The last outputs stay: they are what the card kept, labelled with their time. -> the session state once it is not starting (null when the sandbox could not start).
  async function begin() {
    const mine = ++startGen.current;
    setSession({ status: 'starting' }); setActive(null);
    try {
      for (;;) {
        const state = await call({ action: 'start' });
        if (!live.current || startGen.current !== mine) return null;
        setSession(state);
        if (state.status !== 'starting') {
          if (state.sessionId && state.sessionId !== sess.current.id) { sess.current = { id: state.sessionId, n: sess.current.n + 1 }; save({ sessionSeq: sess.current.n }); } // History names its session
          const cells = (state.cells || []).map(storedCell);
          if (cells.length && JSON.stringify(cells) !== JSON.stringify(store.current.cells)) save({ cells });
          return state;
        }
        await wait(timer, RUN_POLL_MS);
        if (!live.current || startGen.current !== mine) return null;
      }
    } catch (error) {
      if (live.current && startGen.current === mine) { setSession({ status: 'failed' }); tell(SENTENCES.runStartFailed); }
      return null;
    }
  }

  // One run, a cell's or a custom one: POST the request, poll until it completes, keep the result and a History row, say in the chat what went wrong.
  // spec: { key, body (the request), cellId | custom, flags, title, known (the flags the card takes), sid }
  async function launch(spec) {
    const mine = ++runGen.current, { key, sid } = spec;
    specs.current[key] = spec;
    setActive(key);
    setRuns(old => ({ ...old, [key]: { status: 'queued', complete: false, sec: 0, stdoutTail: '', stderrTail: '' } }));
    try {
      const { runId } = await call({ ...spec.body, sessionId: sid });
      for (;;) {
        const status = await call({ action: 'poll', sessionId: sid, runId });
        if (!live.current || runGen.current !== mine) return;
        seen.current[runId] = { ...status, runId };
        const done = status.complete ? storedResult(status, paneText(status)) : null;
        setRuns(old => ({ ...old, [key]: { ...status, runId, ...(done ? { at: done.at } : {}) } }));
        if (done) {
          if (spec.cellId) save({ results: { ...store.current.results, [spec.cellId]: done } });
          save({ history: addHistory(store.current.history, historyEntry({ status: { ...status, runId }, cellId: spec.cellId, custom: spec.custom, flags: spec.flags, sessionLabel: sess.current.n ? sessionLabelOf(sess.current.n) : '' })) });
          if (['error', 'timeout'].includes(status.status)) {
            const stepCell = spec.cellId ? null : stepCells(store.current.cells).find(c => stepIdOf(c) === status.step), title = stepCell?.title || spec.title, out = paneText(status);
            tell((status.status === 'error' && flagRejectedLine({ out, cmd: status.cmd, title, known: spec.known })) || cellFailedLine({ title, out, status: status.status, inRehearsal: !!failedStepOf(saved.failedSteps, spec.cellId || status.step) }));
          }
        }
        if (logsOpen.current[key] !== undefined) { const { log } = await call({ action: 'log', sessionId: sid, runId }); if (live.current && runGen.current === mine) setLogs(old => ({ ...old, [key]: log })); }
        if (status.complete) break;
        await wait(timer, RUN_POLL_MS);
        if (!live.current || runGen.current !== mine) return;
      }
    } catch (error) {
      if (live.current && runGen.current === mine) {
        // The run is gone, so the cell shows what it last kept; a session the controller no longer has (idle or hard timeout) sends the card back to Start.
        setRuns(old => { const { [key]: _gone, ...rest } = old; const prior = spec.cellId && store.current.results?.[spec.cellId]; return prior ? { ...rest, [key]: runFromStored(prior) } : rest; });
        if ([404, 410].includes(error.status)) { setSession(old => ({ ...old, status: 'expired' })); tell(SENTENCES.sessionEnded); begin(); } // not an error tone: a new session starts, the earlier outputs stay
        else if (error.status === 400) tell(flagRefusedLine({ repo, message: error.data?.error || error.message, accepted: spec.known }));
        else tell(SENTENCES.runFailed);
      }
    } finally { if (live.current && runGen.current === mine) setActive(null); }
  }

  // The Run tab: one cell. values: the typed overrides (the cell's own by default); an invalid value is shown and not sent, and the chat says nothing ran.
  function runCell(cell, { sid = session?.sessionId, cells: list = cells, values = flags[cell.cellId] } = {}) {
    const fields = knobFields(cell, { overrides: values, added, cells: list }), { errors, body } = cellRunBody(cell, fields, { added, cells: list, sessionId: sid });
    if (errors.length) { tell(valueRuleLine({ flag: errors[0].flag, message: errors[0].message })); return Promise.resolve(); }
    save({ flags: { ...store.current.flags, [cell.cellId]: cleanOverrides(values) } });
    return launch({ key: cell.cellId, sid, body, cellId: cell.cellId, flags: body.flags, title: cell.title, known: fields.filter(f => f.editable).map(f => f.flag) });
  }
  // The Custom run tab (and a preset, and Run again of a custom row): steps in route order, their knobs, a name.
  function runCustom(d = draft, { sid = session?.sessionId, cells: list = cells } = {}) {
    const { errors, body, steps } = customRunBody(d, { cells: list, added, sessionId: sid });
    if (errors.length) { tell(valueRuleLine({ flag: errors[0].flag, message: errors[0].message })); return Promise.resolve(); }
    const known = steps.flatMap(id => knobFields(stepCells(list).find(c => stepIdOf(c) === id), { added, cells: list }).filter(f => f.editable).map(f => f.flag));
    return launch({ key: CUSTOM_KEY, sid, body, custom: body.custom, title: body.custom.name || 'Your custom run', known });
  }

  // The contract has one stop: the session. It ends the sandbox and so the run in it. Runs in progress are kept as stopped, in the cell and in History.
  async function stop() {
    startGen.current++; runGen.current++; clearTimeout(timer.current);
    try {
      const state = await call({ action: 'stop', sessionId: session.sessionId });
      if (!live.current) return;
      setSession(old => ({ ...old, ...state }));
      const results = { ...store.current.results };
      let history = store.current.history;
      const next = Object.fromEntries(Object.entries(runsRef.current).map(([key, r]) => {
        if (r.complete) return [key, r];
        const stopped = { ...r, status: 'stopped', complete: true }, done = storedResult(stopped, paneText(stopped)), spec = specs.current[key];
        if (spec?.cellId) results[spec.cellId] = done;
        if (spec && r.runId) history = addHistory(history, historyEntry({ status: stopped, cellId: spec.cellId, custom: spec.custom, flags: spec.flags, sessionLabel: sess.current.n ? sessionLabelOf(sess.current.n) : '' }));
        return [key, { ...stopped, at: done.at }];
      }));
      setRuns(next); setActive(null);
      save({ results, flags, history });
    } catch (error) { fail(error); }
  }

  async function toggleLog(key) {
    if (logs[key] !== undefined) return setLogs(({ [key]: _gone, ...rest }) => rest);
    try { const { log } = await call({ action: 'log', sessionId: session.sessionId, runId: runs[key].runId }); if (live.current) setLogs(old => ({ ...old, [key]: log })); } catch (error) { fail(error); }
  }

  // A produced file through the control plane's proxy (RUN_CARD.md: GET /api/learn/run?action=file), as bytes for a blob; never called for a binary.
  async function loadFile(runId, path) {
    const response = await apiFetch(`/api/learn/run?${fileQuery({ app, board, routeId: saved.routeId, sessionId: session?.sessionId || '', runId, path })}`);
    if (!response.ok) throw new Error(response.status === 404 ? 'no longer available' : `HTTP ${response.status}`);
    return { bytes: await response.arrayBuffer(), type: response.headers.get('content-type') || '' };
  }
  // A History row's run as the controller still has it: from this page, else polled while a session is ready; null once it is gone (a 404 for another session's run).
  async function getStatus(entry) {
    if (!entry.runId) return null;
    if (seen.current[entry.runId]) return seen.current[entry.runId];
    if (!sessionReady(session)) return null;
    try { const status = await call({ action: 'poll', sessionId: session.sessionId, runId: entry.runId }); return { ...status, runId: entry.runId }; } catch { return null; }
  }

  // History: Run again reproduces the row's cell or custom run with its flags in the current session (a new one starts when there is none).
  async function runAgain(entry) {
    let state = session;
    if (!sessionReady(state)) { state = await begin(); if (!sessionReady(state)) return; }
    const list = (state.cells?.length ? state.cells : store.current.cells) || [], spec = runAgainSpec(entry), sid = state.sessionId;
    if (spec.custom) {
      const next = { steps: spec.custom.steps, values: spec.custom.knobs, name: spec.custom.name || '' };
      setDraft(next); setTab('custom');
      await runCustom(next, { sid, cells: list });
    } else {
      const cell = list.find(c => c.cellId === spec.cellId);
      if (!cell) return;
      setFlags(old => ({ ...old, [cell.cellId]: spec.flags })); setTab('run');
      await runCell(cell, { sid, cells: list, values: spec.flags });
    }
  }
  // Save as custom run: the row's step and flags as a preset, shown in the Custom run tab.
  function savePresetFrom(entry) {
    const preset = presetFromEntry(entry, cells, [entry.custom?.name || entry.cellId, ...Object.entries(entry.flags || {}).map(([f, v]) => `${f.replace(/^--/, '')} ${v}`)].join(' '));
    if (!preset) return;
    save({ customRuns: addPreset(saved.customRuns, preset) }); setTab('custom');
  }
  // The Custom run tab's Save as a preset: the picked steps and the values that differ.
  function savePresetDraft() {
    const { errors, body } = customRunBody(draft, { cells, added, sessionId: '' });
    if (errors.length) return tell(valueRuleLine({ flag: errors[0].flag, message: errors[0].message }));
    save({ customRuns: addPreset(saved.customRuns, presetFromDraft(body.custom.steps, body.custom.knobs, draft.name)) });
  }

  const ready = sessionReady(session), ended = sessionEnded(session), idle = !session || ended, cells = (session?.cells?.length ? session.cells : saved.cells) || [];
  useEffect(() => { if (seeded.current || !cells.length) return; seeded.current = true; const last = lastStepId(cells); if (last) setDraft(d => (d.steps.length ? d : { ...d, steps: [last] })); }, [cells.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessionTone = session?.status === 'ready' ? 'success' : ended ? 'error' : 'idle';
  const action = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';
  const stopPress = event => event.stopPropagation();

  // One cell, a section of the Run tab: its status, Run and Stop, a progress bar while it runs, the command, its parameters, the output pane, what the run produced, and the rehearsal's output.
  const renderCell = cell => {
    const r = runs[cell.cellId], failedHere = failedStepOf(saved.failedSteps, cell.cellId), tone = cellTone(r, failedHere), full = logs[cell.cellId], progress = progressOf(r);
    const fields = knobFields(cell, { overrides: flags[cell.cellId], added, cells }), expected = expectedView(cell.expected), busy = active === cell.cellId;
    const setField = (flag, value) => setFlags(old => ({ ...old, [cell.cellId]: { ...old[cell.cellId], [flag]: value } }));
    const leave = () => save({ flags: { ...store.current.flags, ...Object.fromEntries(Object.entries(flags).map(([id, values]) => [id, cleanOverrides(values)])) } });
    return (
      <section key={cell.cellId} data-run-cell={cell.cellId} className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium text-ink">{cell.title}</p>
          <span data-run-status data-run-tone={tone} className={`flex items-center gap-1 text-xs font-medium ${TONE[tone] || 'text-ink-2'}`}><Mark tone={tone} />{[runLabel(r) || (failedHere ? 'Failed in the rehearsal' : ''), seconds(r?.sec)].filter(Boolean).join(' · ')}</span>
          <Button type="button" variant="secondary" size="sm" data-run-run disabled={readOnly || !ready || !!active} onClick={() => runCell(cell)}><Play size={12} aria-hidden="true" />Run</Button>
          <Button type="button" variant={busy ? 'danger' : 'ghost'} size="sm" data-run-stop disabled={readOnly || !busy} onClick={stop}><Square size={12} aria-hidden="true" />Stop</Button>
        </div>
        {failedHere && !r && <p data-run-rehearsal-failed className="text-xs text-fail">The rehearsal stopped at this step{failedHere.error ? `: ${failedHere.error}` : ''}</p>}
        {progress && <Progress progress={progress} />}
        <pre data-run-cmd className={PRE}>{r?.cmd || cell.cmd}</pre>
        <div onBlur={leave}><KnobFields fields={fields} disabled={readOnly || busy} onChange={setField} onReset={() => { setFlags(old => ({ ...old, [cell.cellId]: {} })); save({ flags: { ...store.current.flags, [cell.cellId]: {} } }); }} onOpen={openSource} /></div>
        {r && <div data-run-output className="flex flex-col gap-1.5">
          {r.at && <p data-run-at className="text-xs text-ink-2">Last run {new Date(r.at).toLocaleString()}</p>}
          <OutputPane running={!r.complete} text={(full !== undefined ? full : paneText(r)) || (r.complete ? 'No output' : 'Waiting for output')} />
          {r.runId && <Button type="button" variant="ghost" size="sm" data-run-log className="w-fit" onClick={() => toggleLog(cell.cellId)}>{full !== undefined ? 'Show the latest lines' : 'Show the full log'}</Button>}
          {(r.runId || r.producedFiles?.length > 0) && <RunOutputs status={r} cell={cell} gone={!r.runId} load={path => loadFile(r.runId, path)} />}
        </div>}
        {(expected.facts.length > 0 || expected.output) && (
          <details data-run-expected={cell.cellId} className="text-xs text-ink-2">
            <summary className="cursor-pointer select-none">{REHEARSAL_OUTPUT}</summary>
            <div className="mt-1.5 flex flex-col gap-1">
              <p className="font-medium">{EXPECTED_HEADING}</p>
              {expected.facts.length > 0 && <ul className="list-disc pl-5">{expected.facts.map((line, i) => <li key={i}>{line}</li>)}</ul>}
              {expected.output && <pre className={PRE}>{expected.output}</pre>}
            </div>
          </details>
        )}
      </section>
    );
  };

  const customRun = runs[CUSTOM_KEY], content = 'min-h-0 flex-1 overflow-y-auto';
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
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="shrink-0 overflow-x-auto px-4" aria-label="Run card">
            {TABS.map(([id, label]) => <TabsTrigger key={id} value={id} data-run-tab={id} className="shrink-0 whitespace-nowrap">{label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="run" data-scroll className={content}>
            {cells.length === 0
              ? <p className="px-4 py-3 text-sm text-ink-2">Start a session to see the cells of this route and run them.</p>
              : <div className="flex flex-col divide-y divide-line">{cells.filter(cell => cell.kind !== 'knobs').map(renderCell)}</div>}
          </TabsContent>
          <TabsContent value="custom" data-scroll className={content}>
            <RunCustom cells={cells} added={added} draft={draft} setDraft={setDraft} ready={ready} active={active} readOnly={readOnly} run={customRun} full={logs[CUSTOM_KEY]} presets={saved.customRuns || []}
              onRun={() => runCustom()} onStop={stop} onSave={savePresetDraft} onLog={() => toggleLog(CUSTOM_KEY)} onOpen={openSource} load={loadFile}
              onRunPreset={preset => { const next = { steps: preset.steps, values: preset.knobs, name: preset.name }; setDraft(next); runCustom(next); }}
              onDelete={preset => save({ customRuns: deletePreset(saved.customRuns, preset) })} />
          </TabsContent>
          <TabsContent value="history" data-run-history data-scroll className={content}>
            <RunHistory history={saved.history || []} cells={cells} readOnly={readOnly} ready={ready} filter={filter} setFilter={setFilter} getStatus={getStatus} load={loadFile} onRunAgain={runAgain} onSavePreset={savePresetFrom} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
