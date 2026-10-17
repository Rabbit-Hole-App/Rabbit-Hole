import test from 'node:test';
import assert from 'node:assert/strict';
import { readSearchComments } from './canvas-search-comments.js';

test('search reads every permitted thread/message page without marking read or resolving', async () => {
  const calls = [];
  const client = {
    threads: async (status, audience, cursor) => { calls.push(['list', status, cursor]); return cursor ? { threads: [{ id: 'b', anchor: {kind:'point',x:2,y:3}, status:'resolved' }] } : { threads: [{id:'a',anchor:{kind:'object',object_id:'card'},status:'open'}], cursor:'next' }; },
    thread: async (id, before) => { calls.push(['thread',id,before]); return id === 'a' && !before ? { messages:[{id:'new',segments:[{text:'later optimizer'}]},{id:'deleted',deleted:'author',segments:[{text:'secret'}]}],before:'older' } : { messages:[{id:id+':old',segments:[{text:'old /src/a.py'}]}] }; },
  };
  const result = await readSearchComments(client);
  assert.equal(result.comments.length, 2);
  assert.match(result.comments[0].text, /old \/src\/a.py[\s\S]*later optimizer/);
  assert.doesNotMatch(result.comments[0].text, /secret/);
  assert.equal(result.comments[0].objectId,'card');
  assert.equal(result.comments[1].resolved,true);
  assert.deepEqual(calls.filter(c=>c[0]==='list').map(c=>c[1]), ['all','all']);
  assert.equal(result.errors.length,0);
});

test('unavailable thread is omitted with partial evidence; other threads remain', async () => {
  const result=await readSearchComments({ threads:async()=>({threads:[{id:'denied'},{id:'ok'}]}), thread:async id=>{ if(id==='denied')throw new Error('not accessible');return {messages:[{segments:[{text:'visible'}]}]}; } });
  assert.deepEqual(result.comments.map(c=>c.id),['ok']);
  assert.equal(result.errors.length,1);
});

test('scope cancellation stops old pagination and progress publication', async () => {
  const control=new AbortController();let published=0;let detail=0;
  await assert.rejects(readSearchComments({threads:async()=>{control.abort();return {threads:[{id:'old'}],cursor:'next'}},thread:async()=>{detail++;}}, {signal:control.signal,onProgress:()=>published++}), {name:'AbortError'});
  assert.equal(detail,0);assert.equal(published,0);
});
