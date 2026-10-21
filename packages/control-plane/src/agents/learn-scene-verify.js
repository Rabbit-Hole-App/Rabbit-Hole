// The verifier pass over a generated interactive scene (owner, 2026-10-21, L10): a second call reads the card back as a
// learner meets it, setting by setting (learn-scene-gates.js cardAtSettings), and reports statements that are false. Any
// report goes to the existing one repair; a scene still reported is no card (learn-artifact.js). Server-only.

export const VERIFY_SYSTEM = `You check one interactive learning card before a learner sees it. The card is described setting by setting: for each setting of its controls, what every object on it shows (texts, labels, and the numbers its data objects draw).
Look for statements that are false:
- a sentence, label or number that the card's own numbers at that setting contradict: a count, range, total, difference, equality, crossing, maximum or step result it states that the values drawn at that setting do not show;
- a statement that is wrong about the subject itself: a wrong formula, law, definition, algorithm step or fact, or numbers that cannot come from the rule the card says produced them.
Numbers the card calls illustrative or example values may be invented; what the card says about them must still hold. Do not report wording, style, layout, simplifications or what the card leaves out. A number shown at the card's display precision is correct: 1102.50 shown as 1103 is not a contradiction.
Check every setting, then call report_check once. List each statement you examined that might be wrong. For each, copy into says the card's own statement exactly as the card shows it, and into against the card's own value or statement it is checked against, also copied exactly (for example [60.00, 80.00]); an item whose quotes are not on the card is ignored. Then write finding: what the card's numbers or the subject show about the statement. Only after the finding, set status: "false" when the finding shows the statement is false, "correct" when it holds; only false ones count. For a wrong number, also give shown (the number as the card prints it) and expected (its true value). When nothing might be wrong, problems is an empty list.`;

// Field order is the order the model fills them in: the finding before the status, so a statement is judged after it is checked.
export const VERIFY_TOOL = {
  name: 'report_check',
  description: 'The statements examined, each checked and then marked false or correct, with exact quotes from the card (an empty list when none might be wrong).',
  input_schema: { type: 'object', additionalProperties: false, required: ['problems'], properties: { problems: { type: 'array', maxItems: 12, items: {
    type: 'object', additionalProperties: false, required: ['object', 'says', 'against', 'finding', 'status'], properties: {
      setting: { type: 'string', maxLength: 200 }, object: { type: 'string', maxLength: 64 },
      says: { type: 'string', maxLength: 300 }, against: { type: 'string', maxLength: 300 },
      finding: { type: 'string', maxLength: 400 }, status: { type: 'string', enum: ['false', 'correct'] },
      shown: { type: 'string', maxLength: 40 }, expected: { type: 'number' },
    } } } } },
};

// What the server keeps of a report (owner/integrator, 2026-10-21): items marked false whose quotes are on the card, and not
// a number that is its true value at the card's display precision. A quote is matched case- and spacing-insensitively.
const plain = text => String(text ?? '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().replace(/^["']+|["'.,;:]+$/g, '').toLowerCase();
const places = text => String(text).match(/\.(\d+)/)?.[1].length ?? 0;
const quoted = (page, text) => Boolean(plain(text)) && page.includes(plain(text));
// A wrong number whose true value, printed at the shown number's places, is the shown number: display precision, not an error.
const rounding = item => item.shown != null && Number.isFinite(item.expected) && Number(String(item.shown).replace(/[^\d.-]/g, '')) === Number(item.expected.toFixed(places(item.shown)));
export function falseItems(problems, card) {
  const page = plain(card);
  return problems.filter(item => item?.status === 'false' && quoted(page, item.says) && quoted(page, item.against) && !rounding(item));
}

const CALCULATION = { live: 'calculated live from the controls', precomputed: 'precomputed: each setting shows stored results', none: 'absent: it shows no numbers' };
export const verifyMessage = ({ request, title, calculation, card }) =>
  `The learner asked: ${request || '(no words)'}\nCard title: ${title}\nThe card says its numbers are ${CALCULATION[calculation] || calculation}.\n\n${card}`;
