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

// The Learn section flow's own tools (docs/features/learn-sections DECISIONS H and N, Reviewer 2026-11-16 01:00): offered only by directTools(env, email,
// { sectionFlow: true }), never in CHAT_CAPABILITIES or CHAT_ROUTES, so ordinary chat's list stays exactly as it is. The written explanation is read, not played;
// the visual explain (/interactive) is not in the section set.
export const SECTION_TOOLS = Object.freeze({
  explanation: { label: 'Explanation', intent: 'A written explanation card the learner reads and keeps: prose, with tables and diagrams where they help.', fit: { narration: false, interactive: false, limits: 'A written card to read, not played: no controls, no motion, no narration.' } },
  notebook: { label: 'Notebook', intent: 'A notebook card with runnable cells the learner can edit and run.', about: 'Cells that run as given; the learner presses Run to see the idea and may change a value and rerun.', fit: { narration: false, interactive: true, limits: 'Python cells the learner runs in the browser (Pyodide: numpy and pure Python; no torch, no network).' } },
  document: { label: 'Document', intent: 'A written document card: prose, headings, equations, lists.', about: 'A document card to read.', fit: { narration: false, interactive: false, limits: 'Text and equations to read; no code runs, no media.' } },
  browser: { label: 'Browser', intent: 'An existing web page captured onto the canvas, scrolled to a passage, with highlights (found, not made).', fit: { narration: null, interactive: null, limits: 'Finds and captures a public web page; highlights a passage. Never generates.' } },
});

// Never in the section set: the visual explain (N); quiz, flashcards and practice (Reviewer 10:50; practice is a later slice).
const NOT_IN_SECTIONS = new Set(['explain', 'quiz', 'flashcards', 'practice']);
const SEARCH = new Set(['youtube', 'wikipedia', 'arxiv', 'image']);
export const toolNameOf = command => `run_${command.replace(/-/g, '_')}`;
const entryOf = command => SLASH.find(c => c.name === command && c.places.includes('learn'));
const sectionTool = (command, sectionFlow) => (sectionFlow && Object.hasOwn(SECTION_TOOLS, command) ? SECTION_TOOLS[command] : null);
const fitOf = (command, sectionFlow) => sectionTool(command, sectionFlow)?.fit || FIT[command];
const labelFor = (command, sectionFlow) => sectionTool(command, sectionFlow)?.label || commandLabel(command);

// The direct tools this caller may use now: declared, not explicit-only, guarded ones only where the server enables them, and available
// (the same checks the router applies). -> [{ command, name, label }]. sectionFlow: the ordinary set minus NOT_IN_SECTIONS, plus SECTION_TOOLS.
export function directTools(env, email = null, { sectionFlow = false } = {}) {
  const tools = Object.entries(CHAT_CAPABILITIES)
    .filter(([command, cap]) => cap.flow === 'direct' && !cap.explicit && FIT[command] && entryOf(command))
    .filter(([command, cap]) => !cap.guarded || (command === 'explain' && env.EXPLAIN_V2_ENABLED === 'true'))
    .filter(([command]) => availability(env, { name: command, needs: entryOf(command).needs || null }, null, email))
    .map(([command]) => ({ command, name: toolNameOf(command), label: commandLabel(command) }));
  if (!sectionFlow) return tools;
  return [...tools.filter(t => !NOT_IN_SECTIONS.has(t.command) && !Object.hasOwn(SECTION_TOOLS, t.command)),
    ...Object.entries(SECTION_TOOLS).filter(([command]) => availability(env, { name: command, needs: entryOf(command)?.needs || null }, null, email))
      .map(([command, tool]) => ({ command, name: toolNameOf(command), label: tool.label }))];
}

// Native tool definitions (Claude input_schema; the OpenAI-compatible mapping reads the same object as parameters).
export function chatToolDefs(env, email = null, { sectionFlow = false } = {}) {
  return directTools(env, email, { sectionFlow }).map(({ command, name, label }) => ({
    name,
    description: `${sectionTool(command, sectionFlow)?.intent || CHAT_CAPABILITIES[command].intent} ${sectionTool(command, sectionFlow)?.about || entryOf(command).about} Limits: ${fitOf(command, sectionFlow).limits} Calling this only asks the app to open the ${label} command with your request; nothing exists until the learner uses it. Do not call it to answer a question about the tool, for conversation, or when the learner declines this format.`,
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
export function fitProblem(command, requirements, { sectionFlow = false } = {}) {
  const fit = fitOf(command, sectionFlow);
  if (!fit || !requirements) return null;
  if (requirements.narration === true && fit.narration === false) return `${labelFor(command, sectionFlow)} cannot provide narration`;
  if (requirements.interactive === true && fit.interactive === false) return `${labelFor(command, sectionFlow)} is not interactive`;
  return null;
}

// The qualified alternatives for a requirement set, from the same catalogue (Motion included), so the model can offer one or say none exists.
export function alternativesFor(env, email, requirements, exclude = null, { sectionFlow = false } = {}) {
  const ids = [...directTools(env, email, { sectionFlow }).map(t => t.command), ...(!sectionFlow && availability(env, { name: 'motion', needs: 'motion_dev' }, null, email) ? ['motion'] : [])];
  return ids.filter(id => id !== exclude && !SEARCH.has(id) && id !== 'browser' && !fitProblem(id, requirements, { sectionFlow })).map(id => labelFor(id, sectionFlow)); // a search finds existing material, never a substitute for making it
}

// One call: validate and either surface it ({ request: {command, args} }) or answer the model with why not ({ error }).
export function checkToolCall(env, email, call, { taken = false, sectionFlow = false } = {}) {
  const tool = directTools(env, email, { sectionFlow }).find(t => t.name === call?.name);
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
  const problem = fitProblem(tool.command, req, { sectionFlow });
  if (problem) {
    const alternatives = alternativesFor(env, email, req, tool.command, { sectionFlow });
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

// The roadmap's chat tool (start_lesson, Explain on canvas from typed words) is removed: the product has no roadmap (roadmap-unplug-spec.md, owner 2026-11-19).
