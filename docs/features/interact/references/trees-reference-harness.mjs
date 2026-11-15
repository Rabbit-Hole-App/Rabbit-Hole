import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
export function mount(html){
 const nodes=new Map();
 for(const m of html.split('<script')[0].matchAll(/<([a-z][a-z0-9-]*)\b([^<>]*\bid="[^"]+"[^<>]*)>/gi)){
  const a=Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
  nodes.set(a.id,{attributes:a,value:a.value??'',innerHTML:'',textContent:'',disabled:false,listeners:{},setAttribute(k,v){this.attributes[k]=String(v)},addEventListener(k,h){this.listeners[k]=h}});
 }
 const context={document:{getElementById:id=>{assert.ok(nodes.has(id),`missing node ${id}`);return nodes.get(id)}}};
 const scripts=[...html.matchAll(/<script id="scene-(?:model|view)">([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 assert.equal(scripts.length,2);runInNewContext(scripts.join('\n'),context,{timeout:2000});
 return {nodes,card:context.TreesCard,change(id,v){const n=nodes.get(id);n.value=String(v);n.listeners[n.attributes['data-event']??'input']({target:n,currentTarget:n})},reset(){nodes.get('reset').listeners.click()},svg(){return nodes.get('objects').innerHTML}};
}
export function inspect(html,comp){
 const ui=mount(html); assert.deepEqual(JSON.parse(JSON.stringify(ui.card.scene)),comp);
 const choices=comp.controls.filter(c=>c.kind!=='reset');let states=[{}];
 for(const c of choices){const vals=c.values??Array.from({length:Math.round((c.max-c.min)/c.step)+1},(_,i)=>Number((c.min+i*c.step).toFixed(8)));assert.ok(vals.length<500);states=states.flatMap(s=>vals.map(v=>({...s,[c.id]:v})));}
 assert.ok(states.length<=50000); let max=0;const signatures=new Set();
 for(const input of states){for(const c of choices)ui.change(c.id,input[c.id]);const svg=ui.svg();assert.ok(!/NaN|Infinity|undefined/.test(svg));
  assert.doesNotMatch(svg,/<(?:use|image|foreignObject)\b/);const count=[...svg.matchAll(/<(?:rect|circle|ellipse|line|polyline|polygon|path|text)\b/g)].length;max=Math.max(max,count);
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  for(const m of svg.matchAll(/<rect\b([^>]+)>/g)){const a=Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));assert.ok(+a.x>=0&&+a.y>=0&&+a.x+(+a.width)<=640.01&&+a.y+(+a.height)<=comp.layout.height+.01,JSON.stringify(a));}
  signatures.add(JSON.stringify(ui.card.evidence));
 }
 assert.ok(max<=130,`${comp.id} has ${max} objects`);assert.ok(signatures.size>1,'controls change evidence');
 ui.reset();const initial=ui.svg();
 for(const c of choices){ui.reset();const start=JSON.stringify(ui.card.evidence);const vals=c.values??[c.min,c.max];let changed=false;for(const v of vals){ui.change(c.id,v);if(JSON.stringify(ui.card.evidence)!==start)changed=true}assert.ok(changed,`${c.id} changes evidence, not just its label`)}
 ui.reset();for(const c of choices)if(Object.hasOwn(comp.aha.inputs,c.id))ui.change(c.id,comp.aha.inputs[c.id]);assert.equal(ui.card.ahaReached,true,'aha reachable through real handlers');
 const held=ui.svg();assert.equal(ui.svg(),held,'aha is held without a clock');ui.reset();assert.equal(ui.svg(),initial,'Reset restores the drawing');
 assert.equal(max,comp.data.verification.maxObjects);assert.equal(states.length,comp.data.verification.cases);
 assert.ok(html.includes('width="640"'));assert.doesNotMatch(html,/<script[^>]+src=|https?:\/\/[^\s"<>]+/);
 return {max,cases:states.length};
}
