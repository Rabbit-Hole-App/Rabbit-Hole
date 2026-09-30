// Tutor v2 turn-level tracing (docs/features/tutor-architecture-v2.md "Tracing"). One trace per
// Tutor turn: a trace_id, and per stage its start offset, duration, status (ok / error / timeout)
// and a short result category. No secrets, no learner text: stages record categories and counts.
// Stages: target_resolution, practice_evaluation, claim_selection, evaluate (with the worker's own
// jev / larger timings), evidence_reconciliation, router, planner, action_validation; the UI adds
// first_visible_response and canvas_action_complete marks.
const statusOf = error => /timed? ?out|timeout|abort/i.test(error?.message || '') ? 'timeout' : 'error';

export function turnTrace(now = () => performance.now()) {
  const t0 = now();
  const offset = () => +(now() - t0).toFixed(1);
  const trace = { trace_id: crypto.randomUUID(), started_at: new Date().toISOString(), stages: [], marks: {} };
  const record = (stage, start, status, result) => trace.stages.push({ stage, start_ms: start, ms: +(offset() - start).toFixed(1), status, result });
  return {
    trace,
    // Runs one stage; `category` turns its value into the recorded result. Errors are recorded and rethrown.
    async step(stage, run, category = () => null) {
      const start = offset();
      try { const value = await run(); record(stage, start, 'ok', category(value)); return value; }
      catch (error) { record(stage, start, statusOf(error), String(error?.message || error).slice(0, 160)); throw error; }
    },
    // A stage timed elsewhere (the worker's JEV and larger evaluator), placed inside its parent.
    add: (stage, ms, status, result = null) => trace.stages.push({ stage, start_ms: null, ms, status, result }),
    mark: name => { trace.marks[name] = offset(); },
  };
}
