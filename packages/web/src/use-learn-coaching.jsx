// The personal Tutor controls in the Learn Chat (C:/s/spec/tutor-workflow/draft.md Task 03 and Task 04; owner decisions 1a,
// 3a, 4a): useLearnCoaching, the On/Off switch beside the selected Tutor mode, and the static status line, entry card and
// waiting opening above the composer. Nothing here calls a model: opening, restoring, selecting Tutor, switching it On or
// Off, Not now, Resume and Undo only read or save the learner's controls. A choice the learner presses that needs new
// content goes through the Chat's normal send, as the learner's own request.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { Toggle } from './ui.jsx';
import { controlsNote, createCoachingSync, effectiveControls, guidedOpening } from './learn-coaching-client.js';
import { checkpointOf, entryAction, entryCopy, resolveTutorEntry } from './learn-coaching-entry.js';

const CHANNEL = 'rh.learn-coaching';

// useLearnCoaching({ app, board }) -> { status, saveStatus, controls, state, undo, notice, dispatch(event), act(action,
// payload), retry(), canCoach(context) }. One sync per learner canvas: another tab's save arrives by BroadcastChannel, and a
// tab coming back into view reads the saved controls again (another device), so proactive work rechecks current controls.
export function useLearnCoaching({ app, board = 'main' }) {
  // The channel opens in the effect, never in render: an open BroadcastChannel keeps a server render (and node) alive.
  const sync = useMemo(() => {
    const port = { current: null };
    return Object.assign(createCoachingSync({ scope: { app, board }, call: api, channel: { postMessage: message => port.current?.postMessage(message) } }), { port });
  }, [app, board]);
  useEffect(() => {
    let channel = null;
    try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; }
    sync.port.current = channel;
    const hear = event => sync.receive(event.data);
    channel?.addEventListener('message', hear);
    sync.start();
    const back = () => { if (document.visibilityState === 'visible') sync.load(); };
    document.addEventListener('visibilitychange', back);
    return () => {
      sync.stop();
      channel?.removeEventListener('message', hear);
      channel?.close();
      if (sync.port.current === channel) sync.port.current = null;
      document.removeEventListener('visibilitychange', back);
    };
  }, [sync]);
  const view = useSyncExternalStore(sync.subscribe, sync.view, sync.view);
  return useMemo(() => ({ ...view, dispatch: sync.dispatch, act: sync.act, retry: sync.retry, canCoach: sync.canCoach }), [view, sync]);
}

// The switch immediately beside the selected Tutor mode (draft "Tutor controls and dismissal"); ModeSelector hides it in
// Auto and Ask. Its name says what it controls; the description says questions are still answered when it is Off.
export function TutorSwitch({ coaching }) {
  const on = coaching.controls.tutorEnabled;
  return (
    <span data-tutor-switch={on ? 'on' : 'off'} className="inline-flex shrink-0 items-center gap-1.5 px-1">
      <Toggle on={on} onChange={next => coaching.dispatch({ type: 'set_tutor_enabled', enabled: next })} aria-label="Proactive Tutor suggestions" aria-describedby="tutor-switch-help"
        title="Proactive Tutor suggestions on this canvas. Your questions are always answered." disabled={coaching.status === 'loading' || coaching.status === 'error'} />
      <span aria-hidden="true" className="text-xs text-ink-2">{on ? 'On' : 'Off'}</span>
      <span id="tutor-switch-help" className="sr-only">Controls proactive Tutor suggestions on this canvas. Explicit questions are answered when it is Off.</span>
    </span>
  );
}

const LINK = 'shrink-0 cursor-pointer font-medium text-ink underline-offset-2 hover:underline';
const CHOICE = 'cursor-pointer rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink hover:bg-hover disabled:cursor-default disabled:opacity-50';

// Above the Chat composer (ask.jsx): the controls' status line, a guided Rabbit Hole opening that is waiting for the learner
// (owner 4a: shown, never sent, where coaching may not run), and the static entry card (Task 04). chat: the workspace;
// send(text): the Chat's own send; sendOpening(opening): sends a waiting opening exactly as the automatic one would have;
// messages: how many messages the open conversation shows; busy: a turn is in flight.
export function TutorCoaching({ chat, send, sendOpening, waitingOpening = null, messages = 0, busy = false }) {
  const { coaching, thread, composer, canvasOps } = chat;
  const [engaged, setEngaged] = useState(null); // the canvas whose entry the learner already acted on in this view
  const [shown, setShown] = useState(null); // the saved activity prompt Continue put back in view
  const controls = effectiveControls(coaching, thread);
  const checkpoint = checkpointOf(coaching.state);
  const workspace = canvasOps?.workspace?.() || { loaded: false, content: 0 };
  const loadState = coaching.status === 'loading' || thread.status === 'loading' || !workspace.loaded ? 'loading' : coaching.status === 'error' || thread.status === 'error' ? 'error' : 'ready';
  const entry = resolveTutorEntry({ loadState, controls, checkpoint, workspace: { content: workspace.content, history: messages > 0 || (coaching.state?.goals?.length || 0) > 0 },
    interaction: { typing: !!composer.text?.trim(), uploading: chat.context?.items?.some(item => item.state === 'uploading'), busy } });
  const note = controlsNote({ ...coaching, controls });
  const pick = action => {
    const run = entryAction(action, checkpoint);
    setEngaged(chat.canvas);
    if (run.event) coaching.dispatch({ type: run.event });
    if (run.send) send(run.send);
    if (run.focus) {
      // Continue: the saved task and its linked cards come back into view; the learner's newer work stays as it is.
      setShown(checkpoint.activity?.prompt || null);
      const linked = checkpoint.activity?.checkpoint?.blockIds?.[0];
      if (linked && canvasOps?.hasBlock?.(linked)) canvasOps.locate(linked);
      composer.focus();
    }
  };
  const offer = ['welcome', 'existing_work', 'resume', 'completed'].includes(entry.kind) && engaged !== chat.canvas;
  return <>
    {note && <p role={note.tone === 'error' ? 'alert' : 'status'} data-tutor-status={note.action || note.tone} className={`mb-1.5 flex flex-wrap items-center gap-x-2 text-xs ${note.tone === 'error' ? 'text-fail' : 'text-ink-2'}`}>
      {note.text}
      {note.action === 'retry' && <button type="button" onClick={coaching.retry} className={LINK}>Retry</button>}
      {note.action === 'undo' && <button type="button" data-tutor-undo onClick={() => coaching.dispatch({ type: 'undo', undo: coaching.undo })} className={LINK}>Undo</button>}
      {note.action === 'resume' && <button type="button" data-tutor-resume onClick={() => { coaching.dispatch({ type: 'resume' }); setEngaged(null); }} className={LINK}>Resume</button>}
    </p>}
    {waitingOpening && <div data-tutor-opening-waiting className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-2.5 text-xs text-ink-2">
      <span className="min-w-0 flex-1">{waitingOpening.next_step ? `Continue with: ${waitingOpening.next_step.hook}` : `Start with: “${waitingOpening.question}”`}</span>
      <button type="button" disabled={busy} onClick={() => sendOpening(waitingOpening)} className={CHOICE}>{waitingOpening.next_step ? 'Continue' : 'Ask this'}</button>
    </div>}
    {shown && engaged === chat.canvas && <p data-tutor-activity className="mb-2 rounded-xl border border-line bg-white p-2.5 text-sm text-ink">{shown}</p>}
    {offer && <section data-tutor-entry={entry.kind} aria-label="Tutor" className="mb-2 flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
      <p className="text-sm text-ink">{entryCopy(entry, checkpoint)}</p>
      <div className="flex flex-wrap gap-1.5">
        {entry.allowedActions.map(action => { const run = entryAction(action, checkpoint); return run && <button key={action} type="button" data-tutor-choice={action} disabled={busy} onClick={() => pick(action)} className={CHOICE}>{run.label}</button>; })}
        <button type="button" data-tutor-own-work onClick={() => { setEngaged(chat.canvas); coaching.dispatch({ type: 'continue_own_work' }); }} className={CHOICE}>Continue my own work</button>
        <button type="button" data-tutor-not-now onClick={() => coaching.dispatch({ type: 'not_now' })} className={CHOICE}>Not now</button>
      </div>
    </section>}
  </>;
}

// The guided-entry decision ask.jsx asks before a hole's opening turn (owner 4a): start_guided is saved for this hole (it
// clears a pause only in selected, enabled Tutor), and the turn runs only where coaching may run.
export function openGuided(coaching, thread, { entry = null, chatOpen }) {
  coaching.dispatch({ type: 'start_guided' });
  const own = effectiveControls(coaching, thread);
  return guidedOpening({ own: { ...own, revision: coaching.status === 'local' ? 0 : own.revision }, entry, context: { chatOpen, ready: true } });
}
