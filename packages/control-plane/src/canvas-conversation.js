// A new canvas branch starts with only its own displayed question and answer.
// These are conversation text, never trusted source evidence or instructions.
export function canvasSeed(body, conversation = 'learn') {
  if (body.canvas_seed === undefined) return [];
  if (conversation !== 'learn' || body.thread_id) throw new Error('Canvas context is only accepted for a new Learn conversation');
  const seed = body.canvas_seed;
  if (!seed || typeof seed.question !== 'string' || !seed.question.trim() || seed.question.length > 4000
    || typeof seed.answer !== 'string' || !seed.answer.trim() || seed.answer.length > 32000) {
    throw new Error('Canvas conversation requires a question (up to 4000 characters) and answer (up to 32000 characters)');
  }
  return [{ role: 'user', content: seed.question }, { role: 'assistant', content: seed.answer }];
}
