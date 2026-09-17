// Shared character-by-character writing for scripted lessons and tutor annotations.
export function writingFrames(text, update) {
  return Array.from({ length: text.length }, (_, i) => ({ apply: () => update(text.slice(0, i + 1)), delay: 35 }));
}
