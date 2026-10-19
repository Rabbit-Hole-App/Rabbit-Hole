import { NODE_KINDS, validateDiagram, layoutDiagram, toCanvasObjects } from './inline-diagram.js';
import { previewVerticalDiagram } from './inline-diagram-layout.js';
import {runsOf,reconcileRuns,textPatch} from './learn-rich-text.js';

const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
const own = (x,k) => Object.hasOwn(x || {},k);
const keys = (x,allowed) => plain(x) && Object.keys(x).every(k=>allowed.includes(k));
const idOK = id => typeof id === 'string' && /^[\w.:-]{1,160}$/.test(id);
const textOK = s => typeof s === 'string' && s.length <= 80;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const failure = (message,dependencies=[]) => ({ok:false,changes:[],additions:[],removals:[],dependencies,errors:[message]});

// Pure proposal only. The caller binds this to an authorized frozen request and
// runs it again at Accept. New node positions come from the existing layout code.
export function previewDiagramEdit(input,{board,frozen,requestId,readOnly=false}={}) {
 try {
  if(!input||!Object.hasOwn(input,'layout'))return preview(input,{board,frozen,requestId,readOnly});
  if(!['add','changes','removeIds'].some(key=>Object.hasOwn(input,key)))return previewVerticalDiagram(input,{board,frozen,readOnly});
  const {layout,...structural}=input;
  const edited=preview(structural,{board,frozen,requestId,readOnly});
  if(!edited.ok)return edited;
  // Lay out a virtual result, then fold its positions into the same transaction.
  // Only surviving selected objects and this proposal's additions are eligible.
  const working=structuredClone(board),removed=new Set(edited.removals.map(item=>item.id));
  for(const change of edited.changes)working[change.list]=working[change.list].map(item=>item.id===change.id?change.after:item);
  for(const removal of edited.removals)working[removal.list]=working[removal.list].filter(item=>item.id!==removal.id);
  for(const addition of edited.additions)working[addition.list].push(addition.after);
  const ids=[...input.targetIds.filter(id=>!removed.has(id)),...edited.additions.map(item=>item.id)];
  const objects=Object.fromEntries(['shapes','links'].flatMap(list=>working[list]||[]).filter(item=>ids.includes(item.id)).map(item=>[item.id,item]));
  const arranged=previewVerticalDiagram({targetIds:ids,layout},{board:working,frozen:{ids,objects},readOnly});
  if(!arranged.ok)return arranged;
  const positions=new Map(arranged.changes.map(change=>[change.id,change]));
  const additions=edited.additions.map(addition=>({...addition,after:positions.get(addition.id)?.after||addition.after}));
  const changes=new Map(edited.changes.map(change=>[change.id,change]));
  for(const change of arranged.changes){
   if(additions.some(addition=>addition.id===change.id))continue;
   changes.set(change.id,{...change,before:frozen.objects[change.id]});
  }
  return{...edited,changes:[...changes.values()],additions,dependencies:[...edited.dependencies,...arranged.dependencies],limitations:arranged.limitations};
 }
 catch { return failure('The diagram request or frozen state is malformed.'); }
}
function preview(input,{board,frozen,requestId,readOnly}) {
 if(readOnly)return failure('This canvas is read-only.');
 if(!idOK(requestId)||!keys(input,['targetIds','add','removeIds','changes'])||JSON.stringify(input).length>16000)return failure('Invalid bounded diagram edit.');
 const ids=input.targetIds,remove=input.removeIds||[],edits=input.changes||[],add=input.add||{};
 if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>!idOK(id))||new Set(ids).size!==ids.length||!Array.isArray(frozen?.ids)||!same([...ids].sort(),[...frozen.ids].sort()))return failure('The frozen diagram targets changed.');
 if(!Array.isArray(remove)||!Array.isArray(edits)||!keys(add,['shapes','links'])||remove.length+edits.length>40)return failure('Unsupported diagram changes.');
 const newShapes=add.shapes||[],newLinks=add.links||[];
 if(!Array.isArray(newShapes)||!Array.isArray(newLinks)||newShapes.length>20||newLinks.length>30||newShapes.length+newLinks.length+remove.length+edits.length===0)return failure('Empty or oversized diagram change.');
 const entries=new Map();
 for(const list of ['shapes','items','links'])for(const entity of board?.[list]||[]){
  if(entries.has(entity.id))return failure('Canvas object IDs are ambiguous.');
  entries.set(entity.id,{list,entity});
 }
 for(const id of ids){
  const item=entries.get(id);
  if(!item||!own(frozen.objects,id)||!same(item.entity,frozen.objects[id]))return failure('The selected diagram changed. Request a new preview.');
  if(item.entity.locked)return failure('A selected object is locked.');
  if(item.entity.source||item.entity.fileRef||item.entity.sources?.length||item.entity.citations?.length)return failure('Source-backed or citation-bearing diagram objects cannot be structurally edited here.');
  if(item.list==='items'||item.list==='shapes'&&!NODE_KINDS.includes(item.entity.kind))return failure('Structural edits currently support boxed shapes and native connectors.');
 }
 if(new Set(remove).size!==remove.length||remove.some(id=>!ids.includes(id)))return failure('Removal targets must be unique selected objects.');
 if(edits.some(x=>!keys(x,['id','patch'])||!ids.includes(x.id)||remove.includes(x.id))||new Set(edits.map(x=>x.id)).size!==edits.length)return failure('Change targets are invalid or repeated.');
 const dependencies=[];
 for(const id of remove){
  const item=entries.get(id);
  if(item.entity.groupId)return failure('Expand the group before removing this diagram object.');
  if(item.list==='shapes')for(const link of board.links||[])if((link.from===id||link.to===id)&&!remove.includes(link.id)&&!edits.some(e=>e.id===link.id))dependencies.push({id:link.id,reason:'connector depends on removed node',requiresScopeExpansion:!ids.includes(link.id)});
 }
 if(dependencies.length)return failure('Include dependent connectors in the removal or explicitly rewire them in this preview.',dependencies);
 const aliases=new Map(),additions=[],changes=[],removals=remove.map(id=>({id,list:entries.get(id).list,before:entries.get(id).entity}));
 const nodes=ids.map(id=>entries.get(id)).filter(x=>x.list==='shapes').map(x=>x.entity);
 if(newShapes.length){
  if(!nodes.length)return failure('Select a boxed shape to place new diagram nodes beside it.');
  if(newShapes.some(x=>!keys(x,['id','kind','label'])||!idOK(x.id)||entries.has(x.id)))return failure('New nodes need fresh IDs, supported kinds and short labels.');
  const checked=validateDiagram({shapes:newShapes,connectors:[],groups:[],layout:{arrange:'column',flow:'down',spacing:1}});
  if(!checked.ok)return failure(checked.errors.join(' '));
  if(nodes.some(n=>![n.x1,n.x2,n.y1,n.y2].every(Number.isFinite)))return failure('Selected diagram bounds are unavailable.');
  const at={x:Math.max(...nodes.flatMap(n=>[n.x1,n.x2]))+48,y:Math.min(...nodes.flatMap(n=>[n.y1,n.y2]))};
  const created=toCanvasObjects(checked.spec,layoutDiagram(checked.spec),{requestId:`edit-${requestId}`,at,taken:new Set(entries.keys())});
  created.shapes.forEach((entity,i)=>{aliases.set(newShapes[i].id,entity.id);entries.set(entity.id,{list:'shapes',entity});additions.push({id:entity.id,list:'shapes',after:entity});});
 }
 const resolve = id => aliases.get(id)||id;
 const removed=new Set(remove);
 function validEnds(link,prior){
  if(link.from===link.to)return false;
  return ['from','to'].every(key=>{
   const id=link[key],entry=entries.get(id);
   return entry?.list==='shapes'&&!removed.has(id)&&(ids.includes(id)||additions.some(a=>a.id===id)||prior&&(id===prior.from||id===prior.to));
  });
 }
 for(const edit of edits){
  const {list,entity}=entries.get(edit.id),patch=edit.patch;
  if(list==='shapes'){
   if(!keys(patch,['text'])||!own(patch,'text')||!textOK(patch.text))return failure('Node edits may change only a short label. Use arrangement or appearance tools for other changes.');
  }else if(!keys(patch,['label','from','to'])||!Object.keys(patch).length||own(patch,'label')&&!textOK(patch.label))return failure('Unsupported connector edit.');
  const after={...entity,...patch};
  const labelKey=list==='shapes'?'text':'label';
  if(own(patch,labelKey)&&Array.isArray(entity.runs)){
   const updated=textPatch(reconcileRuns(runsOf(entity),patch[labelKey]));
   if(updated.runs)after.runs=updated.runs;else delete after.runs;
  }
  if(list==='links'){
   after.from=resolve(after.from);after.to=resolve(after.to);
   if(!validEnds(after,entity))return failure('A connector would dangle or reference an unselected new endpoint.');
   if(after.from!==entity.from||after.to!==entity.to){after.fromSide='right';after.toSide='left';delete after.toPoint;}
   for(const id of [after.from,after.to])if(!ids.includes(id)&&!additions.some(a=>a.id===id))dependencies.push({id,reason:'existing connector endpoint',readOnly:true});
  }
  if(!same(entity,after))changes.push({id:edit.id,list,before:entity,after});
 }
 const linkIds=new Set();
 for(const [index,link] of newLinks.entries()){
  if(!keys(link,['id','from','to','label'])||!idOK(link.id)||linkIds.has(link.id)||entries.has(link.id)||aliases.has(link.id)||own(link,'label')&&!textOK(link.label))return failure('New connector identity or label is invalid.');
  linkIds.add(link.id);
  const entity={id:`inline-edit-${requestId}-link${index}`,from:resolve(link.from),to:resolve(link.to),fromSide:'right',toSide:'left',head:true,route:'elbow',color:'#37352f',...(link.label?{label:link.label}:{})};
  if(entries.has(entity.id)||!validEnds(entity))return failure('A new connector has a conflicting ID, dangling endpoint or unselected target.');
  additions.push({id:entity.id,list:'links',after:entity});
 }
 return{ok:true,changes,additions,removals,dependencies,errors:[],limitations:['New nodes use deterministic placement beside the selected diagram.','This adapter supports boxed shapes and native connectors; grouped removals require explicit ungrouping.']};
}
