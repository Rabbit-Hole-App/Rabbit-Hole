// Where the Tutor runs, and with which TutorDomain (Professor Next Steps Task 0, owner 2026-10-06). Shared Tutor code
// never asks which course a canvas is: a course or context is registered here as data - how it is recognised (its
// repository id, which names the course app and a hole's repository root; its board id, the board and a hole's board
// root), its TutorDomain (docs/features/adaptive-learning-path-v1-architecture.md §3) and its capabilities - and
// tutorContext resolves any canvas from that data and the journey state. nanoGPT is one entry.
import { NANOGPT, TUTOR_BOARD } from './learn-tutor-claims.js';
import { canvasDomain, journeyDomain } from './learn-journey-domain.js';

// capabilities: tutor - the Tutor answers there; hook_turns - hook clicks only (Ruling F4); evidence - where its evidence
// lives ('session': the browser's tab store); suppliedCourse - the course's lesson ships with the product (LearnPage).
// ponytail: one supplied lesson module (nanogpt-lesson.js); an entry names its lesson when a second supplied course ships.
// Eligibility is not readiness: a second non-journey course would still get the nanoGPT planner prompt (agents/learn-tutor.js
// PLANNER_SYSTEM, chosen when no journey or canvas context is sent) and share the tab-wide session store (storeKey(app)); an entry
// names its prompt and its store key when that course ships.
export const TUTOR_DOMAINS = [
  { id: 'nanogpt-attention', match: { repo: 'karpathy/nanoGPT', board: TUTOR_BOARD }, domain: NANOGPT, capabilities: { tutor: true, evidence: 'session', suppliedCourse: true } },
];

// The registered entry a canvas is, by its data alone: the course app's repository, the board open now, or a hole's root
// (the server names a repository root by its repo). An entry without a repo or board never matches on it.
export function registeredCourse({ app = null, board = null, root = null }, registry = TUTOR_DOMAINS) {
  return registry.find(({ match: { repo, board: id } = {} }) => (repo && (app?.repo === repo || (root?.kind === 'repository' && root.title === repo)))
    || (id && (board === id || root?.board === id))) || null;
}

// { domain, capabilities, source } or null (no Tutor: the Learn chat stays). Precedence: a live journey on this board, a
// hole whose dive record carries a journey once its parent journey is read (LP1 Task 14), then a registered entry with
// a domain and capabilities.tutor, or capabilities.hook_turns (Ruling F4: hook clicks only; useTutor keeps typed turns
// on capabilities.tutor); a registered entry that refuses both is null. Anywhere else - a plain canvas, a plain hole, a
// hole from a shared canvas - the canvas domain for hook clicks only (Task 10, Ruling F4): goal the hole's learning_goal,
// else the live canvas title (a hole's too, fix round 2), else a hole's creation-time title; origin the shared canvas a hole
// came from. app: the course app, only on its own canvas
// (LearnPage). blocks: the canvas blocks a journey domain is built over (per turn). title: the live canvas title.
export function tutorContext({ app = null, board = null, root = null, journey = null, parentJourney = null, record = null, blocks = [], title = null }, registry = TUTOR_DOMAINS) {
  if (journey?.journey) return { domain: journeyDomain({ journey: journey.journey, path: journey.path, blocks }), capabilities: { tutor: true, evidence: 'journey' }, source: 'journey' };
  if (parentJourney && record?.journey) {
    return { domain: journeyDomain({ journey: parentJourney.journey, path: parentJourney.path, blocks, dive: record.journey }), capabilities: { tutor: true, evidence: 'session' }, source: 'dive' };
  }
  const entry = registeredCourse({ app, board, root }, registry);
  if (!entry) return { domain: canvasDomain({ goal: record ? record.learning_goal || title || record.title : title, origin: record?.source?.title }), capabilities: { tutor: false, hook_turns: true }, source: 'canvas' };
  return entry.domain && (entry.capabilities?.tutor === true || entry.capabilities?.hook_turns === true) ? { domain: entry.domain, capabilities: entry.capabilities, source: 'registry' } : null;
}
