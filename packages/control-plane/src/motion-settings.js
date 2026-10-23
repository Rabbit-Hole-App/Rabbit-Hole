// Motion's two video settings, with the server-side rules for them (owner brief 2026-10-23). The ratios and their output sizes
// live with the renderer (learn-render/motion/stage-sizes.js), so a ratio cannot be accepted that the renderer would not produce.
// Keys: duration_seconds, aspect_ratio (and audio, which the proposal validator owns). Pure: no I/O.
import { MOTION_DEFAULT_RATIO, MOTION_RATIOS, MOTION_STAGE_SIZES } from '../../learn-render/motion/stage-sizes.js';

// Exactly these twelve, in seconds.
export const MOTION_DURATIONS = Object.freeze([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
export { MOTION_DEFAULT_RATIO, MOTION_RATIOS, MOTION_STAGE_SIZES };

// -> { value: {duration_seconds, aspect_ratio} } or { error } in words the model (and a test) reads. A missing aspect_ratio is
// the original 16:9 (proposals and cards saved before the setting existed); a missing duration is an error, as it always was.
export function validateMotionVideoSettings({ duration_seconds, aspect_ratio }) {
  if (!MOTION_DURATIONS.includes(duration_seconds)) return { error: `settings.duration_seconds must be one of ${MOTION_DURATIONS.join(', ')} (seconds)` };
  const ratio = aspect_ratio === undefined ? MOTION_DEFAULT_RATIO : aspect_ratio;
  if (!MOTION_RATIOS.includes(ratio)) return { error: `settings.aspect_ratio must be one of ${MOTION_RATIOS.join(', ')}` };
  return { value: { duration_seconds, aspect_ratio: ratio } };
}
