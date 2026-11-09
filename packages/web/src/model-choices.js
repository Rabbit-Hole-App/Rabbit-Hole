// The chat model picker's display list: keys, labels and one-word hints only.
// The model ids stay on the server (ASK_MODELS in control-plane
// learn-models.js); model-choices.test.mjs keeps the keys in step.
export const MODEL_CHOICES = [
  { key: 'auto', label: 'Auto', hint: 'Gemini 3.5 Flash Lite' }, // chat answers run on Gemini for now (owner 2026-11-08; server chatModel, CHAT_MODEL_PROFILE=anthropic puts Opus back); no Opus pick while that holds
  { key: 'sonnet-5', label: 'Sonnet 5', hint: 'Balanced' },
  { key: 'haiku-4.5', label: 'Haiku 4.5', hint: 'Fastest' },
];
// The saved pick (Settings default): a key the picker no longer offers, such as the old 'opus-5', is Auto.
export const savedModel = stored => (MODEL_CHOICES.some(choice => choice.key === stored) ? stored : 'auto');
// What the pick reaches: the server resolves it for chat answers only.
export const MODEL_SCOPE = 'It applies to chat answers only: cards, the whiteboard and grading use their own configured model.';
