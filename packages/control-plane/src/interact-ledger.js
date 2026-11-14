// The benchmark ledger row of one /interact job (build-half sprint item 1): one flat object, factual columns first, speed columns after.
// Pure: it reads the job record (or the same fields rebuilt from a detail=1 response, jobFromDetail) and invents nothing; a number the record does not hold is null,
// never 0. The server puts the row on GET .../jobs/<id>?detail=1 as diagnostics.ledger, and scripts/interact/ledger.mjs appends it to the ledger file.
import { interactOracle } from './interact-oracle.js';
import { TOSS_MVP_META } from '../../web/src/interact-toss-mvp-plans.js';
import { timingSummary } from './explain-policy.js';
const round1 = n => Math.round(n * 10) / 10;
// A job pinned to toss-mvp-<depth> is a brief-mvp design; the model and the fill time come from the data file's meta of that depth (null when it has none).
const mvpDesign = fixture => { const depth = typeof fixture === 'string' ? /^toss-mvp-(brief|balanced|detailed)$/.exec(fixture)?.[1] : null, meta = depth ? TOSS_MVP_META[depth] : null; return { designModel: meta?.designModel ?? null, designKind: depth ? 'brief-mvp' : null, msFill: meta?.msFill ?? null }; };

// The design half of the row (brief 12). job.design.fast = { kind: 'fast'|'opus', model, calls, fallback: 'none'|'after_correction', costUsd } is written by the fast design path (INTERACT_DESIGN_KIND=fast); a job with no such record
// and no pinned fixture that made design calls is the Opus design ('opus'). designCalls and designCostUsd are the fast record's, else the sum of the design_* stage records (costUsd null when a call was unpriced).
// msDesign is submitted -> proposalReady, the Generate request admitted to awaiting_approval (the first time counts), null while the plan is not ready.
const designPart = (job, t, mvp) => {
  const fast = job.design?.fast ?? null, stages = t.stages.filter(s => s.stage.startsWith('design_')), calls = stages.reduce((n, s) => n + s.calls, 0), priced = stages.filter(s => s.model !== undefined && s.calls > 0);
  const dcalls = (job.calls ?? []).filter(c => c.role?.startsWith('design_') && c.status !== 'refused'), opus = !fast && !job.designFixture && calls > 0, model = stages.find(s => s.model)?.model;
  const stageCost = priced.length && priced.every(s => typeof s.costMicros === 'number') ? priced.reduce((n, s) => n + s.costMicros, 0) / 1e6 : null;
  return { designModel: fast?.model ?? (opus || fast ? model?.served ?? model?.requested ?? null : mvp.designModel), designKind: fast?.kind ?? (opus ? 'opus' : mvp.designKind), msFill: mvp.msFill, designFallback: fast ? fast.fallback ?? 'none' : null,
    designCalls: fast || opus ? (dcalls.length || fast?.calls || calls) : null, msDesign: fast || opus ? t.proposalMs : null, designCostUsd: fast || opus ? (dcalls.length ? (dcalls.every(c => typeof c.costMicros === 'number') ? dcalls.reduce((n, c) => n + c.costMicros, 0) / 1e6 : null) : fast?.costUsd || stageCost) : null,
    // brief 13: the pick of a fast design (a family id, or 'gap'), its confidence and its wall-clock; null when no pick ran.
    pickFamily: fast?.pick ? fast.pick.family ?? 'gap' : null, pickConfidence: fast?.pick?.confidence ?? null, msPick: fast?.pick?.ms ?? null,
    // brief 14: who approved the plan: the system ('fast-path', no approval pause) or the learner; null while there is no approval.
    approvedBy: job.approval ? job.approval.by ?? 'learner' : null };
};

// timing: 'v2' is a job whose stage columns are the contiguous wall-clock slices ledgerRow explains (they add up to msTotal); 'v1' is every older row, kept as it was recorded.
export const LEDGER_COLUMNS = Object.freeze(['jobId', 'planHash', 'depth', 'result', 'stopReason', 'oracleId', 'oracleChecked', 'oracleFailed', 'bindingProblems', 'overlapProblems', 'repairs', 'repairCauses',
  'profile', 'fixture', 'authorModel', 'fallbackFired', 'judgeVerdict', 'judgeMajor', 'judgeCostUsd', 'costUsd', 'msSteer', 'msAuthor', 'msValidate', 'msRun', 'msCheck', 'msCompose', 'msReview', 'msRepair', 'msTotal', 'msJudge', 'timing', 'buildKind', 'msHopWait', 'judgeFindingsPath', 'designModel', 'designKind', 'msFill', 'designFallback', 'designCalls', 'msDesign', 'designCostUsd', 'pickFamily', 'pickConfidence', 'msPick', 'approvedBy']);

// What triggered each failed round, in order, `;`-joined, one token per distinct problem of a round: `overlap:text-frame` (a layout rule), `numeric_mismatch` (an oracle code),
// `program_error:sdk.panel` or `program_error:frame.objects.*.series.*.points` (the guest program's own error), `schema:manifest.readouts.*.labels` (the path a validation problem names),
// `review:<category>` (a review finding). Read off job.findings, where every failed round keeps its problems, so a ready job's last, accepted round adds nothing.
const generic = text => text.replace(/\b\d+\b/g, '*');
export function problemCause(problem) {
  const text = String(problem), coded = /^\[(\w+)\]\s*([\s\S]*)$/.exec(text);
  if (!coded) return `schema:${generic(/^main:\s*([\w.]+):/.exec(text)?.[1] ?? /^([\w.]+):/.exec(text)?.[1] ?? text.slice(0, 40))}`;
  const [, code, rest] = coded;
  if (code === 'convention') return `convention:${/^"([^"]+)"/.exec(rest)?.[1] ?? 'unknown'}`;
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
  // A template build (interact-template.js) has no provider round trip and its columns are the true body durations, timed with the monotonic clock in each stage (build.ms: gen, validate, run, check, compose);
  // msHopWait is what is left of msTotal: the wait for the next alarm between the stages, the job's own writes and the platform's. The model-build columns above keep their wall-clock slices.
  const template = job.build?.kind === 'template', bms = job.build?.ms ?? {};
  const stages = template ? { msAuthor: null, msValidate: bms.validate ?? null, msRun: bms.run ?? null, msCheck: bms.check ?? null, msCompose: bms.gen != null ? round1(bms.gen + (accept ?? 0)) : null } : null;
  const hopWait = template && t.generateToResultMs != null ? Math.max(0, round1(t.generateToResultMs - (job.timing.steerMs ?? 0) - ['msValidate', 'msRun', 'msCheck', 'msCompose'].reduce((n, k) => n + (stages[k] ?? 0), 0))) : null;
  return {
    jobId: job.id, planHash: job.planHash ?? null, depth: job.plan?.depth ?? null, result: job.stage === 'ready' ? 'ready' : ['failed', 'cancelled'].includes(job.stage) ? 'failed' : 'running', stopReason: job.stopReason ?? null,
    oracleId: job.plan ? interactOracle(job.plan)?.id ?? null : null, oracleChecked: job.build?.check?.oracle?.checked ?? null, oracleFailed: count('numeric_mismatch', 'quantity_missing'),
    bindingProblems: count('binding_no_effect', 'control_no_effect') + problems.filter((p, i) => !codes[i] && /\bbinding\b/i.test(p)).length, overlapProblems: count('overlap'),
    repairs: t.repairs, repairCauses: repairCauses(job.findings), profile: job.flow?.profile?.id ?? null, fixture: job.designFixture ?? null, authorModel: template ? 'template' : author?.served ?? author?.requested ?? null, fallbackFired: calls.some(c => c.fallback === true),
    judgeVerdict: judge?.verdict ?? null, judgeMajor: judge ? (judge.findings ?? []).filter(f => f.severity === 'major').length : null,
    judgeCostUsd: judgeMicros === undefined ? null : typeof judgeMicros === 'number' ? judgeMicros / 1e6 : null,
    costUsd: priced.length && priced.every(m => typeof m === 'number') ? priced.reduce((n, m) => n + m, 0) / 1e6 : null,
    msSteer: job.timing.steerMs ?? null, // interact-job.js buildStage writes the measured JEV steer time (interact-steer.js) to job.timing.steerMs
    ...(stages ?? { msAuthor: providerMs ?? authoring, msValidate: stageMs('validating'), msRun: run, msCheck: check, msCompose: compose }), msReview: stageMs('reviewing'), msRepair: stageMs('repairing'),
    // A fast-path job is approved by the system the instant its plan is ready (brief 14): its one number is prompt admitted -> ready (the plan's time plus the build's).
    msTotal: job.approval?.by === 'fast-path' && t.proposalMs != null && t.generateToResultMs != null ? round1(t.proposalMs + t.generateToResultMs) : t.generateToResultMs, msJudge: judge?.ms ?? null, timing: job.timing.v === 2 ? 'v2' : 'v1',
    buildKind: template ? 'template' : calls.some(c => c.role === 'build_author') ? 'model' : null, msHopWait: hopWait,
    judgeFindingsPath: null, // set by scripts/interact/ledger.mjs when it writes the judge's findings to benchmarks/judge/<jobId>.json (the row itself stays pure)
    // A job pinned to a toss-mvp-<depth> fixture (the design MVP, brief 11): which model wrote the plan brief, that the design was a brief, and how long the fill took, from the data file's TOSS_MVP_META (the bench row the plan was picked from).
    ...designPart(job, t, mvpDesign(job.designFixture)),
  };
}

// The job-shaped fields of a detail=1 response ({ job, scenePlan, diagnostics }), for a run the server did not compute a row for (the saved evidence, an older clone).
export const jobFromDetail = ({ job, scenePlan, diagnostics: d }) => ({ id: job.id, plan: scenePlan?.plan, planHash: scenePlan?.hash ?? null, stage: job.stage, stopReason: job.stopReason,
  calls: d.calls, timing: d.timing, findings: d.findings, build: d.build ?? null, bench: d.bench ?? null, ...(d.designFast ? { design: { fast: d.designFast } } : {}) }); // designFast: the fast design record the clone exposes (diagnostics), so a saved response keeps the design and pick columns

// The ledger table: the same columns, factual first; a null cell is empty.
export const ledgerMarkdown = rows => {
  const cell = v => (v === null || v === undefined ? '' : String(v).replace(/\|/g, '/'));
  return `${['| ' + LEDGER_COLUMNS.join(' | ') + ' |', '|' + LEDGER_COLUMNS.map(() => ' --- ').join('|') + '|', ...rows.map(r => '| ' + LEDGER_COLUMNS.map(c => cell(r[c])).join(' | ') + ' |')].join('\n')}\n`;
};
