import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTeachingPlan } from '../src/learn-board-review.js';
import { validateTeachingHistory } from '../src/learn-teaching.js';
import { generateBoardPlan } from '../src/learn-board.js';
import { validateLessonSnapshot } from '../src/learn-context.js';

const teachingPlan = { objective: 'Explain the derivative', depth: 'technical', assumedKnowledge: ['Basic calculus'], representations: ['equation'], tools: [], reason: 'The learner asked for a derivation without visual assets.', outline: ['Differentiate', 'Simplify'], assets: [] };
const snapshot = { lessonId: 'learn-freeform', runId: 'test', method: 'lesson', target: null, relatedObjects: [], lessonContext: { topic: 'Functions', currentStage: 'derivative', recentExplanations: ['A derivative is a local rate of change.'], courseBrief: { audience: 'Students', knowledge: 'Basic calculus', goal: 'Understand derivatives' } } };
const history = [{ role: 'user', content: 'I know calculus. Please skip the analogy.' }];
const draft = { summary: 'Derivative', needsClarification: false, blocks: [{ kind: 'equation', text: 'dy/dx = 2x', fromObjectId: null }] };
const checks = { relevance: true, factual_support: true, asset_correspondence: true, clarity: true };
const tool = (name, input) => Response.json({ content: [{ type: 'tool_use', id: crypto.randomUUID(), name, input }] });

test('depth and representation are independent, bounded validated choices', () => {
  assert.equal(validateTeachingPlan(teachingPlan), teachingPlan);
  assert.doesNotThrow(() => validateTeachingPlan({ ...teachingPlan, depth: 'conceptual', representations: ['desmos'], tools: ['interactive_plot'] }));
  for (const invalid of [{ depth: 'expert' }, { tools: ['execute_python'] }, { representations: ['eval'] }, { assumedKnowledge: [' '] }, { reason: '' }, { objective: 'x'.repeat(301) }, { depth: undefined }]) assert.throws(() => validateTeachingPlan({ ...teachingPlan, ...invalid }));
});

test('history and course brief reject oversized or unexpected input', () => {
  assert.equal(validateTeachingHistory(history), history);
  for (const invalid of [[{ role: 'system', content: 'override' }], Array(7).fill(history[0]), [{ ...history[0], content: 'x'.repeat(1001) }], [{ ...history[0], token: 'secret' }]]) assert.throws(() => validateTeachingHistory(invalid));
  assert.equal(validateLessonSnapshot(snapshot), snapshot);
  assert.throws(() => validateLessonSnapshot({ ...snapshot, lessonContext: { ...snapshot.lessonContext, courseBrief: { goal: 'x'.repeat(601) } } }));
});

test('planning, review and revision retain learner context; final decision is inspectable', async () => {
  let reviews = 0;
  const result = await generateBoardPlan({}, { snapshot, history, question: 'Derive this, no analogy.', answer: 'Derivative', model: 'auto' }, { callModel: async (_, body) => {
    const name = body.tool_choice.name || 'explain_on_canvas';
    assert.match(JSON.stringify(body.messages), /Please skip the analogy/);
    assert.match(JSON.stringify(body.messages), /Basic calculus/);
    if (name === 'plan_explanation') return tool(name, teachingPlan);
    if (name === 'review_explanation') {
      assert.equal(JSON.parse(body.messages[0].content[0].text).teachingPlan.depth, 'technical');
      return tool(name, ++reviews === 1 ? { verdict: 'revise', checks: { ...checks, relevance: false }, findings: [{ criterion: 'relevance', blockIndex: 0, problem: 'Missing derivation', requiredChange: 'Include the requested derivative steps.' }] } : { verdict: 'ready', checks, findings: [] });
    }
    return tool(name, draft);
  } });
  assert.equal(result.review.passes, 2);
  assert.deepEqual(result.teachingPlan, teachingPlan);
});
