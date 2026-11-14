import test from 'node:test';
import assert from 'node:assert';
import {parameters,derived,classifyLogit} from './topic-contextual-embeddings-data.js';
import {references} from './composition-contextual-embeddings-references.js';
import {parseTutorDiagram} from './spec.js';
import {lintDiagramContent} from './content-contract.js';
import {renderTutorDiagram} from './TutorDiagram.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} versus ${b}`);

test('C09 independent directions recompute every state from its own prefix/suffix and zero boundaries',()=>{
 const p=parameters.directional,d=derived().directional;
 for(const context of d.contexts){
  const E=context.tokens.map(token=>p.lookup.find(row=>row.token===token).values);
  assert.deepStrictEqual(context.E,E);assert.strictEqual(p.boundary,0);
  for(let i=0;i<E.length;i++){
   const F1=E.slice(0,i+1).reduce((s,row,k)=>s+p.forward**(i-k)*row[0],0);
   const B1=E.slice(i).reduce((s,row,k)=>s+p.backward**k*row[1],0);
   near(context.F[0][i],F1);near(context.B[0][i],B1);
   const F2=context.F[0].slice(0,i+1).reduce((s,value,k)=>s+p.forward**(i-k)*value,0);
   const B2=context.B[0].slice(i).reduce((s,value,k)=>s+p.backward**k*value,0);
   near(context.F[1][i],F2);near(context.B[1][i],B2);
   assert.deepStrictEqual(context.H[0][i],E[i]);for(let depth=1;depth<=2;depth++)assert.deepStrictEqual(context.H[depth][i],[context.F[depth-1][i],context.B[depth-1][i]]);
  }
 }
 assert.strictEqual(d.contexts.length,2);const [G,C]=d.contexts;
 for(let depth=0;depth<2;depth++)for(let i=0;i<=p.selectedPosition;i++)assert.strictEqual(G.F[depth][i],C.F[depth][i]);
 assert.notStrictEqual(G.B[0][p.selectedPosition],C.B[0][p.selectedPosition]);
 assert.deepStrictEqual(G.F,[[0,1,2.5],[0,1,3]]);assert.deepStrictEqual(C.B,[[1.125,.5,2],[1.375,1,2]]);
});

test('C09 H0=E and only two directional joins feed compatible task-depth products and conditional probes',()=>{
 const p=parameters.directional,d=derived().directional;
 for(const context of d.contexts){assert.strictEqual(context.H.length,3);for(let i=0;i<context.tokens.length;i++){
  const mix=context.taskA;assert.strictEqual(mix.products[i].length,3);
  near(p.taskA.coefficients.reduce((a,b)=>a+b,0),1);
  for(let j=0;j<2;j++){const terms=context.H.map((layer,depth)=>p.taskA.coefficients[depth]*layer[i][j]);terms.forEach((term,depth)=>near(mix.products[i][depth][j],term));near(mix.outputs[i][j],p.taskA.gamma*terms.reduce((a,b)=>a+b,0));}
 }}
 const [G,C]=d.contexts,i=p.selectedPosition;assert.deepStrictEqual(G.taskA.displayOutputs,[[0,1.1125],[1,.325],[2.65,1]]);assert.deepStrictEqual(C.taskA.displayOutputs,[[0,1.225],[1,.65],[-.35,2]]);
 near(p.taskB.coefficients.reduce((a,b)=>a+b,0),1);const b=d.taskProbe;
 for(let j=0;j<2;j++)near(b.output[j],p.taskB.gamma*G.H.reduce((s,H,depth)=>s+p.taskB.coefficients[depth]*H[i][j],0));
 d.contexts[0].taskA.outputs.forEach((row,position)=>row.forEach((x,j)=>near(d.outputDelta[position][j],d.contexts[1].taskA.outputs[position][j]-x)));assert.deepStrictEqual(d.displayOutputDelta,[[0,.1125],[0,.325],[-3,1]]);assert.deepStrictEqual(b.displayOutput,[1,.175]);assert.deepStrictEqual(b.displayDelta,[0,-.15]);assert.deepStrictEqual(b.operands,G.H.map(H=>H[i]));
 const ref=references.find(r=>r.id.endsWith('weighted-layer-states'));
 for(const[depth,task,out]of[['standard',p.taskA,G.taskA.displayOutputs[i]],['deep',p.taskB,b.displayOutput]]){const main=ref.depths[depth].spec.diagram;assert.deepStrictEqual(main.rows.slice(0,3).map(row=>row.cells.slice(0,2)),G.H.map(H=>H[i]));assert.deepStrictEqual(main.rows.map(row=>row.cells[2]),[...task.coefficients,task.gamma]);assert.deepStrictEqual(main.rows[3].cells.slice(0,2),out);assert.match(main.caption,/gamma|\\gamma/);assert.match(main.rows[0].label,/E=H_0/);assert.match(main.rows[1].label,/F_1;B_1/);assert.match(main.rows[2].label,/F_2;B_2/);assert.match(main.rows[3].label,/gamma/);if(depth==='standard'){assert.match(main.caption,/First3 scales: depth weights/);assert.match(main.caption,/last:/);}}
 assert.deepStrictEqual(ref.depths.standard.detailSpec.diagram.rows.map(r=>r.cells),[...G.taskA.displayProducts[i],G.taskA.displayOutputs[i]]);
});

test('C09 synthetic readouts derive width, logits, strict threshold, confusion counts and unrounded F1',()=>{
 const p=parameters.evaluation,d=derived().evaluation;assert.strictEqual(classifyLogit(p.threshold),0);assert.strictEqual(classifyLogit(p.threshold+.25),1);assert.strictEqual(classifyLogit(p.threshold-.25),0);
 for(const method of d.base){const config=p.methods.find(m=>m.id===method.id);const expected=p.records.map(record=>{
  const [L1,L2]=record.layers,feature=config.operation==='last'?L2:config.operation==='sum'?L1.map((x,i)=>x+L2[i]):[...L1,...L2];assert.strictEqual(feature.length,config.head.length);
  const logit=feature.reduce((s,x,j)=>s+x*config.head[j],p.bias);return{id:record.id,target:record.target,feature,logit,prediction:+(logit>p.threshold)};
 });assert.deepStrictEqual(method.rows,expected);assert.strictEqual(method.width,config.head.length);
 const counts={TP:0,FP:0,FN:0,TN:0};expected.forEach(r=>counts[r.target?(r.prediction?'TP':'FN'):(r.prediction?'FP':'TN')]++);assert.deepStrictEqual(method.counts,counts);near(method.f1,2*counts.TP/(2*counts.TP+counts.FP+counts.FN));assert.strictEqual(method.displayF1,+method.f1.toFixed(parameters.scorePrecision));assert.strictEqual(counts.TP+counts.FN,3);assert.strictEqual(counts.FP+counts.TN,3);
 }
 assert.deepStrictEqual(d.base.map(m=>m.counts),[{TP:2,FP:1,FN:1,TN:2},{TP:2,FP:0,FN:1,TN:3},{TP:3,FP:1,FN:0,TN:2}]);assert.deepStrictEqual(d.base.map(m=>m.displayF1),[.667,.8,.857]);
 for(const method of d.reordered){const original=d.base.find(m=>m.id===method.id);assert.deepStrictEqual(method.rows.map(r=>r.id),p.reorder);assert.deepStrictEqual(method.counts,original.counts);assert.strictEqual(method.f1,original.f1);for(const row of method.rows)assert.deepStrictEqual(row,original.rows.find(old=>old.id===row.id));}
});

test('C09 resolved native depth inventory preserves full output rows, directional labels and honest synthetic provenance',()=>{
 let count=0;for(const ref of references)for(const[depth,override]of Object.entries(ref.depths)){const view={...ref,...override};if(depth==='overview')assert.strictEqual(override.detailSpec,null);for(const spec of[view.spec,view.detailSpec].filter(Boolean)){count++;assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);assert.ok(renderTutorDiagram(spec,680).width<=680);assert.ok(renderTutorDiagram(spec,408).width<=408);}}
 assert.strictEqual(count,17);
 const contextual=references.find(r=>r.id.endsWith('contextual-word-vectors'));for(const depth of['standard','deep']){const main=contextual.depths[depth].spec.diagram;assert.strictEqual(main.rows.length,6);assert.deepStrictEqual(main.rows.map(row=>row.cells),derived().directional.contexts.flatMap(c=>c.taskA.displayOutputs));assert.match(main.caption,/animal/);assert.match(main.caption,/gasket/);}
 const direction=references.find(r=>r.id.endsWith('two-directional-states'));assert.deepStrictEqual(direction.lessons,[]);assert.match(direction.spec.diagram.caption,/zero/);assert.match(direction.spec.diagram.caption,/toy/);assert.strictEqual(direction.depths.deep.detailSpec,null);
 const evaluation=references.find(r=>r.id.endsWith('layer-pooling-evaluation'));assert.match(evaluation.spec.diagram.caption,/synthetic/);assert.match(evaluation.spec.diagram.caption,/untrained/);assert.match(evaluation.spec.diagram.caption,/bias/);assert.match(evaluation.spec.diagram.caption,/logit/);
});
