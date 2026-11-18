// Which card's explanation audio is audibly playing right now (ExplanationAudio.jsx writes it; the canvas card's green frame and the
// minimap's green mark read it). Runtime only: never saved with the board. One id at a time, like the module-level `playing` audio element.
import { useSyncExternalStore } from 'react';

let playingCardId = null;
const listeners = new Set();

export const getPlayingCard = () => playingCardId;
export function setPlayingCard(id) {
  const next = id ?? null;
  if (next === playingCardId) return;
  playingCardId = next;
  for (const listener of [...listeners]) listener();
}
// A card clears only its own mark: a late pause event from a card that another card already replaced must not clear the new one.
export function clearPlayingCard(id) { if (playingCardId === id) setPlayingCard(null); }
export function subscribePlaying(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }

// With an id: whether that card is the playing one (a card re-renders only when its own answer flips). Without: the playing id.
export function usePlayingCard(id) {
  const snapshot = () => (id === undefined ? playingCardId : playingCardId === id);
  return useSyncExternalStore(subscribePlaying, snapshot, snapshot);
}

// The transcript window beside the playing card (TranscriptWindow.jsx, docs/features/explain.md "Audio control"): { cardId, script, t, d } for the ONE card whose window is open, with t the
// audio's current time and d its length, in seconds. Open while playing and while paused, and after the end (full text); it closes by its own X, when another card starts, on unmount or on a failure.
let transcript = null;
const notify = () => { for (const listener of [...listeners]) listener(); };
export const getTranscript = () => transcript;
export function openTranscript(cardId, script) {
  if (!cardId) return;
  if (typeof script !== 'string' || !script.trim()) { if (transcript) { transcript = null; notify(); } return; } // no script: no window, and this card starting ends the other card's
  if (transcript?.cardId === cardId && transcript.script === script) return; // a resume keeps its position
  transcript = { cardId, script, t: 0, d: 0 };
  notify();
}
// timeupdate fires about 4 times a second; a change under 0.2 s (the end excepted) is not published, so a card re-renders at most that often.
export function updateTranscript(cardId, t, d) {
  if (!transcript || transcript.cardId !== cardId || !Number.isFinite(t)) return;
  const length = Number.isFinite(d) && d > 0 ? d : 0;
  if (length === transcript.d && Math.abs(t - transcript.t) < 0.2 && !(length && t >= length)) return;
  transcript = { ...transcript, t, d: length };
  notify();
}
// A replay starts again from 0 without closing: the old position must not flash the whole text.
export function restartTranscript(cardId) { updateTranscript(cardId, 0, transcript?.d); }
export function closeTranscript(cardId) { if (transcript?.cardId === cardId) { transcript = null; notify(); } }
// A card's window data, or null: only the card that owns the window re-renders when it changes.
export function usePlayingTranscript(id) {
  const snapshot = () => (transcript?.cardId === id ? transcript : null);
  return useSyncExternalStore(subscribePlaying, snapshot, snapshot);
}
