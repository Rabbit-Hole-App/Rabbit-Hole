// The benchmark ledger row of one /interact job (build-half sprint item 1): one flat object, factual columns first, speed columns after.
// Pure: it reads the job record (or the same fields rebuilt from a detail=1 response, jobFromDetail) and invents nothing; a number the record does not hold is null,
// never 0. The server puts the row on GET .../jobs/<id>?detail=1 as diagnostics.ledger, and scripts/interact/ledger.mjs appends it to the ledger file.
import { interactOracle } from './interact-oracle.js';
import { timingSummary } from './explain-policy.js';

export const LEDGER_COLUMNS = Object.freeze(['jobId', 'planHash', 'depth', 'result', 'stopReason', 'oracleId', 'oracleChecked', 'oracleFailed', 'bindingProblems', 'overlapProblems', 'repairs',
  'authorModel', 'fallbackFired', 'judgeVerdict', 'judgeMajor', 'costUsd', 'msSteer', 'msAuthor', 'msValidate', 'msRun', 'msCheck', 'msReview', 'msRepair', 'msTotal']);

// job: { id, plan, planHash, stage, stopReason, calls, timing (the raw record), findings, build?, bench? }
export function ledgerRow(job) {
  const t = timingSummary(job.timing), calls = job.calls ?? [];
  // The deterministic checks name their problems "[code] message" (interact-checks.js); a failed round keeps them in job.findings.
  const problems = (job.findings ?? []).flatMap(f => f.problems ?? []), codes = problems.map(p => /^\[(\w+)\]/.exec(p)?.[1] ?? null);
  const count = (...names) => codes.filter(c => names.includes(c)).length;
  const stageMs = name => { const s = t.stages.filter(x => x.stage === name); return s.length && s.every(x => x.ms != null) ? s.reduce((n, x) => n + x.ms, 0) : null; };
  const judge = job.bench?.judge ?? null;
  // Unknown cost stays unknown: any settled or failed call without a price makes the total null (a refused call cost nothing).
  const priced = [...calls.filter(c => c.status !== 'refused').map(c => c.costMicros), ...(judge ? [judge.costMicros] : [])];
  const author = calls.find(c => c.role === 'build_author');
  const run = job.build?.ms?.run ?? stageMs('rendering'); // the stage's own time when the capture and the checks were not timed apart (older records)
  return {
    jobId: job.id, planHash: job.planHash ?? null, depth: job.plan?.depth ?? null, result: job.stage === 'ready' ? 'ready' : ['failed', 'cancelled'].includes(job.stage) ? 'failed' : 'running', stopReason: job.stopReason ?? null,
    oracleId: job.plan ? interactOracle(job.plan)?.id ?? null : null, oracleChecked: job.build?.check?.oracle?.checked ?? null, oracleFailed: count('numeric_mismatch', 'quantity_missing'),
    bindingProblems: count('binding_no_effect', 'control_no_effect') + problems.filter((p, i) => !codes[i] && /\bbinding\b/i.test(p)).length, overlapProblems: count('overlap'),
    repairs: t.repairs, authorModel: author?.served ?? author?.requested ?? null, fallbackFired: calls.some(c => c.fallback === true),
    judgeVerdict: judge?.verdict ?? null, judgeMajor: judge ? (judge.findings ?? []).filter(f => f.severity === 'major').length : null,
    costUsd: priced.length && priced.every(m => typeof m === 'number') ? priced.reduce((n, m) => n + m, 0) / 1e6 : null,
    msSteer: job.timing.steerMs ?? null, // TODO(integrator): interact-steer.js (item 5, Agent B) writes the measured JEV steer time to job.timing.steerMs
    msAuthor: stageMs('authoring'), msValidate: stageMs('validating'), msRun: run, msCheck: job.build?.ms?.check ?? null, msReview: stageMs('reviewing'), msRepair: stageMs('repairing'),
    msTotal: t.generateToResultMs,
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
