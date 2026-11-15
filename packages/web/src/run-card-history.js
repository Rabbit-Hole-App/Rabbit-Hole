// packages/web/src/run-card-history.js
// The Run card's History and Custom run presets (Run card v1.1 Parts 3b and 3c; schemas/run-card-state.json history, customRuns). Pure: no React, no network.
// Board-size guard: a row keeps a text tail of at most 4 KB, produced-file metadata and the kinds, never bytes or a session id; the list keeps the last 50.
import { collapseCR, kindsOf, referenceCurve, storedFiles } from './run-card-outputs.js';
import { NAME_MAX, PRESETS_MAX, composeDisplay, lastStepId, stepCells, stepIdOf } from './run-card-knobs.js';
import { firstErrorLine } from './tutor-rehearsal-text.js';

export const HISTORY_MAX = 50;
export const HISTORY_TAIL = 4096;
export const FILTERS = ['All', 'Succeeded', 'Failed', 'Custom'];
export const sessionLabelOf = n => `session ${n}`;

const tail = (text, max = HISTORY_TAIL) => { const s = String(text ?? ''); return s.length > max ? s.slice(s.length - max) : s; };
const flat = knobs => Object.assign({}, ...Object.values(knobs || {}));

// The source column: Run · train, or Custom · "ROMEO at 0.3".
export const sourceLabel = ({ cellId, custom }) => (custom ? `Custom · "${String(custom.name || (custom.steps || []).join(' + ')).slice(0, 60)}"` : `Run · ${cellId}`);

// One finished run as a History row. status: run-status.json (complete); flags: only the ones that differ from the defaults; custom: { steps, knobs, name } for a custom run.
export function historyEntry({ status, cellId, custom, flags, sessionLabel, at = new Date().toISOString() }) {
  const ok = status.status === 'done', pane = collapseCR([status.stdoutTail, status.stderrTail].filter(Boolean).join('\n'));
  return {
    at, ...(status.runId ? { runId: status.runId } : {}), ...(sessionLabel ? { sessionLabel } : {}), source: sourceLabel({ cellId, custom }),
    ...(custom ? { custom } : { cellId }), flags: custom ? flat(custom.knobs) : flags || {}, ok, ...(Number.isInteger(status.rc) ? { rc: status.rc } : {}), sec: status.sec ?? 0,
    ...(ok ? {} : { error: firstErrorLine(collapseCR(status.stderrTail || status.stdoutTail)).slice(0, 300) || status.status }),
    kinds: kindsOf(status), tail: tail(pane), files: storedFiles(status),
  };
}

// Newest first, the oldest dropped past 50.
export const addHistory = (history, entry) => [entry, ...(history || [])].slice(0, HISTORY_MAX);

export function filterHistory(history, filter) {
  const list = history || [];
  return filter === 'Succeeded' ? list.filter(e => e.ok) : filter === 'Failed' ? list.filter(e => !e.ok) : filter === 'Custom' ? list.filter(e => e.custom) : list;
}

export const chipsOf = entry => Object.entries(entry?.flags || {}).map(([flag, value]) => `${flag}=${value}`);

// Run again: the same cell or custom run with the same parameters. -> { cellId, flags } | { custom }.
export const runAgainSpec = entry => (entry.custom ? { custom: { steps: [...entry.custom.steps], knobs: structuredClone(entry.custom.knobs), name: entry.custom.name } } : { cellId: entry.cellId, flags: { ...(entry.flags || {}) } });

// ---- Custom run presets --------------------------------------------------------------------------------------------------------

// Save as custom run: a preset is (step ids, knob values). A cell run of a step is that step; the Make it yours cell is the final step; Install is not a step.
export function presetFromEntry(entry, cells, name, createdAt = new Date().toISOString()) {
  let steps, knobs;
  if (entry.custom) { steps = [...entry.custom.steps]; knobs = structuredClone(entry.custom.knobs); }
  else {
    const cell = (cells || []).find(c => c.cellId === entry.cellId), step = cell?.kind === 'knobs' ? lastStepId(cells) : cell?.kind === 'step' ? stepIdOf(cell) : null;
    if (!step) return null;
    steps = [step]; knobs = { [step]: { ...(entry.flags || {}) } };
  }
  return { name: String(name || entry.custom?.name || steps.join(' + ')).trim().slice(0, NAME_MAX), steps, knobs, createdAt };
}

// A preset from the Custom run tab's draft (steps picked, per-step knob values already reduced to what differs).
export const presetFromDraft = (steps, knobs, name, createdAt = new Date().toISOString()) => ({ name: String(name || steps.join(' + ')).trim().slice(0, NAME_MAX), steps: [...steps], knobs: structuredClone(knobs), createdAt });

// The same name replaces the older preset; at most 50 (the oldest goes).
export const addPreset = (list, preset) => [...(list || []).filter(p => p.name !== preset.name), preset].slice(-PRESETS_MAX);
export const deletePreset = (list, preset) => (list || []).filter(p => !(p.name === preset.name && p.createdAt === preset.createdAt));

// What a preset shows read-only under its name: per step the composed command (display only; the controller composes the real one from the record) and each flag with its file:line.
// added: the card's Tutor-added knobs, whose source a preset flag may carry.
export function presetCommands(preset, cells, added = []) {
  return (preset.steps || []).map(step => {
    const cell = stepCells(cells).find(c => stepIdOf(c) === step), values = preset.knobs?.[step] || {};
    const meta = flag => (cell?.flags || []).find(f => f.flag === flag) || (added || []).find(k => k.step === step && k.flag === flag) || {};
    return { step, cmd: cell ? composeDisplay(cell.cmd, values) : '', flags: Object.entries(values).map(([flag, value]) => ({ flag, value, source: meta(flag).source || '' })) };
  });
}

// ---- Compare with rehearsal -----------------------------------------------------------------------------------------------------

// What Compare shows for a row: both curves on one chart for a metric step, else the two text tails side by side. status: the run as the controller still has it (metrics), or null once it is gone.
// cell: the step's cell (its expected is the rehearsal). -> { kind: 'chart', series, ref } | { kind: 'text', mine, rehearsal } | { kind: 'none', reason }.
export function compareModel(entry, status, cell) {
  const rehearsal = [cell?.expected?.stdoutHead, cell?.expected?.stdoutTail].filter(Boolean).join('\n\n');
  const series = (status?.metrics || []).find(m => (m.points || []).length > 1);
  const ref = series && referenceCurve(cell?.expected, series);
  if (series && ref) return { kind: 'chart', series, ref };
  if (cell?.expected?.metrics?.length && !series) return { kind: 'text', mine: entry.tail || '', rehearsal, note: 'The curve of this run is no longer available; the text tails are shown.' };
  if (!entry.tail && !rehearsal) return { kind: 'none', reason: 'Nothing to compare: neither run kept output.' };
  return { kind: 'text', mine: entry.tail || '', rehearsal };
}
// The cell a History row's Compare uses: its own cell, or a custom run's last step.
export const compareCell = (entry, cells) => (entry.custom ? stepCells(cells).find(c => stepIdOf(c) === entry.custom.steps.at(-1)) : (cells || []).find(c => c.cellId === entry.cellId)) || null;
