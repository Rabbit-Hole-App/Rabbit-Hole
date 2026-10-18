import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineEditToolFor } from '../src/agents/learn-inline.js';
import { jevDecideRequest, modelDecideRequest } from '../src/learn-inline-route.js';
import { freezeInlineTools } from '../../web/src/inline-tool-plan.js';

test('notebook split schema bounds cuts and scope without permitting model-generated cell identities', () => {
  const step=inlineEditToolFor(true,true).input_schema.properties.plan.properties.steps.items.properties;
  assert.ok(step.tool.enum.includes('edit_notebook_cells'));
  const split=step.input.properties.splits;
  assert.equal(split.maxItems,20);assert.equal(split.items.properties.offsets.maxItems,3);
  assert.equal(split.items.additionalProperties,false);
  assert.deepEqual(Object.keys(split.items.properties),['id','offsets']);
  assert.equal(step.input.properties.edits.minItems,0);
});
test('decision payloads recognize exact-source splitting while keeping execution unavailable', () => {
  const block={id:'notebook',type:'notebook',notebook_id:'workspace',active_path:'a.ipynb',ipynb_path:'a.ipynb',ipynb:{nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'cell',cell_type:'code',source:'x=1\ny=2',metadata:{},outputs:[],execution_count:null}]}};
  const scope={id:block.id,notebookId:block.notebook_id,path:'a.ipynb',cellIds:['cell'],revision:JSON.stringify(block.ipynb)};
  const snapshot=freezeInlineTools({blocks:[block],items:[],shapes:[],links:[]},[block.id],{}, {notebook:scope});assert.ok(snapshot);
  const request={kind:'selection',mode:'edit',targetIds:[block.id],prompt:'Split this cell after the first line',context:{toolSnapshot:snapshot,target:{ids:[block.id],objects:[{id:block.id,type:'notebook',text:'Selected code cell'}]}}};
  for(const payload of [jevDecideRequest(request,{capability:'edit'},'fixture'),modelDecideRequest(request,{capability:'edit'})]) {
    assert.match(JSON.stringify(payload),/partitioned into bounded exact-source fragments/);
    assert.match(JSON.stringify(payload),/without execution/);
  }
});
