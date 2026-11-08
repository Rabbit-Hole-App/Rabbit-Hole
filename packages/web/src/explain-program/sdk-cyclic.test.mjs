import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { SDK_SOURCE } from './sdk.js';
import { CYCLIC_GRAPH_SOURCE } from './sdk-cyclic.js';
import { parseFrame } from './contract.js';
import { normalizeFrame } from './frame.js';

const sdk = runInNewContext(`${SDK_SOURCE}\n${CYCLIC_GRAPH_SOURCE}\nsdk`);
const graph = { x: 20, y: 20, w: 540, h: 380,
  nodes: [{ id:'a',label:'Observe',x:120,y:90 }, { id:'b',label:'Act',x:420,y:90 }, { id:'c',label:'Measure',x:270,y:290 }],
  edges: [{ from:'a',to:'b',label:'command',labelAt:[270,70] }, { from:'b',to:'c',label:'effect',labelAt:[420,220] }, { from:'c',to:'a',label:'feedback',labelAt:[110,220] }],
};
const draw = config => JSON.parse(JSON.stringify(sdk.cyclicGraph('loop',config || graph)));
const valid = objects => {
  const frame={width:580,height:420,objects};
  assert.equal(parseFrame(frame).ok,true);
  const result=normalizeFrame(frame);
  assert.equal(result.ok,true,result.issue);
};

test('a directed cycle renders contract-safe arrows with stable selectable node IDs', () => {
  const before=draw(), after=draw({...graph,selected:'b'});
  valid(before); valid(after);
  assert.equal(before.filter(o=>o.kind==='arrow').length,3);
  assert.deepEqual(before.filter(o=>o.kind==='box').map(o=>o.id),['loop.node.a','loop.node.b','loop.node.c']);
  assert.deepEqual(after.filter(o=>o.role==='learner').map(o=>o.id),['loop.e.b:c.a','loop.node.b']);
  assert.deepEqual(before.map(({role,...o})=>o),after.map(({role,...o})=>o));
  assert.deepEqual(draw(),before,'same input produces the same layout');
  assert.ok(before.length <=44);
  const arrow=before.find(o=>o.id==='loop.e.a:b.a');
  assert.equal(arrow.from.y,110);
  assert.equal(arrow.to.y,110);
  assert.ok(arrow.to.x > arrow.from.x,'arrow direction follows from → to');
  const a=before.find(o=>o.id==='loop.node.a'),b=before.find(o=>o.id==='loop.node.b');
  assert.equal(arrow.from.x,a.x+a.w,'starts on source boundary');
  assert.equal(arrow.to.x,b.x,'ends on target boundary');
});

test('reciprocal links use separate routes and self-loops have visible directed endpoints', () => {
  const config={...graph,nodes:graph.nodes.slice(0,2),edges:[
    {from:'a',to:'b',label:'request',labelAt:[270,150]},
    {from:'b',to:'a',label:'reply',labelAt:[270,35]},
    {from:'a',to:'a',label:'retry',labelAt:[120,16]},
  ]};
  const objects=draw(config);valid(objects);
  const forward=objects.find(o=>o.id==='loop.e.a:b.p'),back=objects.find(o=>o.id==='loop.e.b:a.p');
  assert.notEqual(forward.points.at(-1)[1],back.points.at(-1)[1]);
  const loop=objects.find(o=>o.id==='loop.e.a:a.a');
  assert.ok(Math.hypot(loop.to.x-loop.from.x,loop.to.y-loop.from.y)>=8);
  assert.equal(objects.filter(o=>o.kind==='arrow').length,3);
});

test('explicit routing goes around an intervening node and respects all local bounds', () => {
  const config={...graph,nodes:[{id:'a',label:'A',x:80,y:200},{id:'b',label:'B',x:270,y:200},{id:'c',label:'C',x:460,y:200}],
    edges:[{from:'a',to:'c',label:'skip',via:[[80,100],[460,100]],labelAt:[270,80]}]};
  const objects=draw(config);valid(objects);
  assert.deepEqual(objects.find(o=>o.kind==='polyline').points,[[100,199],[100,120],[480,120]]);
  assert.throws(()=>draw({...config,edges:[{from:'a',to:'c',label:'skip'}]}),/crosses a node/);
});

test('malformed topology, roles, selection and coordinates fail instead of producing an ambiguous network', () => {
  assert.throws(()=>draw({...graph,nodes:[...graph.nodes,graph.nodes[0]]}),/duplicate node/);
  assert.throws(()=>draw({...graph,edges:[...graph.edges,graph.edges[0]]}),/duplicate edge/);
  assert.throws(()=>draw({...graph,edges:[{from:'a',to:'missing',label:'x'}]}),/unknown node/);
  assert.throws(()=>draw({...graph,selected:'missing'}),/selected/);
  assert.throws(()=>draw({...graph,nodes:[{...graph.nodes[0],role:'bogus'},...graph.nodes.slice(1)]}),/role/);
  for(const coordinate of [NaN,Infinity,-1,600]) assert.throws(()=>draw({...graph,nodes:[{...graph.nodes[0],x:coordinate},...graph.nodes.slice(1)]}),/bounds/);
  assert.throws(()=>draw({...graph,nodes:[graph.nodes[0],{...graph.nodes[1],x:120}]}),/overlap/);
  for(const edges of [[{from:'a',to:'b'}],[{from:'a',to:'b',label:''}],[{from:'a',to:'b',label:'long label beyond limit'}]]) assert.throws(()=>draw({...graph,edges}),/label/);
  for(const via of [null,[],[[Infinity,1]],[[1,2,3]],Array(5).fill([1,2])]) assert.throws(()=>draw({...graph,edges:[{...graph.edges[0],via}]}),/via/);
  assert.throws(()=>draw({...graph,edges:[{...graph.edges[0],labelAt:[10,10]}]}),/label outside bounds/);
  assert.throws(()=>draw({...graph,edges:[{...graph.edges[0],labelAt:[120,90]}]}),/label overlaps/);
  assert.throws(()=>draw({...graph,edges:Array(13).fill(graph.edges[0])}),/1 to 12/);
  assert.throws(()=>draw({...graph,nodes:Array(9).fill(graph.nodes[0])}),/2 to 8/);
  assert.throws(()=>draw({...graph,w:Infinity}),/bounds/);
});

test('unroutable self-loops and degenerate routes fail with actionable errors', () => {
  const nodes=[{...graph.nodes[0],y:30},graph.nodes[1]];
  assert.throws(()=>draw({...graph,nodes,edges:[{from:'a',to:'a',label:'retry'}]}),/outside bounds/);
  assert.throws(()=>draw({...graph,edges:[{from:'a',to:'b',label:'x',via:[[120,90]]}]}),/leave its node/);
  assert.throws(()=>draw({...graph,edges:[{from:'a',to:'b',label:'x',via:[[200,90],[201,90]]}]}),/8 pixels/);
});

test('the maximum supported network stays within the frame object budget', () => {
  const nodes=[],edges=[];
  for(let row=0;row<4;row++) {
    const y=100+row*200,a='a'+row,b='b'+row;
    nodes.push({id:a,label:a,x:120,y},{id:b,label:b,x:500,y});
    edges.push({from:a,to:b,label:'request',labelAt:[310,y+50]},
      {from:b,to:a,label:'reply',labelAt:[310,y-50]},
      {from:a,to:a,label:'retry',labelAt:[120,y-72]});
  }
  const objects=draw({x:0,y:0,w:640,h:800,nodes,edges});
  assert.equal(objects.length,44);
  const frame={width:640,height:800,objects};
  assert.equal(parseFrame(frame).ok,true);
  assert.equal(normalizeFrame(frame).ok,true);
});
