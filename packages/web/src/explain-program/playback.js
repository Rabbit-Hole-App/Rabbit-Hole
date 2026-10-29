// Which frame a program card asks its host for, and which answers it draws (ProgramScene.jsx). Pure; no React, no DOM.
//
// A frame is valid for one state: key = the artifact's host + the inputs + a state epoch the card bumps on a scrub, a reset or
// a replay. The playback time is NOT part of the key: while playing, the newest frame that completes for the current key is
// drawn even if the clock has moved on, so an evaluation slower than one animation frame still advances the picture instead of
// being discarded as outdated. One request per key is in flight; when it answers, the newest wanted time is sent next
// (coalesced), so the frames drawn are in the order they were asked for, which is the clock's order. An answer for an older key
// is never drawn. When the clock stops (pause, scrub), the last request is the exact wanted time, so the drawing settles on it.
// The host (host.js) still keeps one request in flight and only the newest waiting; this sits in front of it.
// A frame that misses the program's own operation deadline (frameOverrun) is skipped: the last drawn frame stays and the newest
// wanted moment is asked for next. A drawn or completed frame resets the count; the third overrun in a row stops the card as any
// other error does at once (owner decision 2026-10-29, option A). Evaluate is pure, so asking again replays no state.
//   createFrameScheduler({ evaluate(job) -> Promise<reply>, show(reply, job), fail(error, job) })
//     .want({ key, time, inputs })   the state the card needs drawn now
//     .dispose()                     nothing is drawn or sent after this
export const MAX_OVERRUNS = 3;
// The 50 ms generated-operation deadline (runtime.js reports it as 'time limit' after setup). The host watchdog, boot deadline,
// memory and output limits carry other diagnostics, so they still stop the card at once.
export const frameOverrun = error => error?.code === 'runtime_limit' && error.diagnostic === 'time limit';

export function createFrameScheduler({ evaluate, show, fail = () => {} }) {
  let wanted = null, sent = null, shown = null, dead = false, overruns = 0;
  const pump = () => {
    if (dead || !wanted) return;
    if (sent ? sent.key === wanted.key : shown?.key === wanted.key && shown.time === wanted.time) return; // waiting, or settled
    const job = sent = { ...wanted };
    evaluate(job).then(reply => {
      if (dead) return;
      if (sent === job) sent = null;
      overruns = 0;
      if (job.key === wanted.key) { shown = job; show(reply, job); }
      pump();
    }, error => {
      if (dead) return;
      if (sent === job) sent = null;
      // An older state's error is dropped. For the current state an AbortError means the host was disposed (only another key
      // supersedes a request), so nothing is resent; a frame overrun under MAX_OVERRUNS in a row is skipped; any other error
      // stops the card (no retry loop).
      const skipped = frameOverrun(error) && ++overruns < MAX_OVERRUNS;
      if (job.key !== wanted.key || skipped) pump();
      else if (error?.name !== 'AbortError') fail(error, job);
    });
  };
  return {
    want(next) { wanted = { ...next }; pump(); },
    dispose() { dead = true; },
  };
}
