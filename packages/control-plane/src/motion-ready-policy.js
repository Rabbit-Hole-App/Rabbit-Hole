// The Motion readiness policies as DATA. Two exist, and which one applies is decided by one worker variable, MOTION_RENDERER_CONFIG:
//
//   unset (production today, and after a deploy that does not activate): LEGACY_READY_POLICY. It reproduces what production does now, exactly:
//     16:9 only, any whole second from 5 to 30, no ratio choice. Deploying this code changes no supported setting. 35 to 60 s and every other
//     ratio stay visible on the card and are refused with the not-ready line.
//   set to MEASURED_RENDERER_CONFIG (the activation, one line in each of the two config files): MEASURED_READY_POLICY, an allowlist of
//     (ratio, duration) pairs that a receipt shows rendering on the measured renderer. Nothing is interpolated: passing at 15 s and at 30 s
//     does not enable 20 s. A set variable that names another configuration makes nothing ready.
//   MOTION_READY_POLICY (a worker variable) overrides both; tests use it.
//
// WHAT "READY" MEANS, AND WHAT IT DOES NOT. A ready pair says: a FIXTURE scene (simple or medium, written by validation-fixtures.js) of that ratio
// and duration rendered inside the 420 s limit on the measured renderer with identical determinism hashes, or one model-built composition did,
// once. It is NOT a capacity check and NOT a promise for the composition a model writes next:
//   - The static gate (composition-limits.js) counts tags and elements in the SOURCE TEXT. The fixtures build their layers in loops, so simple,
//     medium AND the heavy fixtures that timed out at 420 s (D18, D20, D21) all measure as class "simple" (1 layer, 9 elements). The `complexity`
//     field below therefore names the only class ever measured; it does not separate a composition that renders from one that times out.
//   - What can really be enforced before rendering: the (ratio, duration) allowlist; the stage size and frame count; the storyboard's object
//     appearances by duration (storyboard-check.js); the Author's effort by storyboard size; the contract and static-safety checks on the
//     source; the source byte cap; the renderer's code identity (the orchestrator refuses a renderer whose code hash is not its own).
//   - What stays uncertain until it has rendered: render time (loops, computed element counts, effects), memory, per-frame cost, the 25 MB
//     output cap at long durations, and layout quality (overlap, clipping). A timeout or capacity failure is a renderer failure and charges the
//     learner zero credits; the platform pays the model spend.

// Set MOTION_RENDERER_CONFIG to this id (and only then) to activate the measured policy.
export const MEASURED_RENDERER_CONFIG = '03f2a1efc08e-1.5cpu-3gib-420s';
export const MEASURED_RENDERER_REVISION = '03f2a1efc08e8d5c0d73aadced534b614c13f3d5';
// The renderer CODE the receipts were taken on: the 12-hex hash the service reports in /health `version` ("motion-renderer-1-<hash>/...") and
// the orchestrator checks (orchestrator.mjs rendererCodeHashes). A test compares it with this checkout's hash, so editing a renderer file after
// the measurement fails CI until the pairs are measured again.
export const MEASURED_RENDERER_CODE_HASH = '02d5069eeb4d';
export const MEASURED_POLICY_VERSION = 'p2-03f2a1efc08e';
export const LEGACY_POLICY_VERSION = 'legacy-5-30';

const cell = (ratio, seconds, scene, receipt, service_total_s, extra = {}) => Object.freeze({ ratio, seconds, scene, receipt, service_total_s, ...extra });

// Passing deterministic runs (matrix "c4", dev renderer at the revision above, 18 of 21 passed; "c5" 2026-10-25, the same renderer, adds the
// 10, 20 and 25 s steps at 16:9 so that activating the policy does not narrow the durations production offers today, and 30 s at the seven
// other ratios that had no 30 s receipt; 10 of 10 passed). service_total_s is the service's total
// against the 420 s limit. `withheld` keeps a passing pair OUT of the first expanded release (owner 2026-10-25: 45 and 60 s stay visible with
// their readiness explanation but unavailable until a model-built 60 s video has completed); the receipt stays as evidence.
const LONG = 'withheld from the first expanded release: 45 and 60 s wait for a model-built 60 s video to complete';
export const PASSED = Object.freeze([
  cell('16:9', 5, 'medium', 'mv-D10-c4', 63.89),
  cell('16:9', 10, 'medium', 'mv-E10-c5', 94.61),
  cell('16:9', 15, 'medium', 'mv-D01-c4', 120.73),
  cell('16:9', 20, 'medium', 'mv-E20-c5', 144.25),
  cell('16:9', 25, 'medium', 'mv-E25-c5', 166.83),
  cell('16:9', 30, 'medium', 'mv-D11-c4', 197.17),
  cell('1:1', 30, 'medium', 'mv-F30-11-c5', 160.98),
  cell('3:4', 30, 'medium', 'mv-F30-34-c5', 181.11),
  cell('4:3', 30, 'medium', 'mv-F30-43-c5', 178.38),
  cell('2:3', 30, 'medium', 'mv-F30-23-c5', 180.21),
  cell('3:2', 30, 'medium', 'mv-F30-32-c5', 178.88),
  cell('4:5', 30, 'medium', 'mv-F30-45-c5', 178.96),
  cell('5:4', 30, 'medium', 'mv-F30-54-c5', 177.75),
  cell('16:9', 45, 'medium', 'mv-D12-c4', 271.3, { withheld: LONG }),
  cell('16:9', 60, 'medium', 'mv-D13-c4', 347.68, { withheld: LONG }),
  cell('9:16', 15, 'medium', 'mv-D02-c4', 121.47),
  cell('1:1', 15, 'medium', 'mv-D03-c4', 100.46),
  cell('3:4', 15, 'medium', 'mv-D04-c4', 113.14),
  cell('4:3', 15, 'medium', 'mv-D05-c4', 112.06),
  cell('2:3', 15, 'medium', 'mv-D06-c4', 110.11),
  cell('3:2', 15, 'medium', 'mv-D07-c4', 113.22),
  cell('4:5', 15, 'medium', 'mv-D08-c4', 111.44),
  cell('5:4', 15, 'medium', 'mv-D09-c4', 112.75),
  cell('9:16', 60, 'medium', 'mv-D14-c4', 344.97, { withheld: LONG }),
  cell('1:1', 60, 'medium', 'mv-D15-c4', 277.68, { withheld: LONG }),
  cell('3:4', 60, 'medium', 'mv-D16-c4', 320.3, { withheld: LONG }),
  cell('16:9', 15, 'simple', 'mv-D17-c4', 108.58),
  cell('16:9', 60, 'simple', 'mv-D19-c4', 307.92, { withheld: LONG }),
]);

// Model-built videos that went through the whole path (Director, storyboard, Author, reviews, final render with determinism) on the same
// renderer. One sample each: they enable their own pair and say nothing about a rate. (The 30 s portrait pair has no fixture receipt.)
export const MODEL_RUNS = Object.freeze([
  cell('16:9', 15, 'model: /motion 15s softmax', 'mmr-M1-2', null, { model_run: true }),
  cell('9:16', 30, 'model: MLP block (approved proposal)', 'mmr-M2-r2', null, { model_run: true }),
  cell('9:16', 15, 'model: /motion 15s softmax, portrait', 'mmr-M4', null, { model_run: true }),
  cell('16:9', 10, 'model: /motion 10s softmax (patch repair used)', 'mmr-M5', null, { model_run: true }),
]);

// Runs that hit the 420 s limit (recorded once, not repeated). They do not disable a pair a lighter scene passed; they bound what the
// enabled pairs mean (see the note at the top).
export const TIMED_OUT = Object.freeze([
  cell('16:9', 15, 'heavy', 'mv-D18-c4', null),
  cell('16:9', 60, 'heavy', 'mv-D20-c4', null),
  cell('16:9', 60, 'heavy (preview job alone)', 'mv-D21-c4', null),
]);

// THE EVIDENCE STATEMENT OF THE INITIAL RELEASE (owner 2026-10-25). Every enabled pair is in exactly one group.
//   GROUP A: a model-built video went through the whole path on the measured renderer (Director, storyboard, Author, reviews, final render) AND the
//            pair has a fixture receipt or is itself that run. Basis for enabling: that real run. One sample per pair: not a success rate.
//   GROUP B: fixture receipts only (a deterministic fixture scene rendered inside 420 s with identical determinism hashes). Basis: that receipt. No model-built
//            video has been made at this pair.
// Limitations that apply to BOTH groups (and are the only things the product may say about them):
export const EVIDENCE_LIMITATIONS = Object.freeze([
  'No canary has run on the production renderer yet; every receipt is from the dev renderer at the same code.',
  'The static composition gate is not a capacity check: it measures the heavy fixtures that timed out as class simple.',
  'A model-built video can still fail (content review, renderer limits); a renderer or platform failure charges the learner zero credits.',
  '45 and 60 s are not enabled.',
]);
export const evidenceGroups = () => {
  const modelPairs = new Set(MODEL_RUNS.map(c => `${c.ratio}|${c.seconds}`));
  const A = [], B = [];
  for (const e of MEASURED_READY_POLICY.entries) (modelPairs.has(`${e.aspect_ratio}|${e.min_seconds}`) ? A : B).push({ aspect_ratio: e.aspect_ratio, seconds: e.min_seconds, receipts: e.receipts });
  return { A, B };
};

// Model-built 60 s attempts: none has reached a final render (mmr-M3: output cap; mmr-M3-r2: blocking overlap after the repair; mmr-M3-r3: the
// repair did not fit the validation-only US$2.95 ceiling). Recorded so the withheld long pairs are not mistaken for untested ones.
export const MODEL_RUNS_NOT_COMPLETED = Object.freeze(['mmr-M3', 'mmr-M3-r2', 'mmr-M3-r3']);

const enabled = [...PASSED.filter(c => !c.withheld), ...MODEL_RUNS];
const keys = [...new Set(enabled.map(c => `${c.ratio}|${c.seconds}`))];
// The MOTION_READY_POLICY document of the activated policy: one entry per enabled (ratio, duration) pair, the single static class ever
// measured, and its receipts.
export const MEASURED_READY_POLICY = Object.freeze({
  version: MEASURED_POLICY_VERSION,
  renderer_config: MEASURED_RENDERER_CONFIG,
  entries: Object.freeze(keys.map(k => {
    const [aspect_ratio, s] = k.split('|'), seconds = Number(s);
    return Object.freeze({ aspect_ratio, min_seconds: seconds, max_seconds: seconds, complexity: ['simple'], receipts: enabled.filter(c => c.ratio === aspect_ratio && c.seconds === seconds).map(c => c.receipt) });
  })),
});

// What production does today (main 889ed230: the 5 to 30 s placeholder in motion-readiness.js, 16:9 only because the card hides the ratio).
// Every static class stays allowed, as with no policy at all. renderer_config is null: the worker sends the orchestrator no configuration.
export const LEGACY_READY_POLICY = Object.freeze({
  version: LEGACY_POLICY_VERSION,
  renderer_config: null,
  entries: Object.freeze([Object.freeze({ aspect_ratio: '16:9', min_seconds: 5, max_seconds: 30, complexity: ['simple', 'standard', 'heavy'] })]),
});
