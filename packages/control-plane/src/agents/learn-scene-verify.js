// The verifier pass over a generated interactive scene (owner, 2026-10-21, L10): a second call reads the card back as a
// learner meets it, setting by setting (learn-scene-gates.js cardAtSettings), and reports statements that are false. Any
// report goes to the existing one repair; a scene still reported is no card (learn-artifact.js). Server-only.

export const VERIFY_SYSTEM = `You check one interactive learning card before a learner sees it. The card is described setting by setting: for each setting of its controls, what every object on it shows (texts, labels, and the numbers its data objects draw).
Report only statements that are false:
- a sentence, label or number that the card's own numbers at that setting contradict: a count, range, total, difference, equality, crossing, maximum or step result it states that the values drawn at that setting do not show;
- a statement that is wrong about the subject itself: a wrong formula, law, definition, algorithm step or fact, or numbers that cannot come from the rule the card says produced them.
Numbers the card calls illustrative or example values may be invented; what the card says about them must still hold. Do not report wording, style, layout, simplifications, rounding to the shown precision, or what the card leaves out.
Check every setting. Call report_check once: each false statement with the setting where it shows, or an empty list when nothing is false.`;

export const VERIFY_TOOL = {
  name: 'report_check',
  description: 'Report every false statement on the card, or an empty list when there is none.',
  input_schema: { type: 'object', additionalProperties: false, required: ['problems'], properties: { problems: { type: 'array', maxItems: 8, items: {
    type: 'object', additionalProperties: false, required: ['object', 'says', 'wrong'], properties: {
      setting: { type: 'string', maxLength: 200 }, object: { type: 'string', maxLength: 64 }, says: { type: 'string', maxLength: 300 }, wrong: { type: 'string', maxLength: 400 },
    } } } } },
};

const CALCULATION = { live: 'calculated live from the controls', precomputed: 'precomputed: each setting shows stored results', none: 'absent: it shows no numbers' };
export const verifyMessage = ({ request, title, calculation, card }) =>
  `The learner asked: ${request || '(no words)'}\nCard title: ${title}\nThe card says its numbers are ${CALCULATION[calculation] || calculation}.\n\n${card}`;
