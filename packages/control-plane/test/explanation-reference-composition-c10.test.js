import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import queue from '../../../docs/features/explain/composition/queue.json' with { type: 'json' };
import { selectForAuthor } from '../src/explanation-references.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';

for (const entry of queue.references.filter(row => row.batch === 'C10')) test(`C10 source/alias author routes: ${entry.proposedReferenceId}`, () => {
  for (const source of [entry, ...entry.alsoCovers]) for (const depth of ['brief', 'balanced', 'detailed']) {
    const prompt = source.summary;
    assert.equal(selectForAuthor({ prompt, depth }).references[0]?.id, entry.proposedReferenceId);
    for (const env of [{}, { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'fireworks-low', FIREWORKS_API_KEY: 'x' }]) {
      const prepared = prepareArtifactAuthorRequest(env, { command: 'explanation', args: prompt, depth });
      const actual = prepared.diagramReferences[0];
      assert.equal(actual?.id, entry.proposedReferenceId);
      assert.ok(prepared.body.system.includes(JSON.stringify(actual.spec)));
      const schema = prepared.body.tools.find(tool => tool.name === 'make_explanation').input_schema;
      const visual = (schema.properties.visuals.items.oneOf ?? schema.properties.visuals.items.anyOf).find(branch => branch.properties.spec);
      const kinds = (visual.properties.spec.properties.diagram.oneOf ?? visual.properties.spec.properties.diagram.anyOf).map(branch => branch.properties.kind.const);
      for (const spec of [actual.spec, actual.detailSpec].filter(Boolean)) assert.ok(kinds.includes(spec.diagram.kind));
      assert.equal(actual.spec.diagram.panels, undefined, 'Native depth view does not need a single fallback');
    }
  }
});




import manifest from '../../web/src/tutor-diagrams/topic-gpt2-sources.json' with {type:'json'};
import learnerKeywords from '../../web/src/tutor-diagrams/reference-learner-keywords.json' with {type:'json'};
import {derived as capacityData} from '../../web/src/tutor-diagrams/topic-model-capacity-data.js';
import {derived as gptData} from '../../web/src/tutor-diagrams/topic-gpt2-data.js';

test('C10 source associations preserve all13headings/per-source lessons and explicit accepted depth scopes',()=>{
 const families=queue.references.filter(r=>r.batch==='C10');assert.deepEqual(manifest.families,families);assert.equal(manifest.references.length,5);let headings=0;
 for(const family of families){const entry=manifest.references.find(r=>r.queueId===family.proposedReferenceId),ref=diagramReferences.find(r=>r.id===entry.referenceId);assert.equal(entry.referenceId,family.proposedReferenceId);assert.equal(entry.mode,'NEW');assert.deepEqual(entry.lessons,family.lessons);assert.deepEqual(ref.lessons,family.lessons);assert.deepEqual(entry.source,Object.fromEntries(['source','figure','brief','summary','lessons'].map(k=>[k,family[k]])));assert.deepEqual(entry.alsoCovers,family.alsoCovers);for(const source of[family,...family.alsoCovers]){assert.ok(ref.prompts.includes(source.summary));headings++;}for(const phrase of learnerKeywords[ref.id])assert.equal(selectForAuthor({prompt:phrase}).references[0]?.id,ref.id);}
 assert.equal(headings,13);assert.deepEqual(manifest.allocationDepthScopes.map(s=>[s.figure,s.depth,s.ordinaryStandardCoverage]),[['06','overview',false],['05','standard',true],['12','standard',true],['17','deep',false]]);
 const allocation=diagramReferences.find(r=>r.id.endsWith('depth-width-allocation'));assert.deepEqual(allocation.depthScopes,manifest.allocationDepthScopes);assert.match(allocation.useWhen,/Standard omits full BERT06\/Gallery17/);
});

test('C10 real author views retain counted scope, marker/provenance identity and native residual recipes',()=>{
 const c=capacityData(),g=gptData(),unmath=s=>s.replaceAll('$','');let resolved=0;
 for(const entry of manifest.references)for(const depth of['brief','balanced','detailed']){
 const actual=prepareArtifactAuthorRequest({}, {command:'explanation',args:entry.source.summary,depth}).diagramReferences[0],main=actual.spec.diagram,detail=actual.detailSpec.diagram;assert.equal(actual.id,entry.referenceId);resolved+=2;
 if(entry.referenceId.endsWith('depth-width-allocation')){const models=depth==='brief'?c.E:depth==='balanced'?c.G.slice(0,2):[c.G[0],c.G[2]];for(const[stack,model]of[[main,models[0]],[detail,models[1]]]){assert.ok(stack.title.includes(model.id));if(depth!=='brief')assert.deepEqual(stack.edges.map(e=>[e.from,e.to]),[['na','a'],['nf','f']]);}assert.match(actual.useWhen,/only Overview/);assert.match(actual.useWhen,/only Deep/);}
 else if(entry.referenceId.endsWith('capacity-profiles')){assert.equal(main.unit,'Params');assert.equal(detail.unit,'M params');assert.deepEqual(main.bars.map(b=>b.value),c.M.slice(0,depth==='brief'?2:undefined).map(m=>m.total));assert.deepEqual(detail.bars.map(b=>b.value),c.reportedBert.map(m=>m.millions));assert.match(detail.caption,/Reported.*rounded/);}
 else if(entry.referenceId.endsWith('block-parameter-accounting')){assert.equal(main.rows.length,depth==='brief'?3:4);assert.deepEqual(main.rows.slice(0,2).map(r=>r.heading),c.M[0].projections.slice(0,2).map(p=>p.label));assert.equal(detail.total,undefined);if(depth==='detailed')assert.deepEqual(detail.bars.map(b=>b.value),[c.M[0].total,c.probes.untiedTotal]);else{assert.equal(detail.variant,'stacked');assert.equal(detail.bars.reduce((s,b)=>s+b.value,0),c.M[0].total);}}
 else if(entry.referenceId.endsWith('task-input-format')){const calls=depth==='brief'?g.tasks.slice(0,2):depth==='detailed'?g.reorderedTasks:g.tasks,prefixes=depth==='brief'?g.overviewPrefixes:g.prefixes;assert.deepEqual(main.rows.map(r=>[r.id,...r.cells.map(unmath)]),calls.map(r=>[r.id,r.serialized,r.readoutLabel]));assert.deepEqual(detail.rows.map(r=>r.cells.map(unmath)),prefixes.map(r=>[r.prefix,r.provenance+': '+r.next]));assert.match(detail.caption,/observed T targets vs chosen G/);assert.match(detail.caption,/stop/);if(depth!=='detailed'){assert.match(main.caption,/start/);assert.match(main.caption,/readout/);}assert.equal(new Set(calls.map(r=>r.model)).size,1);assert.notEqual(g.parameters.wrapperModel,g.parameters.decoderModel);}
 else {assert.equal(main.blocks.length,depth==='brief'?2:3);assert.equal(main.blocks[1].detail,2);assert.equal(detail.blocks.length,depth==='brief'?4:6);assert.deepEqual(detail.edges.map(e=>[e.from,e.to]),depth==='brief'?[['ar','ar'],['fr','fr']]:[['na','a'],['nf','f']]);assert.ok(detail.blocks.every(b=>b.merge===undefined));}
 }
 assert.equal(resolved,30);
});
