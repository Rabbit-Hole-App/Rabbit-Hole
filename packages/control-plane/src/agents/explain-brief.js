// /explain v2 brief prompt and tool (EXP-T16; plan v2.1 sections 1.1, 1.4, 3.3). The brief says what the explanation will
// show, in plain sentences, and flags what the learner should know before approving it; the server, not the model, decides
// that it is reviewed (explain-brief.js briefDecision: every new request is).
import { GAP_NEEDS } from './explain-author.js';

// FX-60: what every brief says, so the learner can judge it before Generate: the four things a card's picture must make clear. Generic:
// it names no subject. The summary field carries them (no new field).
export const BRIEF_ELEMENTS = 'In the summary, say plainly: (1) what the learner will see: the objects drawn; (2) what visibly changes, as it plays or steps or when a control moves or a part is pressed; (3) which relationship or idea that change shows; (4) for each control, button or selectable part, what using it lets the learner test. Leave out (2) to (4) only for a picture that never changes.';

// componentNames: the catalogue the brief plans with; null on the program route, where no component is planned.
export function briefTool(componentNames) {
  const catalogue = Array.isArray(componentNames);
  return {
    name: 'explain_brief',
    description: catalogue ? 'The brief for one explanation card: what it will show, its assumptions and which components it plans to use.' : 'The brief for one explanation card: what it will show, what changes, what the learner adjusts and what it demonstrates, with its assumptions and limitations.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['title', 'summary', 'presentation', ...(catalogue ? ['components'] : []), 'assumptions', 'ambiguous', 'expanded'],
      properties: {
        title: { type: 'string', description: 'A short, specific title, at most 80 characters.' },
        summary: { type: 'string', description: catalogue ? `What the card will show: 3 to 5 complete plain sentences (at most 10). ${BRIEF_ELEMENTS} No lists, labels or prefixes such as "Will show".`
          : `What the card will show, what changes, what that change shows and what each control lets the learner test: 3 to 5 complete plain sentences. ${BRIEF_ELEMENTS} No lists, labels, prefixes, code, component or technical names.` },
        presentation: { type: 'string', enum: ['static', 'steps', 'time', 'experiment'], description: 'The simplest that teaches; static unless the idea needs more.' },
        ...(catalogue ? { components: { type: 'array', items: { type: 'string', enum: componentNames }, description: 'The catalogue components it plans to use.' } } : {}),
        assumptions: { type: 'array', items: { type: 'string' }, description: 'Material assumptions the learner should accept; empty when none.' },
        evidence_ids: { type: 'array', items: { type: 'string' }, description: 'Evidence record ids it relies on, from the input only.' },
        limitations: { type: 'array', items: { type: 'string' }, description: 'What it will leave out or cannot show, plainly.' },
        ambiguous: { type: 'boolean', description: 'true when the subject or its version is ambiguous.' },
        expanded: { type: 'boolean', description: 'true when the card goes beyond what was literally asked.' },
        gap: { type: 'object', additionalProperties: false, required: ['needs', 'reason'], properties: { needs: { type: 'array', items: { type: 'string', enum: GAP_NEEDS } }, reason: { type: 'string' } }, description: catalogue ? 'Only when the explanation cannot be drawn with the catalogue and supported features.' : 'Only when the explanation cannot be made within the runtime capabilities and limits.' },
      },
    },
  };
}

export const EXPLAIN_BRIEF_SYSTEM = `You plan one explanation card before it is drawn. Input: request (the learner's words, verbatim), context (attached material), evidence (records with ids and excerpts), catalogue (the components available, with what they draw), supported (features the drawing step can do now).
Write a brief the learner can approve: a title and 3 to 5 plain sentences saying what the card will show. ${BRIEF_ELEMENTS} Choose the simplest presentation that teaches (static unless steps, timing or an experiment is what makes the idea clear). List only catalogue components. Name material assumptions, and say plainly what it will leave out. Well-established textbook knowledge needs no evidence; rely on evidence ids only from the input.
Set ambiguous when the subject or its version could mean different things, expanded when the card goes beyond what was asked. If the idea cannot be drawn with the catalogue and supported features, fill gap instead of promising it.
Call explain_brief exactly once.`;

// The program route (EXPLAIN_PROGRAM_ENABLED): the card is a small generated visualization that runs in the learner's browser, so
// the plan is held to the runtime's real capabilities and limits instead of a component list.
export const EXPLAIN_PROGRAM_BRIEF_SYSTEM = `You plan one explanation card before it is made. Input: request (the learner's words, verbatim), context (attached material), evidence (records with ids and excerpts), runtime (what the card can do: its capabilities and limits, including how many controls and how many seconds of playback).
The card is a small visualization: it draws shapes, lines, curves, labels and equations, can play over time, and can offer the learner a few number or choice controls. It calculates and shows values from the same variables it draws.
Write a brief the learner can approve: a title and 3 to 5 plain sentences saying what the visualization will show. ${BRIEF_ELEMENTS} Write for the learner: never mention code, programs, components, capabilities, limits or other technical terms. For example: "Compare an object falling on Earth and on the Moon, side by side. Change the drop height and object mass, then play or scrub the motion. Compare their fall times and weights." (an example of the form only; write from the request).
Choose the simplest presentation that teaches: static, steps (named stages), time (it plays over time) or experiment (the learner moves a control). Plan no more controls or playback than the runtime allows. Put material assumptions and idealisations (for example "Air resistance is ignored.") in assumptions, and what it will leave out or cannot show in limitations; leave either empty when there is none. Well-established textbook knowledge needs no evidence; rely on evidence ids only from the input.
Set ambiguous when the subject or its version could mean different things, expanded when the card goes beyond what was asked. If the idea cannot be made within the runtime, fill gap instead of promising it.
Call explain_brief exactly once.`;

// Appended only when stateful programs are on (explain-program.js statefulEnabled): the card may also offer buttons and selectable parts.
export const EXPLAIN_STATEFUL_BRIEF_RULES = `
The card can also offer a few buttons and let the learner select or drag parts of the picture (runtime.buttons), remembering what happened: for example running an algorithm one step per press, or choosing an item and seeing the consequence. Plan buttons or selections only when pressing or choosing is what teaches the idea, and say in the summary what the learner presses or selects and what it shows.`;
