import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineEditToolFor, INLINE_IMAGE_TRANSFORM_SYSTEM } from '../src/agents/learn-inline.js';

test('only a validated image selection enables the bounded image plan schema', () => {
  const schema = inlineEditToolFor(true, false, true).input_schema;
  const plan = schema.properties.plan.properties;
  const step = plan.steps.items.properties;
  assert.equal(schema.properties.ops.maxItems, 0);
  assert.equal(plan.steps.maxItems, 1);
  assert.equal(plan.targetIds.maxItems, 1);
  assert.deepEqual(step.tool.enum, ['transform_image']);
  assert.deepEqual(step.input.properties.type.enum, ['crop','rotate','resize','pad']);
  assert.equal(step.input.additionalProperties, false);
  assert.equal(step.input.properties.width.maximum, 8192);
  assert.deepEqual(step.input.properties.fit.enum, ['contain','stretch']);
});
test('unconfigured, legacy, and notebook clients do not advertise image transforms', () => {
  for (const args of [[false,false,true],[true,false,false],[true,true,false]]) {
    const tools=inlineEditToolFor(...args).input_schema.properties.plan.properties.steps.items.properties.tool.enum;
    assert.equal(tools.includes('transform_image'),false);
  }
  assert.ok(inlineEditToolFor(true,true).input_schema.properties.plan.properties.steps.items.properties.tool.enum.includes('edit_notebook_cells'));
});
test('image preparation cannot advertise pixel recognition, removal or paid image editing', () => {
  assert.match(INLINE_IMAGE_TRANSFORM_SYSTEM,/explicit original-image pixels/);
  assert.match(INLINE_IMAGE_TRANSFORM_SYSTEM,/cannot remove a subject background/);
  assert.match(INLINE_IMAGE_TRANSFORM_SYSTEM,/Do not invent source pixels/);
  assert.match(INLINE_IMAGE_TRANSFORM_SYSTEM,/no provider image generation or code execution/);
});
