// The Agent Bar's multiline keys (T02 §6.2): Enter sends, Shift+Enter adds a line, and nothing
// fires while an IME is composing (keyCode 229 covers Safari, which reports isComposing late).
export function composerKey({ key, shiftKey, isComposing, keyCode }) {
  if (key !== 'Enter' || isComposing || keyCode === 229) return 'none';
  return shiftKey ? 'newline' : 'send';
}
