// The comment limits, in one place (docs/features/canvas-comments.md section 9 and section 15). The server (control-plane
// canvas-comments.js) enforces every one of them and lets a worker variable of the same name override a number; the panel reads
// BODY_MAX and COUNTER_FROM from here so the counter and the server cannot drift apart. Invitation caps and the member cap are
// the invitation family's own (canvas-members.js: MEMBERS_MAX and the per-address and per-owner caps with retry_after).
export const BODY_MAX = 5000;
export const COUNTER_FROM = 4500;
export const LIMIT_DEFAULTS = {
  COMMENT_CANVAS_10MIN: 30, COMMENT_CANVAS_DAY: 300, COMMENT_PERSON_DAY: 1000, // posts per person: per canvas in 10 minutes, per canvas a day, everywhere a day
  COMMENT_THREAD_MAX: 1000, // messages in one thread
  COMMENT_MENTIONS_MAX: 10, // mentions kept in one comment
  COMMENT_ATTACH_FILE_BYTES: 10 * 1024 * 1024, COMMENT_ATTACH_COMMENT_MAX: 5, COMMENT_ATTACH_CANVAS_BYTES: 200 * 1024 * 1024, // owner decision D3
};
