import test from 'node:test';
import assert from 'node:assert';
import { horizonParameters, gradientParameters, derived } from './topic-recurrent-training-data.js';
import { references } from './composition-recurrent-training-references.js';
import { parseTutorDiagram } from './spec.js';
import { lintDiagramContent } from './content-contract.js';
import { renderTutorDiagram } from './TutorDiagram.js';

const close = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} versus ${b}`);
test('C05 detach changes reach but preserves independently recomputed forward recurrence', () => {
  const d = derived().horizons, p = horizonParameters;
  const states = p.inputs.reduce((all,x) => [...all, p.a*all.at(-1)+x], [p.h0]);
  assert.deepStrictEqual(d.states, states);
  for (const schedule of d.schedules) {
    assert.deepStrictEqual(schedule.states, states);
    assert.deepStrictEqual(schedule.segments.map(row => row.end-row.start), schedule.boundaries.slice(1).map((v,i)=>v-schedule.boundaries[i]));
    const lastBoundary = schedule.boundaries.at(-2);
    assert.deepStrictEqual(schedule.reach, p.inputs.map((_,i)=>+(i+1>lastBoundary)));
  }
  assert.ok(Math.min(...d.schedules[2].segments.map(row=>row.end-row.start)) < Math.max(...d.schedules[2].segments.map(row=>row.end-row.start)));
  const graph = references[0].depths.deep.detailSpec.diagram;
  assert.ok(graph.edges.some(edge=>edge.from==='h4'&&edge.to==='h5'&&edge.label==='forward'));
  assert.ok(graph.edges.some(edge=>edge.to==='detach'&&edge.label==='gradient'));
  assert.ok(!graph.edges.some(edge=>edge.from==='detach'));
  assert.ok(!graph.edges.some(edge=>edge.from==='h5'&&edge.to==='h4'));
  assert.match(graph.caption,/forward.*detach|detach.*forward/i);
  assert.ok(graph.caption.includes('h'+d.schedules[1].boundaries.at(-2)));
  assert.deepStrictEqual(references[0].depths.overview.spec.diagram.rows.map(row=>row.cells[0]),d.schedules.slice(0,2).map(row=>row.reach.reduce((n,v)=>n+v,0)));
  assert.deepStrictEqual(references[0].depths.deep.spec.diagram.rows.map(row=>row.cells),d.steps.map((_,i)=>d.schedules.slice(2).map(row=>row.reach[i])));
});
test('C05 shared-parameter sensitivities and per-use gradients match finite differences', () => {
  const d = derived().gradients, p = gradientParameters;
  const h = [p.h0]; p.inputs.forEach(x=>h.push(p.a*h.at(-1)+x));
  const objective = a => { let state=p.h0; return p.inputs.reduce((sum,x,i)=>{state=a*state+x;return sum+.5*(state-p.targets[i])**2;},0); };
  const eps=1e-5;
  close(d.totalGradient,(objective(p.a+eps)-objective(p.a-eps))/(2*eps));
  assert.deepStrictEqual(d.states,h);
  const graph=references[1].spec.diagram;
  assert.ok(graph.caption.includes(p.inputs.join(',')));assert.ok(graph.caption.includes(p.targets.join(',')));
  assert.strictEqual(graph.nodes.filter(node=>node.id==='a').length,1);
  assert.deepStrictEqual(graph.edges.filter(edge=>edge.from==='a').map(edge=>edge.to),['h1','h2']);
  assert.deepStrictEqual(d.sensitivities,p.inputs.map((_,loss)=>h.map((value,state)=>state<=loss+1?(h[loss+1]-p.targets[loss])*p.a**(loss+1-state):null)));
  const upstream=h.slice(1).map((_,state)=>p.inputs.reduce((sum,x,loss)=>loss>=state?sum+(h[loss+1]-p.targets[loss])*p.a**(loss-state):sum,0));
  assert.deepStrictEqual(d.perUse,upstream.map((g,i)=>g*h[i]));
  close(d.totalGradient,d.perUse.reduce((s,v)=>s+v,0));
  assert.deepStrictEqual(references[1].depths.deep.spec.diagram.rows.map(row=>row.cells),d.sensitivities);
  assert.deepStrictEqual(references[1].depths.deep.detailSpec.diagram.bars.map(bar=>bar.value),d.perUse);
});
test('C05 recurrent training views are valid native diagrams with magnitude encodings', () => {
  for(const ref of references) {
    assert.deepStrictEqual(ref.lessons,[]);
    assert.ok(ref.depths.deep.detailSpec);
    for(const view of Object.values(ref.depths))for(const spec of Object.values(view)) {
      assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);
      assert.ok(renderTutorDiagram(spec,680).width<=680);
    }
  }
  const timeline=references[0].spec.diagram;
  assert.strictEqual(timeline.layout,'scaled-lanes');
  assert.deepStrictEqual(timeline.lanes[0].intervals.map(({start,end})=>[start,end]),[[0,horizonParameters.inputs.length]]);
  assert.match(timeline.caption,/forward/i); assert.match(timeline.caption,/gradient/i);
});

test('C05 recurrent relationships render one connected graph node per identity',()=>{
 for(const ref of references)for(const view of Object.values(ref.depths))for(const spec of Object.values(view))if(spec.diagram.kind==='relationship'){
 assert.strictEqual(spec.diagram.layout,'graph','An unroll cannot silently render as independent relationship pairs');
 for(const width of [408,680]){const element=renderTutorDiagram(spec,width).element;
 const count=(value,id)=>Array.isArray(value)?value.reduce((n,child)=>n+count(child,id),0):value&&typeof value==='object'?+(value.props?.['data-tutor-node']===id)+count(value.props?.children,id):0;
 for(const node of spec.diagram.nodes)assert.strictEqual(count(element,node.id),1,`One visible node for ${node.id}`);}
 }
});

test('C05 sampled reach mask preserves all cases and states at actual408 width',()=>{
 const d=derived().horizons,mask=references[0].depths.deep.spec.diagram;
 assert.strictEqual(renderTutorDiagram(references[0].depths.deep.spec,408).width,408,'Do not shrink a wider native mask into the408 card');
 assert.strictEqual(mask.rowLabel,'Earlier state');assert.strictEqual(mask.columnLabel,'Sampled boundary');
 assert.deepStrictEqual(mask.columns,d.schedules.slice(2).map(row=>row.name));
 assert.deepStrictEqual(mask.rows.map(row=>row.label),d.steps.map(step=>'h'+step));
 assert.deepStrictEqual(mask.rows.map(row=>row.cells),d.steps.map((_,i)=>d.schedules.slice(2).map(row=>row.reach[i])));
 assert.strictEqual(mask.rows.flatMap(row=>row.cells).length,d.steps.length*d.schedules.slice(2).length);
});
