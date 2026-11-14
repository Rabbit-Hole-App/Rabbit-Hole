import test from 'node:test';import assert from 'node:assert';import {parameters,derived} from './topic-gpt2-data.js';import {references} from './composition-gpt2-references.js';
import {renderTutorDiagram} from './TutorDiagram.js';import {parseTutorDiagram} from './spec.js';import {lintDiagramContent} from './content-contract.js';
const nodes=v=>Array.isArray(v)?v.flatMap(nodes):v&&typeof v==='object'?[v,...nodes(v.props?.children)]:[];
test('C10 wrappers serialize raw fields with stable independent readouts and candidate-only processing reorder',()=>{
 const p=parameters,d=derived();for(const row of d.tasks){assert.strictEqual(row.serialized,p.markers.start+row.fields.map(f=>f.join(' ')).join(p.markers.boundary)+p.markers.readout);assert.strictEqual(row.model,p.wrapperModel);}
 assert.deepStrictEqual(d.tasks.map(row=>row.serialized),['<s>bright day<r>','<s>rain<d>wet<r>','<s>hot<d>warm<r>','<s>warm<d>hot<r>','<s>sky<d>blue<r>','<s>sky<d>green<r>']);
 assert.deepStrictEqual(d.reorderedTasks.slice(0,4),d.tasks.slice(0,4));assert.deepStrictEqual(d.reorderedTasks.slice(4).map(r=>r.id),['choiceB','choiceA']);for(const row of d.reorderedTasks)assert.deepStrictEqual(row,d.tasks.find(old=>old.id===row.id));
});
test('C10 observed translation labels and chosen summary tokens retain full source/document prefixes',()=>{
 const p=parameters,d=derived();assert.deepStrictEqual(d.prefixes.map(r=>r.provenance),['Observed','Observed','Chosen','Chosen','Chosen']);assert.deepStrictEqual(d.prefixes.map(r=>r.next),[...p.translation.target,...p.summary.chosen]);
 for(const row of d.prefixes){const source=row.provenance==='Observed'?p.translation.source:p.summary.document;assert.ok(row.prefix.startsWith(p.markers.start+source.join(' ')+p.markers.boundary));assert.strictEqual(row.model,p.decoderModel);assert.ok(row.prefix.length<=40);}
 assert.deepStrictEqual(d.prefixes.map(r=>r.prefix.length),[15,22,27,32,37]);assert.strictEqual(d.prefixes.at(-1).next,p.markers.stop);
});
test('C10 residual SVG departure precedes norm and joins follow actual branch output with no duplicate joins',()=>{
 const ref=references.find(r=>r.id.endsWith('overview-and-expanded-block'));
 for(const[depth,view]of Object.entries(ref.depths)){const stack=view.detailSpec.diagram;assert.ok(stack.blocks.every(b=>b.merge===undefined));assert.deepStrictEqual(stack.edges.map(e=>[e.from,e.to]),depth==='overview'?[['ar','ar'],['fr','fr']]:[['na','a'],['nf','f']]);
 for(const width of[408,680]){const all=nodes(renderTutorDiagram(view.detailSpec,width).element),node=id=>all.find(n=>n.props?.['data-block-stack-node']===id),rect=id=>nodes(node(id)).find(n=>n.type==='rect').props;
 const residuals=all.filter(n=>n.props?.['data-block-stack-residual']);assert.strictEqual(residuals.length,2);assert.strictEqual(all.filter(n=>n.props?.['data-block-stack-merge']==='add').length,2);
 for(const edge of stack.edges){const wire=residuals.find(n=>n.props['data-block-stack-residual']===edge.from+':'+edge.to),line=nodes(wire).find(n=>n.type==='polyline'),points=line.props.points.split(' ').map(p=>p.split(',').map(Number));assert.ok(points[0][1]<rect(edge.from).y);const target=rect(edge.to);assert.ok(points.at(-1)[1]>target.y+target.height);}}
 }
});
test('C10 task grids and abstract/expanded native blocks fit and obey text/data contracts',()=>{for(const ref of references)for(const view of Object.values(ref.depths))for(const spec of Object.values(view)){assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);assert.ok(renderTutorDiagram(spec,680).width<=680);}});
test('C10 actual combined Overview/Standard inventories reduce drawn blocks while preserving the recipe',()=>{
 const ref=references.find(r=>r.id.endsWith('overview-and-expanded-block')),d=derived();assert.strictEqual(d.counts.norms,2);assert.strictEqual(d.counts.residuals,2);
 for(const width of[408,680]){const count=depth=>Object.values(ref.depths[depth]).reduce((sum,spec)=>sum+nodes(renderTutorDiagram(spec,width).element).filter(n=>n.props?.['data-block-stack-node']).length,0);assert.strictEqual(count('overview'),6);assert.strictEqual(count('standard'),9);assert.strictEqual(count('deep'),9);}
});
