// /explain v2 brief prompt and tool (EXP-T16; plan v2.1 sections 1.1, 1.4, 3.3). The brief says what the explanation will
// show, in plain sentences, and flags what makes it need the learner's review; the server, not the model, decides whether
// it does (explain-brief.js briefDecision).
import { GAP_NEEDS } from './explain-author.js';

export function briefTool(componentNames) {
  return {
    name: 'explain_brief',
    description: 'The brief for one explanation card: what it will show, its assumptions and which components it plans to use.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['title', 'summary', 'presentation', 'components', 'assumptions', 'ambiguous', 'expanded'],
      properties: {
        title: { type: 'string', description: 'A short, specific title, at most 80 characters.' },
        summary: { type: 'string', description: 'What the card will show: 3 or 4 complete plain sentences (at most 10). No lists, labels or prefixes such as "Will show".' },
        presentation: { type: 'string', enum: ['static', 'steps', 'time', 'experiment'], description: 'The simplest that teaches; static unless the idea needs more.' },
        components: { type: 'array', items: { type: 'string', enum: componentNames }, description: 'The catalogue components it plans to use.' },
        assumptions: { type: 'array', items: { type: 'string' }, description: 'Material assumptions the learner should accept; empty when none.' },
        evidence_ids: { type: 'array', items: { type: 'string' }, description: 'Evidence record ids it relies on, from the input only.' },
        limitations: { type: 'array', items: { type: 'string' }, description: 'What it will leave out or cannot show, plainly.' },
        ambiguous: { type: 'boolean', description: 'true when the subject or its version is ambiguous.' },
        expanded: { type: 'boolean', description: 'true when the card goes beyond what was literally asked.' },
        gap: { type: 'object', additionalProperties: false, required: ['needs', 'reason'], properties: { needs: { type: 'array', items: { type: 'string', enum: GAP_NEEDS } }, reason: { type: 'string' } }, description: 'Only when the explanation cannot be drawn with the catalogue and supported features.' },
      },
    },
  };
}

export const EXPLAIN_BRIEF_SYSTEM = `You plan one explanation card before it is drawn. Input: request (the learner's words, verbatim), context (attached material), evidence (records with ids and excerpts), catalogue (the components available, with what they draw), supported (features the drawing step can do now).
Write a brief the learner can approve: a title and 3 or 4 plain sentences saying what the card will show. Choose the simplest presentation that teaches (static unless steps, timing or an experiment is what makes the idea clear). List only catalogue components. Name material assumptions, and say plainly what it will leave out. Well-established textbook knowledge needs no evidence; rely on evidence ids only from the input.
Set ambiguous when the subject or its version could mean different things, expanded when the card goes beyond what was asked. If the idea cannot be drawn with the catalogue and supported features, fill gap instead of promising it.
Call explain_brief exactly once.`;
