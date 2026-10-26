// What a generation proposal's card says about its job (chat generation UX, bug 2). Pure: the state is READ from the same things the
// canvas and the Chat's watch already read, never a second state machine and never a poll of its own.
//   - a card the proposal made: its block on the canvas, through generationState (generation-state.js), the one mapping the
//     "Generating on the canvas" indicator and the canvas card share. The card follows its own job; the Chat reads the block.
//   - a card made but not on this canvas right now: the output saved on the learner's turn (chat-output-refs.js, found by its
//     jobId), so a reload shows the proposal as made, never as pressable again.
//   - an image proposal: the status its job reports while it runs (generate-image.js runImageJob), which has no canvas card yet.
// Labels never carry a trailing dot (UI rule: no ellipsis in a label). No percentage and no completion time is ever made up: the
// stage line is the card's own words, and elapsed time is counted from the press.
import { generationState } from './generation-state.js';
import { videoLabel } from './learn-video-label.js';

// phase: 'submitting' | 'queued' | 'running' | 'checking' | 'done' | 'failed' | 'stopped' | 'unknown' | 'removed'
// label: the primary button's words while the job is live ('Starting', 'Queued', 'Generating', 'Ready'); null once it ended
// without a result, where the button keeps its name (Generate), greyed.
// active: a spinner and a Stop where the job can be stopped. detail: the one status line.
const status = (phase, fields = {}) => ({ phase, label: null, active: false, spinner: false, detail: null, canStop: false, cardId: null, ...fields });

const NOUN = { video: 'video', image: 'image' };
// The first learner turn's saved output for this proposal (its jobId is proposal:<id>), or null.
export const outputForProposal = (turn, proposal) => turn?.outputs?.find(output => output.jobId === `proposal:${proposal?.proposal_id}`) ?? null;
// The card the proposal made belongs to the message of the version it was made from; a card or output that does not say its
// version (a snapshot too large to keep) is taken to be this one.
export const madeFromVersion = (blockLike, proposal) => {
  const version = blockLike?.operation?.proposal?.version ?? blockLike?.snapshot?.block?.operation?.proposal?.version;
  return version === undefined || version === proposal?.version;
};

// A proposal that starts a canvas card (Motion). card: the live block its press made, or null. output: the turn's saved output
// for it, or null. pressed: Generate was pressed here and the card is not on the canvas yet. loaded: the canvas has drawn its
// saved cards (until then a missing card is unknown, not removed). noun: what it makes, for the status line.
// -> null while the proposal waits for its Generate (or its card was refused: the server did not accept this press).
export function cardStatus({ card = null, output = null, pressed = false, loaded = true, noun = 'video' } = {}) {
  const word = NOUN[noun] || noun;
  if (card?.proposalRefused) return null;
  if (!card) {
    if (pressed) return status('submitting', { label: 'Starting', active: true, spinner: true, detail: 'Sending your request.' });
    if (!output) return null;
    return loaded
      ? status('removed', { cardId: output.cardId, detail: `The ${word} card is no longer on the canvas. Go to card puts it back if it finished.` })
      : status('checking', { spinner: true, cardId: output.cardId, detail: `Checking the status of this ${word}.` });
  }
  const gen = generationState(card), shared = { cardId: card.id };
  if (gen.phase === 'running') {
    // A video job has no placement until the server accepted the start: until then it is still starting, whatever the card already shows.
    const queued = gen.label === 'Queued', starting = gen.label === 'Starting' || (card.type === 'video' && !card.placementId);
    const stoppable = card.type === 'video' && !!card.placementId && !!videoLabel(card).stoppable;
    return status(starting ? 'submitting' : queued ? 'queued' : 'running', { ...shared, label: starting ? 'Starting' : queued ? 'Queued' : 'Generating', active: true, spinner: true, canStop: stoppable,
      detail: starting ? 'Sending your request.' : card.type === 'video' ? videoLabel(card).progress : null });
  }
  if (gen.phase === 'idle') return status('submitting', { ...shared, label: 'Starting', active: true, spinner: true, detail: 'Sending your request.' }); // between the card landing and its start
  if (gen.phase === 'done') return status('done', { ...shared, label: 'Ready', detail: `The ${word} is ready on the canvas.` });
  if (gen.phase === 'cancelled') return status('stopped', { ...shared, detail: 'Stopped. Open the card to see your options.' });
  if (gen.phase === 'unknown') return status('unknown', { ...shared, detail: `We could not confirm whether this ${word} was made. It was not started again. Open the card to check.` });
  if (gen.phase === 'failed') return status('failed', { ...shared, detail: `The ${word} could not be made. Open the card for the reason and your options.` });
  return status('failed', { ...shared, detail: `The ${word} card is not in a state that can run. Open the card for details.` });
}

// An image proposal (no canvas card until it is made). image: runImageJob's last status { tone, text, retry } or null. cardId: the
// card it was placed as. -> null while it waits for its Generate.
export function imageProposalStatus({ image = null, pressed = false, cardId = null } = {}) {
  if (!image) return pressed ? status('submitting', { label: 'Starting', active: true, spinner: true, detail: 'Sending your request.' }) : null;
  if (image.tone === 'working') return status('running', { label: 'Generating', active: true, spinner: true, detail: image.text });
  if (image.tone === 'ready') return status('done', { label: 'Ready', cardId, detail: 'The image is ready on the canvas.' });
  return status('failed', { detail: image.text });
}

// Seconds as a short reading, 45s or 4m 12s (shown, never announced).
export const elapsedText = seconds => (seconds == null ? '' : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`);

// What the live region announces: the phase and its words, never the elapsed time (it would speak every second).
export const announcement = s => (s ? (s.active ? `${s.label}. ${s.detail ?? ''}` : s.detail ?? '').trim() : '');
