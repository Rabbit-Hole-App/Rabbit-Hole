import test from 'node:test';
import assert from 'node:assert/strict';
import { freezeInlineTools } from '../../web/src/inline-tool-plan.js';
import { imageReplacement, checkImageReplacement, readReplacementImage } from '../src/inline-image-replacement.js';
import { inlineDecideFetch, inlineGenerateFetch } from '../src/learn-inline.js';
import { KEY_ENV, jevSays } from './learn-inline-fixture.js';
const source = { id: 'fs_' + 'a'.repeat(24), rev: 'b'.repeat(64) };
const receipt = { blockId: 'image', source, coverage: 'whole-image' };
const make = (output = 'table') => ({kind:'selection',mode:'edit',targetIds:['image'],prompt:'Replace this image with editable '+output,context:{target:{ids:['image']},imageReplacement:{targetId:'image',output},toolSnapshot:freezeInlineTools({blocks:[{id:'image',type:'file',kind:'image',fileRef:{source}}]},['image'])}});
const recognized = {content:{columns:['Name','Value'],rows:[['A','2']]},uncertainties:[]};
const read = async () => ({blocks:[{type:'image',source:{type:'base64',media_type:'image/png',data:'AA=='}}],imageSource:receipt});
test('explicit Edit replacement retains exact source receipt and validated native content',()=>{
 const request=make();assert.ok(imageReplacement(request));
 const result=checkImageReplacement(recognized,request,'request-123',receipt).result;
 assert.equal(result.kind,'image_replacement');assert.equal(result.targetId,'image');
 assert.deepEqual(result.content,{kind:'card',block:{type:'table',...recognized.content}});
 assert.deepEqual(result.extraction.source,receipt);
 for(const [output,content,kind] of [['code',{code:'return 2;'},'card'],['equation',{latex:'x^2'},'equation'],['diagram',{shapes:[{id:'a',label:'A'}]},'diagram']]) assert.equal(checkImageReplacement({content,uncertainties:[]},make(output),'request-123',receipt).result.content.kind,kind);
});
test('replacement refuses legacy, links, source drift, mixed result and silent mode changes',()=>{
 for(const mutate of [r=>{r.mode='explain';},r=>{delete r.context.imageReplacement;},r=>{r.context.imageReplacement.output='note';},r=>{r.context.toolSnapshot.objects.image.locked=true;},r=>{r.context.toolSnapshot.objects.image.groupId='g';},r=>{r.context.toolSnapshot.readOnlyGraph.links=[{id:'link',from:'image',to:'other'}];},r=>{delete r.context.toolSnapshot.objects.image.fileRef;r.context.toolSnapshot.objects.image.assetKey='old.png';},r=>{r.textRange={id:'image',from:0,to:1};}]){const r=make();mutate(r);assert.equal(imageReplacement(r),null);}
 assert.ok(checkImageReplacement({...recognized,action:{tool:'find_evidence'}},make(),'request-123',receipt).error);
 assert.ok(checkImageReplacement({...recognized,ops:[]},make(),'request-123',receipt).error);
 assert.ok(checkImageReplacement(recognized,make(),'request-123',{...receipt,source:{...source,rev:'c'.repeat(64)}}).error);
 assert.ok(checkImageReplacement({content:{shapes:[{id:'a',label:'A'}],ops:[]},uncertainties:[]},make('diagram'),'request-123',receipt).error);
 assert.ok(checkImageReplacement({content:{clarify:{question:'Which one?'}},uncertainties:[]},make('equation'),'request-123',receipt).error);
 assert.deepEqual(checkImageReplacement({clarify:{question:'Which one?'}},make(),'request-123',receipt).result,{kind:'clarify',question:'Which one?'});
});
test('source reader pins saved identity, refuses unavailable before provider and main-only',async()=>{
 let calls=0;const images=async(_env,_access,body)=>{calls++;assert.deepEqual(body,{image_context:{block_id:'image'},image_source:source,board:'main'});return read();};
 assert.ok((await readReplacementImage({}, {},make(),'main',images)).imageSource);
 assert.equal((await readReplacementImage({}, {},make(),'fork',images)).status,400);assert.equal(calls,1);
 assert.equal((await readReplacementImage({}, {},make(),'main',async()=>null)).status,409);
});
test('signed replacement uses actual authorized pixels, rechecks source and cannot change output',async()=>{
 const post=body=>new Request('https://test/api/learn/inline/generate',{method:'POST',body:JSON.stringify(body)});
 const body={app:'canvas-demo',request_id:'request-123',request:make(),enabled:['edit']};
 const authorize=async()=>({name:'canvas-demo',email:'owner@test'});let reads=0,calls=0;
 body.request.context.repoScope={app:'repo-demo',repo:'owner/repo',commit:'a'.repeat(40)};
 const repository={repositoryAuthorize:async()=>({repo:'owner/repo'}),repositoryLoad:async()=>body.request.context.repoScope};
 const images=async()=>{reads++;return read();};
 const verdict=await(await inlineDecideFetch(post(body),KEY_ENV,{authorize,images,...repository,ask:jevSays('proceed')})).json();assert.ok(verdict.token);
 const deps={authorize,images,...repository,callModel:async(_env,prompt)=>{calls++;assert.equal(prompt.tools[0].name,'inline_image_replacement');assert.match(prompt.system,/replacement preview/);assert.doesNotMatch(prompt.system,/transform_image|image_action|find_evidence|run_code/);assert.equal(prompt.messages[0].content[0].type,'image');return Response.json({stop_reason:'tool_use',content:[{type:'tool_use',name:prompt.tools[0].name,input:recognized}]});}};
 const output=await(await inlineGenerateFetch(post({...body,token:verdict.token}),KEY_ENV,deps)).text();assert.match(output,/"kind":"image_replacement"/);assert.equal(calls,1);assert.equal(reads,2);
 const changed=structuredClone(body);changed.request.context.imageReplacement.output='code';assert.equal((await inlineGenerateFetch(post({...changed,token:verdict.token}),KEY_ENV,deps)).status,403);
 assert.equal((await inlineGenerateFetch(post({...body,token:verdict.token}),KEY_ENV,{...deps,images:async()=>null})).status,409);assert.equal(calls,1);
 let asked=0;assert.equal((await inlineDecideFetch(post(body),KEY_ENV,{authorize,...repository,images:async()=>null,ask:async()=>{asked++;}})).status,409);assert.equal(asked,0);
});
