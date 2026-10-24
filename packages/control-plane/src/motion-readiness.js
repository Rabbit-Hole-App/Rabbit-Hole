// Motion readiness (owner 2026-10-23: durations 5 to 60 and every ratio stay visible; nothing is clamped or substituted; only
// combinations with evidence may be GENERATED). Same shape as image-settings.js imageReadiness and as motionReadiness in
// motion-settings.js on motion/int: { ready: true, policy_version } | { ready: false, code, message, policy_version }. The message is
// the one line the card shows before confirmation; Generate is refused with it before the proposal is consumed or a hold is taken.
// ponytail: a fixed range (the deployed orchestrator's validateJobRequest accepts approved_proposal.duration_seconds 5 to 30 only;
// heavy compositions are unvalidated beyond that). When the Motion lane lands motion-settings.js (MOTION_READY_POLICY, measured
// buckets), import its motionReadiness here instead and delete this file's range.
export const MOTION_NOT_READY = 'motion_not_ready';
export const MOTION_POLICY_VERSION = 'orchestrator-5-30';
export const MOTION_READY_SECONDS = Object.freeze({ min: 5, max: 30 });

export function motionReadiness(env, inputs) {
  const d = inputs?.duration_seconds;
  if (Number.isInteger(d) && d >= MOTION_READY_SECONDS.min && d <= MOTION_READY_SECONDS.max) return { ready: true, policy_version: MOTION_POLICY_VERSION };
  return { ready: false, code: MOTION_NOT_READY, policy_version: MOTION_POLICY_VERSION,
    message: `A ${d} second video is not ready to generate yet: Motion has only been verified up to ${MOTION_READY_SECONDS.max} seconds. Pick ${MOTION_READY_SECONDS.max} seconds or less.` };
}
// A proposal's settings as the readiness policy reads them (a missing ratio is the original 16:9).
export const motionInputs = settings => ({ duration_seconds: settings?.duration_seconds, aspect_ratio: settings?.aspect_ratio ?? '16:9' });
