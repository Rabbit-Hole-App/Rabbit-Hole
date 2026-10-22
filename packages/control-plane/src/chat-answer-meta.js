// Chat answer metadata (agent-coordination/tasks/chat-workspace-CONTRACT.md B1, B3, B4): the trailer the model ends a chat
// answer with, split off before the text is streamed or stored, then validated into action and follow-up records.
// Interface fixed by the Lane B lead; sub-lane B4 fills the bodies. Sub-lane B3 (apiAsk) calls these three only.
import { commandsFor, learnRequest } from '../../web/src/agent/slash.js';
import { available } from '../../web/src/learn-slash.js';

// Appended to the Learn chat system prompt: how to write the <answer_meta> trailer. Billed on every answer, so kept short.
// ponytail: the prompt never offers motion (dev and review builds only); the validator still accepts it under motionDev. Nor
// animate (owner, 2026-10-20: /motion replaced it as a command), which the registry no longer offers, so the validator drops it.
export const ANSWER_META_SYSTEM = `End every answer with exactly one trailer, valid JSON, nothing after it:
<answer_meta>{"actions":[{"capability":"diagram","label":"Draw the request flow","subject":"..."}],"followUps":[{"text":"...","kind":"clarify"}]}</answer_meta>
actions: 0-3 artifacts the learner could make next, only when one would genuinely help; never fill the list. Choose from this answer, the latest request, earlier turns and the attached context. label: a verb phrase, at most 40 characters. subject: at most 200 characters, exactly what to make. capability, the one that fits:
- diagram: a native editable diagram (flow, structure, process)
- graph: a math function or data plot
- image: a picture of a real thing
- video: an existing video clip
- notebook: runnable Python. Only when this answer contains the Python code, add "code":{"language":"python","cells":["..."]} copied verbatim, setup and imports in the first cell; otherwise omit code
- code: a new code example; compare: a side-by-side comparison; practice: a practice task; quiz: one test question
Never use image for a diagram, plot or animation.
followUps: 2-3 questions that extend this conversation, kind one of clarify (a hard point), implication, check (test understanding), connect (link concepts), next (a practical step); text at most 140 characters. Never one this conversation already answered, a generic "learn more", or one drawn from the canvas title alone.
A short or conversational answer ends with <answer_meta>{"actions":[],"followUps":[]}</answer_meta>.`;

// A Chat connected to a code repository (repo-graph Release 1, brief section 11): its follow-ups investigate this codebase,
// grounded in the code the answer read and the conversation. Curious, not the chat, proposes the deeper concepts.
export const ANSWER_META_REPOSITORY = `This chat is connected to a code repository. followUps: questions that investigate its implementation, grounded in the code this answer read and in this conversation - follow a real request or call through the code, find the callers of something discussed, see how a state change is stored, compare two implementations, or read a relevant test or failure path - only where the code read supports it; never invent a file, symbol or behaviour. actions stay artifacts to make, never questions.`;
// MOT-20b: where a Motion video can start (generation-proposal.js motionOffered), an action may suggest one; its Send is the Chat's
// /motion turn, so it is proposed on the shared card first. Nowhere else is motion offered.
export const ANSWER_META_MOTION = 'motion is also a capability here: a short animated explainer video of this topic, only when animation would genuinely teach it better than text.';
export const answerMetaSystem = ({ repository = false, motion = false } = {}) => [ANSWER_META_SYSTEM, repository ? ANSWER_META_REPOSITORY : null, motion ? ANSWER_META_MOTION : null].filter(Boolean).join('\n');

const OPEN = '<answer_meta>', CLOSE = '</answer_meta>';

// { content: the answer without the trailer, raw: the trailer's JSON text or null }. Safe on a partial stream: a trailing
// partial `<answer_meta` is held back, so a streamed prefix of content is never a piece of the tag.
export function splitAnswerMeta(text) {
  const s = String(text ?? '');
  const at = s.indexOf(OPEN);
  if (at >= 0) {
    const rest = s.slice(at + OPEN.length), end = rest.indexOf(CLOSE);
    return { content: s.slice(0, at).trimEnd(), raw: (end >= 0 ? rest.slice(0, end) : rest).trim() || null };
  }
  for (let k = Math.min(s.length, OPEN.length - 1); k > 0; k--) if (s.endsWith(OPEN.slice(0, k))) return { content: s.slice(0, -k), raw: null };
  return { content: s, raw: null };
}

const ALLOWED = ['diagram', 'graph', 'video', 'image', 'notebook', 'code', 'compare', 'practice', 'quiz', 'motion'];
const KINDS = ['clarify', 'implication', 'check', 'connect', 'next'];
const str = (v, max) => { const t = typeof v === 'string' ? v.trim() : ''; return t && t.length <= max ? t : null; };
// Notebook code the answer already has: Python only (notebooks run Python), every cell a string, blank cells dropped.
const codeOf = code => {
  const cells = Array.isArray(code?.cells) && code.cells.every(c => typeof c === 'string') ? code.cells.filter(c => c.trim()) : [];
  return cells.length && String(code.language || 'python').toLowerCase() === 'python' ? { language: 'python', cells } : null;
};

// { actions: [Action], followUps: [FollowUp] }, never throws: anything invalid is dropped.
export function validateAnswerMeta(raw, { messageId, contextRefs = [], motionDev = false } = {}) {
  let meta;
  try { meta = JSON.parse(raw); } catch { return { actions: [], followUps: [] }; }
  // The commands this environment offers in Learn (motion only with motionDev), narrowed to the suggestable ones.
  const offered = new Set(commandsFor('learn', { motionDev }).filter(available).map(c => c.name).filter(n => ALLOWED.includes(n)));
  const actions = [], seen = new Set();
  for (const a of Array.isArray(meta?.actions) ? meta.actions : []) {
    if (actions.length === 3) break;
    const capabilityId = a?.capability, label = str(a?.label, 40), subject = str(a?.subject, 200);
    if (!offered.has(capabilityId) || seen.has(capabilityId) || !label || !subject) continue;
    seen.add(capabilityId);
    const code = capabilityId === 'notebook' ? codeOf(a.code) : null;
    actions.push({
      id: `a${actions.length + 1}`, capabilityId, label, sourceMessageId: String(messageId),
      // ponytail: every ref the message was built from; per-action narrowing by sourceId waits for a need.
      contextRefs: Array.isArray(contextRefs) ? contextRefs : [],
      args: code ? { subject, code } : { subject },
      // Server-computed, never the model's word.
      generationRequired: !code,
      paid: learnRequest(capabilityId).paid.length > 0 || capabilityId === 'motion',
    });
  }
  const followUps = [], asked = new Set();
  for (const f of Array.isArray(meta?.followUps) ? meta.followUps : []) {
    if (followUps.length === 3) break;
    const text = str(f?.text, 140), key = text?.toLowerCase().replace(/\s+/g, ' ');
    if (!text || asked.has(key)) continue;
    asked.add(key);
    followUps.push({ id: `f${followUps.length + 1}`, text, kind: KINDS.includes(f.kind) ? f.kind : 'next' });
  }
  return { actions, followUps };
}
