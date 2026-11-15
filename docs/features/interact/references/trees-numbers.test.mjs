import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mount} from './trees-reference-harness.mjs';
const root=new URL('./',import.meta.url), read=n=>readFileSync(new URL(n,root),'utf8');
export function card(depth,family,id){return mount(read(`${depth}-${family}-${id}.html`))}
export function has(id){return existsSync(new URL(id,root))}
if(has('overview-graph-active-path-grown-tree.html'))test('grown-tree source oracles: I, J, G and exact-boundary rules',()=>{
 const u=card('overview','graph-active-path','grown-tree');
 for(const [id,path,prediction]of [['I',['root','rootl'],0],['J',['root','rootr','rootrl'],0],['G',['root','rootr','rootrr'],1]]){u.change('point',id);assert.deepEqual(JSON.parse(JSON.stringify(u.card.evidence)),{point:{x:u.card.scene.data.rows.find(r=>r.id===id).x,y:u.card.scene.data.rows.find(r=>r.id===id).y},path,prediction})}
 const d=card('deep','graph-active-path','grown-tree');d.change('x',4);d.change('y',2);d.change('trace',2);assert.equal(d.card.evidence.path.at(-1),'rootl');
 d.change('x',6);d.change('y',2);d.change('trace',2);assert.equal(d.card.evidence.path.at(-1),'rootrl');assert.equal(d.card.evidence.prediction,0);
 const J=d.card.scene.data.rows.find(r=>r.id==='J');assert.equal(J.label,1);assert.equal(d.card.scene.data.tree.counts.join(','),'5,3');
});
