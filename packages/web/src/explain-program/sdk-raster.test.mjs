import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { SDK_SOURCE } from './sdk.js';
import { RASTER_SOURCE } from './sdk-raster.js';
import { parseFrame } from './contract.js';

// Only trusted helper source and test-owned values execute in this VM.
const sdk=runInNewContext(`${SDK_SOURCE}\n${RASTER_SOURCE}\nsdk`);
const layout={x:12,y:18,w:240,h:160,rows:2,cols:3};
const clone=value=>JSON.parse(JSON.stringify(value));
const raster=(options={})=>clone(sdk.raster('pixels',{...layout,pixels:Array(24).fill(255),...options}));
const mask=(options={})=>clone(sdk.mask('mask',{...layout,values:[0,1,0,1,0.5,1],...options}));

test('RGBA pixels preserve row-major channels, independent alpha and source immutability',()=>{
  const pixels=[255,0,0,255,0,255,0,128,0,0,255,0,12,34,56,78,90,80,70,60,0,0,0,255];
  const object=raster({pixels});
  assert.deepEqual(object,{kind:'raster',id:'pixels',...layout,pixels});
  pixels[0]=0;
  assert.equal(object.pixels[0],255);
  const second=raster({pixels});
  assert.equal(second.pixels[0],0,'a changed input emits changed pixels with the same object identity');
  assert.equal(second.id,object.id);
});

test('an irregular mask retains transparent outside pixels and holes and scales alpha',()=>{
  const values=[0,1,0,1,0,1,0,1,0];
  const object=mask({rows:3,cols:3,values,color:'#1248aF',opacity:0.5});
  assert.deepEqual(object.pixels.filter((_,i)=>i%4===3),[0,128,0,128,0,128,0,128,0]);
  assert.deepEqual(object.pixels.slice(0,4),[18,72,175,0]);
  assert.equal(mask().pixels[4*4+3],128,'soft weights are preserved');
  assert.deepEqual(mask().pixels.slice(4,8),[229,170,70,255],'default overlay color and opacity');
  assert.ok(mask({opacity:0}).pixels.filter((_,i)=>i%4===3).every(alpha=>alpha===0));
});

test('malformed channels and sparse input fail before they reach the renderer',()=>{
  for(const value of [-1,256,0.5,NaN,Infinity,'12',null,undefined]) {
    const pixels=Array(24).fill(0);pixels[3]=value;
    assert.throws(()=>raster({pixels}),/RGBA channels/);
  }
  for(const pixels of [null,'url',[],Array(23).fill(0),Array(25).fill(0)]) assert.throws(()=>raster({pixels}),/exactly/);
  assert.throws(()=>raster({pixels:new Array(24)}),/RGBA channels/);
  for(const value of [-0.1,1.1,NaN,Infinity,'0',null,undefined]) {
    const values=Array(6).fill(0);values[0]=value;
    assert.throws(()=>mask({values}),/mask weights/);
  }
  assert.throws(()=>mask({values:new Array(6)}),/mask weights/);
  assert.throws(()=>mask({values:Array(5).fill(1)}),/exactly/);
});

test('layout, dimensions, tint and opacity are explicitly bounded',()=>{
  for(const rows of [0,-1,65,1.5,NaN,'2']) assert.throws(()=>raster({rows}),/rows and cols/);
  for(const cols of [0,-1,65,1.5,Infinity,'3']) assert.throws(()=>raster({cols}),/rows and cols/);
  for(const change of [{w:0},{h:-1},{w:2001},{x:Infinity},{y:NaN},{x:100000},{y:-100001}]) assert.throws(()=>raster(change),/rectangle/);
  for(const color of ['red','#fff','#00000000','url(x)','<svg>',null]) assert.throws(()=>mask({color}),/color/);
  for(const opacity of [-0.1,1.1,NaN,'0.5',null]) assert.throws(()=>mask({opacity}),/opacity/);
  assert.throws(()=>sdk.raster('bad id',{...layout,pixels:Array(24).fill(0)}),/safe object ID/);
  assert.throws(()=>sdk.raster('ok',null),/options/);
});

test('maximum raster and mask are accepted by the frame contract without object expansion',()=>{
  const bounds={x:0,y:0,w:256,h:256,rows:64,cols:64};
  const pixels=raster({...bounds,pixels:Array(4096*4).fill(255)});
  const overlay=mask({...bounds,values:Array(4096).fill(0.25)});
  assert.equal(pixels.pixels.length,16384);
  assert.equal(overlay.pixels.length,16384);
  const frame=parseFrame({width:256,height:256,objects:[pixels,overlay]});
  assert.equal(frame.ok,true,frame.issue);
  assert.equal(frame.value.objects.length,2);
});
