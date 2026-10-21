// The words the person typed to make a card (docs/features/card-prompt.md): kept on the card as `promptUsed` and shown in
// its Prompt row. Only typed words, never a system prompt or a model's own request. `prompt` and `question` are card
// content on quiz, challenge and image cards, so this field has its own name.
export const PROMPT_CHARS = 8000;
export const withPrompt = (block, text) => {
  const words = String(text ?? '').trim().slice(0, PROMPT_CHARS);
  return words ? { ...block, promptUsed: words } : block;
};
