// The build-time switch of the rehearsal feature (owner 2026-11-14/15): VITE_REHEARSAL_TRIGGER=1 builds it in; every other build (production) folds REHEARSAL to false and drops
// every branch and lazy chunk behind it, so the chip, the intake, the Run card client and /api/learn/run are not shipped. 
export const REHEARSAL = import.meta.env?.VITE_REHEARSAL_TRIGGER === '1'; // the same optional-chaining form as flags.js: Vite folds it to false and a test bundle (no import.meta.env) does not throw
