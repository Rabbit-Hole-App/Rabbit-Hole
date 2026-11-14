// The Frame object budget per card (brief 22 task 2): a plan's scene.runtime may declare `frameObjects` up to the hard maximum, and the sealed manifest carries it;
// every plan without it keeps the default. Deliberately imports nothing (the plan, the composition and the contract all take these numbers) and is NOT part of any SDK source,
// so no SDK fingerprint reads it: CONTRACT_LIMITS.objects stays 60 because the guest SDK helpers interpolate that number into their frozen source.
export const FRAME_OBJECTS_DEFAULT = 60;
export const FRAME_OBJECTS_HARD_MAX = 130; // measured 2026-11-14 (docs/features/interact/evidence/2026-11-14-frame-budget/measurement.md): 130 objects cost 15.9 ms per scrub frame (median of 11 runs), 160 cost 16.5 ms; raise only after a quiet-machine measurement
