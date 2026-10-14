// A hole's opening turn, sent once (ask.jsx, from the dock only; the opening and its key come from learn-next-steps.js
// holeOpening). Its own module: ask.jsx is in the app chunk and must not load the planner.
// `sent` outlives a remount of the dock (the canvas remounts when the hole's board lands from the server), so the same opening
// never goes twice, and a new opening - a later, distinct carry into the same hole - has a new key and sends once. Returns
// whether to send. At most 50 keys are kept, the oldest dropped first.
export function openOnce(sent, key) {
  if (!key || sent.has(key)) return false;
  sent.add(key);
  if (sent.size > 50) sent.delete(sent.values().next().value);
  return true;
}
