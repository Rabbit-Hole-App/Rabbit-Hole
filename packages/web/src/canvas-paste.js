// What Ctrl+V on the canvas pastes (AdaptiveCanvas.jsx paste handler). An image from anywhere becomes an image card;
// the canvas's own copied cards paste only while the clipboard still holds their marker, so text copied elsewhere
// afterwards wins; other text becomes a text card. `marker` is CARDS_COPIED, `copying` the in-flight marker write.
export function pasteKind({ images = 0, text = '', marker, copying = false, cards = 0 }) {
  const ours = text === marker;
  if (images && !copying && !ours) return 'image';
  if (cards && (ours || copying || !text.trim())) return 'cards';
  if (text.trim() && !ours) return 'text';
  return null;
}
