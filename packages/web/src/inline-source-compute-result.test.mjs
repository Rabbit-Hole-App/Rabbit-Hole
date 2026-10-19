import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSourceCompute} from './inline-source-compute-result.js';
const block={id:'pdf',fileRef:{source:{id:'fs_source',rev:'revision'}}};
const range={targetId:'pdf',sourceId:'file:fs_source@revision',range:{page:2}};
const frozen={ids:['pdf'],requestId:'request-123',actionMode:'explain',sourceComputation:{type:'table_plot'},sourceRanges:[range],sourceBlocks:{pdf:block}};
const result={kind:'source_compute',requestId:'request-123',targetIds:['pdf'],summary:'Plot values',table:{columns:['Time','Value'],rows:[['1','3'],['2','5']]},operation:{type:'table_plot',columns:[1],units:['kg'],xColumn:0,xUnit:'s'},uncertainties:[{location:'row 2',message:'Digit may be unclear'}],sourceReadings:[{...range,coverage:'partial'}]};
const check=(r=result,f=frozen,b={blocks:[block]},access={mode:'explain'})=>validateSourceCompute(r,f,b,access);
test('recognized values are recomputed with visible uncertainty and exact page provenance',()=>{
 const got=check();assert.equal(got.ok,true);assert.equal(got.preview.block.spec.op,'interactive_plot');assert.deepEqual(got.preview.table,result.table);assert.deepEqual(got.preview.sourceReadings,result.sourceReadings);assert.match(got.preview.limitations[0],/incorrect/);assert.deepEqual(got.preview.evidence.uncertainties,result.uncertainties);
});
test('request, opt-in, source, permission and receipt drift refuse without a proposal',()=>{
 for(const got of [check({...result,requestId:'old'}),check(result,{...frozen,sourceComputation:null}),check(result,frozen,{blocks:[{...block,locked:true}]}),check(result,frozen,{blocks:[block]},{mode:'explain',readOnly:true}),check({...result,sourceReadings:[{...range,range:{page:1},coverage:'partial'}]}),check({...result,points:[123]})])assert.equal(got.ok,false);
});
