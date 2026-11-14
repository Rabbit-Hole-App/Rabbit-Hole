import test from 'node:test';
import assert from 'node:assert';
import { updateParameters, languageParameters, derived } from './topic-recurrent-networks-data.js';
import { references } from './composition-recurrent-networks-references.js';
import manifest from './topic-recurrent-networks-sources.json' with { type: 'json' };
import { parseTutorDiagram } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} versus ${b}`);
test('C05 recurrent cell independently combines prior state and fresh input before ReLU and readout',()=>{
 const d=derived().update,p=updateParameters;let h=p.h0;
 for(const [i,x] of p.inputs.entries()){const z=p.a*h+p.b*x+p.bias;h=Math.max(0,z);assert.strictEqual(d.rows[i].z,z);assert.strictEqual(d.rows[i].h,h);assert.strictEqual(d.rows[i].y,p.readout*h);}
 assert.ok(d.rows[1].z<0);assert.strictEqual(d.rows[1].h,0);
 const graph=references[0].spec.diagram;
 for(const edge of [{from:'x1',to:'h1'},{from:'x2',to:'h2'},{from:'h1',to:'h2'},{from:'h1',to:'y1'},{from:'h2',to:'y2'}])assert.ok(graph.edges.some(e=>e.from===edge.from&&e.to===edge.to));
 assert.ok(!graph.edges.some(e=>e.to.startsWith('x')));
 const blocks=references[0].depths.standard.detailSpec.diagram.blocks;
 assert.match(blocks[0].label,/combine/i);assert.match(blocks[1].label,/ReLU/);assert.match(blocks[2].label,/readout/i);
 assert.deepStrictEqual(references[0].depths.deep.spec.diagram.series.map(s=>s.points.map(p=>p.y)),[d.rows.map(r=>r.z),d.rows.map(r=>r.h)]);
});
test('C05 next-token prefix states, softmax and hidden gradients match an independent objective',()=>{
 const d=derived().language,p=languageParameters;let h=p.h0;
 for(const [i,row] of d.rows.entries()){
  h=Math.max(0,p.a*h+p.features[p.observed[i]]);
  assert.strictEqual(row.state,h);assert.strictEqual(row.prefix,p.observed.slice(0,i+1).join(' '));assert.strictEqual(row.target,p.observed[i+1]);
  const z=p.slopes.map((u,j)=>u*h+p.biases[j]);const exps=z.map(v=>Math.exp(v-Math.max(...z)));const probs=exps.map(v=>v/exps.reduce((s,n)=>s+n,0));
  row.probabilities.forEach((v,j)=>close(v,probs[j]));close(row.loss,-Math.log(probs[p.vocabulary.indexOf(row.target)]));
  close(row.stateGradient,probs.reduce((s,v,j)=>s+v*p.slopes[j],0)-p.slopes[p.vocabulary.indexOf(row.target)]);
 }
 const loss=a=>{let state=p.h0;return p.observed.slice(0,-1).reduce((sum,token,i)=>{state=Math.max(0,a*state+p.features[token]);const z=p.slopes.map((u,j)=>u*state+p.biases[j]);const max=Math.max(...z);return sum+Math.log(z.reduce((s,v)=>s+Math.exp(v-max),0))+max-z[p.vocabulary.indexOf(p.observed[i+1])];},0);};
 const eps=1e-5;close(d.totalGradient,(loss(p.a+eps)-loss(p.a-eps))/(2*eps));
 assert.strictEqual(d.counterfactual.actualInput,p.observed[1]);assert.notStrictEqual(d.counterfactual.guess,d.counterfactual.actualInput);
 assert.strictEqual(d.counterfactual.observedState,d.rows[1].state);assert.notStrictEqual(d.counterfactual.guessState,d.rows[1].state);
 const graph=references[1].spec.diagram;
 assert.ok(graph.edges.some(e=>e.from==='h1'&&e.to==='h2'));
 assert.ok(!graph.edges.some(e=>e.from.startsWith('p')&&e.to.startsWith('x')));
 assert.match(graph.caption,/observed|teacher/i);
 assert.deepStrictEqual(references[1].depths.deep.detailSpec.diagram.bars.map(b=>b.value),[d.counterfactual.observedState,d.counterfactual.guessState]);
 assert.deepStrictEqual(references[1].depths.deep.spec.diagram.bars.map(b=>b.value),d.rows[0].probabilities.map(v=>+v.toFixed(3)));
});
test('C05 exact source aliases and lessons are retained without legacy metadata union',()=>{
 const rows=manifest.references;assert.strictEqual(rows.length,4);assert.strictEqual(rows.reduce((n,r)=>n+1+r.alsoCovers.length,0),5);
 for(const ref of references){const row=rows.find(r=>r.referenceId===ref.id);assert.deepStrictEqual(ref.lessons,row.lessons);for(const source of [row.source,...row.alsoCovers])assert.ok(ref.prompts.includes(source.summary));}
 assert.deepStrictEqual(references[0].lessons,[]);assert.deepStrictEqual(references[1].lessons,['01','15']);
 const lang=rows.find(r=>r.referenceId===references[1].id);assert.deepStrictEqual(lang.alsoCovers[0].lessons,[]);
});
test('C05 recurrent network views parse, fit and keep quantity values in plots',()=>{
 for(const ref of references)for(const view of Object.values(ref.depths))for(const spec of Object.values(view)){
 assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);assert.ok(renderTutorDiagram(spec,680).width<=680);assert.ok(!['panels','comparison','token-links'].includes(spec.diagram.kind));
 }
});

test('C05 recurrent relationships render one connected graph node per identity',()=>{
 for(const ref of references)for(const view of Object.values(ref.depths))for(const spec of Object.values(view))if(spec.diagram.kind==='relationship'){
 assert.strictEqual(spec.diagram.layout,'graph','An unroll cannot silently render as independent relationship pairs');
 for(const width of [408,680]){const element=renderTutorDiagram(spec,width).element;
 const count=(value,id)=>Array.isArray(value)?value.reduce((n,child)=>n+count(child,id),0):value&&typeof value==='object'?+(value.props?.['data-tutor-node']===id)+count(value.props?.children,id):0;
 for(const node of spec.diagram.nodes)assert.strictEqual(count(element,node.id),1,`One visible node for ${node.id}`);}
 }
});
