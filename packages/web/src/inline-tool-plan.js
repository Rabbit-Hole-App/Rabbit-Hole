import { editableImage, imageOperation } from './inline-image-plan.js';
import { arrangementCardEligible, previewInlineArrangement } from './inline-card-arrangement.js';
import { freezeNativeTools, validateNativePlan } from './inline-native-plan.js';
import { validateInlineToolPlan } from './inline-tool-capabilities.js';
import { cardEditSpec, validateCardContent } from './inline-card-edit.js';
import { transformTable } from './inline-table-tools.js';
import { previewDiagramEdit } from './inline-diagram-edit.js';
import { previewAnnotations } from './inline-annotation-tools.js';
import { previewNotebookCellEdit } from './inline-notebook-edit.js';
import { activePath, ipynbPath } from './learn-notebook.js';

const LISTS=['shapes','items','links','blocks'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=message=>({ok:false,errors:[message],changes:[],additions:[],removals:[],dependencies:[],limitations:[]});
const kind=(list,item)=>list==='blocks'?editableImage(item)?'image':['table','notebook'].includes(item.type)?item.type:'card':list==='links'?'connector':list==='shapes'?'shape':item.kind==='equation'?'equation':'text';
const adapters=Object.fromEntries(['set_appearance','arrange_selection','transform_table','edit_diagram','annotate_selection','edit_notebook_cells','transform_image'].map(key=>[key,{available:true}]));
function validNotebookScope(scope,item){return !!scope&&item?.type==='notebook'&&!item.locked&&!item.fileRef&&!item.source&&!item.sources?.length&&!item.citations?.length&&scope.id===item.id&&scope.notebookId===item.notebook_id&&scope.path===activePath(item)&&scope.path===ipynbPath(item)&&scope.revision===JSON.stringify(item.ipynb)&&Array.isArray(scope.cellIds)&&scope.cellIds.length>0&&scope.cellIds.length<=20&&new Set(scope.cellIds).size===scope.cellIds.length&&scope.cellIds.every(id=>typeof id==='string'&&item.ipynb?.cells?.some(cell=>cell.id===id));}

// Explicit selected data only. Incident graph records are read-only dependencies;
// they never enlarge the set of IDs an edit may change.
export function freezeInlineTools(board,ids,bounds={}, {mode='edit',notebook=null}={}) {
 try {
  if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length)return null;
  const objects={},lists={},boxes={},selection=[];
  for(const id of ids){
   const found=LISTS.flatMap(list=>(board[list]||[]).filter(item=>item.id===id).map(item=>({list,item})));
   if(found.length!==1)return null;
   const {list,item}=found[0];
   if(list==='items'&&!['text','sticky',...(mode==='explain'?['equation']:[])].includes(item.kind)||mode==='edit'&&list==='blocks'&&!(arrangementCardEligible(item)||ids.length===1&&(editableImage(item)||validNotebookScope(notebook,item))))return null;
   objects[id]=structuredClone(item);lists[id]=list;
   if(bounds[id]){const {x,y,w,h}=bounds[id];boxes[id]={x,y,w,h};}
   selection.push({id,kind:kind(list,item),locked:!!item.locked});
  }
  const links=(board.links||[]).filter(link=>ids.includes(link.id)||ids.includes(link.from)||ids.includes(link.to));
  const endpoints=new Set(links.flatMap(link=>[link.from,link.to]));
  const readOnlyGraph={links:links.filter(link=>!ids.includes(link.id)),shapes:(board.shapes||[]).filter(item=>endpoints.has(item.id)&&!ids.includes(item.id))};
  const snapshot={version:1,intent:mode,ids:[...ids],objects,lists,bounds:boxes,selection,readOnlyGraph:structuredClone(readOnlyGraph),...(notebook?{notebook:structuredClone(notebook)}:{})};
  return validInlineToolSnapshot(snapshot)?snapshot:null;
 }catch{return null;}
}
export function validInlineToolSnapshot(snapshot){
 try{
  if(snapshot?.version!==1||!Array.isArray(snapshot.ids)||!snapshot.ids.length||snapshot.ids.length>20||new Set(snapshot.ids).size!==snapshot.ids.length||!snapshot.objects||!snapshot.lists||!snapshot.bounds||!Array.isArray(snapshot.selection)||snapshot.selection.length!==snapshot.ids.length)return false;
  if(!['edit','explain'].includes(snapshot.intent||'edit'))return false;
  for(const id of snapshot.ids){
   const item=snapshot.objects[id],list=snapshot.lists[id],entry=snapshot.selection.find(value=>value?.id===id);
   if(typeof id!=='string'||!id||id.length>160||!Object.hasOwn(snapshot.objects,id)||!LISTS.includes(list)||!item||item.id!==id||!entry||entry.kind!==kind(list,item)||entry.locked!==!!item.locked)return false;
   if(list==='items'&&!['text','sticky',...((snapshot.intent||'edit')==='explain'?['equation']:[])].includes(item.kind)||(snapshot.intent||'edit')==='edit'&&list==='blocks'&&!(arrangementCardEligible(item)||snapshot.ids.length===1&&(editableImage(item)||validNotebookScope(snapshot.notebook,item))))return false;
  }
  const graph=snapshot.readOnlyGraph;
  if(!graph||!Array.isArray(graph.links)||!Array.isArray(graph.shapes)||graph.links.length>80||graph.shapes.length>80)return false;
  const dependencyIds=[...graph.links,...graph.shapes].map(item=>item?.id);
  if(dependencyIds.some(id=>typeof id!=='string'||!id||id.length>160||snapshot.ids.includes(id))||new Set(dependencyIds).size!==dependencyIds.length)return false;
  return JSON.stringify(snapshot).length<=24000;
 }catch{return false;}
}
export function inlineToolSnapshotBoard(snapshot){
 if(!validInlineToolSnapshot(snapshot))return null;
 const board={shapes:structuredClone(snapshot.readOnlyGraph.shapes),links:structuredClone(snapshot.readOnlyGraph.links),items:[],blocks:[]};
 for(const id of snapshot.ids)board[snapshot.lists[id]].push(structuredClone(snapshot.objects[id]));
 return board;
}

export function validateInlinePlan(plan,snapshot,board,currentBounds={},options={}){
 try{return validate(plan,snapshot,board,currentBounds,options);}catch{return fail('The tool plan or frozen state is malformed.');}
}
function validate(plan,snapshot,board,currentBounds,{mode='edit',requestId,readOnly=false}){
 if(!validInlineToolSnapshot(snapshot))return fail('Tools were unavailable for this frozen selection.');
 if((snapshot.intent||'edit')!==mode)return fail('The frozen request mode changed.');
 const envelope=validateInlineToolPlan(plan,{mode,selection:snapshot.selection,readOnly,adapters});
 if(!envelope.ok)return fail(envelope.reason);
 for(const step of plan.steps)if(step.tool==='arrange_selection'&&step.targetIds.some(id=>!same(snapshot.bounds[id],currentBounds[id])))return fail('The selected layout changed. Request a new preview.');
 for(const id of snapshot.ids){
  const current=board[snapshot.lists[id]]?.find(item=>item.id===id);
  if(!current||mode==='edit'&&current.locked||!same(current,snapshot.objects[id]))return fail('The selected object changed. Request a new preview.');
 }
 for(const list of ['links','shapes'])for(const item of snapshot.readOnlyGraph[list]){
  if(!same(board[list]?.find(value=>value.id===item.id),item))return fail('A diagram dependency changed. Request a new preview.');
 }
 // A dependency added after the request also invalidates the frozen graph.
 const liveLinks=(board.links||[]).filter(link=>snapshot.ids.includes(link.id)||snapshot.ids.includes(link.from)||snapshot.ids.includes(link.to));
 const frozenLinks=[...snapshot.readOnlyGraph.links,...snapshot.ids.filter(id=>snapshot.lists[id]==='links').map(id=>snapshot.objects[id])];
 if(!same(liveLinks.map(item=>item.id).sort(),frozenLinks.map(item=>item.id).sort()))return fail('Diagram connections changed. Request a new preview.');
 if(plan.steps.some(step=>step.tool==='transform_image')){
  const step=plan.steps[0];
  if(plan.steps.length!==1||snapshot.ids.length!==1||step.targetIds.length!==1||!editableImage(snapshot.objects[step.targetIds[0]]))return fail('Transform one editable image in a separate preview.');
  return {ok:true,changes:[],additions:[],removals:[],dependencies:[],limitations:['The original image is retained; no background removal or generative image editing is performed.'],imageTransform:{id:step.targetIds[0],operation:imageOperation(step.input)}};
 }
 let working=structuredClone(board);
 const changes=new Map(),additions=[],removals=[],dependencies=[],limitations=[];
 const structural=plan.steps.filter(step=>step.tool==='edit_diagram');
 if(structural.length>1||structural.length&&plan.steps.at(-1).tool!=='edit_diagram')return fail('Use one structural diagram step, last in the preview.');
 if(plan.steps.filter(step=>step.tool==='arrange_selection').length>1)return fail('Use one arrangement per preview.');
 if(plan.steps.some(step=>step.tool==='annotate_selection')&&plan.steps.length!==1)return fail('Keep annotations in one separate preview.');
 if(plan.steps.some(step=>step.tool==='edit_notebook_cells')&&plan.steps.length!==1)return fail('Keep selected-cell edits in one separate preview.');
 for(const [index,step] of plan.steps.entries()){
  let result;
  if(step.tool==='edit_notebook_cells'){
   if(step.targetIds.length!==1||step.targetIds[0]!==snapshot.notebook?.id||Object.keys(step.input).some(key=>!['cellIds','edits','splits'].includes(key)))return fail('Notebook edits require explicit selected cells.');
   result=previewNotebookCellEdit({targetId:step.targetIds[0],...step.input},{block:working.blocks.find(item=>item.id===step.targetIds[0]),frozen:snapshot.notebook,readOnly,requestId});
   if(result.ok){result.changes=result.changes.map(change=>({...change,field:'notebookCells',cellIds:step.input.cellIds,staleCellIds:result.staleCellIds,addedCellIds:result.addedCellIds||[]}));limitations.push('Source edit only. Affected code outputs are cleared; no cells were executed.');}
  }else if(step.tool==='annotate_selection'){
   if(typeof requestId!=='string'||!requestId||Object.keys(step.input).some(key=>key!=='annotations'))return fail('Invalid annotation request.');
   const frozen={...snapshot,ids:step.targetIds};
   result=previewAnnotations({requestId,mode,annotations:step.input.annotations},{board:working,frozen,currentBounds,readOnly});
  }else if(step.tool==='arrange_selection'){
   result=previewInlineArrangement(step.input,{ids:step.targetIds,snapshot:{...snapshot,objects:Object.fromEntries(snapshot.ids.map(id=>[id,working[snapshot.lists[id]].find(item=>item.id===id)]))},board:working,currentBounds,readOnly});
  }else if(step.tool==='transform_table'){
   const tableChanges=[];
   for(const id of step.targetIds){
    const item=working.blocks.find(value=>value.id===id),spec=cardEditSpec(item);
    if(!spec.ok)return fail(spec.reason);
    const transformed=transformTable(item,step.input);
    if(!transformed.ok)return fail(transformed.reason);
    const checked=validateCardContent(item,{...spec.content,...transformed.content});
    if(!checked.ok)return fail(checked.error);
    tableChanges.push({id,list:'blocks',field:'cardContent',before:item,after:checked.after});
    limitations.push(...transformed.limitations);
   }
   result={ok:true,changes:tableChanges};
  }else if(step.tool==='edit_diagram'){
   if(typeof requestId!=='string'||!requestId)return fail('The diagram request identity is unavailable.');
   if(step.targetIds.some(id=>snapshot.lists[id]==='links'&&snapshot.objects[id].kind==='annotation'))return fail('Annotation connectors are not structural diagram edges.');
   if(Object.hasOwn(step.input,'targetIds'))return fail('Diagram scope must come from the tool targets.');
   const frozen={ids:step.targetIds,objects:Object.fromEntries(step.targetIds.map(id=>[id,working[snapshot.lists[id]].find(item=>item.id===id)]))};
   result=previewDiagramEdit({...step.input,targetIds:step.targetIds},{board:working,frozen,requestId:`${requestId}-${index}`,readOnly});
  }else{
   const native=freezeNativeTools(working,step.targetIds,currentBounds);
   result=validateNativePlan({mode,targetIds:step.targetIds,steps:[step]},native,working,currentBounds,{readOnly});
  }
  if(!result.ok)return {...fail(result.errors?.join(' ')||result.reason||'Tool validation failed.'),dependencies:result.dependencies||[]};
  for(const change of result.changes||[]){
   working[change.list]=working[change.list].map(item=>item.id===change.id?change.after:item);
   changes.set(change.id,{...change,field:change.field||'native',before:snapshot.objects[change.id]});
  }
  for(const addition of result.additions||[]){working[addition.list].push(addition.after);additions.push(addition);}
  for(const removal of result.removals||[]){working[removal.list]=working[removal.list].filter(item=>item.id!==removal.id);changes.delete(removal.id);removals.push({...removal,before:snapshot.objects[removal.id]});}
  dependencies.push(...(result.dependencies||[]));limitations.push(...(result.limitations||[]));
 }
 const changed=[...changes.values()].filter(change=>!same(change.before,change.after));
 return changed.length+additions.length+removals.length?{ok:true,changes:changed,additions,removals,dependencies,errors:[],limitations:[...new Set(limitations)]}:fail('The tool plan changed nothing.');
}
