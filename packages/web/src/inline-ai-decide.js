// One inline request's validation and route (docs/features/inline-ai-validation.md; owner briefs 2026-10-13: creation
// §2 and §5, validation). Shared: the editor runs the same free local checks and reads the same response schema; the
// worker (control-plane/src/learn-inline-route.js) runs them again, asks the one route+validate call and signs a
// proceed. Built on inline-ai-route.js (the registry's inline routes, limits and wording), not a second routing table.
//
// Request (the same object goes to /decide and then /generate):
//   { kind: 'selection', mode: 'edit'|'explain', targetIds: [id...] | textRange: { id, from, to }, prompt, slash?, context }
//   { kind: 'creation', mode: 'explain', anchor: { x, y } (world), region: '<compact subject+style summary>', prompt, slash?, context }
// Response: { decision, message?, route?: { capability, outcome }, missing?: [...], paid, token? }
import { SLASH, primitive } from './agent/slash.js';
import { EXPLICIT_ROUTES, NOTE_COMMANDS, NOT_INLINE, PROMPT_MAX, ROUTES, commandInput, explicitCommand, isPlainExplain, promptTooLong, selectionSummary, unavailableText } from './inline-ai-route.js';

export const DECISIONS = Object.freeze(['proceed', 'clarify', 'invalid', 'unsupported', 'blocked']);
export const MISSING = Object.freeze(['subject', 'target', 'format', 'data']);
export const OUTCOMES = Object.freeze(['edit', 'text', 'diagram', 'card', 'media']);
export const REGION_MAX = 1500, TARGETS_MAX = 200;

// What Explain can make. /diagram's own handler makes a flow or Mermaid card: a picture drawn inside a card, not canvas
// objects anyone can edit. Inline, a diagram is the native one ('shapes': canvas shapes, text and connectors, built by
// inline-diagram.js), so "/diagram ..." and "draw a diagram of ..." both go there.
const { diagram: _card, ...OTHERS } = ROUTES;
export const CAPABILITIES = Object.freeze({
  ...OTHERS,
  equation: { label: 'Equation', criterion: 'A rendered, editable mathematical equation or formula in LaTeX, including a natural-language description of a desired equation. Explaining mathematics in prose remains a text explanation.' },
  note: { label: 'Text explanation', criterion: 'An editable written explanation on the canvas, with no special format: why and how questions, "explain this", definitions, and any request that declines a format (for example "but don\'t make a video").' },
  shapes: { label: 'Diagram', criterion: 'An editable diagram drawn on the canvas from shapes, text and arrows: a tree, flowchart, cycle, hierarchy, timeline, or a map of how parts connect.' },
});
export const INLINE_SLASH = Object.freeze({ diagram: 'shapes' });
// A capability the editor can run: one the validator may choose (CAPABILITIES), or one only its explicit command reaches
// (EXPLICIT_ROUTES: never offered to the validator's route question, so automatic routing is unchanged).
export const knownCapability = capability => !!(CAPABILITIES[capability] || EXPLICIT_ROUTES[capability]);
export const DEFAULT_ENABLED = Object.freeze(['note', 'shapes', 'equation']);
export const outcomeOf = capability => (capability === 'edit' ? 'edit' : capability === 'equation' ? 'equation' : capability === 'note' ? 'text' : capability === 'shapes' ? 'diagram' : ['image', 'video', '3d', 'motion'].includes(capability) ? 'media' : 'card');
// Whether the capability can start paid generation: Motion, or a command whose family holds a paid primitive. The router
// only says so; the handler's proposal, cost disclosure and Generate step stay where they are.
export const paidOf = capability => capability === 'motion' || (SLASH.find(entry => entry.name === capability)?.family || []).some(id => primitive(id).paid);

// The decision words, shared by every validator so each is judged on the same definitions.
export const DECISION_CRITERIA = Object.freeze({
  proceed: 'The editor can act on it: in any language, however short or misspelled, with code, equations, identifiers, unfamiliar terms or profanity, including legitimate educational, medical, historical, artistic or scientific discussion of sensitive subjects (anatomy, sex education, drugs, violence in history). "Explain this", "fix this" or "make it clearer" with selected material is actionable.',
  clarify: 'Meaningful, but one essential piece is missing and a guess would probably be wrong: "this" or "it" with nothing selected and nothing in the material it could mean, a chart with no topic or data, words that name no action or result (for example "make it" or "do it"), even with material selected, or several quite different meanings.',
  invalid: 'No interpretable request: random characters, keyboard mashing, or words that ask for nothing.',
  unsupported: 'Meaningful, but none of the available outputs can do it: audio, sending a message, browsing the web, booking something; in edit mode, anything beyond changing selected words/text style or the explicitly supplied nativeTools appearance/alignment capabilities (adding, deleting, regrouping or reconnecting objects remains unsupported).',
  blocked: 'Asks for content the content policy prohibits whatever the framing: sexual content involving minors, sexually explicit material, serious help toward weapons capable of mass casualties, malware, or harassment of or incitement against real people. Learning about or discussing a sensitive subject is not blocked.',
});
export const MISSING_CRITERIA = Object.freeze({ subject: 'what topic or thing it is about', target: 'which canvas material "this" or "it" refers to', format: 'which kind of output is wanted', data: 'values or content needed to make it' });

export const MESSAGES = Object.freeze({
  invalid: 'Describe what you\'d like to change or understand.',
  unsupported: 'That isn\'t something the editor can make here.',
  blocked: 'I can\'t help with that request.',
  noTarget: 'Select something to edit.',
  several: 'This asks for more than one kind of output. Which first?',
});
const ASK = { subject: 'What should it be about?', target: 'Which part of the canvas do you mean? Select it, or name it.', format: 'Which would you like: a text explanation, a diagram or a card?', data: 'What values or content should it use?' };
export const clarifyText = missing => ASK[missing?.[0]] || ASK.subject;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const isId = id => typeof id === 'string' && id.length > 0 && id.length <= 200;
// An explicit command: the composer's own `slash` (its words are the prompt), else a leading /name typed in the prompt.
export const commandOf = request => (request.slash ? { name: request.slash.toLowerCase(), args: request.prompt.trim() } : explicitCommand(request.prompt));

// The free local checks, before any call. { error }: a malformed request (a client bug, 400). A decision: the learner's
// own input is empty or too long. null: it goes on to validation.
export function checkRequest(request) {
  const bad = { error: 'Invalid inline request' };
  if (!request || typeof request !== 'object' || typeof request.prompt !== 'string' || !['edit', 'explain'].includes(request.mode)) return bad;
  if (request.output != null && (request.output !== 'equation' || request.mode !== 'explain'
    || commandOf(request) || (request.revising != null && request.revising !== request.output))) return bad;
  // A refine names the output it revises (the session's previous route): only a known one.
  if (request.revising != null && !(request.revising === 'edit' || knownCapability(request.revising))) return bad;
  if (request.slash != null && (typeof request.slash !== 'string' || !/^[\w-]{1,40}$/.test(request.slash))) return bad;
  if (request.context != null && typeof request.context !== 'object') return bad;
  if (request.kind === 'selection') {
    const { targetIds: ids, textRange: range } = request;
    const idsOk = Array.isArray(ids) && ids.length > 0 && ids.length <= TARGETS_MAX && ids.every(isId);
    const rangeOk = !!range && typeof range === 'object' && isId(range.id) && Number.isInteger(range.from) && Number.isInteger(range.to) && range.from >= 0 && range.from <= range.to;
    if ((ids != null) === (range != null) || !(idsOk || rangeOk) || request.anchor != null) return bad;
  } else if (request.kind === 'creation') {
    const { anchor, region } = request;
    if (!anchor || !finite(anchor.x) || !finite(anchor.y) || request.targetIds != null || request.textRange != null) return bad;
    if (region != null && (typeof region !== 'string' || region.length > REGION_MAX)) return bad;
    // Edit changes a selection; it is never widened to "anything" when there is none.
    if (request.mode === 'edit') return { decision: 'unsupported', message: MESSAGES.noTarget, paid: false };
  } else return bad;
  if (request.prompt.length > PROMPT_MAX) return { decision: 'invalid', message: promptTooLong(request.prompt.length), paid: false };
  if (!request.prompt.trim() && !request.slash) return { decision: 'invalid', message: MESSAGES.invalid, paid: false };
  return null;
}

// What the mode or an explicit command already fixes, with no call: { capability } (validation still runs), a final
// decision (nothing to validate: it can never generate), or null (natural language: the validator also picks the route).
export function fixedRoute(request, enabled = DEFAULT_ENABLED) {
  const command = commandOf(request);
  const stop = (decision, message, extra = {}) => ({ decision, message, paid: false, ...extra });
  if (request.output === 'equation' && request.mode === 'explain' && !command) return enabled.includes('equation') ? { capability: 'equation' } : stop('unsupported', 'Equation generation is unavailable here.');
  // A refine keeps its output: the check validates the new words for it ("make it shorter" means the result shown).
  if (request.revising && request.mode === 'explain' && !command) return enabled.includes(request.revising) || request.revising === 'note' ? { capability: request.revising, revising: true } : stop('unsupported', unavailableText(request.revising).text);
  if (request.mode === 'edit') return command ? stop('unsupported', `/${command.name} adds something new. Switch to Explain to use it, or describe the change you want.`) : { capability: 'edit' };
  if (command) {
    if (NOTE_COMMANDS[command.name]) return { capability: 'note' };
    const capability = INLINE_SLASH[command.name] || command.name;
    if (!knownCapability(capability) || capability === 'note') {
      const known = SLASH.some(entry => entry.name === command.name && entry.places.includes('learn'));
      return stop('unsupported', known ? `/${command.name} isn't part of inline Explain (${NOT_INLINE[command.name] || 'not an explanation'}). Use it from the chat composer.` : `/${command.name} is not a Learn command.`);
    }
    if (!enabled.includes(capability)) return stop('unsupported', unavailableText(capability).text);
    // A bare command needs a subject: the selection's words, or the command's own.
    const input = commandInput({ route: command.name, via: 'command', args: command.args }, { prompt: request.prompt, context: request.context });
    if (input.clarify) return stop('clarify', input.clarify.question, { missing: ['subject'] });
    return { capability };
  }
  if (request.kind === 'selection' && isPlainExplain(request.prompt)) return { capability: 'note' };
  return null;
}

// The compact material a validator reads: the selection's types and first words, or the creation region's summary.
// Never the context package itself.
export const summaryOf = request => (request.kind === 'creation' ? String(request.region || '') : request.context?.target?.objects ? selectionSummary(request.context) : '').slice(0, REGION_MAX);

// The words generation gets for a decided request: /simplify, /example and /deeper put their instruction first; any other
// command's words are its own; otherwise the prompt as typed.
export function generationPrompt(request) {
  const command = commandOf(request);
  if (!command) return request.prompt.trim();
  return NOTE_COMMANDS[command.name] ? [NOTE_COMMANDS[command.name], command.args].filter(Boolean).join(' ') : command.args;
}

// The validator's verdict ({ decision, capability?, missing?, message? }) with the fixed route, to the response (before
// its token). Only the fixed route, or a listed and enabled capability, can proceed.
export function settle(fixed, verdict, enabled = DEFAULT_ENABLED) {
  const capability = fixed?.capability || verdict.capability;
  const missing = (verdict.missing || []).filter(id => MISSING.includes(id));
  if (verdict.decision === 'blocked') return { decision: 'blocked', message: MESSAGES.blocked, paid: false };
  if (verdict.decision === 'invalid') return { decision: 'invalid', message: MESSAGES.invalid, paid: false };
  // A refine's "it" is the result shown: a question about what "it" means, or what it is about, is already answered.
  const refined = fixed?.revising && verdict.decision === 'clarify' && missing.every(id => id === 'target' || id === 'subject');
  if (verdict.decision === 'clarify' && !refined) return { decision: 'clarify', message: verdict.message || clarifyText(missing), missing: missing.length ? missing : ['subject'], paid: false };
  if (verdict.decision === 'unsupported') return { decision: 'unsupported', message: verdict.message || MESSAGES.unsupported, paid: false };
  if (capability === 'several') return { decision: 'clarify', message: MESSAGES.several, missing: ['format'], paid: false };
  // An explicit-only capability proceeds only as the fixed route its command chose, never as a validator's pick.
  if (capability !== 'edit' && !CAPABILITIES[capability] && !(EXPLICIT_ROUTES[capability] && fixed?.capability === capability)) return { decision: 'unsupported', message: verdict.message || MESSAGES.unsupported, paid: false };
  if (capability !== 'edit' && !enabled.includes(capability)) return { decision: 'unsupported', message: unavailableText(capability).text, paid: false };
  return { decision: 'proceed', route: { capability, outcome: outcomeOf(capability) }, paid: paidOf(capability) };
}

// The response schema, for the worker before it answers and the editor when it reads one. Throws on anything else.
export function checkDecision(out) {
  const fail = () => { throw new Error('The request check returned no usable decision.'); };
  if (!out || typeof out !== 'object' || !DECISIONS.includes(out.decision) || typeof out.paid !== 'boolean') fail();
  if (out.message != null && (typeof out.message !== 'string' || out.message.length > 300)) fail();
  if (out.missing != null && (!Array.isArray(out.missing) || !out.missing.every(id => MISSING.includes(id)))) fail();
  if (out.decision === 'proceed') {
    const capability = out.route?.capability;
    if ((capability !== 'edit' && !knownCapability(capability)) || out.route.outcome !== outcomeOf(capability) || typeof out.token !== 'string' || !out.token) fail();
  } else if (out.token != null || !out.message) fail();
  return out;
}
