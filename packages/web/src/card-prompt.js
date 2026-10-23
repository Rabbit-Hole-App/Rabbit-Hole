// The words the person typed to make a card (docs/features/card-prompt.md): kept on the card as `promptUsed` and shown in
// its Show prompt reveal (CardPrompt.jsx). Only typed words, never a system prompt or a model's own request. `prompt` and `question` are card
// content on quiz, challenge and image cards, so this field has its own name.
export const PROMPT_CHARS = 8000;
// A /cad line: [1] is the prompt after the command. The pill shows `cad`, never the printed /cad (owner brief 2026-10-23).
export const CAD_LINE = /^\/cad\s+([\s\S]+)$/i;
export const withPrompt = (block, text) => {
  const words = String(text ?? '').trim().slice(0, PROMPT_CHARS);
  return words ? { ...block, promptUsed: words } : block;
};
