import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {profileFetch} from '../../../packages/control-plane/src/profile.js';
import {learnDb} from '../../../packages/control-plane/test/learn-grade-fixture.js';
const code=readFileSync(new URL('../scripts/settings-api.js',import.meta.url),'utf8');
function exports(){const window={fetch};vm.runInNewContext(code,{window,setTimeout:fn=>queueMicrotask(fn),Date,Error,Promise});return window;}
test('real profile route: handle claim succeeds; conflict stays 409 and does not overwrite',async t=>{
 const {LEARN_DB}=learnDb(t);const window=exports();
 const env={LEARN_DB,CONTROL_PLANE:{fetch:async req=>Response.json({org:'test',email:req.headers.get('x-email')||'alice@test',orgName:'Test',apps:[]})}};
 const apiFor=email=>window.createSettingsApi((path,options)=>profileFetch(new Request('https://app.test'+path,{...options,headers:{...options.headers,'x-email':email}}),env));
 const alice=apiFor('alice@test'),bob=apiFor('bob@test');
 assert.equal((await alice.saveProfile({handle:'tree_learner'})).handle,'tree_learner');
 await assert.rejects(()=>bob.saveProfile({handle:'tree_learner'}),e=>e.status===409&&e.taken===true);
 assert.equal((await bob.loadProfile()).handle,null);
 assert.equal((await bob.saveProfile({handle:'another_learner'})).handle,'another_learner');
});
test('server unavailable and invalid responses are failures, never available handles',async()=>{
 const {createSettingsApi}=exports();
 for(const request of [async()=>{throw Error('offline')},async()=>new Response('bad'),async()=>Response.json({error:'Unavailable'},{status:503})])await assert.rejects(()=>createSettingsApi(request).saveProfile({handle:'unique'}));
});
test('demo profile, save, preference and avatar failures recover on retry',async()=>{
 const {createSettingsDemoApi}=exports();
 for(const [scenario,method,arg]of [['profile-unavailable','loadProfile'],['save-failure','saveProfile',{name:'Test'}],['avatar-failure','saveProfile',{avatar:'data:image/png;base64,AA=='}],['preference-failure','savePreference']]){
  const api=createSettingsDemoApi(scenario);await assert.rejects(()=>api[method](arg));await api[method](arg);
 }
});
test('usage empty, exhausted and unavailable stay distinct',async()=>{
 const {createSettingsDemoApi}=exports();
 const empty=await createSettingsDemoApi('usage-empty').loadUsage();assert.equal(empty.usedCredits,0);assert.equal(empty.remainingCredits,10000);
 const exhausted=await createSettingsDemoApi('usage-exhausted').loadUsage();assert.equal(exhausted.remainingCredits,0);assert.equal(exhausted.usedCredits,10000);
 const failed=createSettingsDemoApi('usage-unavailable');await assert.rejects(()=>failed.loadUsage());assert.equal((await failed.loadUsage()).remainingCredits,6750);
});
test('adapter uses explicit same-origin save and preserves server conflict metadata',async()=>{
 const requests=[];const {createSettingsApi}=exports();const api=createSettingsApi(async(path,options)=>{requests.push({path,options});return Response.json({handle:'new_handle'});});
 await api.saveProfile({handle:'new_handle'});assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/profile');assert.equal(requests[0].options.method,'PUT');assert.equal(requests[0].options.credentials,'same-origin');assert.deepEqual(JSON.parse(requests[0].options.body),{handle:'new_handle'});
});
