import { AUTHOR_PICTURE_LIMITS, NO_TEXT_SUFFIX as NO_TEXT } from './learn-primitives.js';

// Fill the braces with concrete visual details. Supply a noun phrase for subject and a viewpoint or framing for view.
export const EXPLANATION_PICTURE_TEMPLATES = Object.freeze({
  'object-mechanism': `Technical cutaway of {subject} showing {partsAndAction}. ${NO_TEXT}`,
  'positional-cause': `Textbook illustration of {subject}, {view}, showing the arrangement of {objectsAndPositions}. ${NO_TEXT}`,
  appearance: `Realistic exterior of {subject}, {view}, showing {visibleFeatures}. ${NO_TEXT}`,
  organism: `Natural-history illustration of {subject}, {view}, showing {traitInContext}. ${NO_TEXT}`,
  'repeating-structure': `Scientific close-up of {subject} showing {unitAndPattern}. ${NO_TEXT}`,
});

// Builds the p field of an author picture. Shorten the supplied phrases if the filled prompt exceeds the budget.
export function buildPicturePrompt(subjectClass, slots) {
  if (!Object.hasOwn(EXPLANATION_PICTURE_TEMPLATES, subjectClass)) throw new TypeError('Unknown picture subject class');
  const prompt = EXPLANATION_PICTURE_TEMPLATES[subjectClass].replace(/\{(\w+)\}/g, (_, name) => {
    const value = slots?.[name];
    const detail = typeof value === 'string' ? value.trim() : '';
    if (!detail) throw new TypeError(`Picture prompt requires ${name}`);
    return detail;
  });
  if (prompt.length > AUTHOR_PICTURE_LIMITS.prompt) throw new RangeError(`Picture prompt exceeds ${AUTHOR_PICTURE_LIMITS.prompt} characters`);
  return prompt;
}
