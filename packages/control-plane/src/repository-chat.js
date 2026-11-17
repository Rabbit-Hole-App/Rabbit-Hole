// Chat turns on a repository's Main canvas (repo-graph Release 1, lead ruling on brief section 11): repositoryAsk gets
// apiAsk's Chat-turn handling through the same chat-modes and chat-answer-meta helpers - the mode, command and context_refs
// recorded with the question, the answer_meta trailer with the repository follow-up guidance, its split and validation,
// and the meta stored on the answer. An ask without the Chat fields (an old client, the Agent Bar) passes through unchanged.
import { CAP_CHARS } from './ask.js';
import { chatContext, chatSystem, recordAnswer, recordUserTurn, regenerateTurn, resolveMode, threadMemory } from './chat-modes.js';
import { answerMetaSystem, splitAnswerMeta, validateAnswerMeta } from './chat-answer-meta.js';

const PLAIN = { context: '', system: base => base, research: {}, onDone: () => null };

// A regeneration (contract B5), once the thread is known: the stored turn, whose mode, command and refs ride instead of
// this request's. null when the ask regenerates nothing; a 404 when the answer is not in this thread.
// ponytail: the question sent is this request's text (the client re-sends the turn's own words); apiAsk sends the stored text.
export async function repositoryRegenerate(db, threadId, chat) {
  if (!chat?.regenerate) return null;
  const turn = await regenerateTurn(db, threadId, chat.regenerate.messageId);
  if (!turn) throw Object.assign(Error('no such answer in this thread'), { status: 404 });
  return turn;
}

// After the thread's history (its user message stored), what a Chat turn adds: context joins the ask's context (the
// attached refs and a long thread's summary), system(base) is its system prompt with the trailer rules, research joins
// askStream's research (the trailer split; a Tutor turn runs with no tools), and onDone(saveGraph) is askStream's onDone,
// storing the answer with its meta and then its graph. A plain ask gets PLAIN: no context, the same system, onDone null.
export async function repositoryChatTurn(db, { chat, turn = null, threadId, history, message, readPaper = null }) {
  if (!chat) return PLAIN;
  const asked = turn ? { ...chat, mode: turn.mode, command: turn.command, contextRefs: turn.contextRefs } : chat;
  await recordUserTurn(db, threadId, history.userMessageId, asked, !!turn);
  const resolved = resolveMode(asked, turn ? turn.message : message), memory = await threadMemory(db, threadId, history.userMessageId);
  let trailer = null;
  return {
    // Code refs are read from the snapshot by repositoryAsk (selectedEntities), once each: never listed again as attachments.
    context: chatContext('', (asked.contextRefs || []).filter(ref => ref.kind !== 'code'), memory.long ? memory.summary : null, CAP_CHARS, readPaper),
    system: base => chatSystem(base, answerMetaSystem({ repository: true }), resolved, memory.long),
    research: { onAnswer: text => { const split = splitAnswerMeta(text); trailer = split.raw; return split.content; }, ...(resolved.mode === 'tutor' ? { tools: [], system: null } : {}) },
    onDone: saveGraph => async (full, stopped = false) => {
      const stored = await recordAnswer(db, { threadId, userMessageId: history.userMessageId, content: full, raw: trailer, stopped, chat: asked, resolved, turn, prior: memory.summary, long: memory.long, validate: (raw, opts) => validateAnswerMeta(raw, { ...opts, motionDev: false }) });
      if (stored) await saveGraph(Number(stored.done.messageId));
      return stored;
    },
  };
}
