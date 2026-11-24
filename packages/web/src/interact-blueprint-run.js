// Runs a blueprint's math function in the pinned QuickJS engine, never as native JavaScript (Brief 38 spec section 5). The function is wrapped so it sees neither the sdk nor anything of ours.
// How the numbers travel out: the checker's guest module exports the card's own `evaluate`, but its `state` argument carries a list of times; the guest calls compute once per time at the one
// setting in `inputs`, checks every declared output in the guest, and returns { rows: [{ id: value }], problems } as the module's plain result (runProgram returns it as out.value; no frame is built).
// One call runs many times at once (BATCH_TIMES) inside the engine's 50 ms; a call that runs out of time is split.
import { loadEngine, runProgram } from './explain-program/runtime.js';
import { BATCH_TIMES } from './interact-blueprint-constants.js';

let engine, engineWasm;
export const provideBlueprintEngineWasm = wasmModule => { engineWasm = wasmModule; }; // a Worker bundles the wasm and hands it over once (dev-worker.js); Node loads the engine itself
const engineOnce = async () => (engine ??= await loadEngine(undefined, engineWasm));

// shadowed names: the function cannot reach the sdk, the checker's own bindings or the module's exports
export const getEngine = engineOnce;
export const guestSource = (code, outputs) => `const compute = (function (sdk, DECLARED, evaluate, run) {
${code}
;
return compute;
})(undefined, undefined, undefined, undefined);
const DECLARED = ${JSON.stringify(outputs.map(({ id, kind }) => ({ id, kind })))};
export function evaluate({ inputs, state }) {
  const rows = [], problems = [];
  const sweep = typeof state.over === 'string' && Array.isArray(state.values), count = sweep ? state.values.length : state.times.length;
  for (let k = 0; k < count; k++) {
    const time = sweep ? state.times[0] : state.times[k], given = JSON.parse(JSON.stringify(inputs));
    if (sweep) given[state.over] = state.values[k];
    let out;
    try { out = compute(given, time); } catch (error) { return { rows, problems, thrown: String(error && error.message), at: time }; }
    if (!out || typeof out !== 'object') return { rows, problems, thrown: 'compute returned ' + (out === null ? 'null' : typeof out) + ', not an object', at: time };
    const row = {};
    for (const entry of DECLARED) {
      const value = out[entry.id];
      if (value === undefined) { problems.push({ id: entry.id, why: 'missing', at: time }); continue; }
      if (entry.kind === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) { problems.push({ id: entry.id, why: 'not_finite', at: time, got: typeof value === 'number' ? String(value) : typeof value }); continue; } }
      else if (entry.kind === 'flag') { if (typeof value !== 'boolean') { problems.push({ id: entry.id, why: 'not_flag', at: time, got: typeof value }); continue; } }
      row[entry.id] = value;
    }
    rows.push(row);
  }
  return { rows, problems };
}`;

// -> { ok, rows, problems, thrown?, at?, ms, error? }. error: { code, detail } when the engine refused the source or ran out of time on a single time.
export async function runBatch(source, inputs, times, now = () => performance.now()) {
  const eng = await engineOnce(), started = now();
  const call = chunk => runProgram(eng, { source, request: { requestId: '1', inputs, time: 0, seed: 0, state: { times: chunk } }, sdkVersion: 'sdk-8' });
  const rows = [], problems = [];
  let thrown = null, at = null;
  const take = chunk => {
    const out = call(chunk);
    if (!out.ok) {
      if (out.code === 'runtime_limit' && chunk.length > 1) { const half = Math.ceil(chunk.length / 2); return take(chunk.slice(0, half)) ?? take(chunk.slice(half)); }
      return { error: { code: out.code, detail: out.detail } };
    }
    rows.push(...out.value.rows); problems.push(...out.value.problems);
    if (out.value.thrown) { thrown = out.value.thrown; at = out.value.at; return 'thrown'; }
    return null; // null: this chunk is done, go on
  };
  for (let i = 0; i < times.length; i += BATCH_TIMES) {
    const result = take(times.slice(i, i + BATCH_TIMES));
    if (result?.error) return { ok: false, rows, problems, error: result.error, ms: now() - started };
    if (result === 'thrown') break;
  }
  return { ok: !thrown, rows, problems, ...(thrown ? { thrown, at } : {}), ms: now() - started };
}

// A graph drawn against a control: the function is called once per value of `over`, at `time`, with the other inputs as given. -> { ok, rows, problems, ... } like runBatch, one row per value (the guest's `evaluate` reads
// state.over and state.values; before 2026-11-24 it read state.times only, so every sweep returned one row and a graph over a control read flat). A call that runs out of time is split in halves, as runBatch splits one (96 values run inside one 50 ms call).
export async function runSweep(source, inputs, over, values, time, now = () => performance.now()) {
  const eng = await engineOnce(), started = now();
  const call = chunk => runProgram(eng, { source, request: { requestId: '1', inputs, time: 0, seed: 0, state: { times: [time], over, values: chunk } }, sdkVersion: 'sdk-8' });
  const rows = [], problems = [];
  let thrown = null;
  const take = chunk => {
    const out = call(chunk);
    if (!out.ok) {
      if (out.code === 'runtime_limit' && chunk.length > 1) { const half = Math.ceil(chunk.length / 2); return take(chunk.slice(0, half)) ?? take(chunk.slice(half)); }
      return { error: { code: out.code, detail: out.detail } };
    }
    rows.push(...out.value.rows); problems.push(...out.value.problems);
    if (out.value.thrown) { thrown = out.value.thrown; return 'thrown'; }
    return null; // null: this chunk is done, go on
  };
  const result = take(values);
  if (result?.error) return { ok: false, rows, problems, error: result.error, ms: now() - started };
  return { ok: !thrown, rows, problems, ...(thrown ? { thrown, at: time } : {}), ms: now() - started };
}

// A runner for one blueprint: run(inputs, times) -> the same as runBatch, with the source made once.
export function blueprintRunner(blueprint) {
  const source = guestSource(blueprint.math.code, blueprint.math.outputs);
  return { source, run: (inputs, times) => runBatch(source, inputs, times), sweep: (inputs, over, values, time) => runSweep(source, inputs, over, values, time) };
}
