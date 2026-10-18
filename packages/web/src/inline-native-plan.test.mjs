import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeNativeTools,validateNativePlan} from './inline-native-plan.js';
import {validateEdit,editTx,applyTx,describeChange} from './inline-ai-apply.js';
import {checkEdit} from '../../control-plane/src/learn-inline.js';
const shape=(id,x,y)=>({id,kind:'rect',x1:x,y1:y,x2:x+40,y2:y+30,text:id,fill:'#ffffff',color:'#37352f'});
function fixture(){const board={shapes:[shape('a',10,10),shape('b',90,80),shape('other',200,70)],items:[],links:[{id:'link',from:'a',to:'b'}],blocks:[]};board.boxes=Object.fromEntries(board.shapes.map(s=>[s.id,{x:s.x1,y:s.y1,w:40,h:30}]));const snapshot=freezeNativeTools(board,['a','b'],board.boxes);const plan={mode:'edit',targetIds:['a','b'],steps:[{tool:'set_appearance',targetIds:['a','b'],input:{patch:{fill:'#0000ff'}}},{tool:'arrange_selection',targetIds:['a','b'],input:{how:'top'}}]};return{board,snapshot,plan};}
test('one appearance+arrangement result survives server validation and applies one transaction without touching neighbours/content/topology',()=>{
 const {board,snapshot,plan}=fixture(),input={summary:'Blue and aligned',ops:[],plan};
 const server=checkEdit(input,['a','b'],{nativeTools:snapshot});assert.ok(server.result);
 const preview=validateEdit(server.result,{ids:['a','b'],nativeTools:snapshot},board);assert.equal(preview.ok,true);assert.equal(board.shapes[1].y1,80);
 const tx=editTx({requestId:'request',changes:preview.changes}),next=applyTx(board,tx);assert.equal(tx.changes.length,2);
 assert.equal(next.shapes[1].y1,10);assert.equal(next.shapes[1].y2,40);assert.equal(next.shapes[1].x1,90);assert.equal(next.shapes[1].text,'b');assert.equal(next.shapes[1].fill,'#0000ff');assert.deepEqual(next.shapes[2],board.shapes[2]);assert.deepEqual(next.links,board.links);
 assert.equal(describeChange(preview.changes[1]).native,true);
});
test('Accept rejects moved, restyled, edited, locked or removed targets and changed measured layout',()=>{
 for(const mutate of [b=>b.shapes[0].x1++,b=>b.shapes[0].fill='#ff0000',b=>b.shapes[0].text='new',b=>b.shapes[0].locked=true,b=>b.shapes.shift(),b=>b.boxes.b.h++]){
  const {board,snapshot,plan}=fixture();mutate(board);assert.equal(validateNativePlan(plan,snapshot,board,board.boxes).ok,false);
 }
});
test('native plans reject out-of-scope IDs, unsupported image mutation, implicit modes, arbitrary movement and mixed legacy ops',()=>{
 const {board,snapshot,plan}=fixture();
 for(const bad of [{...plan,mode:'explain'},{...plan,steps:[{tool:'set_appearance',targetIds:['other'],input:{patch:{fill:'#0000ff'}}}]},{...plan,steps:[{tool:'arrange_selection',targetIds:['a','b'],input:{how:'top',x:100}}]},{...plan,steps:[{tool:'edit_image',targetIds:['a'],input:{}}]}])assert.equal(validateNativePlan(bad,snapshot,board,board.boxes).ok,false);
 assert.ok(checkEdit({ops:[{op:'replace_text',id:'a',text:'bad'}],plan},['a','b'],{nativeTools:snapshot}).error);
 assert.equal(freezeNativeTools({items:[{id:'image',kind:'image',src:'private'}]},['image'],{}),null);
});
test('appearance-only plans recheck source objects but do not require unrelated layout measurements',()=>{
 const {board,snapshot,plan}=fixture();plan.steps.pop();board.boxes.b.h++;
 assert.equal(validateNativePlan(plan,snapshot,board,board.boxes).ok,true);
 assert.equal(validateNativePlan(plan,snapshot,board,board.boxes,{readOnly:true}).ok,false);
});
test('malformed untrusted native snapshots return validation errors without throwing',()=>{
 const {plan}=fixture();for(const snapshot of [{},{ids:['a']},{ids:['a'],objects:{a:{id:'a'}},lists:{a:'shapes'},bounds:{},selection:[null]}])assert.ok(checkEdit({ops:[],plan},['a'],{nativeTools:snapshot}).error);
});
