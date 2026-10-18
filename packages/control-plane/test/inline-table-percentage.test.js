import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineEditToolFor, INLINE_EDIT_SYSTEM } from '../src/agents/learn-inline.js';
import { freezeInlineTools, validateInlinePlan } from '../../web/src/inline-tool-plan.js';
test('percentage schema reaches the shared table preview without widening mutation scope',()=>{
  const properties=inlineEditToolFor(true).input_schema.properties.plan.properties.steps.items.properties.input.properties;
  assert.ok(properties.operation.enum.includes('percentage_change'));
  for(const key of ['fromColumn','toColumn','outputColumn','decimalPlaces'])assert.ok(properties[key]);
  assert.match(INLINE_EDIT_SYSTEM,/percentage_change/);
  const source={blocks:[{id:'t',type:'table',title:'Timing',x:30,y:50,columns:['Before','After'],rows:[['100','125']]}]};
  const snapshot=freezeInlineTools(source,['t']);
  const input={operation:'percentage_change',fromColumn:0,toColumn:1,outputColumn:'Change (%)',unitFrom:'ms',unitTo:'ms'};
  const plan={mode:'edit',targetIds:['t'],steps:[{tool:'transform_table',targetIds:['t'],input}]};
  const result=validateInlinePlan(plan,snapshot,source);
  assert.equal(result.ok,true);assert.deepEqual(result.changes[0].after.rows,[['100','125','25']]);
  assert.equal(result.changes[0].after.x,30);assert.deepEqual(source.blocks[0].columns,['Before','After']);
  source.blocks[0].rows[0][0]='200';assert.equal(validateInlinePlan(plan,snapshot,source).ok,false);
});
