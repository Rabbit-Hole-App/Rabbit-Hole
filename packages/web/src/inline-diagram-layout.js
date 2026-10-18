import { layoutDiagram, NODE_KINDS } from './inline-diagram.js';
const fail=message=>({ok:false,changes:[],additions:[],removals:[],dependencies:[],errors:[message]});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function previewVerticalDiagram(input,{board,frozen,readOnly=false}={}){
  if(readOnly)return fail('This canvas is read-only.');
  if(!input||Object.keys(input).some(key=>!['targetIds','layout'].includes(key))||input.layout?.flow!=='down'||Object.keys(input.layout).some(key=>key!=='flow'))return fail('Use a separate vertical-layout preview without structural changes.');
  const ids=input.targetIds;
  if(!Array.isArray(ids)||ids.length<2||ids.length>20||new Set(ids).size!==ids.length||!Array.isArray(frozen?.ids)||!same([...ids].sort(),[...frozen.ids].sort()))return fail('The frozen diagram selection changed.');
  const nodes=[];
  for(const id of ids){
    const entries=['shapes','items','links','blocks'].flatMap(list=>(board[list]||[]).filter(entity=>entity.id===id).map(entity=>({list,entity})));
    if(entries.length!==1||!same(entries[0].entity,frozen.objects?.[id]))return fail('A selected diagram object changed or is ambiguous.');
    const {list,entity}=entries[0];
    if(entity.locked||entity.groupId||entity.source||entity.fileRef||entity.sources?.length||entity.citations?.length)return fail('Locked, grouped or source-backed diagram objects cannot be rearranged here.');
    if(list==='shapes'&&NODE_KINDS.includes(entity.kind))nodes.push(entity);
    else if(list!=='links'||entity.kind==='annotation')return fail('Vertical layout supports boxed native shapes and their connectors.');
  }
  if(nodes.length<2)return fail('Select at least two boxed diagram nodes.');
  const nodeIds=new Set(nodes.map(node=>node.id));
  const incident=(board.links||[]).filter(link=>nodeIds.has(link.from)||nodeIds.has(link.to));
  if(incident.length>80||incident.some(link=>link.toPoint))return fail('Expand or normalize point-anchored connectors before laying out this diagram.');
  if(ids.some(id=>!nodeIds.has(id)&&!incident.some(link=>link.id===id)))return fail('A selected connector is outside the selected diagram.');
  const aliases=new Map(nodes.map((node,index)=>[node.id,`n${index}`])),sizes={};
  for(const node of nodes){
    if(!['x1','y1','x2','y2'].every(key=>Number.isFinite(node[key])))return fail('The saved node geometry is invalid.');
    sizes[aliases.get(node.id)]={w:Math.abs(node.x2-node.x1),h:Math.abs(node.y2-node.y1)};
  }
  const spec={shapes:nodes.map(node=>({id:aliases.get(node.id),label:'',kind:node.kind})),connectors:incident.filter(link=>nodeIds.has(link.from)&&nodeIds.has(link.to)).map(link=>({from:aliases.get(link.from),to:aliases.get(link.to)})),layout:{arrange:'layered',flow:'down',spacing:1}};
  const layout=layoutDiagram(spec,undefined,sizes);
  const origin={x:Math.min(...nodes.flatMap(node=>[node.x1,node.x2])),y:Math.min(...nodes.flatMap(node=>[node.y1,node.y2]))};
  const changes=nodes.map((node,index)=>{
    const box=layout.nodes[index],dx=origin.x+box.x-Math.min(node.x1,node.x2),dy=origin.y+box.y-Math.min(node.y1,node.y2);
    return{id:node.id,list:'shapes',field:'native',before:node,after:{...node,x1:node.x1+dx,x2:node.x2+dx,y1:node.y1+dy,y2:node.y2+dy},bounds:{x:origin.x+box.x,y:origin.y+box.y,w:box.w,h:box.h}};
  });
  if(changes.some(change=>!['x1','x2','y1','y2'].every(key=>Number.isFinite(change.after[key]))))return fail('The layout exceeds finite canvas coordinates.');
  return{ok:true,changes,additions:[],removals:[],dependencies:incident.filter(link=>!nodeIds.has(link.from)||!nodeIds.has(link.to)).map(link=>({id:link.id,reason:'Existing connection to an unselected node; topology is preserved.',readOnly:true})),errors:[],limitations:['Uses existing deterministic layered layout; cycle back-edges do not determine ranks. Node dimensions, labels and connector records are preserved. External objects are not moved; unrelated overlaps are not automatically resolved.']};
}
