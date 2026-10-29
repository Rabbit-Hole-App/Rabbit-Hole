// The compact brief of a simple explicit material command (owner spec 2026-10-29 section 6): /practice, /quiz, /flashcards, /code,
// /graph, /diagram and /3d prepare a brief in Chat and make their card only after Generate. The brief is built here from the learner's
// own words and the selected card, with no model call (6.1: no extra planning call for a simple brief); the server signs it into the
// existing proposal storage (control-plane chat-proposal-route.js) and runs the existing generator at Generate (learn-artifact.js).
// Pure: the browser and the worker read the same wording. Explain, Motion, Image and CAD keep their own specialised briefs.
import { learnRequest, typedOf } from './agent/slash.js';

export const BRIEF_COMMANDS = Object.freeze(['practice', 'quiz', 'flashcards', 'code', 'graph', 'diagram', '3d']);
export const isBriefCommand = name => BRIEF_COMMANDS.includes(name);
export const BRIEF_LIMITS = Object.freeze({ args: 1000, title: 80, change: 300, changes: 5, context: 4000, selectionTitle: 200 });

const squash = text => String(text ?? '').replace(/\s+/g, ' ').trim();
const upper = text => (text ? text[0].toUpperCase() + text.slice(1) : text);
const cut = (text, max) => (text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') || text.slice(0, max) : text);

// What the brief is about: the learner's words, else the selected card (by its title). '' when there is neither: the command asks.
export function briefSubject(args, selection = null) {
  const words = squash(args);
  if (words) return words;
  const title = squash(selection?.title).slice(0, 120);
  return selection?.id ? (title ? `the selected card "${title}"` : 'the selected card') : '';
}

// One sentence of what the result will show or ask the learner to do; never the answer, never a claim that it is made.
const SAYS = {
  quiz: topic => `One multiple-choice question about ${topic}, with feedback after you answer.`,
  flashcards: topic => `A short deck of question-and-answer cards about ${topic}, to flip through and review.`,
  code: topic => `A short Python example: ${topic}, with a brief explanation of how it works.`,
  graph: topic => `A graph of ${topic}, to explore how it changes.`,
  diagram: topic => `A diagram of ${topic}, showing its steps or relationships.`,
  '3d': topic => `A 3D scene of ${topic}, to explore its spatial relationships.`,
};
const PRACTICE = {
  explain_back: () => 'Explain the idea in your own words, then get feedback on the reasoning in your answer.',
  quiz: SAYS.quiz,
  code_exercise: topic => `One coding task about ${topic}, then feedback on your answer.`,
  any: topic => `One practice task about ${topic}: you answer, then get feedback.`,
};

// -> { title, description, limitations } for a command's brief, or null when there is nothing to be about. changes: the learner's
// requested changes so far (conversational Edit), said in the brief and carried to the generator, never rewritten by a model.
export function materialBrief(command, { args = '', selection = null, changes = [] } = {}) {
  if (!isBriefCommand(command)) return null;
  const subject = briefSubject(args, selection);
  if (!subject) return null;
  let title = upper(subject), description;
  if (command === 'practice') {
    const narrowed = learnRequest('practice', { args }).allowedPrimitives;
    const mode = narrowed.length === 1 ? narrowed[0] : 'any';
    const topic = subject.replace(/^explain(ing)? it back\b\s*[:,-]?\s*/i, '') || subject;
    title = mode === 'explain_back' ? `Explain ${topic}` : upper(topic);
    description = (PRACTICE[mode] || PRACTICE.any)(topic);
  } else description = SAYS[command](subject);
  const asked = changes.map(squash).filter(Boolean);
  return {
    title: cut(title, BRIEF_LIMITS.title),
    description: asked.length ? `${description} Changes you asked for: ${asked.join('; ')}.` : description,
    limitations: command === '3d' ? ['Making it uses paid generation.'] : [],
  };
}

// The browser's one call (ask.jsx materialPlan): a new brief { command, request, selection, context }, or an Edit's revision
// { revise: { proposal }, change } of exactly the targeted revision. selection: the card it is about ({ id, title, text }), sent as
// a snapshot. -> { thread_id, message_id, proposal }; a refusal rejects with the server's words (api's error carries status and data).
export function requestMaterialBrief(api, { app, threadId, command, text, selection = null, edit = null }) {
  const words = squash(text);
  const body = edit ? { app, thread_id: threadId, revise: { proposal: edit.proposal }, change: words.slice(0, BRIEF_LIMITS.change) }
    : { app, thread_id: threadId, command, request: words.slice(0, BRIEF_LIMITS.args),
      selection: selection?.id ? { kind: 'card', id: String(selection.id).slice(0, 200), title: squash(selection.title).slice(0, BRIEF_LIMITS.selectionTitle) } : null,
      context: selection?.id && selection.text ? String(selection.text).slice(0, BRIEF_LIMITS.context) : null };
  return api('/api/learn/chat/material-proposals', { method: 'POST', body: JSON.stringify(body) });
}

// The card's heading, naming the command (owner spec 2026-10-29 6.1): Review quiz, Review 3D scene.
const HEADINGS = { practice: 'practice', quiz: 'quiz', flashcards: 'flashcards', code: 'code example', graph: 'graph', diagram: 'diagram', '3d': '3D scene' };
export const briefHeading = command => `Review ${HEADINGS[command] || 'brief'}`;

// The typed line a brief records as its request: `/quiz Newton's second law` (the typed name: /photos, /image).
export const briefRequest = (command, args) => `/${typedOf(command)} ${squash(args)}`.trim();
// What the generator receives at Generate: the learner's full words and each requested change, in order (never the short title).
// Never cut: the revision route refuses a change that would take it past BRIEF_LIMITS.args, and Generate refuses an older one that did.
export const generationArgs = input => [squash(input?.args), ...(input?.changes || []).map(change => `Change: ${squash(change)}`)].filter(Boolean).join('\n');
