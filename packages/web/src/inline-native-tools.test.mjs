import test from 'node:test';
import assert from 'node:assert/strict';
import {previewNativeAppearance,previewNativeArrangement} from './inline-native-tools.js';
const rect=(id,x=0)=>({id,kind:'rect',x1:x,y1:0,x2:x+10,y2:10,color:'#37352f',text:'unchanged',fill:'#ffffff',opacity:1,custom:'preserved'});
const a=rect('a'),b=rect('b',20),other=rect('other',50),board={shapes:[a,b,other],links:[{id:'edge',from:'a',to:'b'}]};
const frozen={ids:['a','b'],objects:{a,b}};
test('appearance preview preserves content, identity, geometry, topology and unspecified style',()=>{
 const result=previewNativeAppearance({ids:['a','b'],patch:{fill:'#0000ff',dash:'dashed'}},{board,frozen});assert.equal(result.ok,true);
 for(const change of result.changes){assert.equal(change.after.text,'unchanged');assert.equal(change.after.custom,'preserved');assert.equal(change.after.x1,change.before.x1);assert.equal(change.after.opacity,1);assert.equal(change.after.fill,'#0000ff');}
 assert.equal(board.shapes[0],a);assert.equal(other.fill,'#ffffff');assert.deepEqual(board.links,[{id:'edge',from:'a',to:'b'}]);
});
test('appearance rejects stale, locked, missing, unsupported and out-of-scope targets atomically',()=>{
 const run=(ids,patch,options={})=>previewNativeAppearance({ids,patch},{board,frozen,...options});
 assert.equal(run(['a','other'],{fill:'#0000ff'}).ok,false);assert.equal(run(['a'],{id:'other'}).ok,false);
 assert.equal(run(['a'],{opacity:Infinity}).ok,false);assert.equal(run(['a'],{fill:'url(secret)'}).ok,false);
 assert.equal(run(['a'],{fill:'#0000ff'},{board:{shapes:[{...a,text:'new'}]}}).ok,false);
 assert.equal(run(['a'],{fill:'#0000ff'},{board:{shapes:[{...a,locked:true}]}}).ok,false);
 assert.equal(run(['a'],{fill:'#0000ff'},{readOnly:true}).ok,false);
});
test('stroke changes preserve inherited text colour and restore outline using existing native semantics',()=>{
 const original={...a,noStroke:true};const result=previewNativeAppearance({ids:['a'],patch:{color:'#ff0000'}},{board:{shapes:[original]},frozen:{ids:['a'],objects:{a:original}}});
 assert.equal(result.ok,true);assert.equal(result.changes[0].after.textColor,'#37352f');assert.equal(result.changes[0].after.noStroke,undefined);
});
const bounds={a:{x:0,y:0,w:10,h:10},b:{x:20,y:30,w:20,h:10},c:{x:100,y:50,w:10,h:10}};
const units=Object.entries(bounds).map(([id,box])=>({members:[id],...box}));
const arrange=(how,options={})=>previewNativeArrangement({how,units},{frozen:{ids:['a','b','c'],bounds},currentBounds:bounds,...options});
test('arrangement uses measured rectangles and equal gaps while retaining endpoint objects',()=>{
 assert.deepEqual(arrange('left').moves.map(move=>move.dx),[0,-20,-100]);
 const result=arrange('spread-x');assert.equal(result.ok,true);assert.deepEqual(result.moves.map(move=>move.dx),[0,25,0]);
 assert.deepEqual(result.moves.map(move=>move.dy),[0,0,0]);assert.equal(bounds.b.x,20);
});
test('arrangement rejects forged measured units, stale layout and locked targets before any movement',()=>{
 assert.equal(arrange('left',{locked:['b']}).ok,false);assert.equal(arrange('left',{readOnly:true}).ok,false);
 assert.equal(arrange('left',{currentBounds:{...bounds,b:{...bounds.b,x:21}}}).ok,false);
 assert.equal(previewNativeArrangement({how:'left',units:[{...units[0],x:999},units[1]]},{frozen:{ids:['a','b'],bounds},currentBounds:bounds}).ok,false);
 assert.equal(arrange('same-width').ok,false,'resizing is not yet supported by the translation-only foundation');
});
