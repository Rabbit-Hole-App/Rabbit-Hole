import test from 'node:test';
import assert from 'node:assert';
import { vocabulary, languageParameters, derived } from './topic-language-training-data.js';
import { references } from './composition-language-training-references.js';
import { parseTutorDiagram } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} versus ${b}`);

test('C06 fixed output slots and one-hot observed targets come from token identity',()=>{
 const d=derived(),p=languageParameters;
 assert.deepStrictEqual(d.dictionary,vocabulary.map((token,slot)=>({token,slot})));
 assert.ok(!vocabulary.includes(p.bos));assert.strictEqual(vocabulary.at(-1),p.eos);
 for(const target of d.targets){assert.deepStrictEqual(target.values,vocabulary.map(token=>+(token===target.token)));assert.strictEqual(target.values.reduce((n,v)=>n+v,0),1);assert.strictEqual(target.slot,vocabulary.indexOf(target.token));}
 const single=references[0].spec.diagram;
 assert.deepStrictEqual(single.rows.map(row=>row.label),vocabulary.map((token,i)=>i+': '+token));
 assert.deepStrictEqual(single.rows.map(row=>row.cells[0]),vocabulary.map(token=>+(token===p.selectedTarget)));
 const probe=references[0].depths.deep.spec.diagram;
 assert.deepStrictEqual(probe.columns,[p.selectedTarget,p.eos]);
 assert.deepStrictEqual(probe.rows.map(row=>row.cells),vocabulary.map(token=>[+(token===p.selectedTarget),+(token===p.eos)]));
 assert.deepStrictEqual(probe.rows.map(row=>row.label),single.rows.map(row=>row.label));
 assert.match(single.caption,new RegExp(p.selectedTarget));assert.match(probe.caption,/sum|\\sum/);
});
test('C06 complete distributions and loss change recompute from unrounded logits',()=>{
 const d=derived(),p=languageParameters;
 for(const [i,c]of d.cases.entries()){
  const logits=p.cases[i].logits,max=Math.max(...logits),e=logits.map(z=>Math.exp(z-max)),sum=e.reduce((n,v)=>n+v,0),prob=e.map(v=>v/sum);
  c.probabilities.forEach((v,j)=>close(v,prob[j]));close(c.probabilities.reduce((n,v)=>n+v,0),1);
  close(c.loss,-Math.log(prob[vocabulary.indexOf(p.selectedTarget)]));
  assert.deepStrictEqual(c.displayProbabilities,prob.map(v=>+v.toFixed(p.precision)));
 }
 assert.deepStrictEqual(p.cases[0].logits.flatMap((value,i)=>value!==p.cases[1].logits[i]?[i]:[]),[vocabulary.indexOf(p.selectedTarget)]);
 assert.ok(p.cases[1].logits[vocabulary.indexOf(p.selectedTarget)]>p.cases[0].logits[vocabulary.indexOf(p.selectedTarget)]);
 close(d.lossDelta,d.cases[1].loss-d.cases[0].loss);assert.ok(d.lossDelta<0);assert.ok(d.cases[1].targetProbability>d.cases[0].targetProbability);
 const standard=references[1].spec.diagram,deep=references[1].depths.deep.spec.diagram;
 assert.strictEqual(standard.variant,'grouped');assert.deepStrictEqual(standard.categories,vocabulary);assert.deepStrictEqual(deep.categories,vocabulary);
 assert.deepStrictEqual(standard.series.map(s=>s.values),[d.cases[0].displayProbabilities,d.targets[0].values]);
 assert.deepStrictEqual(deep.series.map(s=>s.values),[...d.cases.map(c=>c.displayProbabilities),d.targets[0].values]);
 assert.deepStrictEqual(references[1].depths.deep.detailSpec.diagram.bars.map(b=>b.value),d.cases.map(c=>c.displayLoss));
 assert.ok(references[1].depths.deep.detailSpec.diagram.caption.includes(String(d.displayLossDelta)));
 assert.match(standard.caption,/Illustrative/);assert.match(standard.caption,/ln/);assert.ok(standard.caption.includes(p.selectedTarget));
});
test('C06 observed prefix boundaries and suffix probe are positional, including repeated tokens',()=>{
 const d=derived(),p=languageParameters,sequence=[p.bos,...p.observed,p.eos];
 assert.strictEqual(d.prefixes.length,p.observed.length+1);
 for(const [i,row]of d.prefixes.entries()){
  assert.deepStrictEqual(row.prefixTokens,sequence.slice(0,i+1));assert.strictEqual(row.target,sequence[i+1]);
  assert.strictEqual(row.prefix,row.prefixTokens.map(token=>token===p.bos?'“'+token+'”':token).join(' '));assert.strictEqual(row.targetSlot,vocabulary.indexOf(row.target));
  assert.deepStrictEqual(d.causalMask[i],d.inputPositions.map(position=>+(position<i+1)));
 }
 const changed=[...p.observed];changed[p.replacement.index]=p.replacement.token;
 const changedSequence=[p.bos,...changed,p.eos];
 assert.deepStrictEqual(d.probe.map(row=>[row.prefix,row.target]),changedSequence.slice(1).map((target,i)=>[changedSequence.slice(0,i+1).map(token=>token===p.bos?'“'+token+'”':token).join(' '),target]));
 assert.deepStrictEqual(d.probe.slice(0,p.replacement.index),d.prefixes.slice(0,p.replacement.index));
 assert.notStrictEqual(d.probe[p.replacement.index].target,d.prefixes[p.replacement.index].target);
 assert.notStrictEqual(d.probe.at(-1).prefix,d.prefixes.at(-1).prefix);
 const ref=references[2];assert.deepStrictEqual(ref.spec.diagram.rows.map(row=>row.cells),d.prefixes.map(row=>[row.prefix,row.target]));
 assert.deepStrictEqual(ref.depths.deep.detailSpec.diagram.rows.map(row=>row.cells),d.probe.map(row=>[row.prefix,row.target]));
 assert.match(ref.spec.diagram.caption,/observed|Observed/);assert.match(ref.spec.diagram.caption,/class labels/);
});
test('C06 language views parse, preserve magnitude and fit the declared native width',()=>{
 for(const ref of references)for(const view of Object.values(ref.depths))for(const spec of Object.values(view)){
  assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);
  assert.ok(renderTutorDiagram(spec,680).width<=680);
  const width=renderTutorDiagram(spec,408).width;
  assert.ok(width<=(spec.diagram.variant==='grouped'?420:408),`${ref.id} unexpectedly widens to ${width}`);
  assert.ok(!['panels','comparison','token-links'].includes(spec.diagram.kind));
 }
});
