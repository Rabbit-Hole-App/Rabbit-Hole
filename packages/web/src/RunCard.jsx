import { useEffect, useRef, useState } from 'react';
import { ListChecks, Loader2, Play, Square } from 'lucide-react';
import CardHeader from './CardHeader.jsx';
import { api, apiFetch } from './api.js';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, toast } from './ui.jsx';
import { resultsToRuns, runFromStored, storedCell, storedResult } from './rehearsal-cards.js';
import { tutorLine } from './tutor-lines.js';
import { SENTENCES, cellFailedLine, flagRefusedLine, flagRejectedLine, valueRuleLine } from './tutor-rehearsal-text.js';
import { CUSTOM_KEY, RUN_POLL_MS, TABS, failedStepOf, paneText, progressOf, sessionEnded, sessionReady } from './run-card-view.js';
import { RUN_CARD_COPY as COPY, headerState, sessionGoneText, stepState, whatHappens } from './run-card-copy.js';
import { formatReset } from './account-usage.js';
import { cellRunBody, cleanOverrides, customRunBody, knobFields, openSourceLine, stepCells, stepIdOf } from './run-card-knobs.js';
import { addHistory, addPreset, deletePreset, historyEntry, presetFromDraft, presetFromEntry, runAgainSpec, sessionLabelOf } from './run-card-history.js';
import { fileQuery } from './run-card-outputs.js';
import { CMD_PRE, Chip, OutputPane, Progress, StepBadge } from './RunParts.jsx';
import RunOutputs from './RunOutputs.jsx';
import RunCustom from './RunCustom.jsx';
import RunHistory from './RunHistory.jsx';

// The Run card (packages/rehearsal-runtime/RUN_CARD.md, Run card v1.1): the rehearsal's route as notebook-shaped cells, run in one sandbox through POST /api/learn/run. Three card-level
// tabs, Run | Custom run | History (owner 2026-11-15), serve one session: Run stacks the cells as sections (each with its parameters, Run and Stop, status, progress, output and outputs),
// Custom run composes a run from the route's steps and knobs and keeps presets, History lists the last 50 runs. Status colours: green while running and on success, red on an error, a
// timeout or a stop. The shell and header are the Notebook card's (CardHeader.jsx, its action buttons); tabs are the ui.jsx kit; the output pane is the code block of ask.jsx; notices are toast().
// The browser polls every RUN_POLL_MS; nothing is polled once a run completes, the session is stopped, or the card unmounts. It is a canvas card (type 'run', rehearsal-cards.js): the card keeps
// the record reference (block.run: app, board, commit, hardware), the cells, each cell's last output, the typed flag values, and since v1.1 its tab, the Tutor-added knobs, the presets and the
// History (run-card-state.json); it never keeps a session id. On load it shows Ready to run and Start; Stop, a stopped or expired session and a hard timeout return it to Start with the last outputs still
// shown. A viewer who cannot edit sees the card, its History and its presets with Run, Start and every field disabled (a session is the owner's; POST /api/learn/run refuses anyone else).
// Buttons are the ui.jsx kit: Run secondary, Stop ghost (grey) until its run is in progress and then danger (the app's filled red Stop), the session control ghost.
const wait = (timer, ms) => new Promise(resolve => { timer.current = setTimeout(resolve, ms); });

// onSave(run): the card's stored run after a change (a quiet patch on the block, AdaptiveCanvas RunNode); saved when cells arrive, when a run ends or is stopped, when a flag value is left,
// when a preset or a tab changes, never on a poll. Nothing of the session is saved.
export default function RunCard({ block, readOnly, onSave }) {
  const saved = block.run || {}, { app, board } = saved, repo = block.generated?.repo, added = saved.addedKnobs || [];
  const [session, setSession] = useState(null), [runs, setRuns] = useState(() => resultsToRuns(saved.results)), [logs, setLogs] = useState({}), [flags, setFlags] = useState(saved.flags || {});
  const [notes, setNotes] = useState({}), [expanded, setExpanded] = useState({}), [startLine, setStartLine] = useState(''); // notes: a state the card set itself per step; expanded: output panes opened past their last lines
  const [active, setActive] = useState(null); // the key (a cellId, or CUSTOM_KEY) whose run is in progress: one run at a time
  const [tab, setTabNow] = useState(TABS.some(([id]) => id === saved.tab) ? saved.tab : 'run'), [filter, setFilter] = useState('All');
  const [draft, setDraft] = useState({ steps: [], values: {}, name: '' });
  // Custom run opens with every step on, once; a pill turned off is skipped (run-card-ux-spec.md section 1).
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
    setSession({ status: 'starting' }); setActive(null); setStartLine('');
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
      if (live.current && startGen.current === mine) {
        const code = error.data?.error, line = code === 'compute_exhausted' ? COPY.lines.computeOut(error.data.allowanceUnits?.toLocaleString('en-US') ?? '', error.data.resetsAt ? formatReset(error.data.resetsAt) : 'the 1st')
          : code === 'compute_unavailable' ? COPY.lines.computeUnavailable : COPY.lines.startFailed;
        setSession({ status: 'failed' }); setStartLine(line); tell(code === 'compute_exhausted' || code === 'compute_unavailable' ? line : SENTENCES.runStartFailed);
      }
      return null;
    }
  }

  // One run, a cell's or a custom one: POST the request, poll until it completes, keep the result and a History row, say in the chat what went wrong.
  // spec: { key, body (the request), cellId | custom, flags, title, known (the flags the card takes), sid }
  async function launch(spec) {
    const mine = ++runGen.current, { key, sid } = spec;
    let final = null;
    specs.current[key] = spec;
    setActive(key); setNotes(old => { const { [key]: _gone, ...rest } = old; return rest; });
    setRuns(old => ({ ...old, [key]: { status: 'queued', complete: false, sec: 0, stdoutTail: '', stderrTail: '' } }));
    try {
      const { runId } = await call({ ...spec.body, sessionId: sid });
      for (;;) {
        const status = await call({ action: 'poll', sessionId: sid, runId });
        if (!live.current || runGen.current !== mine) return;
        seen.current[runId] = { ...status, runId };
        if (status.complete) final = { ...status, runId };
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
        if ([404, 410].includes(error.status)) { setSession(old => ({ ...old, status: 'expired' })); setNotes(old => ({ ...old, [key]: { tone: 'warn', chip: COPY.header.ended, line: error.data?.error === 'compute_out' ? COPY.lines.computeRanOut : COPY.lines.sessionEnded } })); if (error.data?.error === 'compute_out') tell(COPY.lines.computeRanOut); } // not an error: the header says Ended and the earlier outputs stay; Start again is the learner's
        else if (error.status === 400) { setNotes(old => ({ ...old, [key]: { tone: 'idle', chip: COPY.step.validator, line: error.data?.error || error.message } })); tell(flagRefusedLine({ repo, message: error.data?.error || error.message, accepted: spec.known })); }
        else tell(SENTENCES.runFailed);
      }
    } finally { if (live.current && runGen.current === mine) setActive(null); }
    return final;
  }

  // The Run tab: one cell. values: the typed overrides (the cell's own by default); an invalid value is shown and not sent, and the chat says nothing ran.
  function runCell(cell, { sid = session?.sessionId, cells: list = cells, values = flags[cell.cellId] } = {}) {
    const fields = knobFields(cell, { overrides: values, added, cells: list }), { errors, body } = cellRunBody(cell, fields, { added, cells: list, sessionId: sid });
    if (errors.length) { tell(valueRuleLine({ flag: errors[0].flag, message: errors[0].message })); return Promise.resolve(); }
    save({ flags: { ...store.current.flags, [cell.cellId]: cleanOverrides(values) } });
    return launch({ key: cell.cellId, sid, body, cellId: cell.cellId, flags: body.flags, title: cell.title, known: fields.filter(f => f.editable).map(f => f.flag) });
  }
  async function runAll() {
    for (const cell of stepCells(cells)) {
      const final = await runCell(cell);
      if (!final || final.status !== 'done') return;
    }
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
  useEffect(() => { if (seeded.current || !cells.length) return; seeded.current = true; const all = stepCells(cells).map(stepIdOf); if (all.length) setDraft(d => (d.steps.length ? d : { ...d, steps: all })); }, [cells.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const sessionTone = session?.status === 'ready' ? 'success' : ended ? 'error' : 'idle';
  const stopPress = event => event.stopPropagation();

  // One step, a card of the Run tab: a number, the plan's title and what happens, one state chip, Run; the command only on request; the output once it has run, past 12 lines under Show all.
  const renderStep = (cell, index) => {
    const r = runs[cell.cellId], failedHere = failedStepOf(saved.failedSteps, cell.cellId), full = logs[cell.cellId], progress = progressOf(r), busy = active === cell.cellId;
    const state = stepState(r, { failedHere: !!failedHere, rehearsalPassed: !failedHere && !!saved.results?.[cell.cellId]?.status && saved.results[cell.cellId].status === 'done', timeoutMin: Math.round((cell.timeoutSec || 0) / 60) || null, note: notes[cell.cellId] });
    const text = (full !== undefined ? full : paneText(r)) || (r?.complete ? COPY.step.noOutput : COPY.step.waiting), lines = text.split('\n'), long = lines.length > 12, open = expanded[cell.cellId];
    const pane = r && !sessionGoneText(`${r.stderrTail || ''}${r.stdoutTail || ''}`) && <OutputPane running={!r.complete} text={long && !open ? lines.slice(-12).join('\n') : text} />;
    const what = whatHappens(cell);
    return (
      <section key={cell.cellId} data-run-cell={cell.cellId} data-run-state={state.tone} className="flex flex-col gap-2 px-4 py-3" onKeyDown={event => { if (event.key === 'Enter' && event.target === event.currentTarget && ready && !active && !readOnly) runCell(cell); }} tabIndex={0}>
        <div className="flex items-start gap-3">
          <StepBadge n={index + 1} done={state.tone === 'success'} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm font-medium text-ink">{cell.title}</p>
            {what && <p data-run-what className="text-xs text-ink-2">{what}</p>}
          </div>
          <Chip tone={state.tone} data-run-status>{state.label}</Chip>
          <Button type="button" variant="secondary" size="sm" data-run-run disabled={readOnly || !ready || !!active} onClick={() => runCell(cell)}><Play size={12} aria-hidden="true" />{COPY.step.run}</Button>
          {busy && <Button type="button" variant="danger" size="sm" data-run-stop onClick={stop}><Square size={12} aria-hidden="true" />{COPY.header.stop}</Button>}
        </div>
        {state.line && <p data-run-line className={`pl-9 text-xs ${state.tone === 'danger' ? 'text-fail' : 'text-ink-2'}`}>{state.line}</p>}
        {progress && <div className="pl-9"><Progress progress={progress} /></div>}
        <details data-run-command className="pl-9 text-xs text-ink-2">
          <summary className="cursor-pointer select-none">{COPY.step.showCommand}</summary>
          <pre data-run-cmd className={`mt-1 ${CMD_PRE}`}>{r?.cmd || cell.cmd}</pre>
        </details>
        {r && (
          <div data-run-output className="flex flex-col gap-1.5 pl-9">
            {state.tone === 'danger'
              ? <details className="text-xs text-ink-2"><summary className="cursor-pointer select-none">{COPY.step.details}</summary><div className="mt-1.5">{pane}</div></details>
              : pane}
            <div className="flex flex-wrap items-center gap-2">
              {long && <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(old => ({ ...old, [cell.cellId]: !open }))}>{open ? COPY.step.showLess : COPY.step.showAll}</Button>}
              {r.runId && <Button type="button" variant="ghost" size="sm" data-run-log onClick={() => toggleLog(cell.cellId)}>{full !== undefined ? 'Show the latest lines' : 'Show the full log'}</Button>}
            </div>
            {(r.runId || r.producedFiles?.length > 0) && <RunOutputs status={r} cell={cell} gone={!r.runId} load={path => loadFile(r.runId, path)} />}
          </div>
        )}
      </section>
    );
  };

  const customRun = runs[CUSTOM_KEY], content = 'min-h-0 flex-1 overflow-y-auto', hs = headerState(session), dirty = !!draft.name || Object.values(draft.values || {}).some(v => Object.keys(v || {}).length > 0);
  return (
    <>
      <CardHeader block={block} className="relative px-4 pt-3 pb-2" meta={COPY.subtitle} trailing={<>
        <Chip tone={hs.tone} data-run-session-chip title={hs.button === 'stop' ? COPY.header.autoStop : undefined}>{hs.busy && <Loader2 aria-hidden="true" size={12} className="motion-safe:animate-spin" />}{hs.chip}</Chip>
        <Button type="button" variant={hs.button === 'stop' ? 'danger' : 'primary'} size="sm" data-run-session title={hs.button === 'stop' ? COPY.header.autoStop : COPY.header.hint} disabled={readOnly || hs.busy || (hs.button === 'stop' && !session?.sessionId)} onPointerDown={stopPress} onClick={hs.button === 'stop' ? stop : begin}>
          {hs.button === 'stop' ? <Square size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}{hs.button === 'stop' ? COPY.header.stop : hs.button === 'startAgain' ? COPY.header.startAgain : hs.button === 'tryAgain' ? COPY.header.tryAgain : COPY.header.start}
        </Button>
      </>} />
      <div data-run-card data-run-session-status={session?.status || 'idle'} aria-label="Run card" className="flex min-h-0 flex-1 flex-col rounded-b-xl border-t border-line">
        {startLine && <p data-run-start-line role="alert" className="px-4 pt-2 text-xs text-fail">{startLine}</p>}
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="shrink-0 overflow-x-auto px-4" aria-label="Run card">
            {TABS.map(([id]) => <TabsTrigger key={id} value={id} data-run-tab={id} className="shrink-0 whitespace-nowrap">{COPY.tabs[id]}{id === 'custom' && dirty && <span aria-label={COPY.custom.unsaved} title={COPY.custom.unsaved} className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent" />}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="run" data-scroll className={content}>
            {stepCells(cells).length === 0
              ? <p className="px-4 py-3 text-sm text-ink-2">{COPY.step.startFirst}</p>
              : <>
                <div className="flex items-center gap-2 px-4 pt-3">{!ready && <p data-run-hint className="min-w-0 flex-1 text-xs text-ink-3">{COPY.header.hint}</p>}<span className="flex-1" /><Button type="button" variant="primary" size="sm" data-run-all disabled={readOnly || !ready || !!active} onClick={runAll}><ListChecks size={12} aria-hidden="true" />{COPY.step.runAll}</Button></div>
                <div className="flex flex-col divide-y divide-line">{stepCells(cells).map(renderStep)}</div>
              </>}
          </TabsContent>
          <TabsContent value="custom" data-scroll className={content}>
            <RunCustom cells={cells} added={added} draft={draft} setDraft={setDraft} ready={ready} active={active} readOnly={readOnly} run={customRun} full={logs[CUSTOM_KEY]} presets={saved.customRuns || []}
              onRun={() => runCustom()} onStop={stop} onSave={savePresetDraft} onLog={() => toggleLog(CUSTOM_KEY)} onOpen={openSource} load={loadFile}
              onRunPreset={preset => { const next = { steps: preset.steps, values: preset.knobs, name: preset.name }; setDraft(next); runCustom(next); }}
              onRename={(preset, name) => save({ customRuns: (saved.customRuns || []).map(p => (p === preset ? { ...p, name } : p)) })}
              onDelete={preset => save({ customRuns: deletePreset(saved.customRuns, preset) })} />
          </TabsContent>
          <TabsContent value="history" data-run-history data-scroll className={content}>
            <RunHistory history={saved.history || []} cells={cells} rehearsal={cells} readOnly={readOnly} ready={ready} filter={filter} setFilter={setFilter} getStatus={getStatus} load={loadFile} onRunAgain={runAgain} onSavePreset={savePresetFrom} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
