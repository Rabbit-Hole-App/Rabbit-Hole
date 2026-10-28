// The guest interpreter adapter: generated /explain source runs only inside a pinned QuickJS/WASM engine, never as native
// JavaScript. Each operation gets a fresh QuickJS runtime and context (no state survives between calls), one deadline that
// covers SDK and source load, evaluate and serialization, and guest heap/stack caps. The guest has the ECMAScript built-ins only:
// no host function is ever exposed to it, module imports are refused (no loader is set), Date is absent and Math.random is
// seeded from the request. Pending jobs (promise callbacks) are never run. Host watchdog/termination is host.js's job.
//
// The authoring format, exactly: the source is one ES module whose named export is
//   export function evaluate({ inputs, time, seed, state }) { ...; return { frame, quantities }; }
// It is synchronous and has no imports (static import fails at load, import() never loads anything). The SDK (sdk.js) is the
// global `sdk`, defined before the module runs. A source without that named export (a plain global function evaluate, a
// default export) is invalid_program.
import { DefaultIntrinsics, QuickJSWASMModule, newVariant } from 'quickjs-emscripten-core';
import { QuickJSFFI } from '@jitl/quickjs-wasmfile-release-sync/ffi';
import emscriptenModule from '@jitl/quickjs-wasmfile-release-sync/emscripten-module';
import { LIMITS } from './limits.js';
import { SDK_SOURCE } from './sdk.js';

// The release-sync variant, with its two parts imported statically instead of through the package's dynamic import(), so the
// Worker bundle is self-contained: page-worker.js starts it from a Blob, where it can fetch nothing of its own.
const variant = { type: 'sync', importFFI: async () => QuickJSFFI, importModuleLoader: async () => emscriptenModule };

// One WASM instance per Worker; a failed instance is replaced by loading another. Its linear memory is capped: QuickJS's own
// heap limit is not reliable in this build (it counts malloc_usable_size, which the WASM build lacks, so large arrays and
// typed arrays passed a 16 MiB limit up to 2 GiB in runtime.test.mjs). The WASM maximum is the hard memory bound.
// wasmModule: an already compiled engine (page-worker.js hands one over), so nothing is fetched.
// shortcut: these lines are newQuickJSWASMModuleFromVariant (0.32.0) minus its dynamic import() of the module class, which would
// be a separate chunk the Blob-started Worker cannot fetch; re-check them when the pinned version changes.
export async function loadEngine(limits = LIMITS, wasmModule) {
  const loader = await newVariant(variant, {
    wasmMemory: new WebAssembly.Memory({ initial: 256, maximum: limits.wasmBytes / 65536 }),
    ...(wasmModule ? { wasmModule } : {}),
  }).importModuleLoader();
  const wasm = await loader();
  wasm.type = 'sync';
  return new QuickJSWASMModule(wasm, new QuickJSFFI(wasm));
}

// Trusted guest-side helpers, made before any guest source runs so guest changes to JSON or String cannot replace them.
// Math.random becomes mulberry32 over the request seed: reproducible, no host entropy.
// serialize is JSON.stringify with a replacer that keeps a lower bound on the output's length while the walk runs (after each
// getter and toJSON): past maxBytes it throws, so an oversized result stops before its string is built. Every UTF-16 unit is
// at least one UTF-8 byte, so the bound never refuses a result that fits; the host still measures the exact bytes.
const prelude = (seed, maxBytes) => `(() => {
  let s = ${seed >>> 0};
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const slice = Function.prototype.call.bind(String.prototype.slice), str = String, isArray = Array.isArray, stringify = JSON.stringify, finite = Number.isFinite;
  const describe = e => { try { return slice(str(e && e.name), 0, 40) + ': ' + slice(str(e && e.message), 0, 200); } catch { return 'unprintable error'; } };
  const serialize = value => {
    let size = 0;
    return stringify(value, function (key, v) {
      const t = typeof v;
      if (t === 'undefined' || t === 'function' || t === 'symbol') return v;
      if (key !== '' && !isArray(this)) size += key.length + 3;
      size += t === 'string' ? v.length + 2 : t === 'number' ? (finite(v) ? str(v).length : 4) : t === 'boolean' ? 4 : 2;
      if (size > ${maxBytes | 0}) throw new RangeError('output over its size limit');
      return v;
    });
  };
  return [JSON.parse, serialize, describe];
})()`;

const LIMIT_MESSAGES = /^InternalError: (out of memory|stack overflow|interrupted|string too long)|^RangeError: (Maximum call stack|invalid array length)/;
const encoder = new TextEncoder();

// Depth of a parsed JSON value, stopping as soon as it exceeds max (so the walk itself stays bounded).
const tooDeep = (value, max, depth = 1) => depth > max || (value !== null && typeof value === 'object'
  && Object.values(value).some(child => tooDeep(child, max, depth + 1)));

// runProgram(engine, { source, request: { inputs, time, seed, state } }) -> { ok: true, value, metrics } |
// { ok: false, code, phase, detail, metrics }. detail is bounded guest text for logs/review, never for the learner.
export function runProgram(engine, { source, request }, limits = LIMITS) {
  const started = performance.now();
  const metrics = () => ({ ms: performance.now() - started, wasmBytes: engine.getWasmMemory().buffer.byteLength });
  const fail = (code, phase, detail) => ({ ok: false, code, phase, detail, metrics: metrics() });
  if (typeof source !== 'string' || encoder.encode(source).length > limits.sourceBytes) return fail('invalid_program', 'load', 'source is missing or over its size limit');
  const input = JSON.stringify({ inputs: request.inputs ?? {}, time: request.time ?? 0, seed: request.seed ?? 0, state: request.state ?? null });
  if (encoder.encode(JSON.stringify(request.state ?? null)).length > limits.stateBytes) return fail('runtime_limit', 'load', 'state is over its size limit');

  const runtime = engine.newRuntime();
  const handles = [];
  let context, interrupted = false;
  try {
    runtime.setMemoryLimit(limits.heapBytes);
    runtime.setMaxStackSize(limits.stackBytes);
    // Two deadlines, one handler. The host's own setup (context, prelude, SDK: trusted code, the same for every program, slowest on a cold
    // engine) is bounded by the host watchdog; the program's work (loading ITS source, evaluate, serialization) then gets exactly
    // limits.interruptMs, started after the SDK is in, over ALL generated execution (top-level source, evaluate, serialization). A setup that fails or
    // is interrupted is the host's (phase setup), never the program's. This is not a warm-up: a cold engine still pays its setup.
    let deadline = performance.now() + limits.watchdogMs;
    runtime.setInterruptHandler(() => interrupted ||= performance.now() > deadline); // started before any code runs
    const keep = handle => (handles.push(handle), handle);
    let parse, serialize, describe;
    try {
      context = runtime.newContext({ intrinsics: { ...DefaultIntrinsics, Date: false } });
      const helpers = keep(context.unwrapResult(context.evalCode(prelude(Number(request.seed) || 0, limits.outputBytes), 'prelude.js', { type: 'global' })));
      [parse, serialize, describe] = [0, 1, 2].map(i => keep(context.getProp(helpers, i)));
      keep(context.unwrapResult(context.evalCode(SDK_SOURCE, 'sdk.js', { type: 'global' }))); // the generic SDK (one global, sdk)
    } catch (error) {
      // The bound was hit: a time limit, in the setup phase. Any other exception in trusted setup is a runtime error in the same phase.
      return interrupted ? fail('runtime_limit', 'setup', 'setup time limit') : fail('runtime_error', 'setup', `setup failed: ${String(error?.message ?? error).slice(0, 200)}`);
    }
    deadline = performance.now() + limits.interruptMs;
    // A guest exception: limit hit, else its bounded description (read in the guest, still under the deadline).
    const guestFail = (error, code, phase) => {
      keep(error);
      if (interrupted) return fail('runtime_limit', phase, 'time limit');
      const text = context.callFunction(describe, context.undefined, error);
      const detail = text.error ? (keep(text.error), 'unprintable error') : context.getString(keep(text.value));
      if (interrupted) return fail('runtime_limit', phase, 'time limit'); // the deadline passed while describing the error
      return fail(LIMIT_MESSAGES.test(detail) ? 'runtime_limit' : code, phase, detail);
    };

    // The generated module, under the program's deadline and the same limits.
    const loaded = context.evalCode(source, 'program.js', { type: 'module' });
    if (loaded.error) return guestFail(loaded.error, 'invalid_program', 'load');
    const evaluate = keep(context.getProp(keep(loaded.value), 'evaluate'));
    if (context.typeof(evaluate) !== 'function') return fail('invalid_program', 'load', 'the program must export function evaluate({ inputs, time, seed, state })');

    const arg = context.callFunction(parse, context.undefined, keep(context.newString(input)));
    if (arg.error) return guestFail(arg.error, 'runtime_error', 'evaluate');
    const out = context.callFunction(evaluate, context.undefined, keep(arg.value));
    if (out.error) return guestFail(out.error, 'runtime_error', 'evaluate');

    // Serialize inside the guest, bounded and under the same deadline; measure the string before copying it out.
    const text = context.callFunction(serialize, context.undefined, keep(out.value));
    if (text.error) return guestFail(text.error, 'invalid_output', 'serialize');
    keep(text.value);
    if (context.typeof(text.value) !== 'string') return fail('invalid_output', 'serialize', 'the result is not JSON');
    if (context.getNumber(keep(context.getProp(text.value, 'length'))) > limits.outputBytes) return fail('invalid_output', 'serialize', 'output over its size limit');
    const json = context.getString(text.value);
    const outputBytes = encoder.encode(json).length;
    if (outputBytes > limits.outputBytes) return fail('invalid_output', 'serialize', 'output over its size limit');
    let value;
    try { value = JSON.parse(json); } catch { return fail('invalid_output', 'serialize', 'the result is not JSON'); }
    if (value === null || typeof value !== 'object' || tooDeep(value, limits.outputDepth)) return fail('invalid_output', 'serialize', 'the result is not a bounded JSON object');
    return { ok: true, value, metrics: { ...metrics(), outputBytes } };
  } finally {
    for (const handle of handles.reverse()) if (handle.alive) handle.dispose();
    context?.dispose();
    runtime.dispose();
  }
}
