import test from 'node:test';import assert from 'node:assert/strict';
import {validateComputeResult,stampComputation} from './inline-compute-result.js';
import {freezeInlineTools} from './inline-tool-plan.js';
import {cardTx,applyTx} from './inline-ai-apply.js';
const table={id:'table',type:'table',columns:['Seconds','Distance'],rows:[['1','3'],['2','5']],dx:0,dy:0};
const board={blocks:[table],items:[],shapes:[],links:[]};
const frozen={requestId:'request-1',actionMode:'explain',ids:['table'],prints:{target:'frozen-table'},toolSnapshot:freezeInlineTools(board,['table'],{}, {mode:'explain'})};
const result={kind:'compute',requestId:'request-1',targetIds:['table'],summary:'Summarize distance',operation:{type:'table_summary',targetId:'table',columns:[1],units:['m']}};
test('summary computes actual frozen cells and stamps detached source provenance without source mutation',()=>{const out=validateComputeResult(result,frozen,board,{mode:'explain'});assert.equal(out.ok,true);assert.deepEqual(out.preview.block.rows,[['Distance','m','2','8','3','5','4']]);const tx=stampComputation(cardTx({requestId:result.requestId,block:out.preview.block,frozen,board,route:'note'}),out.preview,frozen);const next=applyTx(board,tx);assert.deepEqual(next.blocks.find(item=>item.id==='table'),table);assert.equal(next.blocks[1].inline.tool,'compute');assert.equal(next.blocks[1].inline.computation.sourceFingerprint,'frozen-table');assert.notEqual(tx.block.inline.computation.operation,result.operation);});
test('plots reuse graph blocks and request-specific graph identity with actual numeric rows',()=>{const out=validateComputeResult({...result,operation:{...result.operation,type:'table_plot',xColumn:0,xUnit:'s'}},frozen,board,{mode:'explain'});assert.equal(out.ok,true);assert.equal(out.preview.block.type,'graph');assert.equal(out.preview.block.spec.renderer,'plotly');assert.deepEqual(out.preview.block.spec.traces[0].x,[1,2]);assert.deepEqual(out.preview.block.spec.traces[0].y,[3,5]);assert.notEqual(out.preview.block.spec.id,'computed-table');});
test('stale cells, mode, permissions, request, foreign targets and model answers refuse',()=>{
 for(const [value,live,opts] of [[result,{...board,blocks:[{...table,rows:[['1','999']]}]},{}],[result,board,{mode:'edit'}],[result,board,{readOnly:true}],[result,board,{locked:true}],[{...result,requestId:'other'},board,{}],[{...result,operation:{...result.operation,targetId:'other'}},board,{}],[{...result,answer:42},board,{}]])assert.equal(validateComputeResult(value,frozen,live,{mode:'explain',...opts}).ok,false);
});

test('exact derivative reads two original equations, creates separate explanation and refuses stale or invented math',()=>{
 const source={id:'f',kind:'equation',latex:'x^3'},claim={id:'d',kind:'equation',latex:'3x^2'},live={...board,blocks:[],items:[source,claim]};
 const frozenPair={...frozen,ids:['f','d'],toolSnapshot:freezeInlineTools(live,['f','d'],{},{mode:'explain'})};
 const input={...result,targetIds:['f','d'],operation:{type:'polynomial_derivative',sourceId:'f',claimId:'d',variable:'x'}};
 const checked=validateComputeResult(input,frozenPair,live,{mode:'explain'});assert.equal(checked.ok,true);assert.equal(checked.preview.evidence.equivalent,true);assert.equal(checked.preview.block.type,'explanation');
 const tx=stampComputation(cardTx({requestId:input.requestId,block:checked.preview.block,frozen:frozenPair,board:live,route:'note'}),checked.preview,frozenPair);assert.deepEqual(applyTx(live,tx).items,live.items);assert.deepEqual(tx.block.inline.sources,['f','d']);
 assert.equal(validateComputeResult(input,frozenPair,{...live,items:[source,{...claim,latex:'x'}]},{mode:'explain'}).ok,false);
 assert.equal(validateComputeResult({...input,operation:{...input.operation,source:'x^2'}},frozenPair,live,{mode:'explain'}).ok,false);
 assert.equal(validateComputeResult(input,frozenPair,live,{mode:'edit'}).ok,false);
});
