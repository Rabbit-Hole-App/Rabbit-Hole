// Compatibility path: the grading instructions and VERDICT helpers live in
// packages/control-plane/src/agents/learn-grade.js. The benchmark CLI and the
// tests import them from here.
export { assessBody, challengePrompt, explainBackPrompt, parseVerdict, stripVerdict } from '../../control-plane/src/agents/learn-grade.js';
