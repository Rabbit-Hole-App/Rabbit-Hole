// Tutor v1 evaluation ladder on REAL models (docs/features/tutor-v1-locked-decisions.md §3): the JEV
// rung and the larger-evaluator rung, called directly with the keys in packages/web/.dev.vars
// (gitignored; TYPESAFE_API_KEY and ANTHROPIC_API_KEY). Paid calls: run by hand, never from make.
// The planner is exercised end to end by `tutor-slice-check.mjs --live`.
// Usage: node e2e/tutor-live-rungs.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { jevRung, largerRung, JEV_TIMEOUT_MS } from '../../control-plane/src/learn-tutor-routes.js';
import { CLAIMS } from '../src/learn-tutor-claims.js';

const env = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
for (const name of ['TYPESAFE_API_KEY', 'ANTHROPIC_API_KEY']) assert.ok(env[name], `${name} missing from packages/web/.dev.vars`);

// The same claim shape evaluationSpec (learn-tutor.js) sends.
const claim = id => ({ id, concept: CLAIMS[id].concept, statement: CLAIMS[id].statement, ideas: CLAIMS[id].ideas, misconceptions: CLAIMS[id].misconceptions, drawn: CLAIMS[id].drawn });
const spec = { answering: false, claims: [claim('attention/weights-from-scores'), claim('causal-mask/applied-before-softmax')], gaps: [] };
const summary = result => ({ status: result.status, evaluator: result.evaluator, events: result.events?.map(event => `${event.claim}:${event.result}${event.settled ? '' : '(unsettled)'}${event.misconception ? `:${event.misconception}` : ''}`), ...(result.error ? { error: result.error } : {}) });
const timed = async (label, run) => { const start = Date.now(); const result = await run(); console.log(label, `${Date.now() - start} ms`, JSON.stringify(summary(result))); return result; };

// JEV on an unprompted explanation, and on the misconception the claim names. The budget is the
// locked 800 ms (JEV_TIMEOUT_MS); the first call opens the connection.
const explanation = 'The scores go through softmax, so every weight is positive and they add up to one; the output mixes the values with those weights.';
const wrong = 'The mask is applied after softmax: it zeroes the weights of the later characters.';
const jev = [];
for (let i = 0; i < 3; i++) jev.push(await timed(`jev explanation #${i + 1} (budget ${JEV_TIMEOUT_MS} ms)`, () => jevRung(env, spec, explanation)));
jev.push(await timed('jev misconception', () => jevRung(env, spec, wrong)));

// The larger evaluator, called directly: in the route it runs only when JEV is uncertain.
const larger = await timed('larger evaluator', () => largerRung(env, spec, 'I think softmax is kind of in the middle of it? The weights come out of the scores somehow, maybe they add to one.'));

assert.ok(jev.some(result => result.status !== 'error'), 'real JEV answered at least one Tutor evaluation');
assert.equal(larger.evaluator, 'larger');
assert.notEqual(larger.status, 'error', `the larger evaluator answered: ${larger.error || ''}`);
console.log('tutor-live-rungs ok');
