// /interact bench judge (build-half sprint item 3): the system prompt and structured output of the blind judge that scores a delivered card AFTER it is ready
// (INTERACT_REVIEW=shadow), for the benchmark ledger. It is a measurement, never a gate: nothing it says changes the card or its stage.
// Owner rules: the model is claude-sonnet-5-5, never Opus (interact-models.js bench_judge); it is blind to provider identity (nothing in its input names the model that
// built the card); and (owner lesson 16, 2026-11-12) it never sees the oracle's verdict or expected values: it scores, the oracle checks. So its input holds the plan's
// claims and observations, the frames and the traces, and not the plan's checkpoint "expected" text, a claim's "check" text or any oracle number.
// The rules are build_review's (interact-checks.js INTERACT_REVIEW_RULES_PARTIAL, REVIEW_SYSTEM) minus anything that needs pixels. Bump BENCH_JUDGE_VERSION with any wording
// change; the ledger stores the version and the hash of the text (the pattern of scripts/explain-bench/judge.mjs).
export const BENCH_JUDGE_VERSION = 'bench-judge-v1 2026-11-13';
export const BENCH_JUDGE_TOOL = Object.freeze({ name: 'report_bench_judgment', description: 'Report one verdict for the card and a finding for each problem. Call it exactly once.' });

export const BENCH_JUDGE_RUBRIC = `You are an independent, blind judge of a learning card built from an approved scene plan. You did not build it and you are not told how, by what, or in how many tries. You cannot see pixels: you receive the plan's claims and observations, the trusted card layout as text, and for each scheduled state of the card its frame (every drawn object with its position, size and text, and every readout) and its runtime trace (the exact quantities the program reported). Judge only what these show. You are not told the expected numbers: work them out from the plan's quantities, the fixed values and the physics, then compare them with the traces.
- For every required observation and every checkpoint (named by id and label only), find the capture that shows it and say whether the frame and trace support it. An observation or control effect you cannot judge from what you were shown is a finding, not a pass.
- Check that each claim in the plan is true of the card as traced, that signs, units and directions match the plan's quantities, and that each panel's drawn objects and readouts agree with its traced quantities (a drawn position, length or label that contradicts a traced number is a finding).
- A readout or label that contradicts the card's own claim (for example 'a = 0' on a card whose claim is that the acceleration is -9.8 m/s^2 at v = 0) is a major finding unless the scene says why.
- Check that no scene draws the Story or the description as text, the displayed time range in the layout text against the plan's timeline, and the description against the Story for meaning and any scientific qualification; flag a number in the description that the plan does not support.
- Do not report layout you cannot judge without pixels (clipping, colour, exact overlap of drawn text); say in a finding when a behaviour cannot be judged from frames and traces.
Severity: blocker = the card teaches something false or cannot be used; major = a claim, readout or required observation is wrong or unsupported; minor = imprecise but not misleading. Category: spec = what the program draws, computes or lays out (the usual one); source, component, renderer, budget only when the problem is not the program's own output.
verdict: pass only when there is no blocker and no major finding; otherwise fail. Name the capture (and the object when you can) each finding concerns. Call report_bench_judgment exactly once.`;

export const BENCH_JUDGE_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, required: ['verdict', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['capture', 'category', 'severity', 'message'], properties: {
      capture: { type: 'string', maxLength: 64 },
      object: { type: 'string', maxLength: 64 },
      category: { type: 'string', enum: ['source', 'spec', 'component', 'renderer', 'budget'] },
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      message: { type: 'string', maxLength: 400 },
    } } },
  },
});
