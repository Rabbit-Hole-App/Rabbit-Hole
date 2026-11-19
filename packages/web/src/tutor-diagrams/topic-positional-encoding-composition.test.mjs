import test from'node:test';import assert from'node:assert';
import{parameters,derived}from'./topic-positional-encoding-data.js';import{references}from'./composition-positional-encoding-references.js';
import{parseTutorDiagram}from'./spec.js';import{lintDiagramContent}from'./content-contract.js';import{renderTutorDiagram}from'./TutorDiagram.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} versus ${b}`);
test('C08 token ids and position ids independently retrieve equal-width operands and repeated-token sums',()=>{
 const d=derived().tokenPosition,p=parameters.tokenPosition;
 for(const row of d.learned.rows){const token=p.vocabulary.find(v=>v.id===row.tokenId);assert.strictEqual(row.word,token.word);assert.deepStrictEqual(row.E,token.row);assert.deepStrictEqual(row.P,p.learnedPositions[row.position]);assert.deepStrictEqual(row.sum,row.E.map((x,i)=>x+row.P[i]));}
 assert.strictEqual(d.learned.rows[0].tokenId,d.learned.rows[2].tokenId);assert.deepStrictEqual(d.learned.rows[0].E,d.learned.rows[2].E);assert.notDeepStrictEqual(d.learned.rows[0].sum,d.learned.rows[2].sum);
 assert.deepStrictEqual(d.learned.rows.map(r=>r.sum),[[1,0],[.5,.5],[2,.5]]);
 for(const row of d.fixed.rows){close(row.P[0],Math.sin(row.position));close(row.P[1],Math.cos(row.position));}
 assert.notDeepStrictEqual(d.fixed.rows[0].P,d.learned.rows[0].P);
 const changed=p.changedPosition;d.probe.rows.forEach((row,i)=>{assert.deepStrictEqual(row.E,d.learned.rows[i].E);assert.deepStrictEqual(row.P,d.learned.rows[i].P.map((x,j)=>x+(i===changed?p.delta[j]:0)));row.sum.forEach((x,j)=>close(x-d.learned.rows[i].sum[j],i===changed?p.delta[j]:0));});
});
test('C08 learned Standard and all variant/case architecture details emit matching indexed vectors outside repeats',()=>{
 const d=derived().tokenPosition,ref=references.find(r=>r.id==='ml-positional-encoding-token-plus-position');
 assert.deepStrictEqual(ref.spec.diagram.rows.map(row=>row.cells),d.learned.gridRows.map(row=>row.cells));assert.deepStrictEqual(ref.spec.diagram.columns,d.learned.columns);
 for(const[level,rows,index,variant]of[['overview',d.fixed.rows,parameters.tokenPosition.fixedOverviewPosition,'Fixed'],['standard',d.learned.rows,parameters.tokenPosition.activePosition,'Learned'],['deep',d.probe.rows,parameters.tokenPosition.activePosition,'Learned']]){
 const graph=ref.depths[level].detailSpec.diagram,first=graph.blocks[0],combined=graph.blocks[1],decoder=graph.blocks[2];assert.strictEqual(first.diagram,undefined);assert.match(first.label,/id.*position/i);assert.deepStrictEqual(combined.diagram.tensor.values,rows[index].sum.map(x=>+x.toFixed(parameters.precision)));assert.strictEqual(first.repeat,undefined);assert.strictEqual(decoder.repeat,parameters.tokenPosition.decoderBlocks.length);assert.strictEqual(first.inputs.length,2);assert.ok(first.inputs[0].label.includes('table $E['));assert.ok(first.inputs[1].label.includes(level==='overview'?'Fixed':'table $P['));assert.match(graph.caption,new RegExp(variant,'i'));}
 assert.ok(ref.spec.diagram.caption.includes('Learned'));
});
test('C08 every paired sampled sinusoidal channel matches its selected grid row and moves only by display identity',()=>{
 const d=derived().sinusoidal,p=parameters.sinusoidal,ref=references.find(r=>r.id==='ml-positional-encoding-sinusoidal-positions');
 assert.strictEqual(d.channels.length,4);for(const[i,position]of p.positions.entries())for(const[j,channel]of d.channels.entries()){const f=p.frequencies.find(f=>f.id===channel.frequencyId),expected=Math[channel.function](position*f.numerator/f.denominator);close(d.rawRows[i][j],expected);assert.strictEqual(d.displayRows[i][j],+expected.toFixed(parameters.precision));}
 const plot=ref.spec.diagram,grid=ref.depths.standard.detailSpec.diagram;assert.strictEqual(plot.series.length,4);assert.deepStrictEqual(plot.series.map(s=>s.label),d.channels.map(c=>c.label));
 for(const[j,series]of plot.series.entries()){assert.strictEqual(series.samples,undefined);assert.deepStrictEqual(series.points,p.positions.map((x,i)=>({x,y:d.displayRows[i][j]})));}
 assert.deepStrictEqual(grid.rows.map(row=>row.cells),d.displayRows);assert.ok(grid.highlights.every(cell=>cell.row===d.selectedIndex));assert.match(plot.caption,/sample/i);
 const grouped=ref.depths.deep.spec.diagram;for(const[i,row]of grouped.rows.entries())for(const[j,label]of grouped.columns.entries())assert.strictEqual(row.cells[j],grid.rows[i].cells[grid.columns.indexOf(label)]);
 assert.match(grouped.caption,/display/i);assert.match(grouped.caption,/model|basis/i);
});
test('C08 positional views obey bounded schemas and the actual680/readable408 contract',()=>{for(const ref of references)for(const view of Object.values(ref.depths))for(const spec of Object.values(view)){assert.doesNotThrow(()=>parseTutorDiagram(spec));assert.deepStrictEqual(lintDiagramContent(spec),[]);assert.ok(renderTutorDiagram(spec,680).width<=680);}});

const treeNodes = value => Array.isArray(value) ? value.flatMap(treeNodes) : value && typeof value === 'object' ? [value, ...treeNodes(value.props?.children)] : [];
test('C08 rendered index fork precedes independent lookups, sum, combined tensor and decoder',()=>{
 const ref=references.find(r=>r.id==='ml-positional-encoding-token-plus-position');
 for(const view of Object.values(ref.depths))for(const width of [408,680]){
  const nodes=treeNodes(renderTutorDiagram(view.detailSpec,width).element),block=id=>nodes.find(node=>node.props?.['data-block-stack-node']===id),box=node=>treeNodes(node).find(child=>child.type==='rect');
  const indices=box(block('indices')),combined=box(block('combined')),decoder=box(block('decoder'));
  assert.ok(indices&&combined&&decoder,'All three actual rendered blocks must exist');
  const bottom=rect=>rect.props.y+rect.props.height;
  const inputs=nodes.filter(node=>node.props?.['data-block-stack-input']!==undefined).map(box);
  assert.strictEqual(inputs.length,2);for(const input of inputs){assert.ok(input.props.y>bottom(indices));assert.ok(bottom(input)<combined.props.y);}
  assert.ok(bottom(combined)<decoder.props.y);
  const forks=nodes.filter(node=>node.props?.['data-block-stack-input-fork']!==undefined);assert.strictEqual(forks.length,2);
  const forkLine=treeNodes(forks[0]).find(node=>node.type==='polyline');assert.ok(forkLine);assert.strictEqual(+String(forkLine.props.points).split(' ')[0].split(',')[1],bottom(indices));
  const joins=nodes.filter(node=>node.props?.['data-block-stack-merge']==='add');assert.strictEqual(joins.length,1);
 }
});
