// packages/web/src/learn-rehearsal-view.js
// The dev-only "Use the codebase" trigger (Rehearsal runtime MVP spec s9): the pure rules TutorCodebase.jsx renders from. The
// response contract is shared with the control plane: in progress = rehearsal-runtime/schemas/status.json, ready =
// { status: 'ready', elapsedSec, record } (record per schemas/record.json), failure = { status: 'failed', elapsedSec, error }.
// Pure: no storage, no network, no React.

// Dev builds only (VITE_REHEARSAL_TRIGGER=1, rehearsal-flag.js): the new Tutor chat flow.
import { REHEARSAL } from './rehearsal-flag.js';
export const rehearsalOn = () => REHEARSAL;
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

// ---- the plan message in the chat (initial pipeline): See it, Run it, Make it yours, What the README didn't say ----------------------------------------------
// Only the plan lines whose pattern is see, run or change (an old record also carries predict, explain and comeback: they are not shown), under their headings.
const PLAN_HEADINGS = [['see', 'See it'], ['run', 'Run it'], ['change', 'Make it yours']];
export function trimmedPlan(record) {
  const steps = record?.draftPlan?.steps || [];
  return PLAN_HEADINGS.map(([pattern, heading]) => ({ heading, lines: planLines({ steps: steps.filter(step => step.pattern === pattern) }) })).filter(section => section.lines.length);
}

// A record that gave up (record.gaveUp, and the failing step's failed / error / tried): which step fails, the error in one line, what was tried, what can still be done.
// Plain words, no stack trace; the error and the tried phrases come from the record, one line each.
export function gaveUpText(record) {
  if (!record?.gaveUp) return '';
  const step = (record.steps || []).find(s => s.failed) || (record.steps || []).find(s => s.id === record.gaveUp.step) || null;
  const name = String(record.repo || '').split('/').pop() || 'This repository';
  const error = String(step?.error || record.gaveUp.reason || '').trim().replace(/\s+/g, ' ').replace(/[.\s]+$/, '');
  const tried = (step?.tried || []).filter(Boolean);
  const before = (record.steps || []).filter(s => !s.failed && s.rc === 0).length;
  return [`**${name}**'s documented way to run doesn't work at this version. ${record.gaveUp.step ? `The step "${record.gaveUp.step}" fails` : 'A step fails'}${error ? ` with: ${error}` : ''}.`,
    tried.length ? `I tried ${tried.join('; ')}; none of it fixed it. This is worth knowing about the codebase.` : 'This is worth knowing about the codebase.',
    `You can still ${before ? `run the ${before === 1 ? 'step' : `${before} steps`} before it, ` : ''}read the code, or run the tests.`].join(' ');
}

// The whole plan message as the chat's markdown: the gave-up paragraph when there is one, the trimmed plan, then the README's gaps.
export function planMessage(record) {
  const parts = [];
  if (record?.gaveUp) parts.push(gaveUpText(record));
  for (const section of trimmedPlan(record)) parts.push([`**${section.heading}**`, ...section.lines.map(line => `- ${line}`)].join('\n'));
  const gaps = fixLines(record?.fixes);
  if (gaps.length) parts.push([`**${REHEARSAL_FIXES_HEADING}**`, ...gaps.map(line => `- ${line}`)].join('\n'));
  return parts.join('\n\n');
}

// Everything the ready message shows. gaveUp: the run stopped without a plan (record.gaveUp { step, reason }).
export function readyView(record) {
  const gaveUp = record?.gaveUp ? `Gave up at step ${record.gaveUp.step}: ${record.gaveUp.reason}` : '';
  return { plan: planLines(record?.draftPlan), fixes: fixLines(record?.fixes), gaveUp };
}
