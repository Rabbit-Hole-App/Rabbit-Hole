import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDiagramEdit} from './inline-diagram-edit.js';
const board=()=>({shapes:[{id:'a',kind:'rect',text:'Start',x1:0,y1:0,x2:100,y2:50,color:'#123456'},{id:'b',kind:'diamond',text:'Check',x1:180,y1:0,x2:280,y2:70}],items:[{id:'note',kind:'text',text:'Untouched',x:10,y:200}],links:[{id:'ab',from:'a',to:'b',fromSide:'right',toSide:'left',head:true}]});
function run(input,b=board(),extra={}){const objects=Object.fromEntries([...b.shapes,...b.items,...b.links].map(x=>[x.id,structuredClone(x)]));return previewDiagramEdit(input,{board:b,frozen:{ids:input.targetIds,objects},requestId:'test-123',...extra});}

test('a structural insertion and vertical layout produce one immutable coherent proposal',()=>{
 const b=board(),before=structuredClone(b);
 const out=run({targetIds:['a','b','ab'],add:{shapes:[{id:'v',kind:'rect',label:'Validate'}],links:[{id:'vb',from:'v',to:'b'}]},changes:[{id:'ab',patch:{to:'v'}}],layout:{flow:'down'}},b);
 assert.equal(out.ok,true,JSON.stringify(out.errors));assert.deepEqual(b,before);
 const added=out.additions.find(x=>x.list==='shapes'),get=id=>out.changes.find(x=>x.id===id)?.after||b.shapes.find(x=>x.id===id);
 assert.ok(get('a').y2<=added.after.y1);assert.ok(added.after.y2<=get('b').y1);
 assert.equal(out.changes.find(x=>x.id==='ab').after.to,added.id);
 assert.equal(out.additions.find(x=>x.list==='links').after.from,added.id);
 assert.equal(new Set(out.changes.map(x=>x.id)).size,out.changes.length);
 assert.ok(!out.changes.some(x=>x.id==='note'));
});

test('combined structural layout refuses unsupported layout and readonly scope without partial edits',()=>{
 const input={targetIds:['a','b','ab'],add:{shapes:[{id:'v',kind:'rect',label:'V'}]},layout:{flow:'down'}};
 for(const extra of [{readOnly:true},{frozen:{ids:input.targetIds,objects:{}}}])assert.equal(run(input,board(),extra).ok,false);
 assert.equal(run({...input,layout:{flow:'up'}}).ok,false);
});

test('removal cannot evade source restrictions before a combined layout',()=>{
 for(const restriction of [{source:{id:'source'}},{fileRef:{source:{id:'source'}}},{sources:['paper']},{citations:[{page:1}]}]){
  const b=board();Object.assign(b.shapes[0],restriction);
  b.shapes.push({id:'c',kind:'rect',text:'End',x1:320,x2:420,y1:0,y2:50});
  const input={targetIds:['a','b','c','ab'],removeIds:['a','ab'],layout:{flow:'down'}};
  assert.equal(run(input,b).ok,false);assert.equal(b.shapes.length,3);assert.equal(b.links.length,1);
 }
});
test('adds a deterministic failure branch without mutating original content or IDs',()=>{
 const b=board(),before=structuredClone(b),input={targetIds:['b'],add:{shapes:[{id:'failure',kind:'rect',label:'Failure'}],links:[{id:'fail-link',from:'b',to:'failure',label:'no'}]}};
 const out=run(input,b);assert.equal(out.ok,true);assert.deepEqual(out,run(input,b));assert.deepEqual(b,before);
 assert.equal(out.additions.length,2);assert.equal(out.additions[0].after.text,'Failure');assert.ok(out.additions[0].after.x1>280);
 assert.equal(out.additions[1].after.from,'b');assert.equal(out.additions[1].after.to,out.additions[0].id);assert.deepEqual(out.changes,[]);
});
test('removing a node exposes external connector dependencies without deleting them',()=>{
 const out=run({targetIds:['a'],removeIds:['a']});assert.equal(out.ok,false);assert.deepEqual(out.additions,[]);assert.equal(out.dependencies[0].id,'ab');assert.equal(out.dependencies[0].requiresScopeExpansion,true);
 const expanded=run({targetIds:['a','ab'],removeIds:['a','ab']});assert.equal(expanded.ok,true);assert.deepEqual(expanded.removals.map(x=>x.id),['a','ab']);
});
test('inserts validation by rewiring the original connector and adding one new connector',()=>{
 const out=run({targetIds:['a','b','ab'],add:{shapes:[{id:'v',label:'Validate'}],links:[{id:'vb',from:'v',to:'b'}]},changes:[{id:'ab',patch:{to:'v'}}]});
 assert.equal(out.ok,true);assert.equal(out.changes[0].id,'ab');assert.equal(out.changes[0].after.from,'a');assert.equal(out.changes[0].after.to,out.additions[0].id);
});
test('reverses a selected connector while disclosing external endpoints as read-only',()=>{
 const out=run({targetIds:['ab'],changes:[{id:'ab',patch:{from:'b',to:'a'}}]});assert.equal(out.ok,true);assert.deepEqual(out.dependencies.map(x=>x.id),['b','a']);assert.ok(out.dependencies.every(x=>x.readOnly));assert.equal(out.changes[0].after.from,'b');
});
test('refuses dangling endpoints and new links to unselected objects',()=>{
 assert.equal(run({targetIds:['a'],add:{links:[{id:'z',from:'a',to:'missing'}]}}).ok,false);
 assert.equal(run({targetIds:['a'],add:{links:[{id:'z',from:'a',to:'b'}]}}).ok,false);
 assert.equal(run({targetIds:['a','ab'],removeIds:['a'],changes:[{id:'ab',patch:{label:'renamed'}}]}).ok,false);
});
test('stale revisions, readonly state, locks and malformed snapshots fail without mutation',()=>{
 const b=board(),input={targetIds:['a'],changes:[{id:'a',patch:{text:'Updated'}}]};
 assert.equal(run(input,b,{readOnly:true}).ok,false);b.shapes[0].locked=true;assert.equal(run(input,b).ok,false);delete b.shapes[0].locked;
 assert.equal(run(input,b,{frozen:{ids:['a'],objects:{a:{...b.shapes[0],text:'Old'}}}}).ok,false);
 for(const frozen of [null,{}, {ids:[null]}, {ids:['a'],objects:null}])assert.equal(run(input,b,{frozen}).ok,false);
 assert.equal(b.shapes[0].text,'Start');
});
test('shape label update preserves all unrelated properties',()=>{
 const b=board(),out=run({targetIds:['a'],changes:[{id:'a',patch:{text:'Ready'}}]},b);assert.equal(out.ok,true);assert.deepEqual(out.changes[0].after,{...b.shapes[0],text:'Ready'});
});
test('rejects arbitrary fields, IDs, repeated edits and unsupported object types',()=>{
 const cases=[{targetIds:['note'],changes:[{id:'note',patch:{text:'New'}}]}, {targetIds:['a'],changes:[{id:'a',patch:{x1:900}}]}, {targetIds:['a'],add:{shapes:[{id:'new',label:'New',sourceUrl:'https://example.org'}]}}, {targetIds:['a'],add:{shapes:[{id:'b',label:'Collision'}]}}, {targetIds:['a'],changes:[{id:'a',patch:{text:'x'}},{id:'a',patch:{text:'y'}}]}, {targetIds:['a'],add:{items:[]}}, {targetIds:['a'],removeIds:['b']}];
 for(const input of cases)assert.equal(run(input).ok,false);
});
test('group removals and oversized operation lists fail explicitly',()=>{
 const b=board();b.shapes[0].groupId='group';assert.equal(run({targetIds:['a','ab'],removeIds:['a','ab']},b).ok,false);
 assert.equal(run({targetIds:['a'],add:{shapes:Array.from({length:21},(_,i)=>({id:'n'+i,label:'Node'}))}}).ok,false);
});
test('rewiring clears a stale free-point endpoint so the renderer follows the new node',()=>{
 const b=board();b.links[0].toPoint={x:99,y:99};const out=run({targetIds:['ab'],changes:[{id:'ab',patch:{from:'b',to:'a'}}]},b);
 assert.equal(out.ok,true);assert.equal(Object.hasOwn(out.changes[0].after,'toPoint'),false);assert.deepEqual(b.links[0].toPoint,{x:99,y:99});
});
test('label edits retain existing rich-text formatting on unchanged and replaced words',()=>{
 const b=board();b.shapes[0].runs=[{t:'Start',b:true}];b.links[0].label='Old';b.links[0].runs=[{t:'Old',i:true}];
 const out=run({targetIds:['a','ab'],changes:[{id:'a',patch:{text:'Start here'}},{id:'ab',patch:{label:'New'}}]},b);
 assert.equal(out.ok,true);assert.deepEqual(out.changes[0].after.runs,[{t:'Start here',b:true}]);assert.deepEqual(out.changes[1].after.runs,[{t:'New',i:true}]);
});
