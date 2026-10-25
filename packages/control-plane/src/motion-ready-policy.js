// The Motion readiness policy as DATA, built only from the deterministic renderer receipts (C:/s/spec/motion-validation/receipts,
// matrix "c4"): the dev renderer at revision 03f2a1efc08e8d5c0d73aadced534b614c13f3d5 (1.5 CPU, 3 GiB, 420 s limit), 21 runs, 18 succeeded.
// motion-settings.js reads this when the worker variable MOTION_READY_POLICY is unset; the variable still overrides it.
// Owner rules (2026-10-24): durations stay 5 to 60 and all nine ratios stay visible; a (ratio, duration) pair is enabled ONLY when a receipt
// shows it rendering and passing the determinism check on this renderer; nothing is interpolated (30 s passing and 45 s passing do not
// enable 35 s). Every other pair stays visible and is refused with the not-ready line.
//
// What an enabled pair means: a fixture scene of that class rendered inside the limit. It is NOT a guarantee for a model composition:
// the static gate (composition-limits.js) measures every fixture, including the heavy ones that timed out, as class "simple", so the
// class list below is the only class ever measured, not a capacity predictor. A heavy composition can still exceed 420 s (the failure
// is a renderer timeout and charges zero credits). The model runs (M1 to M3) are the first samples of model compositions.

// Set MOTION_RENDERER_CONFIG to this id with the renderer deploy that carries the revision below; any other id makes the policy empty.
export const MEASURED_RENDERER_CONFIG = '03f2a1efc08e-1.5cpu-3gib-420s';
export const MEASURED_RENDERER_REVISION = '03f2a1efc08e8d5c0d73aadced534b614c13f3d5';
export const MEASURED_POLICY_VERSION = 'p1-03f2a1efc08e';

const cell = (ratio, seconds, scene, receipt, service_total_s) => Object.freeze({ ratio, seconds, scene, receipt, service_total_s });

// Passing runs. service_total_s is the service's own total against the 420 s limit (the margin a reader needs).
export const PASSED = Object.freeze([
  cell('16:9', 5, 'medium', 'mv-D10-c4', 63.89),
  cell('16:9', 15, 'medium', 'mv-D01-c4', 120.73),
  cell('16:9', 30, 'medium', 'mv-D11-c4', 197.17),
  cell('16:9', 45, 'medium', 'mv-D12-c4', 271.3),
  cell('16:9', 60, 'medium', 'mv-D13-c4', 347.68),
  cell('9:16', 15, 'medium', 'mv-D02-c4', 121.47),
  cell('1:1', 15, 'medium', 'mv-D03-c4', 100.46),
  cell('3:4', 15, 'medium', 'mv-D04-c4', 113.14),
  cell('4:3', 15, 'medium', 'mv-D05-c4', 112.06),
  cell('2:3', 15, 'medium', 'mv-D06-c4', 110.11),
  cell('3:2', 15, 'medium', 'mv-D07-c4', 113.22),
  cell('4:5', 15, 'medium', 'mv-D08-c4', 111.44),
  cell('5:4', 15, 'medium', 'mv-D09-c4', 112.75),
  cell('9:16', 60, 'medium', 'mv-D14-c4', 344.97),
  cell('1:1', 60, 'medium', 'mv-D15-c4', 277.68),
  cell('3:4', 60, 'medium', 'mv-D16-c4', 320.3),
  cell('16:9', 15, 'simple', 'mv-D17-c4', 108.58),
  cell('16:9', 60, 'simple', 'mv-D19-c4', 307.92),
]);

// Runs that hit the 420 s limit (recorded once, not repeated). They do not disable a pair a lighter scene passed; they bound what the
// enabled pairs mean (see the note at the top).
export const TIMED_OUT = Object.freeze([
  cell('16:9', 15, 'heavy', 'mv-D18-c4', null),
  cell('16:9', 60, 'heavy', 'mv-D20-c4', null),
  cell('16:9', 60, 'heavy (preview job alone)', 'mv-D21-c4', null),
]);

// The MOTION_READY_POLICY document: one entry per passing (ratio, duration) pair, the single static class ever measured, and its receipts.
export const MEASURED_READY_POLICY = Object.freeze({
  version: MEASURED_POLICY_VERSION,
  renderer_config: MEASURED_RENDERER_CONFIG,
  entries: Object.freeze([...new Set(PASSED.map(c => `${c.ratio}|${c.seconds}`))].map(k => {
    const [aspect_ratio, s] = k.split('|'), seconds = Number(s);
    return Object.freeze({ aspect_ratio, min_seconds: seconds, max_seconds: seconds, complexity: ['simple'], receipts: PASSED.filter(c => c.ratio === aspect_ratio && c.seconds === seconds).map(c => c.receipt) });
  })),
});
