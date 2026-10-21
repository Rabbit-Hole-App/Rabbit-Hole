import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITIES, inlineRouteTool } from './inline-ai-decide.js';
import { EXPLICIT_ROUTES, decideRoute, planRoute } from './inline-ai-route.js';
import { INLINE_TOOLS } from './inline-tool-capabilities.js';
import { inlineProvenance } from './inline-ai-apply.js';

test('existing Explain routes resolve registered tools without changing route choice', () => {
  assert.equal(inlineRouteTool('compare'), 'compare_selection');
  // Owner, 2026-10-20: /compare is no longer a typed command; comparing in plain words still reaches the compare route (JEV).
  assert.match(planRoute({ mode: 'explain', prompt: '/compare these snippets', enabled: ['compare'] }).clarify.question, /^\/compare is no longer available/);
  assert.deepEqual(planRoute({ mode: 'explain', prompt: 'compare these snippets side by side', enabled: ['compare'] }), { classify: true });
  assert.deepEqual(decideRoute({ choice: 'compare', confidence: 0.9, probability: 0.9, ranked: ['compare', 'note'] }, { enabled: ['note', 'compare'] }), { route: 'compare', via: 'jev' });
  for (const [route, descriptor] of Object.entries({ ...CAPABILITIES, ...EXPLICIT_ROUTES })) {
    if (descriptor.tool) assert.ok(INLINE_TOOLS[inlineRouteTool(route)]);
  }
  assert.equal(inlineRouteTool('edit'), null);
  assert.equal(inlineRouteTool('run_code'), null);
  assert.equal(inlineRouteTool('unknown'), null);
});

test('explicit-only and unavailable output routes keep existing restrictions', () => {
  assert.equal(CAPABILITIES.flashcards, undefined);
  assert.equal(inlineRouteTool('flashcards'), 'create_learning_artifact');
  assert.ok(planRoute({ mode: 'explain', prompt: '/flashcards terms', enabled: [] }).unavailable);
  assert.ok(planRoute({ mode: 'edit', prompt: '/compare snippets', enabled: ['compare'] }).clarify);
  assert.equal(inlineRouteTool('cad'), null, 'CAD scope is not expanded');
});

test('saved provenance derives its tool from the existing route and preserves range', () => {
  const frozen = { ids: ['code'], range: { id: 'code', from: 1, to: 5 } };
  const record = inlineProvenance({ requestId: 'r', route: 'compare', frozen });
  assert.deepEqual(JSON.parse(JSON.stringify(record)), { requestId: 'r', mode: 'explain', route: 'compare', sources: ['code'], tool: 'compare_selection', range: frozen.range });
  assert.equal(inlineProvenance({ requestId: 'r', mode: 'edit', route: 'compare', frozen }).tool, undefined);
});
