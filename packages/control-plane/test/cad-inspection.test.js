import test from 'node:test';
import assert from 'node:assert/strict';
import {learnDb} from './learn-grade-fixture.js';
import {inspectSavedCad,recordedCadFacts} from '../src/cad-inspection.js';
const validation={baselinePassed:true,geometry_units:'mm',facts:{bounds_mm:{x:40,y:20,z:5},solid_count:1,volume_mm3:4000,circular_diameters_mm:[4]},checks:[{id:'width',status:'passed',actual:40,expected:40,tolerance:0.01}]};
function setup(t){
 const {sqlite,LEARN_DB}=learnDb(t),objects=new Map(),reads=[];
 const access={org:'team',email:'owner@test',name:'app'};
 const block={type:'cad',id:'card',revisionId:'r1',fileRef:{source:{id:'fs_model'}},manifest:{validation:{facts:{volume_mm3:999999}}}};
 const save=()=>sqlite.prepare('UPDATE learn_boards SET state_json=? WHERE id=?').run(JSON.stringify({blocks:[block]}),'board');
 sqlite.prepare("INSERT INTO learn_boards(id,org,owner_email,app,board,state_json,updated_at) VALUES('board','team','owner@test','app','main','{}','now')").run();save();
 sqlite.prepare("INSERT INTO file_sources(id,org,owner_email,app,family,name,media_type,bytes,sha256,r2_key,status,created_at) VALUES('fs_model','team','owner@test','app','cad','model.py','text/plain',10,'sourcehash','original','stored',1)").run();
 sqlite.prepare("INSERT INTO file_source_refs(source_id,board_id) VALUES('fs_model','board')").run();
 const derivative=(id,kind,bytes,revision='r1')=>{objects.set(id,bytes);sqlite.prepare("INSERT INTO file_derivatives(id,source_id,source_sha256,kind,name,converter,converter_version,options_hash,status,bytes,sha256,r2_key,created_at,updated_at) VALUES(?,'fs_model','sourcehash',?,?,'cad-execute','0.7.21',?,'ready',?,'digest',?,1,1)").run(id,kind,id,revision,bytes.length,id);};
 derivative('validation','validation',new TextEncoder().encode(JSON.stringify(validation)));
 derivative('thumbnail','thumbnail',new Uint8Array([137,80,78,71,13,10,26,10,0]));
 const env={LEARN_DB,LEARN_MEDIA:{get:async key=>{reads.push(key);const bytes=objects.get(key);return bytes?{size:bytes.length,body:new Response(bytes).body}:null;}}};
 const inspect=options=>inspectSavedCad(new Request('https://dev.test/x'),env,{access,board:'main',targetIds:['card'],...options});
 return{sqlite,block,save,inspect,reads,objects,access,env};
}
test('inspection uses trusted accepted measurements and thumbnail, not mutable manifest claims',async t=>{
 const f=setup(t),result=await f.inspect({includePreview:true});
 const measured=JSON.parse(result.blocks[0].text).cadInspection;
 assert.equal(measured.facts.volume_mm3,4000);assert.equal(measured.units.length,'mm');assert.equal(measured.revisionId,'r1');
 assert.match(measured.provenance,/saved STEP/);assert.match(measured.unavailable,/Unmeasured/);
 assert.equal(result.blocks.filter(b=>b.type==='image').length,1);
 f.reads.length=0;const noImage=await f.inspect({includePreview:false});assert.equal(noImage.blocks.some(b=>b.type==='image'),false);assert.deepEqual(f.reads,['validation']);
});
test('forged targets and private source references cannot read artifacts',async t=>{
 const f=setup(t);assert.deepEqual((await f.inspect({targetIds:['unrelated']})).blocks,[]);assert.equal(f.reads.length,0);
 f.sqlite.prepare('DELETE FROM file_source_refs').run();
 assert.equal(JSON.parse((await f.inspect()).blocks[0].text).cadInspection.status,'unavailable');assert.equal(f.reads.length,0);
 assert.deepEqual((await f.inspect({access:{...f.access,email:'other@test'}})).blocks,[]);
});
test('mismatched revision or source identity never reuses old measurements',async t=>{
 const f=setup(t);f.block.revisionId='r2';f.save();
 assert.equal(JSON.parse((await f.inspect()).blocks[0].text).cadInspection.status,'unavailable');assert.equal(f.reads.length,0);
 f.block.revisionId='r1';f.save();f.sqlite.prepare("UPDATE file_sources SET sha256='different'").run();
 assert.equal(JSON.parse((await f.inspect()).blocks[0].text).cadInspection.status,'unavailable');assert.equal(f.reads.length,0);
});
test('bounded artifacts and finite whitelisted facts reject unsupported claims',async t=>{
 const f=setup(t);f.sqlite.prepare("UPDATE file_derivatives SET bytes=99999999 WHERE kind='validation'").run();
 assert.equal(JSON.parse((await f.inspect()).blocks[0].text).cadInspection.status,'unavailable');assert.equal(f.reads.length,0);
 const result=recordedCadFacts({...validation,facts:{bounds_mm:{x:Infinity,y:1,z:1},solid_count:1.5,volume_mm3:-2,circular_diameters_mm:[NaN,4],hole_depth:100}});
 assert.deepEqual(result.facts,{circular_edge_diameters_mm:[4]});assert.equal(recordedCadFacts({...validation,geometry_units:'unknown'}),null);
});


test('signed Explain selection supplies recorded measurements in one existing model request',async t=>{
 const {inlineGenerateFetch}=await import('../src/learn-inline.js');
 const {decided,KEY_ENV}=await import('./learn-inline-fixture.js');
 const f=setup(t), seen=[];
 const run=async image=>{
  const context={target:{ids:['card'],objects:[{id:'card',type:'cad',text:'Caller claims volume 999999'}]},related:[],complete:{card:true},...(image?{image:{id:'explicit-image'}}:{})};
  const body=await decided({app:'app',request_id:'cad-inspection-001',prompt:'Explain the measured dimensions',context});
  const response=await inlineGenerateFetch(new Request('https://dev.test/api/learn/inline/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{...f.env,...KEY_ENV},{authorize:async()=>f.access,images:async()=>({blocks:[{type:'image',source:{type:'base64',media_type:'image/png',data:'explicit'}}]}),callModel:async(_env,request)=>{seen.push(request);return Response.json({content:[{type:'text',text:'The recorded STEP bounds are 40 by 20 by 5 mm.'}],stop_reason:'end_turn'});}});
  await response.text();assert.equal(response.status,200);
 };
 await run(false);assert.equal(seen.length,1);
 const first=seen[0].messages[0].content;
 assert.equal(first.filter(block=>block.type==='image').length,1);
 assert.equal(JSON.parse(first.find(block=>block.type==='text'&&block.text.startsWith('{"cadInspection"')).text).cadInspection.facts.volume_mm3,4000);
 f.reads.length=0;await run(true);assert.equal(seen.length,2);
 assert.deepEqual(seen[1].messages[0].content.filter(block=>block.type==='image').map(block=>block.source.data),['explicit']);
 assert.deepEqual(f.reads,['validation']);
});
