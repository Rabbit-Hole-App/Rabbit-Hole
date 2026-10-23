// The worker variables that make every Motion combination ready, for tests that start videos (owner correction 2026-10-23: the real default
// is an empty policy, so nothing is ready until a measured allowlist is configured). Not a statement about what is validated.
export const READY_RENDERER = 'r-test';
export const READY_POLICY = { version: 'p-test', renderer_config: READY_RENDERER, entries: [{ aspect_ratio: ['9:16', '1:1', '16:9', '3:4', '4:3', '2:3', '3:2', '4:5', '5:4'], min_seconds: 5, max_seconds: 60, complexity: ['simple', 'standard', 'heavy'] }] };
export const READY = Object.freeze({ MOTION_READY_POLICY: JSON.stringify(READY_POLICY), MOTION_RENDERER_CONFIG: READY_RENDERER });
