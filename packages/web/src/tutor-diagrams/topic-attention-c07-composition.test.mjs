import test from 'node:test';
import assert from 'node:assert';
import { compositionParameters as p, compositionDerived, derived as oldDerived } from './topic-attention-data.js';
import { references } from './composition-attention-references.js';
import { parseTutorDiagram } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} versus ${b}`);
const softmax=s=>{const e=s.map(x=>Math.exp(x-Math.max(...s)));return e.map(x=>x/e.reduce((n,v)=>n+v,0));};
const sum=a=>a.reduce((n,v)=>n+v,0),dot=(a,b)=>sum(a.map((x,i)=>x*b[i]));
const fresh=references.filter(ref=>ref.id!=='ml-attention-scaled-score-normalization');

test('C07 matching operands independently produce raw terms, shares and value products',()=>{
 const d=compositionDerived().matching,b=d.base;
 assert.deepStrictEqual(b.terms,p.matching.keys.map(k=>k.map((x,i)=>x*p.matching.query[i])));
 assert.deepStrictEqual(b.scores,p.matching.keys.map(k=>dot(k,p.matching.query)));
 const w=softmax(b.scores);b.weights.forEach((x,i)=>close(x,w[i]));
 const products=p.matching.values.map((v,i)=>v.map(x=>x*w[i]));
 products.forEach((v,i)=>v.forEach((x,j)=>close(x,b.products[i][j])));
 b.output.forEach((x,j)=>close(x,sum(products.map(v=>v[j]))));
 for(let j=0;j<b.output.length;j++)close(b.display.output[j],sum(b.display.products.map(v=>v[j])));
 assert.deepStrictEqual(d.scaledQuery.scores,b.scores.map(x=>x*p.matching.queryScale));
});
test('C07 changing only values fixes weights and permuting paired rows fixes the context',()=>{
 const d=compositionDerived().matching;
 assert.deepStrictEqual(d.valueProbe.weights,d.base.weights);
 d.valueProbe.output.forEach((x,j)=>close(x-d.base.output[j],d.base.weights[p.matching.changedValue]*p.matching.valueDelta[j]));
 d.permuted.output.forEach((x,j)=>close(x,d.base.output[j]));
 assert.deepStrictEqual(d.permuted.values,[...d.base.values].reverse());
 assert.deepStrictEqual(d.permuted.weights,[...d.base.weights].reverse());
});
test('C07 additive branches project independently before addition, tanh and a learned score',()=>{
 const d=compositionDerived().additive,a=p.additive;
 const q=a.Wq[0].map((_,j)=>sum(a.query.map((x,i)=>x*a.Wq[i][j])));
 const k=a.keys.map(row=>a.Wk[0].map((_,j)=>sum(row.map((x,i)=>x*a.Wk[i][j]))));
 assert.deepStrictEqual(d.base.projectedQuery,q);assert.deepStrictEqual(d.base.projectedKeys,k);
 const scores=k.map(row=>dot(row.map((x,j)=>Math.tanh(x+q[j])),a.v));
 scores.forEach((x,i)=>close(x,d.base.scores[i]));
 const w=softmax(scores.filter((_,i)=>a.eligible[i]));w.forEach((x,i)=>close(x,d.base.weights[i]));
 assert.strictEqual(d.base.weights.at(-1),0);assert.deepStrictEqual(d.probe.weights,d.base.weights);
 const graph=fresh.find(r=>r.id==='ml-attention-additive-attention').spec.diagram;
 assert.ok(graph.edges.some(e=>e.from==='q'&&e.to==='pq'));assert.ok(graph.edges.some(e=>e.from==='k'&&e.to==='pk'));
 assert.ok(!graph.edges.some(e=>e.from==='pq'&&e.to==='pk'));
 assert.ok(graph.caption.includes('qW_q+k_jW_k'),'Visible score formula must use the same row-vector multiplication as the declared matrices');
 const caption=fresh.find(r=>r.id==='ml-attention-additive-attention').depths.deep.spec.diagram.caption;assert.ok(caption.includes(p.additive.Wk.map(row=>'('+row.join(',')+')').join(',')),'The numeric projection operands expose the actual projector coefficients');
});
test('C07 connectivity hop magnitudes follow independent breadth-first paths for every rule',()=>{
 const d=compositionDerived().connectivity;
 const hops=(A,source,target)=>{let queue=[[source,0]],seen=new Set([source]);while(queue.length){const[i,h]=queue.shift();if(i===target)return h;for(let j=0;j<A.length;j++)if(A[j][i]&&!seen.has(j)){seen.add(j);queue.push([j,h+1]);}}return null;};
 for(const [i,rule]of d.rules.entries()){
 assert.strictEqual(d.base[i],hops(rule.adjacency,0,2));assert.strictEqual(d.near[i],hops(rule.adjacency,0,1));
 assert.strictEqual(d.wide[i],hops(i===0?d.wideLocal:rule.adjacency,0,2));
 }
 assert.deepStrictEqual(d.base,[2,2,1]);assert.deepStrictEqual(d.near,[1,1,1]);assert.deepStrictEqual(d.wide,[1,2,1]);
 const ref=fresh.find(r=>r.id==='ml-attention-connectivity-and-path-length');
 for(const view of Object.values(ref.depths))for(const name of d.rules.map(r=>r.label))assert.ok(view.spec.diagram.bars.some(b=>b.label.includes(name)));
});
test('C07 causal scores are masked before normalization and future edits cannot enter the interior context',()=>{
 const d=compositionDerived().causal,c=p.causal;
 c.queries.forEach((q,i)=>{const raw=c.keys.map(k=>q*k);assert.deepStrictEqual(d.base.rawScores[i],raw);
 assert.deepStrictEqual(d.base.maskedScores[i],raw.map((x,j)=>j<=i?x:null));
 const w=softmax(raw.slice(0,i+1));d.base.weights[i].forEach((x,j)=>close(x,j<=i?w[j]:0));close(sum(d.base.weights[i]),1);
 close(d.base.outputs[i],dot(d.base.weights[i],c.values));});
 const i=c.focus;assert.notDeepStrictEqual(d.probe.rawScores[i],d.base.rawScores[i]);assert.deepStrictEqual(d.probe.weights[i],d.base.weights[i]);close(d.probe.outputs[i],d.base.outputs[i]);
});
test('C07 packed channels, selected-row projections and supplied-layer identities match independent multiplication',()=>{
 const d=compositionDerived().packed,c=p.packed,W=[...c.Wq,...c.Wk,...c.Wv];
 assert.deepStrictEqual(d.jointRows,c.inputs.map(x=>W.map(w=>x*w)));
 assert.deepStrictEqual(d.channels.map(row=>row.cells),W.map(w=>c.inputs.map(x=>x*w)));
 for(const range of d.ranges)assert.deepStrictEqual(d.active[range.key],d.active.joint.slice(range.start,range.end));
 for(const layer of d.layers){assert.strictEqual(layer.position,d.active.position);assert.strictEqual(layer.provided,true);assert.deepStrictEqual(layer.joint,[...layer.Wq,...layer.Wk,...layer.Wv].map(w=>w*layer.input));}
 const ref=fresh.find(r=>r.id==='ml-attention-packed-query-key-value-projections');assert.strictEqual(ref.spec.diagram.kind,'heatmap');assert.strictEqual(ref.spec.diagram.rows.length,6);assert.ok(ref.depths.deep.spec.diagram.caption.includes('Provided'));assert.ok(!ref.depths.deep.spec.diagram.edges.some(e=>e.from==='o0'&&e.to==='h1'));assert.strictEqual(ref.spec.diagram.columns.length,2);
 assert.deepStrictEqual(ref.spec.diagram.rows.map(row=>row.cells),d.channels.map(row=>row.cells));assert.ok(ref.spec.diagram.caption.includes('W=[W_q|W_k|W_v]'));assert.ok(ref.spec.diagram.caption.includes('J=HW'));
});
test('C07 all-query row softmax and AV outputs stay fixed only under row constants with V fixed',()=>{
 const d=compositionDerived().allQuery,c=p.allQuery;
 const S=c.queries.map(q=>c.keys.map(k=>dot(q,k)/Math.sqrt(q.length)));
 assert.deepStrictEqual(d.base.scores,S);
 const visible=fresh.find(r=>r.id==='ml-attention-all-query-attention').spec.diagram;assert.ok(visible.caption.includes(`Q=(${c.queries.flat()})^T`));assert.ok(visible.caption.includes(`K=(${c.keys.flat()})^T`));assert.deepStrictEqual(visible.blocks.map(b=>b.diagram.tensor.values),[d.base.display.scores.flat(),d.base.display.weights.flat(),d.base.display.outputs.flat()]);
 S.forEach((s,i)=>{const w=softmax(s);w.forEach((x,j)=>close(x,d.base.weights[i][j]));d.base.outputs[i].forEach((x,j)=>close(x,sum(c.values.map((v,k)=>w[k]*v[j]))));});
 assert.deepStrictEqual(d.probe.scores,S.map((r,i)=>r.map(x=>x+c.rowOffsets[i])));
 d.base.display.outputs.forEach((row,i)=>row.forEach((value,j)=>assert.strictEqual(value,+sum(c.values.map((v,k)=>d.base.display.weights[i][k]*v[j])).toFixed(p.precision))));
 d.probe.weights.forEach((r,i)=>r.forEach((x,j)=>close(x,d.base.weights[i][j])));d.probe.outputs.forEach((r,i)=>r.forEach((x,j)=>close(x,d.base.outputs[i][j])));
 assert.ok(S.some((r,i)=>r.some((_,j)=>Math.abs(d.base.weights[i][j]-softmax(S.map(r=>r[j]))[i])>1e-3)));
});
test('C07 new attention views use native schemas and real graph identities without changing C02',()=>{
 assert.strictEqual(fresh.length,8);assert.deepStrictEqual(oldDerived().base.raw,[2,1,3]);assert.deepStrictEqual(oldDerived().doubled.raw,[4,2,6]);
 for(const ref of fresh)for(const view of Object.values(ref.depths))for(const spec of Object.values(view)){
 assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);assert.ok(renderTutorDiagram(spec,680).width<=680);
 assert.ok(renderTutorDiagram(spec,408).width<=680,`${ref.id} exceeds the680 native budget`);
 if(spec.diagram.kind==='relationship'){assert.strictEqual(spec.diagram.layout,'graph');const count=(v,id)=>Array.isArray(v)?v.reduce((n,c)=>n+count(c,id),0):v&&typeof v==='object'?+(v.props?.['data-tutor-node']===id)+count(v.props?.children,id):0;for(const node of spec.diagram.nodes)assert.strictEqual(count(renderTutorDiagram(spec,408).element,node.id),1);}
 }
});

test('C07 packed native fork retains every joint component and all three exact slices',()=>{
 const d=compositionDerived().packed,spec=fresh.find(r=>r.id==='ml-attention-packed-query-key-value-projections').depths.deep.detailSpec;
 assert.strictEqual(spec.diagram.kind,'transformation');assert.ok(renderTutorDiagram(spec,408).width<=680);
 assert.deepStrictEqual(spec.diagram.before.items[0].tensor.values,d.active.joint);
 assert.deepStrictEqual(spec.diagram.after.items.map(item=>item.tensor.values),[d.active.queries,d.active.keys,d.active.values]);
 assert.deepStrictEqual(spec.diagram.links.map(({from,to})=>[from,to]),[[0,0],[0,1],[0,2]]);
 for(const range of d.ranges)assert.ok(spec.diagram.operation.includes(`${range.label}[${range.start}:${range.end}]`));
});
