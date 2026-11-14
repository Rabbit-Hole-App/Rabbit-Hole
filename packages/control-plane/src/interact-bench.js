// The bench lane of /interact (build-half sprint item 3): after a card is delivered with INTERACT_REVIEW=shadow, one blind judge call scores it for the ledger.
// benchJudge(job, ctx) is the whole step: build the judge's input from the delivered candidate, make the ONE bench_judge call through callInteractRole (the profile's
// claude-sonnet-5-5, the job's own admitted transport), and return the record stored as job.bench.judge. It never throws a verdict into the job: the caller keeps the
// failure beside the card (job.bench.error) and the card stays ready (explain-job.js benchStep).
// Blind by construction (owner lesson 16): the input carries the plan's claims and observations, the trusted layout text, the frames and the traces; it carries no
// checkpoint "expected" text, no claim "check" text, no oracle value or verdict, and nothing that names the model, provider or number of tries behind the card.
import { sha256Hex } from '../../web/src/explain-program/contract.js';
import { BENCH_JUDGE_RUBRIC, BENCH_JUDGE_SCHEMA, BENCH_JUDGE_TOOL, BENCH_JUDGE_VERSION } from './agents/interact-bench-judge.js';
import { CHECK_LIMITS, buildPlanCaptureCases, compositionLayoutText } from './interact-checks.js';
import { callInteractRole } from './interact-models.js';
import { resolveTimeline } from '../../web/src/interact-composition.js';

export const benchRubric = async () => ({ version: BENCH_JUDGE_VERSION, hash: (await sha256Hex(BENCH_JUDGE_RUBRIC)).slice(0, 16) });

const round = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const rounded = (q = {}) => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, round(v)]));
const BUDGET = 70000; // bytes of input; the role's own ceiling is 80000 (INTERACT_ROLES.bench_judge.maxInputBytes)

// plan: the approved ScenePlan; cases: buildPlanCaptureCases' planned states; captures: the stored per-case records ({ caseId, trace, supports }); manifest: the main program's manifest (readout labels and units).
// Per state the judge also reads what a frame cannot show it: every drawn text and callout line by id (labels), the readout rows as the card words them, and what the scrubber reads (brief: the judge made readable).
export function benchJudgeInput(plan, composition, cases, captures, manifest = null) {
  const quantities = plan.scene.quantities.map(q => ({ id: q.id, label: q.label, unit: q.unit, meaning: q.meaning, reference: q.reference, ...(q.relation ? { relation: q.relation } : {}) }));
  const head = { title: plan.title, cardDescription: plan.cardDescription, story: plan.story, learningGoal: plan.learningGoal, depth: plan.depth, assumptions: plan.assumptions,
    mode: { kind: plan.mode.kind, fixedValues: plan.mode.fixedValues, timeline: plan.mode.timeline && { label: plan.mode.timeline.label, onInputChange: plan.mode.onInputChange } },
    scene: { description: plan.scene.description, quantities, observations: plan.scene.observations, checkpoints: plan.scene.checkpoints.map(c => ({ id: c.id, label: c.label })), readoutIds: plan.scene.readoutIds },
    supportingPanels: plan.supportingVisuals.map(s => ({ id: s.id, title: s.title, description: s.description, observations: s.observations })),
    controls: plan.controls.map(c => ({ id: c.id, label: c.label, type: c.type, affects: c.affects })), claims: plan.claims.map(c => ({ id: c.id, text: c.text })) };
  const shown = captures.filter(c => cases.some(k => k.id === c.caseId));
  // shortcut: when the frames do not fit the budget the drawn objects per capture are halved until they do (the traces and readouts always stay); raise the role's ceiling instead if that bites.
  for (let objects = 80; ; objects = Math.floor(objects / 2)) {
    const states = shown.map(c => { const k = cases.find(x => x.id === c.caseId), t = c.trace ?? {};
      const span = t.inputs && !t.error ? resolveTimeline(composition, t.inputs) : null, defs = new Map((manifest?.readouts ?? []).map(r => [r.id, r]));
      return { capture: c.caseId, label: k.label, time: round(t.time),
        ...(span ? { scrubber: { label: span.label, reads: round(t.time + span.displayOffset), range: [round(span.displayStart), round(span.displayEnd)], elapsed: round(t.time) } } : {}),
        ...(t.labels ? { labels: t.labels } : {}),
        ...(manifest ? { readoutRows: Object.entries(t.readouts ?? {}).map(([id, value]) => ({ id, label: defs.get(id)?.label, unit: defs.get(id)?.unit, value: round(value) })) } : {}), inputs: t.inputs, quantities: rounded(t.quantities), readouts: rounded(t.readouts), texts: (t.texts ?? []).slice(0, 12).map(s => String(s).slice(0, 80)), objects: (t.objects ?? []).slice(0, objects),
        supports: Object.fromEntries(Object.entries(c.supports ?? {}).map(([id, s]) => [id, { quantities: rounded(s.trace?.quantities), readouts: rounded(s.trace?.readouts), texts: (s.trace?.texts ?? []).slice(0, 12) }])) }; });
    const text = `${compositionLayoutText(plan, composition)}\n\nCard plan (claims and observations; no expected values are given):\n${JSON.stringify(head)}\n\nScheduled states of the card, frames and traces (no pixels exist):\n${JSON.stringify(states)}`;
    if (new TextEncoder().encode(text).length <= BUDGET || objects === 0) return text;
  }
}

// job: { id, plan, artifacts, composition, captures }; ctx: callInteractRole's ctx (env, profile, adapters). -> job.bench.judge
export async function benchJudge(job, ctx) {
  const { cases } = buildPlanCaptureCases(job.plan, job.composition, job.artifacts, { limit: CHECK_LIMITS.maxCases });
  const done = await callInteractRole(ctx, 'bench_judge', { system: BENCH_JUDGE_RUBRIC, schema: BENCH_JUDGE_SCHEMA, input: benchJudgeInput(job.plan, job.composition, cases, job.captures, job.artifacts?.main?.program?.manifest), name: BENCH_JUDGE_TOOL.name, description: BENCH_JUDGE_TOOL.description });
  return { model: done.served?.model ?? done.requested.model, verdict: done.output.verdict, findings: done.output.findings, ms: done.timing.ms, costMicros: done.costMicros, rubric: await benchRubric() };
}
