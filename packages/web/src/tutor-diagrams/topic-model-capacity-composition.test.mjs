import test from 'node:test';import assert from 'node:assert';
import {parameters,derived} from './topic-model-capacity-data.js';import {references} from './composition-model-capacity-references.js';
import {renderTutorDiagram} from './TutorDiagram.js';import {parseTutorDiagram} from './spec.js';import {lintDiagramContent} from './content-contract.js';
const nodes=v=>Array.isArray(v)?v.flatMap(nodes):v&&typeof v==='object'?[v,...nodes(v.props?.children)]:[];
test('C10 scalar inventories independently multiply every weight shape, bias, norm and table term',()=>{
 const d=derived();assert.strictEqual(parameters.M.tiedOutput,true);assert.strictEqual(parameters.M.outputBias,false);assert.strictEqual(parameters.M.normOffset,true);assert.strictEqual(parameters.G.normOffset,false);assert.strictEqual(parameters.E.normPlacement,'post');for(const model of[...d.M,...d.E,...d.G]){const d0=model.width,m=model.inner;let weights=0,biases=0;for(const projection of model.projections){weights+=projection.weightShape.reduce((a,b)=>a*b,1);biases+=projection.biasWidth;}
 const norms=model.norms.reduce((sum,n)=>sum+n.scale+n.offset,0);assert.strictEqual(model.block.weights,weights);assert.strictEqual(model.block.biases,biases);assert.strictEqual(model.block.norms,norms);assert.strictEqual(model.block.total,weights+biases+norms);assert.strictEqual(model.core,model.layers*model.block.total);
 if(model.family==='G'){assert.strictEqual(model.kvWidth,model.groups*d0/model.heads);assert.deepStrictEqual(model.projections[0].weightShape,[d0,d0+2*model.kvWidth]);assert.strictEqual(model.block.total,3*d0*d0+2*d0*m+6*d0+m);}else assert.strictEqual(model.block.total,4*d0*d0+2*d0*m+9*d0+m);
 }
 assert.deepStrictEqual(d.M.map(m=>m.total),[172,246,536,780]);assert.deepStrictEqual(d.G.map(m=>m.core),[288,192,600]);
 for(const model of d.M)assert.strictEqual(model.total,parameters.M.vocabulary*model.width+parameters.M.positions*model.width+model.core+2*model.width);
 assert.strictEqual(d.probes.layerDelta,74);assert.strictEqual(d.probes.untiedExtra,8);assert.strictEqual(d.probes.untiedTotal,180);assert.strictEqual(d.probes.widthTotal,536);
 assert.deepStrictEqual(d.reportedBert.map(r=>r.millions),[110,340]);assert.ok(d.reportedBert.every(r=>r.provenance.kind==='paper-reported-rounded'));
});
test('C10 Option N keeps source depth scopes honest and stacks use independent repeated recipes',()=>{
 const ref=references.find(r=>r.id.endsWith('depth-width-allocation')),d=derived();assert.match(ref.useWhen,/Overview/);assert.match(ref.useWhen,/Deep/);
 for(const[level,models]of[['overview',d.E],['standard',d.G.slice(0,2)],['deep',[d.G[0],d.G[2]]]]){const view=ref.depths[level];for(const[spec,model]of[[view.spec,models[0]],[view.detailSpec,models[1]]]){const stack=spec.diagram;if(level==='overview'){assert.strictEqual(stack.blocks.length,3);assert.strictEqual(stack.blocks[1].repeat,model.layers);}else{assert.strictEqual(stack.blocks.length,6);assert.deepStrictEqual(stack.edges.map(e=>[e.from,e.to]),[['na','a'],['nf','f']]);assert.ok(stack.blocks.every(block=>block.merge===undefined));assert.strictEqual(stack.blocks[1].repeat,model.layers);assert.strictEqual(stack.blocks[1].repeatTo,'f');}assert.ok(stack.caption.includes('independent')||stack.caption.includes('Independent'));}}
});
test('C10 stacked parts omit total and actual renderer derives the displayed scalar sum',()=>{
 const ref=references.find(r=>r.id.endsWith('block-parameter-accounting')),d=derived(),spec=ref.depths.standard.detailSpec;
 assert.strictEqual(spec.diagram.variant,'stacked');assert.strictEqual(spec.diagram.total,undefined);assert.deepStrictEqual(spec.diagram.bars.map(b=>b.value),[8,12,148,4]);
 const text=nodes(renderTutorDiagram(spec,408).element).filter(n=>typeof n.props?.children==='string'||typeof n.props?.children==='number').map(n=>String(n.props.children));assert.ok(text.includes(`Sum of the parts: ${d.M[0].total} Params`));
 assert.deepStrictEqual(ref.depths.deep.detailSpec.diagram.bars.map(b=>b.value),[d.M[0].total,d.probes.untiedTotal]);
});
test('C10 capacity native depths stay bounded and preserve categorical shape jobs versus count magnitudes',()=>{for(const ref of references)for(const view of Object.values(ref.depths))for(const spec of Object.values(view)){assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);assert.ok(renderTutorDiagram(spec,680).width<=680);}});
test('C10 actual grouped decoder residuals bypass before RMSNorm and rejoin after each operation',()=>{
 const ref=references.find(r=>r.id.endsWith('depth-width-allocation'));
 for(const depth of['standard','deep'])for(const spec of Object.values(ref.depths[depth]))for(const width of[408,680]){const all=nodes(renderTutorDiagram(spec,width).element),rect=id=>nodes(all.find(n=>n.props?.['data-block-stack-node']===id)).find(n=>n.type==='rect').props;
 assert.strictEqual(all.filter(n=>n.props?.['data-block-stack-merge']==='add').length,2);
 for(const edge of spec.diagram.edges){const wire=all.find(n=>n.props?.['data-block-stack-residual']===edge.from+':'+edge.to),line=nodes(wire).find(n=>n.type==='polyline'),points=line.props.points.split(' ').map(s=>s.split(',').map(Number));assert.ok(points[0][1]<rect(edge.from).y);const target=rect(edge.to);assert.ok(points.at(-1)[1]>target.y+target.height);}
 }
});
