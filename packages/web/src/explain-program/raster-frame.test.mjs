import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrame, parseGuestResult } from './contract.js';
import { normalizeFrame } from './frame.js';
import { rasterRuns } from '../raster-pixels.js';
import { validateScene } from '../animation-scene.js';

const raster = {kind:'raster',id:'pixels',x:10,y:20,w:120,h:80,rows:2,cols:3,
  pixels:[255,0,0,255, 255,0,0,255, 0,0,0,0, 0,10,255,128, 0,10,255,128, 0,10,255,255]};
const frame = objects => ({width:200,height:140,objects});
const draw = object => normalizeFrame(frame([object]));

test('raster reaches shared scene state with exact channels and stable geometry', () => {
  const view=draw(raster);
  assert.equal(view.ok,true,view.issue);
  const object=view.state.objects[0];
  assert.equal(object.type,'raster');
  assert.deepEqual([object.x,object.y,object.w,object.h],[10,20,120,80]);
  assert.deepEqual(object.pixels,raster.pixels);
  assert.deepEqual(rasterRuns(object),[
    {x:0,y:0,w:2,fill:'rgb(255,0,0)',opacity:1},
    {x:0,y:1,w:2,fill:'rgb(0,10,255)',opacity:128/255},
    {x:2,y:1,w:1,fill:'rgb(0,10,255)',opacity:1},
  ]);
  const changed=draw({...raster,pixels:raster.pixels.map((v,i)=>i===0?100:v)});
  assert.notDeepEqual(rasterRuns(changed.state.objects[0]),rasterRuns(object));
});

test('transparent mask holes produce no painted run and alpha stays independent of RGB', () => {
  const object={rows:1,cols:3,pixels:[50,60,70,255, 50,60,70,0, 50,60,70,64]};
  assert.deepEqual(rasterRuns(object),[
    {x:0,y:0,w:1,fill:'rgb(50,60,70)',opacity:1},
    {x:2,y:0,w:1,fill:'rgb(50,60,70)',opacity:64/255},
  ]);
});

test('strict frame gate rejects injected sources, invalid channels, shape mismatches and overflow', () => {
  for(const object of [
    {...raster,src:'https://example.com/a'}, {...raster,pixels:'<svg onload=x>'},
    {...raster,pixels:raster.pixels.slice(1)}, {...raster,rows:0}, {...raster,cols:65},
    {...raster,x:-1}, {...raster,w:200},
    ...[-1,256,NaN,Infinity,0.5,'255',null].map(value=>({...raster,pixels:[value,...raster.pixels.slice(1)]})),
  ]) assert.equal(parseFrame(frame([object])).ok,false,JSON.stringify(object));
  const full={...raster,rows:64,cols:64,pixels:Array(64*64*4).fill(0)};
  assert.equal(parseFrame(frame([full,{...full,id:'second'}])).ok,true);
  assert.equal(parseFrame(frame([full,{...full,id:'second'},{...full,id:'third'}])).ok,false);
});

test('raster capability is explicit and legacy image URL policy is unchanged', () => {
  const result={frame:frame([raster]),quantities:{}};
  assert.equal(parseGuestResult(result,{capabilities:[]}).ok,false);
  assert.equal(parseGuestResult(result,{capabilities:['raster_visuals']}).ok,true);
  const view=draw(raster);
  const injected={...view.scene,objects:[{id:'external',type:'image',initialState:{x:0,y:0,w:100,h:100,src:'data:image/svg+xml,<svg/>'}}]};
  assert.throws(()=>validateScene(injected),/same-origin/);
});
