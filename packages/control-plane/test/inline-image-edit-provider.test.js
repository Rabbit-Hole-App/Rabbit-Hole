import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { inspectPngPixels } from '../src/inline-image-png.js';
import { imageEditProvider } from '../src/inline-image-edit-provider.js';

function crc(bytes) { let value=0xffffffff; for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0; }
function chunk(type, data) { const value=Buffer.concat([Buffer.from(type),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(value));return Buffer.concat([head,value,tail]); }
function png(width=2,height=2,{raw,compressed}={}) { const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed||deflateSync(raw||Buffer.alloc(height*(width*4+1)))),chunk('IEND',Buffer.alloc(0))]); }
const outputRaw=Buffer.alloc(1024*(1024*4+1));outputRaw[4]=255;outputRaw[8]=128;
const image=png(),output=png(1024,1024,{raw:outputRaw});
const response=()=>Response.json({data:[{b64_json:output.toString('base64')}],usage:{input_tokens:4,output_tokens:8,total_tokens:12,input_tokens_details:{text_tokens:1,image_tokens:3}}});
const input={operation:'remove_background',image};

test('removal uses one fixed multipart low-quality transparent PNG request',async()=>{
 let calls=0;const provider=imageEditProvider({apiKey:'fixture-only',transport:async(url,init)=>{calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer fixture-only');for(const [key,value]of Object.entries({model:'gpt-image-2.5-sunburst-2026-09-08',n:'1',quality:'low',size:'1024x1024',output_format:'png',background:'transparent'}))assert.equal(init.body.get(key),value);assert.equal(init.body.has('mask'),false);assert.deepEqual(new Uint8Array(await init.body.get('image').arrayBuffer()),new Uint8Array(image));return response();}});
 const result=await provider.edit(input);assert.equal(calls,1);assert.deepEqual(result.bytes,new Uint8Array(output));assert.equal(result.width,1024);assert.equal(result.usage.total_tokens,12);assert.match(result.limitations.join(' '),/pixels/);
});
test('regional edit requires explicit alpha mask and sends original plus mask',async()=>{
 let calls=0;const provider=imageEditProvider({apiKey:'fixture',transport:async(_,init)=>{calls++;assert.equal(init.body.get('mask').type,'image/png');assert.match(init.body.get('prompt'),/red hat/);return response();}});
 await assert.rejects(provider.edit({operation:'edit_image',image,prompt:'red hat'}),{code:'invalid_input'});assert.equal(calls,0);
 await provider.edit({operation:'edit_image',image,mask:image,prompt:'red hat'});assert.equal(calls,1);
});
test('invalid input fails before transport',async()=>{
 let calls=0;const provider=imageEditProvider({apiKey:'fixture',transport:()=>{calls++;throw Error('unexpected');}});
 for(const value of [{...input,image:'https://example.com/a.png'},{...input,operation:'other'},{...input,mask:image},{operation:'edit_image',image,mask:png(3,2),prompt:'x'},{operation:'edit_image',image,mask:image,prompt:'x'.repeat(2001)},{...input,image:new Uint8Array(5*1024*1024+1)}])await assert.rejects(provider.edit(value),{code:'invalid_input'});
 assert.equal(calls,0);
});
test('pre-abort and missing credentials perform no request',async()=>{
 let calls=0;const transport=()=>{calls++;throw Error('unexpected');};await assert.rejects(imageEditProvider({transport}).edit(input),{code:'not_configured'});
 const controller=new AbortController();controller.abort();await assert.rejects(imageEditProvider({apiKey:'fixture',transport}).edit({...input,signal:controller.signal}),{code:'cancelled'});assert.equal(calls,0);
});
test('provider failure never retries and does not expose response or credential',async()=>{
 let calls=0;await assert.rejects(imageEditProvider({apiKey:'private-fixture',transport:async()=>{calls++;return new Response('secret provider body',{status:429});}}).edit(input),error=>error.code==='provider_error'&&!error.message.includes('secret'));assert.equal(calls,1);
});
test('invalid, multiple, URL-only and wrong-size outputs fail closed',async()=>{
 const invalid=[{data:[{url:'https://example.com/output'}]},{data:[{b64_json:'!!!'}]},{data:[{b64_json:image.toString('base64')}]},{data:[{b64_json:output.toString('base64')},{b64_json:output.toString('base64')}]},{data:[{b64_json:Buffer.from('not png').toString('base64')}]}];
 for(const body of invalid)await assert.rejects(imageEditProvider({apiKey:'fixture',transport:async()=>Response.json(body)}).edit(input),{code:'invalid_output'});
});
test('corrupt PNG and trailing bytes are rejected before upload',async()=>{
 const corrupt=Buffer.from(image);corrupt[20]^=1;
 for(const bytes of [corrupt,Buffer.concat([image,Buffer.from('trailing')])])await assert.rejects(imageEditProvider({apiKey:'fixture',transport:()=>{throw Error('must not call');}}).edit({...input,image:bytes}),{code:'invalid_input'});
});
test('oversized response is cancelled and absent usage is not invented',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(15*1024*1024));},cancel(){cancelled=true;}});
 await assert.rejects(imageEditProvider({apiKey:'fixture',transport:async()=>new Response(stream)}).edit(input),{code:'invalid_output'});assert.equal(cancelled,true);
 const result=await imageEditProvider({apiKey:'fixture',transport:async()=>Response.json({data:[{b64_json:output.toString('base64')}],usage:{input_tokens:-1}})}).edit(input);assert.equal(result.usage,null);
});

test('failure metadata distinguishes preflight from ambiguous started request without leaking transport errors',async()=>{
 const provider=imageEditProvider({apiKey:'fixture',transport:async()=>{throw Object.assign(Error('secret-url-and-key'),{code:'ECONNRESET'});}});
 await assert.rejects(provider.edit(input),error=>error.code==='provider_error'&&error.providerRequestStarted&&error.outcomeUnknown&&!error.message.includes('secret'));
 await assert.rejects(provider.edit({...input,operation:'bad'}),error=>!error.providerRequestStarted&&!error.outcomeUnknown);
});
test('abort after dispatch reports ambiguous outcome and passes caller cancellation to transport',async()=>{
 const controller=new AbortController();let calls=0;
 const provider=imageEditProvider({apiKey:'fixture',transport:async(_,init)=>{calls++;controller.abort();assert.equal(init.signal.aborted,true);init.signal.throwIfAborted();}});
 await assert.rejects(provider.edit({...input,signal:controller.signal}),error=>error.code==='cancelled'&&error.providerRequestStarted&&error.outcomeUnknown);assert.equal(calls,1);
});

test('cancellation interrupts a stalled response body and marks request outcome unknown',async()=>{
 const controller=new AbortController();let cancelled=false;
 const provider=imageEditProvider({apiKey:'fixture',transport:async()=>new Response(new ReadableStream({start(){setTimeout(()=>controller.abort(),5);},cancel(){cancelled=true;}}))});
 await assert.rejects(provider.edit({...input,signal:controller.signal}),error=>error.code==='cancelled'&&error.outcomeUnknown);assert.equal(cancelled,true);
});

test('PNG valid CRC is insufficient: invalid deflate, truncated rows, excess pixels and invalid filters fail before request',async()=>{
 let calls=0;const provider=imageEditProvider({apiKey:'fixture',transport:async()=>{calls++;return response();}});
 for(const options of [{compressed:Buffer.from('invalid zlib')},{raw:Buffer.alloc(1)},{raw:Buffer.alloc(100)},{raw:Buffer.alloc(18,255)}])await assert.rejects(provider.edit({...input,image:png(2,2,options)}),{code:'invalid_input'});assert.equal(calls,0);
});
function opaque(width,height){const raw=Buffer.alloc(height*(width*4+1),255);for(let y=0;y<height;y++)raw[y*(width*4+1)]=0;return png(width,height,{raw});}
test('regional mask requires actual fully transparent pixels, not merely an alpha channel',async()=>{
 let calls=0;const provider=imageEditProvider({apiKey:'fixture',transport:async()=>{calls++;return response();}});
 await assert.rejects(provider.edit({operation:'edit_image',image,mask:opaque(2,2),prompt:'red hat'}),{code:'invalid_input'});assert.equal(calls,0);
});
test('opaque removal output is rejected after one request with ambiguous paid outcome',async()=>{
 let calls=0;const provider=imageEditProvider({apiKey:'fixture',transport:async()=>{calls++;return Response.json({data:[{b64_json:opaque(1024,1024).toString('base64')}]});}});
 await assert.rejects(provider.edit(input),error=>error.code==='invalid_output'&&error.providerRequestStarted&&error.outcomeUnknown);assert.equal(calls,1);
});

test('all five PNG filters reconstruct real alpha values across pixels and rows',async()=>{
 // Two 2-pixel rows: alpha [0,128] then [255,0]. Encoded fixture bytes are fixed.
 const secondAlpha=[0,1,128,65,1];
 for(let filter=0;filter<=4;filter++){
   const raw=Buffer.from([filter,0,0,0,0,0,0,0,128, filter,0,0,0,255,0,0,0,secondAlpha[filter]]);
   const result=await inspectPngPixels({width:2,height:2,alphaChannel:true,idat:[deflateSync(raw)]});
   assert.deepEqual(result,{transparentPixels:2,nonopaquePixels:3},`filter ${filter}`);
 }
});
test('provider PNG with valid container but invalid deflate is rejected before publication',async()=>{
 const provider=imageEditProvider({apiKey:'fixture',transport:async()=>Response.json({data:[{b64_json:png(1024,1024,{compressed:Buffer.from('bad zlib')}).toString('base64')}]})});
 await assert.rejects(provider.edit(input),error=>error.code==='invalid_output'&&error.outcomeUnknown);
});

test('removal rejects blank alpha0 and uniformly translucent alpha254 outputs',async()=>{
 for(const alpha of [0,254]){
  const raw=Buffer.alloc(1024*(1024*4+1));for(let y=0;y<1024;y++)for(let x=0;x<1024;x++)raw[y*(1024*4+1)+1+x*4+3]=alpha;
  const provider=imageEditProvider({apiKey:'fixture',transport:async()=>Response.json({data:[{b64_json:png(1024,1024,{raw}).toString('base64')}]})});
  await assert.rejects(provider.edit(input),error=>error.code==='invalid_output'&&error.outcomeUnknown);
 }
});
