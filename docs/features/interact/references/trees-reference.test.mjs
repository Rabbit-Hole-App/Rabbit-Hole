// Deterministic reference checks, not browser/visual acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('./',import.meta.url), read=n=>readFileSync(new URL(n,root),'utf8');
import {inspect} from './trees-reference-harness.mjs';
const all=readdirSync(root).filter(f=>/^(overview|standard|deep)-.*\.composition\.json$/.test(f)).filter(f=>JSON.parse(read(f)).data?.treeReference===true);
const selected=all.filter(f=>!process.env.TREES_ONLY||f.endsWith('-'+process.env.TREES_ONLY+'.composition.json'));
const corpus={
 'grown-tree':'graph-active-path','threshold-search':'split-sandbox','majority-vote':'vote-board','gini-split':'split-accounting','decision-regions':'partition-map','gini-vs-entropy':'impurity-probe','depth-overfit':'error-inspector','forest-size-accuracy':'forest-size-inspector','bootstrap-coverage':'sampling-coverage','bootstrap-roots':'sample-draw','cost-complexity-pruning':'pruning-inspector','feature-importance':'importance-comparison','regression-step-fit':'regression-fit-probe',
};
const wanted=Object.entries(corpus).filter(([id])=>!process.env.TREES_ONLY||id===process.env.TREES_ONLY).flatMap(([id,family])=>['overview','standard','deep'].map(depth=>`${depth}-${family}-${id}.composition.json`)).sort();
test('the explicit 13-prompt × three-depth corpus has every HTML/JSON pair',()=>{assert.equal(wanted.length,process.env.TREES_ONLY?3:39);assert.deepEqual(selected.toSorted(),wanted);for(const f of wanted)assert.ok(read(f.replace('.composition.json','.html')).includes('id="drawing"'))});
for(const f of selected)test(f, t=>{const c=JSON.parse(read(f));const html=read(f.replace('.composition.json','.html')),approved=read('overview-stepper-merge-sort.html');assert.equal(html.match(/@font-face\{[^}]+\}/)[0],approved.match(/@font-face\{[^}]+\}/)[0]);assert.equal(html.match(/:root\{[^}]+\}/)[0],approved.match(/:root\{[^}]+\}/)[0]);const out=inspect(read(f.replace('.composition.json','.html')),c);t.diagnostic(`${out.cases} cases; densest ${out.max}`)});
