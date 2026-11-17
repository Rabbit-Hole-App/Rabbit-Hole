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
