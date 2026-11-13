// The benchmark ledger row of one /interact job (build-half sprint item 1): one flat object, factual columns first, speed columns after.
// Pure: it reads the job record (or the same fields rebuilt from a detail=1 response, jobFromDetail) and invents nothing; a number the record does not hold is null,
// never 0. The server puts the row on GET .../jobs/<id>?detail=1 as diagnostics.ledger, and scripts/interact/ledger.mjs appends it to the ledger file.
import { interactOracle } from './interact-oracle.js';
import { timingSummary } from './explain-policy.js';

// timing: 'v2' is a job whose stage columns are the contiguous wall-clock slices ledgerRow explains (they add up to msTotal); 'v1' is every older row, kept as it was recorded.
export const LEDGER_COLUMNS = Object.freeze(['jobId', 'planHash', 'depth', 'result', 'stopReason', 'oracleId', 'oracleChecked', 'oracleFailed', 'bindingProblems', 'overlapProblems', 'repairs', 'repairCauses',
  'profile', 'fixture', 'authorModel', 'fallbackFired', 'judgeVerdict', 'judgeMajor', 'judgeCostUsd', 'costUsd', 'msSteer', 'msAuthor', 'msValidate', 'msRun', 'msCheck', 'msCompose', 'msReview', 'msRepair', 'msTotal', 'msJudge', 'timing']);

// What triggered each failed round, in order, `;`-joined, one token per distinct problem of a round: `overlap:text-frame` (a layout rule), `numeric_mismatch` (an oracle code),
// `program_error:sdk.panel` or `program_error:frame.objects.*.series.*.points` (the guest program's own error), `schema:manifest.readouts.*.labels` (the path a validation problem names),
// `review:<category>` (a review finding). Read off job.findings, where every failed round keeps its problems, so a ready job's last, accepted round adds nothing.
const generic = text => text.replace(/\b\d+\b/g, '*');
export function problemCause(problem) {
  const text = String(problem), coded = /^\[(\w+)\]\s*([\s\S]*)$/.exec(text);
  if (!coded) return `schema:${generic(/^main:\s*([\w.]+):/.exec(text)?.[1] ?? /^([\w.]+):/.exec(text)?.[1] ?? text.slice(0, 40))}`;
  const [, code, rest] = coded;
  if (code === 'overlap') return `overlap:${/\(([a-z-]+),/.exec(rest)?.[1] ?? 'overlap'}`;
  if (code === 'program_error') {
    const detail = /^the program failed at "[^"]*" \([a-z_]+\)(?::\s*([\s\S]*))?$/.exec(rest)?.[1] ?? '';
    const sdk = /\b(sdk\.\w+)\b/.exec(detail)?.[1], path = /^(frame\.[\w.]+):/.exec(detail)?.[1];
    return `program_error:${sdk ?? (path ? generic(path) : generic(detail.replace(/^\w*Error:\s*/, '').slice(0, 40).trim()) || 'unknown')}`;
  }
  return code;
}
export function repairCauses(findings = []) {
  const rounds = findings.filter(f => f.problems?.length || (f.accepted === false && f.findings?.length))
    .map(f => [...new Set(f.problems?.length ? f.problems.map(problemCause) : f.findings.map(x => `review:${x.category ?? 'other'}`))]);
  return rounds.flat().join('; ');
}

// job: { id, plan, planHash, stage, stopReason, calls, timing (the raw record), findings, build?, bench?, flow? (flow.profile.id), designFixture? (the INTERACT_DESIGN_FIXTURE id the design was pinned to, else null) }
// oracleId is null whenever no oracle matches the plan's controls (interact-oracle.js: standardTossDropOracle needs a plan with no input, the deep oracle needs depth detailed). Run 15's plan has controls and is
// balanced, so its null is a fact about the plan, not a gap in the saved record: do not "fix" it. profile and fixture are the grouping columns the benchmark groups rows by.
export function ledgerRow(job) {
  const t = timingSummary(job.timing), calls = job.calls ?? [];
  // The deterministic checks name their problems "[code] message" (interact-checks.js); a failed round keeps them in job.findings.
  const problems = (job.findings ?? []).flatMap(f => f.problems ?? []), codes = problems.map(p => /^\[(\w+)\]/.exec(p)?.[1] ?? null);
  const count = (...names) => codes.filter(c => names.includes(c)).length;
  const stageMs = name => { const s = t.stages.filter(x => x.stage === name); return s.length && s.every(x => x.ms != null) ? s.reduce((n, x) => n + x.ms, 0) : null; };
  const judge = job.bench?.judge ?? null;
  // Unknown cost stays unknown: any settled or failed call without a price makes the total null (a refused call cost nothing). costUsd is the learner-paid total (the build and design calls);
  // the bench judge is platform-paid and has its own column, judgeCostUsd, whether its call settled or failed (a failed call keeps the cost it was admitted with, job.bench.error.costMicros).
  const priced = calls.filter(c => c.status !== 'refused').map(c => c.costMicros);
  const judgeMicros = judge ? judge.costMicros : job.bench?.error ? job.bench.error.costMicros ?? null : undefined;
  const author = calls.find(c => c.role === 'build_author');
  // The stage columns are contiguous wall-clock slices of Generate -> ready, each including the alarm hop that starts its stage, so they add up to msTotal (msJudge runs after delivery and is outside it):
  //   msAuthor  the provider round trips of build_author (start to end of each call)      msCompose  the rest of the authoring stage (seal, compose, write the artifacts) plus accepting the card
  //   msValidate the validating stages      msRun  the rendering stages less msCheck and the accept   msCheck  the oracle and layout checks, timed in the body (a CPU step: it can read 0 where the isolate clock stands still)
  //   msReview  the gating review stage (null in shadow mode)      msRepair  the repairing stages, their build_repair calls included
  const check = job.build?.ms?.check ?? null, accept = job.build?.ms?.compose ?? null, authoring = stageMs('authoring'), rendering = stageMs('rendering');
  const authored = calls.filter(c => c.role === 'build_author' && c.startedAt != null && c.endedAt != null), providerMs = authored.length ? authored.reduce((n, c) => n + c.endedAt - c.startedAt, 0) : null;
  const run = rendering === null ? null : Math.max(0, rendering - (check ?? 0) - (accept ?? 0));
  const compose = authoring !== null && providerMs !== null ? Math.max(0, authoring - (job.timing.steerMs ?? 0) - providerMs) + (accept ?? 0) : accept;
  return {
    jobId: job.id, planHash: job.planHash ?? null, depth: job.plan?.depth ?? null, result: job.stage === 'ready' ? 'ready' : ['failed', 'cancelled'].includes(job.stage) ? 'failed' : 'running', stopReason: job.stopReason ?? null,
    oracleId: job.plan ? interactOracle(job.plan)?.id ?? null : null, oracleChecked: job.build?.check?.oracle?.checked ?? null, oracleFailed: count('numeric_mismatch', 'quantity_missing'),
    bindingProblems: count('binding_no_effect', 'control_no_effect') + problems.filter((p, i) => !codes[i] && /\bbinding\b/i.test(p)).length, overlapProblems: count('overlap'),
    repairs: t.repairs, repairCauses: repairCauses(job.findings), profile: job.flow?.profile?.id ?? null, fixture: job.designFixture ?? null, authorModel: author?.served ?? author?.requested ?? null, fallbackFired: calls.some(c => c.fallback === true),
    judgeVerdict: judge?.verdict ?? null, judgeMajor: judge ? (judge.findings ?? []).filter(f => f.severity === 'major').length : null,
    judgeCostUsd: judgeMicros === undefined ? null : typeof judgeMicros === 'number' ? judgeMicros / 1e6 : null,
    costUsd: priced.length && priced.every(m => typeof m === 'number') ? priced.reduce((n, m) => n + m, 0) / 1e6 : null,
    msSteer: job.timing.steerMs ?? null, // interact-job.js buildStage writes the measured JEV steer time (interact-steer.js) to job.timing.steerMs
    msAuthor: providerMs ?? authoring, msValidate: stageMs('validating'), msRun: run, msCheck: check, msCompose: compose, msReview: stageMs('reviewing'), msRepair: stageMs('repairing'),
    msTotal: t.generateToResultMs, msJudge: judge?.ms ?? null, timing: job.timing.v === 2 ? 'v2' : 'v1',
  };
}

// The job-shaped fields of a detail=1 response ({ job, scenePlan, diagnostics }), for a run the server did not compute a row for (the saved evidence, an older clone).
export const jobFromDetail = ({ job, scenePlan, diagnostics: d }) => ({ id: job.id, plan: scenePlan?.plan, planHash: scenePlan?.hash ?? null, stage: job.stage, stopReason: job.stopReason,
  calls: d.calls, timing: d.timing, findings: d.findings, build: d.build ?? null, bench: d.bench ?? null });

// The ledger table: the same columns, factual first; a null cell is empty.
export const ledgerMarkdown = rows => {
  const cell = v => (v === null || v === undefined ? '' : String(v).replace(/\|/g, '/'));
  return `${['| ' + LEDGER_COLUMNS.join(' | ') + ' |', '|' + LEDGER_COLUMNS.map(() => ' --- ').join('|') + '|', ...rows.map(r => '| ' + LEDGER_COLUMNS.map(c => cell(r[c])).join(' | ') + ' |')].join('\n')}\n`;
};
