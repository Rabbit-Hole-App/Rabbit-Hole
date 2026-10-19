import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEdit } from '../src/learn-inline.js';
import { inlineEditToolFor } from '../src/agents/learn-inline.js';
import { freezeInlineTools } from '../../web/src/inline-tool-plan.js';
const snapshot = freezeInlineTools({ blocks: [{ id: 'image', type: 'image', assetKey: 'saved-image', dx: 0, dy: 0 }], items: [], shapes: [], links: [] }, ['image']);
const context = { toolSnapshot: snapshot };
const options = { requestId: 'req-image-action', mode: 'edit' };
const action = { summary: 'Prepare background removal', ops: [], action: { tool: 'remove_background', targetId: 'image' } };
test('natural image action returns a confirmation handoff, never a mutation or execution', () => {
  const value = checkEdit(action, ['image'], context, options);
  assert.equal(value.error, undefined);
  assert.deepEqual(value.result, { kind: 'image_action', action: 'remove_background', targetId: 'image', requestId: options.requestId, summary: action.summary });
  assert.equal(checkEdit({ ...action, action: { tool: 'edit_image', targetId: 'image' } }, ['image'], context, options).result.action, 'edit_image');
});
test('image action refuses mixed changes, arbitrary targets, absent snapshots and Explain mode', () => {
  for (const [input, targets, ctx, opts] of [
    [{ ...action, ops: [{ op: 'replace_text', id: 'image', text: 'oops' }] }, ['image'], context, options],
    [{ ...action, plan: {} }, ['image'], context, options],
    [{ ...action, action: { tool: 'remove_background', targetId: 'other' } }, ['image'], context, options],
    [{ ...action, action: { ...action.action, prompt: 'injected' } }, ['image'], context, options],
    [action, ['image'], {}, options], [action, ['image'], context, { ...options, mode: 'explain' }],
    [action, ['other'], context, options], [action, ['image'], context, { ...options, requestId: '' }],
  ]) assert.ok(checkEdit(input, targets, ctx, opts).error);
});
test('only frozen image tool schema offers image handoff', () => {
  const schema = inlineEditToolFor(true, false, true).input_schema;
  assert.deepEqual(schema.properties.action.properties.tool.enum, ['remove_background', 'edit_image']);
  for (const args of [[false, false, true], [true, false, false]]) assert.equal(inlineEditToolFor(...args).input_schema.properties.action, undefined);
});
