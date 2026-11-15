// packages/web/src/run-card-copy.js
// The Run card's words and states (Run card UX rework, owner 2026-11-15; run-card-ux-spec.md). Pure: no React, no storage, no network.
// Every visible string on the card is either from the record and the plan (step titles, hints, flags, sources, produced files) or from RUN_CARD_COPY below.
// No repository, file, flag or command appears in the component source.

export const RUN_CARD_COPY = Object.freeze({
  subtitle: 'Run card',
  tabs: { run: 'Run', custom: 'Custom run', history: 'History' },
  header: { ready: 'Ready to run', starting: 'Starting', live: 'Live', ended: 'Ended · outputs kept', failed: "Couldn't start", start: 'Start', stop: 'Stop', startAgain: 'Start again', tryAgain: 'Try again' },
  step: {
    notRun: 'Not run yet', running: 'Running', done: 'Done', didnt: "Didn't finish", stopped: 'Stopped', rehearsalDidnt: "Didn't finish in the rehearsal", validator: 'Not run',
    run: 'Run', runAll: 'Run all', showCommand: 'Show command', hideCommand: 'Hide command', details: 'Details', showAll: 'Show all', showLess: 'Show less',
    whatHappens: 'What happens', noOutput: 'No output', waiting: 'Waiting for output', startFirst: 'Start to see the steps of this route and run them.',
  },
  custom: {
    settings: 'Settings', steps: 'Steps to run', name: 'Name this run', namePlaceholder: 'for example, a lower setting', run: 'Run', save: 'Save', stop: 'Stop',
    saved: 'Saved runs', savedEmpty: 'Saved runs appear here.', rename: 'Rename', delete: 'Delete', showCommands: 'Show commands', more: 'More', reset: 'Reset', modified: 'Modified',
    addedFromChat: 'added from chat', startFirst: 'Start to see the settings of this route and compose a run.', unsaved: 'Unsaved changes',
  },
  history: {
    filters: { All: 'All', Succeeded: 'Succeeded', Failed: "Didn't finish", Custom: 'Mine' }, rehearsal: 'Rehearsal · what a real run produced', rehearsalNone: 'The rehearsal kept no output for this route.',
    empty: "Nothing run yet. Your runs will appear here; the rehearsal's results are above for comparison.", noMatch: 'No runs match this filter.', runAgain: 'Run again', saveAsRun: 'Save as a run', compare: 'Compare with rehearsal',
  },
  lines: {
    sessionEnded: 'Your session ended after a while idle. Start again to keep going — your outputs are kept.',
    startFailed: "Couldn't start a machine for this run. Try again in a moment; nothing on the canvas is lost.",
    generic: "This step didn't finish.",
    passedInRehearsal: ' — it passed in the rehearsal; a changed setting or a skipped earlier step is the usual reason.',
    stoppedByYou: 'You stopped this step.',
  },
});

const secs = sec => (Number.isFinite(sec) ? `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s` : '');

// A run's own text can carry the provider's words (the controller's `[run failed: ...]` line, a machine id, an error code). None of it reaches the card.
const GONE = /(sandbox[^\n]*(not found|shut down|already)|NotFoundError|container id)/i;
export const sessionGoneText = text => GONE.test(String(text || ''));
const SCRUB = [[/\[run failed:[^\]]*\]/gi, ''], [/\b(?:sb|im|ap|vo|fu|ta)-[A-Za-z0-9]{8,}\b/g, ''], [/\(Error code: [A-Z0-9]+\)/g, ''], [/\bmodal\b/gi, 'the machine'], [/\bsandbox\b/gi, 'machine']];
export const scrubRunText = text => SCRUB.reduce((out, [re, to]) => out.replace(re, to), String(text ?? '')).replace(/[ \t]+\n/g, '\n').trim();

const firstErrorLine = text => {
  const lines = scrubRunText(text).split('\n').map(l => l.trim()).filter(Boolean);
  const hit = [...lines].reverse().find(l => /(error|exception|failed|no such|not found|cannot|invalid|unrecognized|refused|denied)/i.test(l)) || lines.at(-1) || '';
  return hit.slice(0, 120);
};

// The humanised state of one step's run: { tone, chip, line }, never a developer's word (rc, NotFoundError, a container id, Modal, sandbox). rehearsalPassed: the step passed in the rehearsal.
export function humanizeRunError(run, { rehearsalPassed = false, timeoutMin = null } = {}) {
  const C = RUN_CARD_COPY, raw = [run?.stderrTail, run?.stdoutTail].filter(Boolean).join('\n');
  if (sessionGoneText(raw)) return { tone: 'warn', chip: C.header.ended, line: C.lines.sessionEnded };
  switch (run?.status) {
    case 'timeout': {
      const n = timeoutMin || (Number.isFinite(run.sec) ? Math.max(1, Math.round(run.sec / 60)) : null);
      return { tone: 'warn', chip: n ? `Stopped at ${n} min` : C.step.stopped, line: `This step took longer than ${n ? `the ${n} minutes` : 'the time'} allowed here and was stopped.` };
    }
    case 'stopped': return { tone: 'warn', chip: C.step.stopped, line: C.lines.stoppedByYou };
    case 'error': { const one = firstErrorLine(run.stderrTail || run.stdoutTail); return { tone: 'danger', chip: C.step.didnt, line: `${one || C.lines.generic}${rehearsalPassed ? C.lines.passedInRehearsal : ''}` }; }
    default: return null;
  }
}

// The state chip of one step: { tone: idle | accent | success | danger | warn, label, line? }. failedHere: the rehearsal gave up at this step. note: a state the card set itself (a refused flag, a session that ended).
export function stepState(run, { failedHere = false, rehearsalPassed = false, timeoutMin = null, note = null } = {}) {
  const C = RUN_CARD_COPY.step;
  if (note) return { tone: note.tone || 'warn', label: note.chip, line: note.line };
  if (!run) return failedHere ? { tone: 'danger', label: C.rehearsalDidnt } : { tone: 'idle', label: C.notRun };
  if (run.status === 'queued' || run.status === 'running') return { tone: 'accent', label: [C.running, secs(run.sec)].filter(Boolean).join(' · ') };
  if (run.status === 'done') return { tone: 'success', label: [C.done, secs(run.sec)].filter(Boolean).join(' · ') };
  const h = humanizeRunError(run, { rehearsalPassed, timeoutMin });
  return h ? { tone: h.tone, label: h.chip, line: h.line } : { tone: 'idle', label: C.notRun };
}

// The header's one chip and one button: { tone, chip, button: 'start' | 'stop' | 'startAgain' | 'tryAgain', busy }.
export function headerState(session) {
  const H = RUN_CARD_COPY.header;
  switch (session?.status) {
    case 'starting': return { tone: 'accent', chip: H.starting, button: 'start', busy: true };
    case 'ready': return { tone: 'success', chip: H.live, button: 'stop' };
    case 'stopped': case 'expired': return { tone: 'warn', chip: H.ended, button: 'startAgain' };
    case 'failed': return { tone: 'danger', chip: H.failed, button: 'tryAgain' };
    default: return { tone: 'idle', chip: H.ready, button: 'start' };
  }
}

// Status chip colours: the app's tokens (index.css). Tints carry coloured text, never white on a lighter fill (owner 2026-10-22).
export const CHIP_TONE = Object.freeze({ idle: 'bg-hover text-ink-2', accent: 'bg-accent/10 text-accent', success: 'bg-success/10 text-pass', danger: 'bg-danger/10 text-fail', warn: 'bg-warn/10 text-warn' });

// A knob's readable label from its flag when discovery gave none: strip the dashes, split on _ and -, capitalise the first word.
export const knobLabel = (flag, label = '') => {
  if (label) return label;
  const words = String(flag || '').replace(/^-+/, '').split(/[_-]+/).filter(Boolean).join(' ');
  return words ? words[0].toUpperCase() + words.slice(1) : String(flag || '');
};

// What a step does, in one line: the plan's own line when the cell carries it, else what the rehearsal produced (files, a printed value), else nothing.
export function whatHappens(cell) {
  if (cell?.what) return String(cell.what);
  const files = (cell?.expected?.files || []).map(f => f.path).filter(Boolean);
  if (files.length) return `Writes ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more` : ''}`;
  const metric = (cell?.expected?.metrics || [])[0];
  if (metric?.name) return `Prints ${metric.name} as it goes`;
  return '';
}
