import test from 'node:test';import assert from 'node:assert';
import {parameters,derived} from './topic-attention-pooling-data.js';
import {references} from './composition-attention-pooling-references.js';
import {parseTutorDiagram} from './spec.js';import {lintDiagramContent} from './content-contract.js';import {renderTutorDiagram} from './TutorDiagram.js';
test('C07 compact kernel controls independently normalize every query and preserve finite versus uniform distinction',()=>{
 const d=derived(),p=parameters;
 for(const row of d.controls){for(const[i,q]of p.queries.entries()){
 const e=p.keys.map(k=>row.id==='uniform'?1:Math.exp(-.5*((q-k)/row.width)**2));const total=e.reduce((n,x)=>n+x,0);
 row.weights[i].forEach((x,j)=>assert.ok(Math.abs(x-e[j]/total)<1e-12));assert.ok(Math.abs(row.display[i].reduce((n,x)=>n+x,0)-1)<1e-12);
 }}assert.ok(d.controls.find(r=>r.id==='uniform').weights.flat().every(x=>x===1/p.keys.length));assert.ok(d.controls.find(r=>r.id==='uniform').display.flat().every(x=>x===1/p.keys.length));assert.notDeepStrictEqual(d.controls.find(r=>r.id==='broad').weights,d.controls.find(r=>r.id==='uniform').weights);
 const narrow=d.controls.find(r=>r.id==='narrow'),broad=d.controls.find(r=>r.id==='broad');narrow.weights.forEach((row,i)=>assert.ok(Math.max(...row)>Math.max(...broad.weights[i])));
});
test('C07 pooling depths carry local uniform narrow broad controls at readable full width',()=>{
 const ref=references[0],d=derived();assert.deepStrictEqual(ref.lessons,['06','12']);
 assert.strictEqual(ref.spec.diagram.rows.length,parameters.keys.length);
 const specs=[ref.spec,ref.depths.standard.detailSpec,ref.depths.deep.spec,ref.depths.deep.detailSpec];
 assert.deepStrictEqual(specs.map(s=>s.diagram.rows.map(r=>r.cells)),d.controls.map(c=>parameters.keys.map((_,i)=>c.display.map(row=>row[i]))));
 for(const view of Object.values(ref.depths))for(const spec of Object.values(view)){assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);assert.strictEqual(renderTutorDiagram(spec,408).width,408);assert.ok(renderTutorDiagram(spec,680).width<=680);}
});
