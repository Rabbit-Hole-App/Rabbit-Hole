// CHAT.02 (docs/features/explain-on-canvas/chat-answer-tools.md): the tools an ordinary Chat reply may call. The answer model sees these
// native function definitions, generated from the command registry (web/src/inline-ai-route.js CHAT_CAPABILITIES, web/src/agent/slash.js),
// and decides whether to answer, ask one question or request a tool. Motion keeps its signed in-answer review (generation-proposal.js
// PROPOSAL_TOOL); every other enabled command is a direct tool whose call is only a request: the server validates it and hands
// {command, args} to the browser, which runs the command's existing handler. Nothing here executes, charges or creates a job.
// Off unless CHAT_ANSWER_TOOLS lists the mode (chat-capability-route.js answerToolsOn).
import { CHAT_CAPABILITIES } from '../../web/src/inline-ai-route.js';
import { SLASH, commandLabel } from '../../web/src/agent/slash.js';
import { availability } from './chat-capability-route.js';

export const REQUEST_MAX = 2000;
// What each command can and cannot be, for the fit check and the alternatives the model is told about. false = it cannot; null = unknown or
// not applicable (a search finds existing material). Only the existing registry's facts: Motion's audio field is disabled (generation-confirmation-schema.js).
export const FIT = Object.freeze({
  motion: { narration: false, interactive: false, limits: 'A short visual video with visuals timed to the concept. Audio is off, so it cannot be narrated. Not interactive.' },
  explain: { narration: null, interactive: true, limits: 'A visual explanation card the learner can explore; interactive scenes have controls.' },
  '3d': { narration: false, interactive: true, limits: 'A 3D scene the learner can look around. No narration.' },
  diagram: { narration: false, interactive: false, limits: 'A static diagram or flowchart. No narration or motion.' },
  graph: { narration: false, interactive: true, limits: 'A plot of a function or supplied data the learner can explore. No narration.' },
  code: { narration: false, interactive: false, limits: 'A Python example card. No narration.' },
  flashcards: { narration: false, interactive: true, limits: 'A deck of question-and-answer cards.' },
  quiz: { narration: false, interactive: true, limits: 'One quiz question with feedback.' },
  'generate-image': { narration: false, interactive: false, limits: 'One new still picture, planned and reviewed before it is generated.' },
  image: { narration: null, interactive: null, limits: 'Finds an existing photo with its credit. Never generates a picture.' },
  youtube: { narration: null, interactive: null, limits: 'Finds existing videos to watch. Never generates a video.' },
  wikipedia: { narration: null, interactive: null, limits: 'Finds an encyclopedia article to read.' },
  arxiv: { narration: null, interactive: null, limits: 'Finds research papers to read.' },
});

const SEARCH = new Set(['youtube', 'wikipedia', 'arxiv', 'image']);
export const toolNameOf = command => `run_${command.replace(/-/g, '_')}`;
const entryOf = command => SLASH.find(c => c.name === command && c.places.includes('learn'));

// The direct tools this caller may use now: declared, not explicit-only, guarded ones only where the server enables them, and available
// (the same checks the router applies). -> [{ command, name, label }]
export function directTools(env, email = null) {
  return Object.entries(CHAT_CAPABILITIES)
    .filter(([command, cap]) => cap.flow === 'direct' && !cap.explicit && FIT[command] && entryOf(command))
    .filter(([command, cap]) => !cap.guarded || (command === 'explain' && env.EXPLAIN_V2_ENABLED === 'true'))
    .filter(([command]) => availability(env, { name: command, needs: entryOf(command).needs || null }, null, email))
    .map(([command]) => ({ command, name: toolNameOf(command), label: commandLabel(command) }));
}

// Native tool definitions (Claude input_schema; the OpenAI-compatible mapping reads the same object as parameters).
export function chatToolDefs(env, email = null) {
  return directTools(env, email).map(({ command, name, label }) => ({
    name,
    description: `${CHAT_CAPABILITIES[command].intent} ${entryOf(command).about} Limits: ${FIT[command].limits} Calling this only asks the app to open the ${label} command with your request; nothing exists until the learner uses it. Do not call it to answer a question about the tool, for conversation, or when the learner declines this format.`,
    input_schema: {
      type: 'object', additionalProperties: false, required: ['request'],
      properties: {
        request: { type: 'string', maxLength: REQUEST_MAX, description: `What the learner wants from ${label}, in their own terms and with the needed context from this conversation.` },
        requirements: {
          type: 'object', additionalProperties: false,
          description: 'Behaviors the learner required of the result. Set only what they asked for.',
          properties: { narration: { type: 'boolean', description: 'The result must be narrated with spoken audio.' }, interactive: { type: 'boolean', description: 'The learner must be able to adjust or play with the result.' } },
        },
      },
    },
  }));
}

// -> null when the command can deliver the stated requirements, else a sentence for the model (and a test).
export function fitProblem(command, requirements) {
  const fit = FIT[command];
  if (!fit || !requirements) return null;
  if (requirements.narration === true && fit.narration === false) return `${commandLabel(command)} cannot provide narration`;
  if (requirements.interactive === true && fit.interactive === false) return `${commandLabel(command)} is not interactive`;
  return null;
}

// The qualified alternatives for a requirement set, from the same catalogue (Motion included), so the model can offer one or say none exists.
export function alternativesFor(env, email, requirements, exclude = null) {
  const ids = [...directTools(env, email).map(t => t.command), ...(availability(env, { name: 'motion', needs: 'motion_dev' }, null, email) ? ['motion'] : [])];
  return ids.filter(id => id !== exclude && !SEARCH.has(id) && !fitProblem(id, requirements)).map(id => commandLabel(id)); // a search finds existing material, never a substitute for making it
}

// One call: validate and either surface it ({ request: {command, args} }) or answer the model with why not ({ error }).
export function checkToolCall(env, email, call, { taken = false } = {}) {
  const tool = directTools(env, email).find(t => t.name === call?.name);
  if (!tool) return { error: 'That tool is not available in this conversation. Answer in Chat or ask the learner one question.' };
  if (taken) return { error: 'One tool request per answer. Describe the rest in your reply.' };
  const input = call.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'The input must be an object.' };
  const extra = Object.keys(input).find(k => !['request', 'requirements'].includes(k));
  if (extra) return { error: `${extra} is not a field` };
  const args = typeof input.request === 'string' ? input.request.replace(/\s+/g, ' ').trim() : '';
  if (!args || args.length > REQUEST_MAX) return { error: `request must be 1 to ${REQUEST_MAX} characters` };
  const req = input.requirements;
  if (req !== undefined && (!req || typeof req !== 'object' || Array.isArray(req) || Object.keys(req).some(k => !['narration', 'interactive'].includes(k) || typeof req[k] !== 'boolean'))) return { error: 'requirements may only set narration and interactive to true or false' };
  const problem = fitProblem(tool.command, req);
  if (problem) {
    const alternatives = alternativesFor(env, email, req, tool.command);
    return { error: `${problem}. ${alternatives.length ? `Tools that fit these requirements: ${alternatives.join(', ')}. Offer one with a short reason, or ask the learner one question.` : 'No available tool fits these requirements. Give useful help in Chat and say what the learner can do next.'}` };
  }
  return { request: { command: tool.command, args } };
}

// The shared selection policy (one place; the signatures above carry the tool-specific facts).
export const CHAT_TOOLS_POLICY = [
  'Tools: you may call one of the tools offered, once, only when the learner asks for that tool\'s output and its description fits what they asked for.',
  'Answer questions and conversation in Chat. A greeting, a question about a tool, or a request that declines a format is not a request for that tool.',
  'If the output or a required input is genuinely unclear, ask ONE focused question instead of calling a tool.',
  'Compare what the learner asked for (the result, narration, interactivity, settings) with each tool\'s limits. If a tool cannot deliver what they asked for, offer a qualified alternative with a short reason; otherwise ask one question that would unblock it; otherwise give useful help in Chat and a concrete next step.',
  'Never say something was created. A tool call only opens the command; nothing exists until the learner uses it.',
].join('\n');

// ---- Explain on canvas from typed words (checklist 4.1.1, BE.01a) -----------------------------------------------------------------------
// The browser sends body.lesson = { sources: [{ key, rev, name }] } only when this canvas has authorized Markdown sources ready and no unfinished
// roadmap (roadmap-client.js lessonSourcesOf). The tool exists only then. The server executes nothing: a valid call is handed back as
// answer_meta.toolRequest { command: 'explain-on-canvas', args: { instruction, scope, source } } and the browser runs the SAME action the button
// runs (roadmap-controller.js lesson). The create route re-authorizes the source and refuses a second unfinished roadmap.
export const LESSON_COMMAND = 'explain-on-canvas';
export const LESSON_TOOL_NAME = 'start_lesson';
const LESSON_KEY = /^file:[A-Za-z0-9_.-]{1,100}$/;
export function parseLesson(raw) {
  const list = Array.isArray(raw?.sources) ? raw.sources : null;
  if (!list || !list.length || list.length > 5) return null;
  const sources = [];
  for (const s of list) {
    if (!s || typeof s.key !== 'string' || !LESSON_KEY.test(s.key) || typeof s.rev !== 'string' || !s.rev || s.rev.length > 80) return null;
    sources.push({ key: s.key, rev: s.rev, name: typeof s.name === 'string' ? s.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '' });
  }
  return new Set(sources.map(s => s.key)).size === sources.length ? { sources } : null;
}

export function lessonToolDef(lesson) {
  const many = lesson.sources.length > 1;
  return {
    name: LESSON_TOOL_NAME,
    description: `Start an Explain on canvas lesson: a roadmap draft the learner reviews in Chat, then one explanation card at a time on the canvas, for the source already on this canvas${many ? ` (candidates: ${lesson.sources.map(s => s.name || s.key).join('; ')})` : lesson.sources[0].name ? ` ("${lesson.sources[0].name}")` : ''}. Use it only when the learner CLEARLY asks to be taught or have the source explained as a lesson on the canvas. Limits: not for an informational question about the source, not for a request for one card, diagram, video or quiz, and nothing exists until the learner reviews and accepts the draft. Calling it only starts the roadmap draft in Chat.`,
    input_schema: {
      type: 'object', additionalProperties: false, required: many ? ['instruction', 'source'] : ['instruction'],
      properties: {
        instruction: { type: 'string', maxLength: REQUEST_MAX, description: 'What the learner wants to learn, in their own words, with any depth or focus they asked for.' },
        scope: { type: 'string', enum: ['whole', 'passage'], description: 'whole: the whole source. Use passage only if the learner named a part; the app plans the whole source unless the learner picks a part in Chat.' },
        ...(many ? { source: { type: 'string', enum: lesson.sources.map(s => s.key), description: 'Which source. Ask the learner one question first if they did not say.' } } : {}),
      },
    },
  };
}

// -> { request: { command, args } } | { error } in words for the model (the same shape as checkToolCall).
export function checkLessonCall(lesson, call, { taken = false } = {}) {
  if (taken) return { error: 'One tool request per answer. Describe the rest in your reply.' };
  const input = call?.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'The input must be an object.' };
  const extra = Object.keys(input).find(k => !['instruction', 'scope', 'source'].includes(k));
  if (extra) return { error: `${extra} is not a field` };
  const instruction = typeof input.instruction === 'string' ? input.instruction.replace(/\s+/g, ' ').trim() : '';
  if (!instruction || instruction.length > REQUEST_MAX) return { error: `instruction must be 1 to ${REQUEST_MAX} characters` };
  if (input.scope !== undefined && !['whole', 'passage'].includes(input.scope)) return { error: 'scope must be whole or passage' };
  const source = input.source === undefined && lesson.sources.length === 1 ? lesson.sources[0] : lesson.sources.find(s => s.key === input.source);
  if (!source) return { error: `Which source? Ask the learner one focused question: ${lesson.sources.map(s => s.name || s.key).join('; ')}.` };
  return { request: { command: LESSON_COMMAND, args: { instruction, scope: input.scope || 'whole', source: source.key } } };
}

export const LESSON_POLICY = [
  `${LESSON_TOOL_NAME}: call it only for a clear request to be taught the source as a lesson on the canvas. An informational question about the source, or a request for a single card, diagram, video or quiz, is NOT a lesson request: answer it in Chat or use that tool.`,
  'If more than one source could be meant, or the lesson\'s scope is genuinely unclear, ask ONE focused question first. No lesson exists until the learner accepts the draft.',
].join('\n');
