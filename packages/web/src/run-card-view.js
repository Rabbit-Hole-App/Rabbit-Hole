// packages/web/src/run-card-view.js
// The Run card's pure rules (RunCard.jsx renders from them). Shapes are the frozen contracts in
// packages/rehearsal-runtime/schemas: session state (session.json), cells (cells.json), run status (run-status.json).
// Pure: no storage, no network, no React.

export const RUN_POLL_MS = 2000;
export const EXPECTED_HEADING = 'What a real run produced';

export const sessionEnded = state => ['stopped', 'expired', 'failed'].includes(state?.status);
export const sessionReady = state => state?.status === 'ready';

// The status label of one cell: run is the run-status object (null when the cell has not run in this card).
export function runLabel(run) {
  switch (run?.status) {
    case 'queued': case 'running': return 'Running';
    case 'done': return `Done rc ${run.rc ?? 0}`;
    case 'error': return `Error rc ${run.rc}`;
    case 'timeout': return 'Timeout';
    case 'stopped': return 'Stopped';
    default: return '';
  }
}

// The session line: Starting sandbox until the controller says ready.
export function sessionLabel(state) {
  switch (state?.status) {
    case 'ready': return state.snapshot ? 'Sandbox ready' : 'Sandbox ready, installing the repository first';
    case 'stopped': return 'Stopped';
    case 'expired': return 'Session expired';
    case 'failed': return state.error || 'The sandbox could not start';
    default: return 'Starting sandbox';
  }
}

export const seconds = sec => (Number.isFinite(sec) ? `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s` : '');

export function bytesText(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const num = n => (Math.abs(n) >= 100 ? String(Math.round(n)) : n.toFixed(2));

// "What a real run produced" for one cell (cells.json expected): the facts (time, metrics first to last, files with sizes), then
// the recorded head and tail of stdout, as one block.
export function expectedView(expected) {
  const facts = [];
  if (Number.isFinite(expected?.sec)) facts.push(`took ${seconds(expected.sec)}`);
  for (const m of expected?.metrics || []) {
    if (Number.isFinite(m.first) && Number.isFinite(m.last)) facts.push(`${m.name} ${num(m.first)} to ${num(m.last)}`);
    else if (Number.isFinite(m.last)) facts.push(`${m.name} ${num(m.last)}`);
  }
  for (const f of expected?.files || []) facts.push(`${f.path} (${bytesText(f.bytes)})`);
  return { facts, output: [expected?.stdoutHead, expected?.stdoutTail].filter(Boolean).join('\n\n') };
}

// The editable fields of a cell as { flag: value } (cells.json: only flags with editable true may be sent).
export const initialFlags = cell => Object.fromEntries((cell?.flags || []).filter(f => f.editable).map(f => [f.flag, f.value]));
export const sendFlags = (cell, values) => Object.fromEntries((cell?.flags || []).filter(f => f.editable).map(f => [f.flag, String(values?.[f.flag] ?? f.value)]));

// The run pane's text: stdout tail, then stderr tail.
export const paneText = run => [run?.stdoutTail, run?.stderrTail].filter(Boolean).join('\n');
