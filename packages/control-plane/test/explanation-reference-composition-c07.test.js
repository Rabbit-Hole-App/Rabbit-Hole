import test from 'node:test';
import assert from 'node:assert/strict';
import { compositionParameters, compositionDerived } from '../../web/src/tutor-diagrams/topic-attention-data.js';
import { renderTutorDiagram } from '../../web/src/tutor-diagrams/TutorDiagram.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import manifest from '../../web/src/tutor-diagrams/topic-attention-sources.json' with { type: 'json' };
import queue from '../../../docs/features/explain/composition/queue.json' with { type: 'json' };
import { selectForAuthor } from '../src/explanation-references.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';

for (const entry of queue.references.filter(row => row.batch === 'C07')) test(`C07 source/alias author routes: ${entry.proposedReferenceId}`, () => {
  for (const source of [entry, ...entry.alsoCovers]) for (const depth of ['brief', 'balanced', 'detailed']) {
    const prompt = source.summary;
    const expected = source.source === 'illustrated-retrieval-transformer' ? 'figure-retro-chunk-embedding' : entry.proposedReferenceId;
    assert.equal(selectForAuthor({ prompt, depth }).references[0]?.id, expected);
    for (const env of [{}, { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' }]) {
      const prepared = prepareArtifactAuthorRequest(env, { command: 'explanation', args: prompt, depth });
      const actual = prepared.diagramReferences[0];
      assert.equal(actual?.id, expected);
      assert.ok(prepared.body.system.includes(JSON.stringify(actual.spec)));
      const schema = prepared.body.tools.find(tool => tool.name === 'make_explanation').input_schema;
      const visual = (schema.properties.visuals.items.oneOf ?? schema.properties.visuals.items.anyOf).find(branch => branch.properties.spec);
      const kinds = (visual.properties.spec.properties.diagram.oneOf ?? visual.properties.spec.properties.diagram.anyOf).map(branch => branch.properties.kind.const);
      for (const spec of [actual.spec, actual.detailSpec].filter(Boolean)) assert.ok(kinds.includes(spec.diagram.kind));
      assert.equal(actual.spec.diagram.panels, undefined, 'Native depth view does not need a single fallback');
    }
  }
});


test('C07 all family metadata and all36 source headings retain exact per-source routes',()=>{
 const families=queue.references.filter(row=>row.batch==='C07');assert.deepEqual(manifest.families,families);assert.equal(manifest.references.length,11);assert.equal(manifest.references.filter(row=>row.mode==='NEW').length,10);
 const sourceRows=family=>[{source:family.source,figure:family.figure,brief:family.brief,summary:family.summary,lessons:family.representativeLessons},...family.alsoCovers];
 const key=row=>row.source+'|'+row.figure+'|'+row.brief;
 const expected=new Map(families.flatMap(sourceRows).map(row=>[key(row),row]));let count=0;const seen=new Set();
 for(const entry of manifest.references){const family=families.find(row=>row.proposedReferenceId===entry.queueId),ref=diagramReferences.find(row=>row.id===entry.referenceId);assert.ok(ref);
 if(entry.mode==='NEW'){assert.equal(entry.referenceId,family.proposedReferenceId);assert.deepEqual(ref.lessons,family.lessons);assert.equal(ref.topic,family.proposedTopicSlug);assert.deepEqual(ref.sources.map(row=>row.path),[entry.source,...entry.alsoCovers].map(row=>row.brief));}
 else{assert.equal(entry.referenceId,'figure-retro-chunk-embedding');assert.deepEqual(ref.lessons,[]);}
 for(const source of [entry.source,...entry.alsoCovers]){count++;assert.ok(!seen.has(key(source)));seen.add(key(source));const original=expected.get(key(source));assert.ok(original);for(const field of ['source','figure','brief','summary','lessons'])assert.deepEqual(source[field],original[field]);assert.ok(ref.prompts.includes(source.summary));}
 }assert.equal(count,36);assert.deepEqual([...seen].sort(),[...expected.keys()].sort());
});

test('C07 outgoing weighted permutation keeps spec and rendered SVG labels attached to every row',()=>{
 const id='ml-attention-weighted-vector-pooling',ref=diagramReferences.find(row=>row.id===id),d=compositionDerived().matching;
 const text=value=>Array.isArray(value)?value.map(text).join(' '):value&&typeof value==='object'?text(value.props?.children):typeof value==='string'||typeof value==='number'?String(value):'';
 const find=(value,id)=>Array.isArray(value)?value.map(v=>find(v,id)).find(Boolean):value&&typeof value==='object'?value.props?.['data-tutor-node']===id?value:find(value.props?.children,id):undefined;
 for(const [depth,order]of [['detailed',['B','A']],['brief',['A','B']],['balanced',['A','B']]]){
 const outgoing=selectForAuthor({prompt:ref.prompts[0],depth}).references[0];assert.equal(outgoing.id,id);
 const graph=outgoing.spec.diagram,nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
 for(const [nodeId,prefix]of [['a','Weights'],['v','Values'],...(depth==='brief'?[]:[['t','Weighted terms']])])assert.equal(nodes[nodeId].label,prefix+' '+order.join(','));
 const svg=renderTutorDiagram(outgoing.spec,408).element;assert.equal(svg.type,'svg');
 for(const nodeId of ['a','v',...(depth==='brief'?[]:['t'])])assert.ok(text(find(svg,nodeId)).replace(/\s+/g,' ').includes(nodes[nodeId].label),'Rendered SVG node text preserves the same pair order');
 const base=new Map(d.base.order.map((name,i)=>[name,{weight:d.base.display.weights[i],value:d.base.values[i],product:d.base.display.products[i]}]));
 assert.deepEqual(nodes.a.tensor.values,order.map(name=>base.get(name).weight));
 assert.deepEqual(nodes.v.tensor.values,order.flatMap(name=>base.get(name).value));
 if(nodes.t)assert.deepEqual(nodes.t.tensor.values,order.flatMap(name=>base.get(name).product));
 assert.deepEqual(nodes.c.tensor.values,d.base.display.output);
 }
 assert.deepEqual(d.permuted.order,[...d.base.order].reverse());
});

test('C07 weighted Deep rendered SVG visibly names its B,A permutation',()=>{
 const ref=diagramReferences.find(r=>r.id==='ml-attention-weighted-vector-pooling');
 const outgoing=selectForAuthor({prompt:ref.prompts[0],depth:'detailed'}).references[0];
 const svg=renderTutorDiagram(outgoing.spec,408).element;
 const text=v=>Array.isArray(v)?v.map(text).join(' '):v&&typeof v==='object'?text(v.props?.children):typeof v==='string'||typeof v==='number'?String(v):'';
 const shown=text(svg).replace(/\s+/g,' ');
 for(const label of ['Weights B,A','Values B,A','Weighted terms B,A'])assert.ok(shown.includes(label),`SVG visibly supplies ${label}`);
 for(const stale of ['Weights A,B','Values A,B','Weighted terms A,B'])assert.ok(!shown.includes(stale),`No stale SVG label ${stale}`);
});

test('C07 outgoing causal and packed products declare the actual column operands',()=>{
 const d=compositionDerived(),p=compositionParameters;
 for(const id of ['ml-attention-causal-mask-and-weights','ml-attention-packed-query-key-value-projections']){
 const ref=diagramReferences.find(r=>r.id===id),out=selectForAuthor({prompt:ref.prompts[0],depth:'balanced'}).references[0];
 assert.equal(out.id,id);
 if(id.includes('causal')){assert.ok(out.spec.diagram.caption.includes(`Q=(${p.causal.queries})^T`));assert.ok(out.spec.diagram.caption.includes(`K=(${p.causal.keys})^T`));assert.deepEqual(out.spec.diagram.rows.map(r=>r.cells),d.causal.base.display.maskedScores);}
 else{assert.ok(out.spec.diagram.caption.includes(`H=(${p.packed.inputs})^T`));assert.deepEqual(out.spec.diagram.rows.map(r=>r.cells),d.packed.channels.map(r=>r.cells));}
 }
});
test('C07 outgoing packed Deep declares both provided-layer projector maps without needing Standard',()=>{
 const ref=diagramReferences.find(r=>r.id==='ml-attention-packed-query-key-value-projections'),d=compositionDerived().packed;
 for(const env of [{},{SMALL_ENV:'test',EXPLANATION_MODEL_PROFILE:'fireworks-low',FIREWORKS_API_KEY:'x'}]){
 const prepared=prepareArtifactAuthorRequest(env,{command:'explanation',args:ref.prompts[0],depth:'detailed'}),out=prepared.diagramReferences[0];assert.equal(out.id,ref.id);
 const caption=out.spec.diagram.caption;
 assert.match(out.spec.diagram.title+' '+caption,/toy/i);
 assert.ok(caption.includes('W_q|W_k|W_v'));
 for(const[i,layer]of d.layers.entries()){const name=i===0?'A':'B',map=[layer.Wq,layer.Wk,layer.Wv].map(v=>v.join(',')).join('|');assert.ok(caption.includes(`${name}=(${map})`),`Deep visibly declares ${name}'s own projector coefficients`);assert.deepEqual(out.spec.diagram.nodes.find(n=>n.id==='o'+i).tensor.values,layer.joint);}
 assert.ok(prepared.body.system.includes(JSON.stringify(out.spec)));assert.match(caption,/provided/i);assert.match(caption,/no.*update/i);
 }
});
test('C07 exact score-to-value source emits matching value-product terms for Standard and changed-value Deep',()=>{
 const prompt='Attention converts query-to-key scores into weights and then uses those weights to combine values.',d=compositionDerived().matching;
 for(const[depth,row]of[['balanced',d.base],['detailed',d.valueProbe]]){
 const out=selectForAuthor({prompt,depth}).references[0];assert.equal(out.id,'ml-attention-query-key-value-roles');assert.ok(out.detailSpec,'The source requires actual visible value-product terms');
 for(const env of [{},{SMALL_ENV:'test',EXPLANATION_MODEL_PROFILE:'fireworks-low',FIREWORKS_API_KEY:'x'}]){const prepared=prepareArtifactAuthorRequest(env,{command:'explanation',args:prompt,depth});const actual=prepared.diagramReferences[0];assert.deepEqual(actual.detailSpec,out.detailSpec);assert.ok(prepared.body.system.includes(JSON.stringify(actual.detailSpec)));}
 const main=Object.fromEntries(out.spec.diagram.nodes.map(n=>[n.id,n])),detail=Object.fromEntries(out.detailSpec.diagram.nodes.map(n=>[n.id,n]));
 assert.deepEqual(detail.a.tensor.values,row.display.weights);assert.deepEqual(detail.v.tensor.values,row.values.flat());assert.deepEqual(detail.t.tensor.values,row.display.products.flat());assert.deepEqual(detail.c.tensor.values,row.display.output);
 assert.deepEqual(main.v.tensor.values,detail.v.tensor.values);assert.deepEqual(main.c.tensor.values,detail.c.tensor.values);
 for(const[id,prefix]of[['a','Weights'],['v','Values'],['t','Weighted terms']])assert.equal(detail[id].label,prefix+' '+row.order.join(','));
 }
});
