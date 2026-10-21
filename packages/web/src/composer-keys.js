// The Agent Bar's multiline keys (T02 §6.2): Enter sends, Shift+Enter adds a line, and nothing
// fires while an IME is composing (keyCode 229 covers Safari, which reports isComposing late).
// sendKey 'mod' (Settings > Appearance & input, chat boxes only; ui-prefs.js chatSendKey): Ctrl/Cmd+Enter sends and Enter
// adds a line. Callers that pass nothing (the Ctrl+K editor) keep Enter.
export function composerKey({ key, shiftKey, ctrlKey, metaKey, isComposing, keyCode }, sendKey = 'enter') {
  if (key !== 'Enter' || isComposing || keyCode === 229) return 'none';
  if (sendKey === 'mod') return ctrlKey || metaKey ? 'send' : 'newline';
  return shiftKey ? 'newline' : 'send';
}
