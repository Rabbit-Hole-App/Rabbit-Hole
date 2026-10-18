import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEdit, checkExplanation, inlineGenerateFetch } from '../src/learn-inline.js';
import { decide, jevDecideRequest, modelDecideRequest } from '../src/learn-inline-route.js';
import { inlineEditToolFor } from '../src/agents/learn-inline.js';
import { freezeInlineTools, inlineToolSnapshotBoard, validateInlinePlan } from '../../web/src/inline-tool-plan.js';
import { KEY_ENV, decided } from './learn-inline-fixture.js';
import { readGeneration } from '../../web/src/inline-ai-transport.js';

const requestId = 'req-tools-12345678';
const shape = id => ({id,kind:'rect',text:id,x1:0,y1:0,x2:80,y2:40});
function fixture(table = false) {
  const board = {shapes:[shape('a'),shape('b')],links:[{id:'ab',from:'a',to:'b'}],items:[],blocks:[{id:'table',type:'table',title:'Values',columns:['Value'],rows:[['2'],['1']]}]};
  const ids = table ? ['table'] : ['a','b','ab'];
  const snapshot = freezeInlineTools(board,ids,{});
  assert.ok(snapshot);
  const context = {target:{ids,objects:ids.map(id=>({id,text:id}))},toolSnapshot:snapshot};
  const plan = {mode:'edit',targetIds:ids,steps:[table ? {tool:'transform_table',targetIds:ids,input:{operation:'sort',column:0}} : {tool:'edit_diagram',targetIds:ids,input:{add:{shapes:[{id:'check',label:'Check'}],links:[{id:'cb',from:'check',to:'b'}]},changes:[{id:'ab',patch:{to:'check'}}]}}]};
  return {board,ids,context,plan};
}
const edit = plan => ({summary:'Update selection',ops:[],plan});
test('table and diagram plans use the same deterministic frontend validator', () => {
  for (const table of [true,false]) {
    const {context,ids,plan} = fixture(table);
    const checked = checkEdit(edit(plan),ids,context,{requestId});
    assert.ok(checked.result);
    const preview = validateInlinePlan(checked.result.plan,context.toolSnapshot,inlineToolSnapshotBoard(context.toolSnapshot),{}, {requestId});
    assert.equal(preview.ok,true);
    if (!table) assert.match(preview.additions[0].id,new RegExp(requestId));
  }
});
test('scope, request identity, mode, malformed snapshots and mixed ops fail closed', () => {
  const {context,ids,plan} = fixture();
  assert.ok(checkEdit(edit(plan),ids,context).error);
  assert.ok(checkEdit(edit(plan),ids,context,{requestId,mode:'explain'}).error);
  assert.ok(checkEdit(edit(plan),['a'],context,{requestId}).error);
  assert.ok(checkEdit({...edit(plan),ops:[{op:'replace_text',id:'a',text:'x'}]},ids,context,{requestId}).error);
  for(const toolSnapshot of [{}, {...context.toolSnapshot,selection:[null]}, {...context.toolSnapshot,readOnlyGraph:{shapes:[],links:Array(81).fill({id:'external'})}}]) assert.ok(checkEdit(edit(plan),ids,{...context,toolSnapshot},{requestId}).error);
});
test('external graph objects cannot become edit targets or disappear through implicit dependency removal', () => {
  const {board} = fixture();
  const snapshot = freezeInlineTools(board,['a'],{}), context={toolSnapshot:snapshot};
  const plan={mode:'edit',targetIds:['a'],steps:[{tool:'edit_diagram',targetIds:['a'],input:{removeIds:['a']}}]};
  assert.ok(checkEdit(edit(plan),['a'],context,{requestId}).error);
  plan.steps[0].input={changes:[{id:'b',patch:{text:'Changed'}}]};
  assert.ok(checkEdit(edit(plan),['a'],context,{requestId}).error);
});
test('unconfigured clients get only legacy native tools, no new adapter advertisement', () => {
  const tools = value => inlineEditToolFor(value).input_schema.properties.plan.properties.steps.items.properties.tool.enum;
  assert.deepEqual(tools(false),['set_appearance','arrange_selection']);
  assert.deepEqual(tools(true),['set_appearance','arrange_selection','transform_table','edit_diagram','annotate_selection']);
  assert.deepEqual(tools(false),['set_appearance','arrange_selection']);
  const {context,ids} = fixture();
  const request={mode:'edit',kind:'selection',targetIds:ids,prompt:'Add a check',context};
  assert.ok(jevDecideRequest(request,null,'fixture').state.toolSnapshot);
  assert.equal(jevDecideRequest({...request,mode:'explain'},null,'fixture').state.toolSnapshot,undefined);
  assert.match(modelDecideRequest(request,null).system,/explicitly available selection tools/);
});
test('malformed tool scope fails before any validator request', async () => {
  let calls=0;
  const {context,ids} = fixture();
  const result=await decide(KEY_ENV,{app:'canvas-test',requestId,request:{mode:'edit',kind:'selection',targetIds:ids,prompt:'Change it',context:{...context,toolSnapshot:{}}}},{transport:'direct',ask:async()=>{calls++;throw Error('must not call');}});
  assert.equal(result.status,400);assert.equal(calls,0);
});
test('signed request binds snapshot and requestId; valid generation returns shared plan only', async () => {
  const {context,plan} = fixture();
  const body=await decided({app:'canvas-test',request_id:requestId,mode:'edit',route:'edit',prompt:'Insert a check',context});
  const post=value=>new Request('https://test/api/learn/inline/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
  let calls=0;
  const deps={authorize:async()=>({name:'canvas-test',email:'owner@test',user_id:'owner'}),callModel:async(_env,request)=>{calls++;assert.ok(request.tools[0].input_schema.properties.plan.properties.steps.items.properties.tool.enum.includes('edit_diagram'));return Response.json({content:[{type:'tool_use',name:'inline_edit',input:edit(plan)}],stop_reason:'tool_use'});}};
  const wrongId=await inlineGenerateFetch(post({...body,request_id:'req-different-123'}),KEY_ENV,deps);
  assert.equal(wrongId.status,403);
  const altered=structuredClone(body);altered.request.context.toolSnapshot.objects.a.text='Different';
  assert.equal((await inlineGenerateFetch(post(altered),KEY_ENV,deps)).status,403);assert.equal(calls,0);
  const output=await readGeneration(await inlineGenerateFetch(post(body),KEY_ENV,deps),()=>{});
  assert.equal(calls,1);assert.equal(output.result.kind,'edit');assert.deepEqual(output.result.plan,plan);
});
test('source-backed, citation-bearing and locked tables cannot enter tool context', () => {
  for(const restricted of [{fileRef:{id:'source'}},{citations:[{id:'citation'}]}]) {
    const {board}=fixture(true);Object.assign(board.blocks[0],restricted);
    assert.equal(freezeInlineTools(board,['table'],{}),null);
  }
  const {context,ids,plan}=fixture(true);context.toolSnapshot.objects.table.locked=true;context.toolSnapshot.selection[0].locked=true;
  assert.ok(checkEdit(edit(plan),ids,context,{requestId}).error);
});
test('Explain annotations add separate objects and never reinterpret ordinary notes as edits', () => {
  const {board}=fixture();const bounds={a:{x:0,y:0,w:80,h:40}};
  const snapshot=freezeInlineTools(board,['a'],bounds,{mode:'explain'});
  const context={toolSnapshot:snapshot};
  const plan={mode:'explain',targetIds:['a'],steps:[{tool:'annotate_selection',targetIds:['a'],input:{annotations:[{targetId:'a',text:'A useful callout'}]}}]};
  assert.deepEqual(checkExplanation({text:'Ordinary explanation'},['a'],context,requestId).result,{kind:'note',text:'Ordinary explanation'});
  assert.equal(checkExplanation({plan},['a'],context,requestId).result.kind,'annotations');
  assert.ok(checkExplanation({text:'Mixed',plan},['a'],context,requestId).error);
  assert.ok(checkExplanation({plan:{...plan,mode:'edit'}},['a'],context,requestId).error);
  assert.ok(checkExplanation({plan:{...plan,steps:[{tool:'set_appearance',targetIds:['a'],input:{patch:{fill:'#ff0000'}}}]}},['a'],context,requestId).error);
  assert.ok(checkEdit(edit({...plan,mode:'edit'}),['a'],context,{requestId}).error);
});
test('signed Explain generation returns annotations with one generation call, not Edit', async () => {
  const {board}=fixture();const ids=['a'];
  const context={target:{ids,objects:[{id:'a',text:'a'}]},toolSnapshot:freezeInlineTools(board,ids,{a:{x:0,y:0,w:80,h:40}},{mode:'explain'})};
  const plan={mode:'explain',targetIds:ids,steps:[{tool:'annotate_selection',targetIds:ids,input:{annotations:[{targetId:'a',text:'An annotation'}]}}]};
  const body=await decided({app:'canvas-test',request_id:requestId,mode:'explain',route:'note',prompt:'Annotate this node',context});
  let calls=0;
  const response=await inlineGenerateFetch(new Request('https://test/api/learn/inline/generate',{method:'POST',body:JSON.stringify(body)}),KEY_ENV,{authorize:async()=>({name:'canvas-test',email:'owner@test'}),callModel:async(_env,request)=>{calls++;assert.equal(request.tools[0].name,'inline_explain');return Response.json({content:[{type:'tool_use',name:'inline_explain',input:{plan}}],stop_reason:'tool_use'});}});
  const result=await readGeneration(response,()=>{});
  assert.equal(calls,1);assert.equal(result.result.kind,'annotations');assert.equal(result.result.plan.mode,'explain');
});
