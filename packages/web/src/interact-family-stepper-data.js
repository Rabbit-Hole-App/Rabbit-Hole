// The validation-only half: closed data schemas, without templates or expansion.
import { WORDS, compositionSchemaFor } from './interact-stepper-schema.js';
import { treeTraceSchema } from './interact-templates/tree-trace.js';

export const id = 'stepper-states';
export const pickCriterion = 'A process shown as a sequence of discrete states or steps that the learner advances one at a time (an algorithm, a protocol, a cycle).';  // the same text the coverage bench asks (scripts/interact/bench-coverage.mjs imports it)
export const templates = Object.freeze(['stepper-brief', 'stepper-standard', 'stepper-deep', 'stepper-tree-trace']);
export const independent = Object.freeze({ id: 'step', domain: Object.freeze([0, 7]) });
const roles = Object.freeze([]);
export const templateData = Object.freeze(Object.fromEntries([...['brief', 'balanced', 'detailed'].map((depth, i) => [templates[i], Object.freeze({
  lanes: 0, roles, independent, words: WORDS, sceneDataSchema: compositionSchemaFor(depth),
})]), ['stepper-tree-trace', Object.freeze({ lanes: 0, roles, independent, words: [], sceneDataSchema: treeTraceSchema })]]));
export const stepperData = Object.freeze({ id, pickCriterion, templates, templateData });
