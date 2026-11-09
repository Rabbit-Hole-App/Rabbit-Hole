// The chat model picker's display list: keys, labels and one-word hints only.
// The model ids stay on the server (ASK_MODELS in control-plane
// learn-models.js); model-choices.test.mjs keeps the keys in step.
export const MODEL_CHOICES = [
  { key: 'auto', label: 'Auto', hint: 'Picks for you' },
  { key: 'opus-5', label: 'Opus 5', hint: 'Most capable' },
  { key: 'sonnet-5', label: 'Sonnet 5', hint: 'Balanced' },
  { key: 'haiku-4.5', label: 'Haiku 4.5', hint: 'Fastest' },
];
// What the pick reaches: the server resolves it for chat answers only.
export const MODEL_SCOPE = 'It applies to chat answers only: cards, the whiteboard and grading use their own configured model.';
