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
if(has('overview-split-sandbox-threshold-search.html'))test('threshold search recomputes all six source fractions and actual child membership',()=>{
 const u=card('deep','split-sandbox','threshold-search');
 for(const [feature,scores]of [['x',[3/8,3/16,5/24]],['y',[3/8,7/16,11/24]]]){u.change('feature',feature);for(const [i,cut]of [2,4,6].entries()){u.change('cut',cut);assert.ok(Math.abs(u.card.evidence.weighted-scores[i])<1e-12);assert.equal(u.card.evidence.left.length+u.card.evidence.right.length,8)}}
 u.change('feature','x');u.change('cut',4);assert.deepEqual(Array.from(u.card.evidence.left),['A','B','C','D']);assert.deepEqual(Array.from(u.card.evidence.gain),[9,32]);
});
if(has('overview-vote-board-majority-vote.html'))test('forest vote oracle uses full downstream predicates and reports partial ties',()=>{
 const u=card('standard','vote-board','majority-vote');for(const [id,votes,winner]of [['I',[0,0,0],0],['J',[0,1,1],1]]){u.change('row',id);u.change('reveal',3);assert.deepEqual(Array.from(u.card.evidence.votes),votes);assert.equal(u.card.evidence.winner,winner)}u.change('row','J');u.change('reveal',2);assert.equal(u.card.evidence.winner,null);assert.deepEqual(Array.from(u.card.evidence.counts),[1,1]);
 const d=card('deep','vote-board','majority-vote');d.change('row','J');for(let i=0;i<3;i++){d.change('tree',String(i));assert.ok(d.card.evidence.route.length>=2);assert.equal(d.card.evidence.sample.length,8)}
});
if(has('overview-split-accounting-gini-split.html'))test('Gini accounting exposes exact weighted score and parent-minus-child gain at every depth',()=>{
 for(const depth of ['overview','standard','deep']){const u=card(depth,'split-accounting','gini-split');u.change('cut',4);assert.equal(u.card.evidence.weighted,3/16);assert.deepEqual(Array.from(u.card.evidence.gain),[9,32]);assert.ok(u.svg().includes(depth==='deep'?'9/32':'0.28125'))}
});
if(has('overview-partition-map-decision-regions.html'))test('decision regions respect branch-local cuts and ≤ boundaries',()=>{
 const u=card('deep','partition-map','decision-regions');u.change('x',6);u.change('y',1);for(const [stage,pred]of [[0,0],[1,1],[2,0]]){u.change('stage',stage);assert.equal(u.card.evidence.prediction,pred)}u.change('x',4);u.change('y',8);assert.equal(u.card.evidence.region,'L');u.change('x',6);u.change('y',2);assert.equal(u.card.evidence.region,'RL');assert.deepEqual(Array.from(u.card.evidence.members),['E']);u.change('y',3);assert.equal(u.card.evidence.region,'RR');
});
if(has('overview-impurity-probe-gini-vs-entropy.html'))test('Gini/entropy endpoints, peaks and original rounded samples agree with independent formulas',()=>{
 const u=card('overview','impurity-probe','gini-vs-entropy');for(const [p,g,h]of [[0,0,0],[.5,.5,1],[1,0,0]]){u.change('p',p);assert.equal(u.card.evidence.g,g);assert.equal(u.card.evidence.h,h)}for(let i=1;i<10;i++){const p=i/10;u.change('p',p);const h=-(p*Math.log(p)+(1-p)*Math.log(1-p))/Math.LN2;assert.ok(Math.abs(u.card.evidence.h-h)<1e-12);assert.ok(Math.abs(h-u.card.scene.data.reference.series[1].samples.y[i]/1000)<=.0005)}
 const s=card('standard','impurity-probe','gini-vs-entropy');s.change('p',.5);s.change('scale','peak');assert.equal(s.card.evidence.g,.5);assert.equal(s.card.evidence.giniPlot,1);
});
if(has('overview-error-inspector-depth-overfit.html'))test('overfit keeps illustrative and worked datasets separate; toy errors come from predictions',()=>{
 const d=card('deep','error-inspector','depth-overfit');for(const [depth,train,held]of [[0,37.5,50],[1,12.5,0],[2,0,50]]){d.change('depth',depth);assert.equal(d.card.evidence.train,train);assert.equal(d.card.evidence.held,held)}assert.equal(d.card.evidence.heldPredictions.find(r=>r.id==='J').prediction,0);
 const u=card('standard','error-inspector','depth-overfit');u.change('depth',3);assert.equal(u.card.evidence.held,23);u.change('depth',8);assert.equal(u.card.evidence.train,0);assert.equal(u.card.evidence.held,43);assert.equal(u.card.evidence.differenceFromBest,20);
});
if(has('overview-forest-size-inspector-forest-size-accuracy.html'))test('forest-size observations and marginal gains use the five supplied illustrative settings',()=>{
 const u=card('deep','forest-size-inspector','forest-size-accuracy');for(const [i,n,y]of [[0,1,.78],[1,5,.86],[2,10,.89],[3,50,.92],[4,200,.925]]){u.change('count',i);assert.equal(u.card.evidence.trees,n);assert.equal(u.card.evidence.accuracy,y)}assert.ok(Math.abs(u.card.evidence.delta-.5)<1e-12);assert.ok(Math.abs(u.card.evidence.perTree-1/300)<1e-12);u.change('count',0);assert.equal(u.card.evidence.delta,null);
});
if(has('overview-sampling-coverage-bootstrap-coverage.html'))test('bootstrap coverage is the omission complement, with the finite-n expectation and changed draw count explicit',()=>{
 const u=card('deep','sampling-coverage','bootstrap-coverage');u.change('n',8);u.change('ratio',1);assert.equal(u.card.evidence.omission,(7/8)**8);assert.equal(u.card.evidence.coverage,1-(7/8)**8);assert.equal(u.card.evidence.expectedRows,8*(1-(7/8)**8));assert.ok(Math.abs(u.card.evidence.limit-(1-1/Math.E))<1e-12);u.change('ratio',2);assert.equal(u.card.evidence.draws,16);assert.equal(u.card.evidence.omission,(7/8)**16);u.change('n',1);assert.equal(u.card.evidence.coverage,1);assert.equal(u.card.evidence.expectedRows,1);
});
if(has('overview-sample-draw-bootstrap-roots.html'))test('bootstrap repeats and out-of-bag rows match all three fixed replacement draws',()=>{
 const u=card('standard','sample-draw','bootstrap-roots');for(const [i,draw,oob]of [[0,'A A C D E F G H',['B']],[1,'B B C D F F F G',['A','E','H']],[2,'A B C D D G H H',['E','F']]]){u.change('draw',String(i));assert.equal(Array.from(u.card.evidence.sample).join(' '),draw);assert.deepEqual(Array.from(u.card.evidence.omitted),oob)}
 const d=card('deep','sample-draw','bootstrap-roots');d.change('draw','1');d.change('feature','y');assert.ok(Math.abs(Math.min(...d.card.evidence.trials.map(t=>t.weighted))-3/8)<1e-12);d.change('feature','x');assert.equal(Math.min(...d.card.evidence.trials.map(t=>t.weighted)),0);assert.equal(d.card.evidence.root.feature,'y');assert.equal(d.card.evidence.frequencies.B,2);assert.equal(d.card.evidence.frequencies.F,3);
});
if(has('overview-pruning-inspector-cost-complexity-pruning.html'))test('pruning uses the smallest best-accuracy illustrative candidate, without fabricated topology',()=>{
 const u=card('deep','pruning-inspector','cost-complexity-pruning');for(const[i,leaves,accuracy]of [[0,10,90],[1,8,90],[2,6,90],[3,4,82],[4,2,68]]){u.change('alpha',i);assert.equal(u.card.evidence.leaves,leaves);assert.equal(u.card.evidence.accuracy,accuracy);assert.equal(u.card.evidence.removed,10-leaves);assert.equal(u.card.evidence.bestAlpha,.01)}
});
if(has('standard-pruning-inspector-cost-complexity-pruning.html'))test('pruning log-axis decades are equally spaced in the actual SVG',()=>{
 const u=card('standard','pruning-inspector','cost-complexity-pruning');const ticks=[...u.svg().matchAll(/<text\b([^>]+)>([^<]+)<\/text>/g)].map(m=>({text:m[2],a:Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]]))})).filter(t=>Number(t.a.y)===233&&['0.0001','0.001','0.01','0.1','1'].includes(t.text));assert.equal(ticks.length,5);const xs=ticks.map(t=>Number(t.a.x)),spacing=(xs.at(-1)-xs[0])/4;assert.ok(spacing>70);for(let i=1;i<xs.length;i++)assert.ok(Math.abs(xs[i]-xs[i-1]-spacing)<1e-9,'equal alpha decades must have equal screen spacing');
});
if(has('overview-importance-comparison-feature-importance.html'))test('importance keeps normalized shares, computed ranks and actual bar ordering distinct from accuracy drops',()=>{
 const u=card('deep','importance-comparison','feature-importance');u.change('feature','Noise ID');assert.deepEqual(JSON.parse(JSON.stringify(u.card.evidence.selected)),{name:'Noise ID',mdi:45,permutation:1,mdiRank:1,permutationRank:3});assert.equal(u.card.evidence.totals.mdi,100);assert.equal(u.card.evidence.totals.permutation,100);u.change('order','mdi');assert.deepEqual(Array.from(u.card.evidence.order),['Noise ID','x','y']);u.change('order','perm');assert.deepEqual(Array.from(u.card.evidence.order),['x','y','Noise ID']);
});
