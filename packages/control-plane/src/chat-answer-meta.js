// Chat answer metadata (agent-coordination/tasks/chat-workspace-CONTRACT.md B1, B3, B4): the trailer the model ends a chat
// answer with, split off before the text is streamed or stored, then validated into action and follow-up records.
// Interface fixed by the Lane B lead; sub-lane B4 fills the bodies. Sub-lane B3 (apiAsk) calls these three only.

// Appended to the Learn chat system prompt: how to write the <answer_meta> trailer.
export const ANSWER_META_SYSTEM = '';

// { content: the answer without the trailer, raw: the trailer's JSON text or null }. Safe on a partial stream.
export function splitAnswerMeta(text) {
  return { content: String(text ?? ''), raw: null };
}

// { actions: [Action], followUps: [FollowUp] }, never throws: anything invalid is dropped.
// eslint-disable-next-line no-unused-vars
export function validateAnswerMeta(raw, { messageId, contextRefs = [], motionDev = false } = {}) {
  return { actions: [], followUps: [] };
}
