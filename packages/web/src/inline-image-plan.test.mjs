import test from 'node:test';
import assert from 'node:assert/strict';
import {imageOperation,editableImage} from './inline-image-plan.js';
import {freezeInlineTools,validateInlinePlan} from './inline-tool-plan.js';
const block={id:'image',type:'file',kind:'image',fileRef:{source:{id:'source',rev:'rev'}}};
const board={blocks:[block],items:[],shapes:[],links:[]};
const plan={mode:'edit',targetIds:['image'],steps:[{tool:'transform_image',targetIds:['image'],input:{type:'rotate',quarterTurns:1}}]};
test('image plans authorize only immutable selected source and produce no synchronous mutation',()=>{
 const snapshot=freezeInlineTools(board,['image']);assert.equal(snapshot.selection[0].kind,'image');
 const result=validateInlinePlan(plan,snapshot,board);assert.equal(result.ok,true);assert.deepEqual(result.imageTransform,{id:'image',operation:{type:'rotate',quarterTurns:1}});assert.deepEqual(result.changes,[]);
 assert.equal(validateInlinePlan(plan,snapshot,{...board,blocks:[{...block,title:'changed'}]}).ok,false);
 assert.equal(validateInlinePlan(plan,snapshot,board,{}, {readOnly:true}).ok,false);
 assert.equal(editableImage({...block,citations:[{}]}),false);assert.equal(editableImage({...block,locked:true}),false);
 assert.equal(validateInlinePlan({...plan,steps:[...plan.steps,...plan.steps]},snapshot,board).ok,false);
});
test('operation validation rejects unknown effects, URLs, inferred units and oversized dimensions',()=>{
 for(const input of [{type:'remove_background'},{type:'rotate',quarterTurns:1,url:'https://example.com'},{type:'crop',x:0,y:0,width:'20%',height:3},{type:'resize',width:8192,height:8192},{type:'pad',width:20,height:20,color:'url(x)'}])assert.throws(()=>imageOperation(input));
 assert.deepEqual(imageOperation({type:'resize',width:20,height:30,fit:'contain'}),{type:'resize',width:20,height:30,fit:'contain'});
});
