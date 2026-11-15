// packages/web/src/learn-rehearsal-view.js
// The dev-only "Use the codebase" trigger (Rehearsal runtime MVP spec s9): the pure rules TutorCodebase.jsx renders from. The
// response contract is shared with the control plane: in progress = rehearsal-runtime/schemas/status.json, ready =
// { status: 'ready', elapsedSec, record } (record per schemas/record.json), failure = { status: 'failed', elapsedSec, error }.
// Pure: no storage, no network, no React.

export const REHEARSAL_LABEL = 'Use the codebase';
export const REHEARSAL_FIXES_HEADING = "What the README didn't say";
export const REHEARSAL_POLL_MS = 5000;

export const rehearsalDone = data => data?.status === 'ready' || data?.status === 'failed';

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The status line, verbatim from status.json: the status, then step, attempt and fixes when present.
export function statusLine(data) {
  const parts = [data?.status || 'queued'];
  if (data?.step) parts.push(`step ${data.step}`);
  if (Number.isInteger(data?.attempt)) parts.push(`attempt ${data.attempt}`);
  if (Number.isInteger(data?.fixes)) parts.push(count(data.fixes, 'fix'));
  return parts.join(', ');
}

const checkText = check => {
  if (!check) return '';
  switch (check.type) {
    case 'files_exist': return `files exist: ${(check.paths || []).join(', ')}`;
    case 'stdout_matches': return `output matches ${check.pattern}`;
    case 'metric_decreased': return 'the metric goes down';
    case 'metric_below': return `the metric is below ${check.value}`;
    case 'answers': return count(check.count, 'answer');
    case 'recorded': return 'your answer is recorded';
    case 'exit_zero': return 'the command exits 0';
    case 'unaided_repeat': return 'repeat it unaided';
    default: return check.type;
  }
};

// The draft plan as plain numbered lines: title, minutes, check. The list's own numbering supplies the number.
export const planLines = plan => (plan?.steps || []).map(s => [s.title, `${s.minutes} min`, checkText(s.check)].filter(Boolean).join(' · '));

// "What the README didn't say": one bullet per fix, with its step and the evidence for it.
export const fixLines = fixes => (fixes || []).map(f => `${f.change} (step ${f.step}): ${f.evidence}`);

// Everything the ready message shows. gaveUp: the run stopped without a plan (record.gaveUp { step, reason }).
export function readyView(record) {
  const gaveUp = record?.gaveUp ? `Gave up at step ${record.gaveUp.step}: ${record.gaveUp.reason}` : '';
  return { plan: planLines(record?.draftPlan), fixes: fixLines(record?.fixes), gaveUp };
}
