import test from 'node:test';import assert from 'node:assert';
import {parameters,derived} from './topic-recurrent-attention-data.js';import {references} from './composition-recurrent-attention-references.js';
import {parseTutorDiagram} from './spec.js';import {lintDiagramContent} from './content-contract.js';import {renderTutorDiagram} from './TutorDiagram.js';
test('C07 each previous state actually queries the source before its own recurrent update',()=>{
 const d=derived(),p=parameters;let state=p.initial;
 for(const[i,row]of d.base.entries()){
 assert.strictEqual(row.query,state);const e=p.encoder.map(x=>Math.exp(state*x-Math.max(...p.encoder.map(x=>state*x))));const w=e.map(x=>x/e.reduce((n,x)=>n+x,0));
 row.weights.forEach((x,j)=>assert.ok(Math.abs(x-w[j])<1e-12));const context=p.encoder.reduce((n,x,j)=>n+w[j]*x,0);assert.ok(Math.abs(context-row.context)<1e-12);
 state=p.recurrent*state+p.inputs[i]+context;assert.ok(Math.abs(state-row.state)<1e-12);
 }assert.deepStrictEqual(d.probeEncoder,p.encoder);assert.notDeepStrictEqual(d.probe.map(r=>r.context),d.base.map(r=>r.context));
 const g=references[0].spec.diagram;for(const[from,to]of[['s0','read1'],['s1','read2'],['c1','s1'],['c2','s2']])assert.ok(g.edges.some(e=>e.from===from&&e.to===to));
});
test('C07 recurrent attention has supported readable graph, weight and context views',()=>{
 for(const view of Object.values(references[0].depths))for(const spec of Object.values(view)){assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);assert.ok(renderTutorDiagram(spec,408).width<=680);assert.ok(renderTutorDiagram(spec,680).width<=680);if(spec.diagram.kind==='relationship')assert.strictEqual(spec.diagram.layout,'graph');}
});
