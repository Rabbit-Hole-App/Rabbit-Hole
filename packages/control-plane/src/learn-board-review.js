import { validateToolInput } from './learn-validation.js';
import { TEACHING_TOOLS, REPRESENTATIONS } from './learn-teaching.js';

// A short, observable teaching plan, not private chain-of-thought.
export const PLAN_TOOL = { name: 'plan_explanation', description: 'Plan what the learner should understand and which assets can demonstrate it before gathering assets.', input_schema: {
  type: 'object', additionalProperties: false, required: ['objective', 'depth', 'assumedKnowledge', 'representations', 'tools', 'reason', 'outline', 'assets'], properties: {
    objective: { type: 'string', minLength: 1, maxLength: 300 },
    depth: { type: 'string', enum: ['quick', 'conceptual', 'technical', 'deep_dive'] },
    assumedKnowledge: { type: 'array', maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 200 } },
    representations: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', enum: REPRESENTATIONS } },
    tools: { type: 'array', maxItems: 5, items: { type: 'string', enum: TEACHING_TOOLS } },
    reason: { type: 'string', minLength: 1, maxLength: 400, description: 'Brief decision summary: why this depth and these representations/tools fit the learner request. No private chain-of-thought.' },
    outline: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 400 } },
    assets: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 400 } },
  },
} };

export function validateTeachingPlan(value) {
  // The plan is internal scaffolding and its list lengths are budget limits,
  // not correctness: trim an over-long list instead of spending the one format
  // repair on it, which would leave nothing for a real mistake.
  const caps = { assumedKnowledge: 4, representations: 5, tools: 5, outline: 5, assets: 5 };
  if (value && typeof value === 'object') {
    for (const [key, cap] of Object.entries(caps)) if (Array.isArray(value[key]) && value[key].length > cap) value[key] = value[key].slice(0, cap);
  }
  validateToolInput(value, PLAN_TOOL.input_schema, 'teachingPlan');
  const text = (s, max) => typeof s === 'string' && !!s.trim() && s.length <= max;
  if (!text(value.objective, 300) || !text(value.reason, 400) || value.assumedKnowledge.some(s => !text(s, 200)) || value.outline.some(s => !text(s, 400)) || value.assets.some(s => !text(s, 400))) throw new Error('Invalid teaching plan');
  return value;
}

export const REVIEW_CHECKS = ['relevance', 'factual_support', 'asset_correspondence', 'clarity'];
export { BOARD_REVIEW_SYSTEM } from './agents/learn-board.js';

export const REVIEW_TOOL = { name: 'review_explanation', description: 'Decide whether a visual explanation is ready or requires revision, with actionable evidence-based findings.', input_schema: {
  type: 'object', additionalProperties: false, required: ['verdict', 'checks', 'findings'], properties: {
    verdict: { type: 'string', enum: ['ready', 'revise'] },
    checks: { type: 'object', additionalProperties: false, required: REVIEW_CHECKS, properties: Object.fromEntries(REVIEW_CHECKS.map(key => [key, { type: 'boolean' }])) },
    findings: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['criterion', 'blockIndex', 'problem', 'requiredChange'], properties: {
      criterion: { type: 'string', enum: REVIEW_CHECKS }, blockIndex: { type: 'integer', minimum: 0, maximum: 7 },
      problem: { type: 'string', minLength: 1, maxLength: 1500 }, requiredChange: { type: 'string', minLength: 1, maxLength: 1500 },
    } } },
  },
} };

export function validateBoardReview(review, blockCount) {
  if (!review || !['ready', 'revise'].includes(review.verdict) || !review.checks || Object.keys(review.checks).length !== REVIEW_CHECKS.length || REVIEW_CHECKS.some(k => typeof review.checks[k] !== 'boolean') || !Array.isArray(review.findings) || review.findings.length > 6 || Object.keys(review).some(k => !['verdict', 'checks', 'findings'].includes(k))) throw new Error('Invalid explanation review');
  for (const f of review.findings) {
    if (!f || !REVIEW_CHECKS.includes(f.criterion) || !Number.isInteger(f.blockIndex) || f.blockIndex < 0 || f.blockIndex >= blockCount || ['problem', 'requiredChange'].some(k => typeof f[k] !== 'string' || !f[k].trim() || f[k].length > 1500) || Object.keys(f).some(k => !['criterion', 'blockIndex', 'problem', 'requiredChange'].includes(k))) throw new Error('Invalid explanation finding');
  }
  // A concrete defect overrides a contradictory pass checkbox, never the reverse.
  const checks = { ...review.checks };
  for (const finding of review.findings) checks[finding.criterion] = false;
  review = { ...review, checks, verdict: review.findings.length ? 'revise' : review.verdict };
  const passed = REVIEW_CHECKS.every(k => review.checks[k]);
  if ((review.verdict === 'ready') !== passed || (passed && review.findings.length) || REVIEW_CHECKS.some(k => !review.checks[k] && !review.findings.some(f => f.criterion === k))) throw new Error('Explanation review verdict disagrees with findings');
  return review;
}

// Claude strict tools enforce required fields/types. Numeric/string/array limits
// are not grammar-supported, so retain them as descriptions and validate locally.
export function strictTool(tool) {
  const limits = new Set(['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems']);
  const transform = value => {
    if (Array.isArray(value)) return value.map(transform);
    if (!value || typeof value !== 'object') return value;
    const result = {}, hints = [];
    for (const [key, child] of Object.entries(value)) {
      if (limits.has(key)) hints.push(`${key}: ${child}`);
      else result[key] = transform(child);
    }
    if (hints.length) result.description = [result.description, hints.join('; ')].filter(Boolean).join('. ');
    return result;
  };
  return { ...tool, strict: true, input_schema: transform(tool.input_schema) };
}
