// The Explanation card's spoken add-on, the canvas side (docs/features/explain.md "Card audio"; routes: control-plane explanation-audio.js). Pure helpers and the two calls; the canvas
// (AdaptiveCanvas.jsx) wires them and the pill (ExplanationAudio.jsx) shows them. The server writes no board, so the answers land on the card here, as block.narration:
//   { status: 'script', script, transcript, seconds, scriptBy, estimate_credits, scriptCheck }  the script exists, no audio yet (made right after the card is delivered)
//   { status: 'preparing' }                                                              shown by the pill while the voice is made; never saved
//   { status: 'ready', fileRef, seconds, script, transcript, provider, model, voiceId }  the voice exists: play it
//   { status: 'error', failed: 'script' | 'audio', code, reason, ...what was already made }  one step failed; a retry runs only that step
// A card that never had a narration, and every card made before this feature, has none and draws nothing.
export const SCRIPT_URL = '/api/learn/explanation-audio/script', VOICE_URL = '/api/learn/explanation-audio/voice';
const FENCES = /```[\s\S]*?```/g;
const ERROR_FIELDS = ['failed', 'code', 'reason'];
const withoutError = narration => Object.fromEntries(Object.entries(narration || {}).filter(([key]) => !ERROR_FIELDS.includes(key)));

// A new written Explanation that has no narration yet and has prose worth adding to. Not a topic anchor, a PDF excerpt or an empty card.
export const narratable = block => block?.type === 'explanation' && typeof block.id === 'string' && !block.anchor && !block.excerpt && !block.narration
  && String(block.body ?? '').replace(FENCES, ' ').trim().length >= 80;

// What the script call reads: the title, the body (its diagrams stay in, the server reads their labels and numbers), the other sections, the card's Depth and the learner's own words.
export const scriptInput = block => ({
  title: String(block.title ?? '').slice(0, 300), body: String(block.body ?? '').slice(0, 9000),
  ...((block.more || []).length ? { more: block.more.map(section => section?.text).filter(Boolean).join('\n\n').slice(0, 6000) } : {}),
  ...(block.depth ? { depth: block.depth } : {}),
  ...(typeof block.promptUsed === 'string' && block.promptUsed.trim() ? { question: block.promptUsed.replace(/^\/\S+\s+/, '').trim().slice(0, 1000) } : {}),
});

const errorOf = (failed, code, reason) => ({ status: 'error', failed, code, reason });
const reasonOf = error => (typeof error?.message === 'string' && error.message && !/^HTTP \d+$/.test(error.message) ? error.message : 'It could not be made right now. Try again.');

// The script, once, for a card the learner did not press anything for. -> the narration to save: 'script', or an 'error' naming the step. Never throws.
export async function requestScript(post, { app, block }) {
  try {
    const answer = await post(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ app, id: String(block.id), ...scriptInput(block) }) });
    // estimate_credits: what the voice will cost, in AI units (the server's own figure), shown by the first Play's confirmation; scriptCheck: the length check's counts, kept for review.
    if (typeof answer?.script === 'string' && answer.script.trim()) return { status: 'script', script: answer.script, transcript: answer.transcript || answer.script, seconds: answer.seconds_estimate, ...(answer.scriptBy ? { scriptBy: answer.scriptBy } : {}),
      ...(Number.isFinite(answer.voice_estimate_credits) ? { estimate_credits: answer.voice_estimate_credits } : {}), ...(answer.check ? { scriptCheck: answer.check } : {}) };
    return errorOf('script', answer?.outcome || 'no_script', answer?.reason || 'The audio script could not be made. Try again.');
  } catch (error) { return errorOf('script', 'request_failed', reasonOf(error)); }
}

// The voice, on the first Play: the script (never the transcript) is spoken and kept. confirmed: the press is the paid confirmation. -> the narration's voice fields, or an 'error'. Never throws.
export async function requestVoice(post, { app, block }) {
  try {
    const answer = await post(VOICE_URL, { method: 'POST', body: JSON.stringify({ app, id: String(block.id), script: block.narration.script, confirmed: true }) });
    return answer?.narration?.status ? answer.narration : errorOf('audio', 'no_audio', 'The voice could not be made right now. Try again.');
  } catch (error) { return errorOf('audio', error?.data?.code || 'request_failed', reasonOf(error)); }
}

// The script of a NEW card, asked once as the card is placed (AdaptiveCanvas insertBlock): only where the canvas is editable (a visitor or a copy never asks), only for a card that qualifies and
// is not already asked (asked: the canvas's Set), and the card never waits for it: the call is started and not awaited. -> whether a request was started.
export function askScript({ post, app, editable, asked, land }, card) {
  if (!editable || !app || !narratable(card) || asked.has(card.id)) return false;
  asked.add(card.id);
  requestScript(post, { app, block: card }).then(land);
  return true;
}

// Play on a card whose audio is not ready: the failed step, or the missing ones, run and the whole narration comes back to save. A second press for the same card shares the first.
const inflight = new Map();
// voice: false stops after the script (the free step), so the Play can show the voice's cost before anything is spent.
export function generateNarration(post, { app, block, voice = true }) {
  if (inflight.has(block.id)) return inflight.get(block.id);
  const run = (async () => {
    let narration = withoutError(block.narration);
    if (!narration.script) {
      const made = await requestScript(post, { app, block });
      if (made.status === 'error') return made;
      narration = { ...narration, ...made };
    }
    if (!voice) return narration;
    const spoken = await requestVoice(post, { app, block: { ...block, narration } });
    return { ...narration, ...spoken }; // a failed voice keeps the script, so the retry is the voice alone
  })().finally(() => inflight.delete(block.id));
  inflight.set(block.id, run);
  return run;
}

// The narration lands on the card as it is now (a functional update on the latest blocks): only that field, only on an Explanation still on the canvas, and, with ifNone, only when the
// card still has none, so a card deleted meanwhile is skipped and nothing else on it is overwritten.
export const landNarration = (blocks, id, narration, { ifNone = false } = {}) => blocks.map(block => (block.id === id && block.type === 'explanation' && !(ifNone && block.narration) ? { ...block, narration } : block));

// The press that asked for the voice also asks to hear it: the pill that replaces the Play button on arrival starts it (ExplanationAudio.jsx). A browser may refuse a late play(); then Play is one press more.
export const wantPlay = new Set();
