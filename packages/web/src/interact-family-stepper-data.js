// The validation-only half: closed data schemas, without templates or expansion.
import { WORDS, compositionSchemaFor } from './interact-stepper-schema.js';

export const id = 'stepper-states';
export const pickCriterion = 'An ordered sequence of discrete states in one fixed teaching picture, with linked emphasis and an explanation of the selected state.';
export const templates = Object.freeze(['stepper-brief', 'stepper-standard', 'stepper-deep']);
export const independent = Object.freeze({ id: 'step', domain: Object.freeze([0, 7]) });
const roles = Object.freeze([]);
export const templateData = Object.freeze(Object.fromEntries(['brief', 'balanced', 'detailed'].map((depth, i) => [templates[i], Object.freeze({
  lanes: 0, roles, independent, words: WORDS, sceneDataSchema: compositionSchemaFor(depth),
})])));
export const stepperData = Object.freeze({ id, pickCriterion, templates, templateData });
