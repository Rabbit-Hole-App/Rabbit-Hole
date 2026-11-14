// Overnight brief section 3: the table of the re-judged cards (docs/features/interact/benchmarks/judge2.md) from the saved findings (judge2/<jobId>.json). Every blocker and major is quoted verbatim and
// put in one group by the reader's classification below (a person decided each; the judge does not classify itself). Run: node scripts/interact/judge2-report.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const DIR = 'docs/features/interact/benchmarks/judge2/';
// Groups. physics = a number, sign or direction on the card is wrong. content = what the card draws or says contradicts its plan or is unfinished (a truncated state word). wording = the card and the plan word the
// same thing differently, the meaning is unchanged. cannot judge = the finding says itself it cannot be judged from frames and traces (placement, overlap, clipping) or says in its own text that the thing is consistent, acceptable or not a defect.
const CLASS = {
  'template-moon-ledge': { 0: 'content', 1: 'cannot judge' },
  'fast-balanced-2': { 0: 'content', 1: 'cannot judge' },
  'template-deep': { 0: 'cannot judge', 1: 'cannot judge' },
  'fast-brief-1': { 0: 'cannot judge', 1: 'cannot judge', 2: 'cannot judge' },
  'fast-detailed-2': { 0: 'content', 1: 'cannot judge' },
  'template-overview': { 0: 'wording', 1: 'cannot judge', 2: 'cannot judge' },
  'fast-balanced-1': { 0: 'content', 1: 'content', 2: 'cannot judge' },
  'fast-brief-2': { 0: 'cannot judge', 1: 'cannot judge' },
  'fast-detailed-1': { 0: 'content', 1: 'cannot judge', 2: 'cannot judge' },
};
const ORDER = ['template-overview', 'template-standard', 'template-deep', 'template-moon-ledge', 'fast-brief-1', 'fast-brief-2', 'fast-brief-3', 'fast-balanced-1', 'fast-balanced-2', 'fast-detailed-1', 'fast-detailed-2', 'fast-detailed-3'];
const GROUPS = ['wrong physics', 'content', 'wording', 'cannot judge'];
const OLD = { // the verdict and majors the SAME cards got from the old judge input: the saved findings of the 2026-11-13 template cards (evidence/2026-11-13-template/judge) and the clean fast set's ledger rows
  'template-overview': 'fail, 3', 'template-standard': 'fail, 2', 'template-deep': 'fail, 2', 'template-moon-ledge': 'fail, 2',
  'fast-brief-1': 'fail, 3', 'fast-balanced-1': 'fail, 3', 'fast-detailed-1': 'fail, 1', 'fast-brief-2': 'fail, 3', 'fast-balanced-2': 'not finished', 'fast-detailed-2': 'fail, 2', 'fast-brief-3': 'fail, 3', 'fast-detailed-3': 'fail, 4' };

const all = Object.fromEntries(readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(DIR + f, 'utf8'))).map(j => [j.label, j]));
const majorsOf = j => j.findings.map((f, i) => ({ ...f, i })).filter(f => f.severity !== 'minor');
const lines = ['# Judge 2: the shadow judge with its blind spots filled (bench-judge-v2)', '',
  'The judge now reads, per scheduled state, every drawn text and callout line by object id (`labels`), the readout rows as the card words them (`readoutRows`) and what the scrubber reads (`scrubber`: elapsed + the display offset, within its range). Same Sonnet 5.5, low effort, advisory only. The 12 cards were NOT rebuilt on the clone: each plan was read back from its job and the card rebuilt in-process (template build, zero model calls, headless captures). Findings: `judge2/<jobId>.json`.', '',
  '## Verdicts', '', '| Card | Job | New verdict | Blocker or major | Old input: verdict, majors | Group of each major |', '|---|---|---|---|---|---|'];
for (const label of ORDER) {
  const j = all[label]; if (!j) continue;
  const ms = majorsOf(j), groups = ms.map(f => CLASS[label]?.[f.i] ?? '?');
  lines.push(`| ${label} | ${j.jobId} | ${j.verdict} | ${ms.length} | ${OLD[label]} | ${groups.join(', ') || 'none'} |`);
}
const tally = Object.fromEntries(GROUPS.map(g => [g, 0])); let total = 0;
for (const label of ORDER) for (const f of majorsOf(all[label] ?? { findings: [] })) { tally[CLASS[label]?.[f.i] ?? '?'] = (tally[CLASS[label]?.[f.i] ?? '?'] ?? 0) + 1; total++; }
const tpass = ORDER.filter(l => l.startsWith('template-')).filter(l => all[l]?.verdict === 'pass').length, fpass = ORDER.filter(l => l.startsWith('fast-')).filter(l => all[l]?.verdict === 'pass').length;
lines.push('', '## Summary', '', `- Majors by group (${total} in all): ${GROUPS.map(g => `${g} ${tally[g]}`).join(', ')}.`, `- Agreement with the owner's approval of the 4 template cards: the judge passes ${tpass} of 4 (old input: 0 of 4). Majors it raised against the approved cards: ${ORDER.filter(l => l.startsWith('template-')).reduce((n, l) => n + majorsOf(all[l] ?? { findings: [] }).length, 0)}, none of them wrong physics.`, `- Fast cards: the judge passes ${fpass} of 8 (old input: 0 of 7 that finished).`, '',
  'Classification rule: wrong physics = a number, sign or direction on the card is wrong; content = what the card draws or says contradicts its plan or is unfinished (a truncated state word); wording = the card and the plan word the same thing differently; cannot judge = the finding says itself that it cannot be judged from frames and traces, or says in its own text that the thing is consistent, acceptable or not a defect. Each major was classified by reading it; the judge does not classify itself.', '', '## Blockers and majors, verbatim', '');
for (const label of ORDER) {
  const j = all[label]; if (!j) continue;
  lines.push(`### ${label} (${j.verdict}, US$${j.costUsd})`, '');
  const ms = majorsOf(j);
  if (!ms.length) lines.push('No blocker or major.', '');
  for (const f of ms) lines.push(`- **${CLASS[label]?.[f.i] ?? '?'}** (${f.severity}, ${f.capture}${f.object ? `/${f.object}` : ''}): ${f.message}`);
  if (ms.length) lines.push('');
}
writeFileSync('docs/features/interact/benchmarks/judge2.md', lines.join('\n'));
console.log(`judge2.md: ${total} majors; ${GROUPS.map(g => `${g} ${tally[g]}`).join(', ')}`);
