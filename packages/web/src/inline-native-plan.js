import { previewNativeAppearance, previewNativeArrangement } from './inline-native-tools.js';
import { validateInlineToolPlan } from './inline-tool-capabilities.js';
const BOXED=new Set(['rect','ellipse','triangle','diamond','hexagon','star']);
const TEXT=new Set(['text','sticky']);
const adapters={set_appearance:{available:true},arrange_selection:{available:true}};
const fail=reason=>({ok:false,errors:[reason],changes:[]});
// Only the selected native objects are copied. No cards, source payloads or nearby
// objects are granted mutation scope by this first adapter.
export function freezeNativeTools(board,ids,bounds){
 if(!Array.isArray(ids)||!ids.length||ids.length>20)return null;
 const objects={},lists={},boxes={},selection=[];
 for(const id of ids){
  const found=['shapes','items','links'].flatMap(list=>(board[list]||[]).filter(entity=>entity.id===id).map(entity=>({list,entity})));
  if(found.length!==1)return null;
  const {list,entity}=found[0];
  if(list==='items'&&!TEXT.has(entity.kind))return null;
  objects[id]=structuredClone(entity);lists[id]=list;boxes[id]=bounds?.[id]&&{x:bounds[id].x,y:bounds[id].y,w:bounds[id].w,h:bounds[id].h};
  selection.push({id,kind:list==='links'?'connector':list==='items'?'text':'shape',locked:!!entity.locked});
 }
 const snapshot={ids:[...ids],objects,lists,bounds:boxes,selection};
 return JSON.stringify(snapshot).length<=12000?snapshot:null;
}
export function validNativeSnapshot(value){
 if(!value||!Array.isArray(value.ids)||!value.ids.length||value.ids.length>20||new Set(value.ids).size!==value.ids.length||!value.objects||!value.lists||!value.bounds||!Array.isArray(value.selection)||value.selection.length!==value.ids.length)return false;
 if(value.ids.some(id=>typeof id!=='string'||!id||id.length>200))return false;
 for(const id of value.ids){
  if(!Object.hasOwn(value.objects,id)||!Object.hasOwn(value.lists,id))return false;
  const list=value.lists[id],entity=value.objects[id],entry=value.selection.find(item=>item?.id===id);
  if(!['shapes','items','links'].includes(list)||!entity||entity.id!==id||!entry||entry.kind!==(list==='links'?'connector':list==='items'?'text':'shape')||entry.locked!==!!entity.locked)return false;
  if(list==='items'&&!TEXT.has(entity.kind))return false;
 }
 try{return JSON.stringify(value).length<=12000;}catch{return false;}
}
export function validateNativePlan(plan,snapshot,board,currentBounds,{readOnly=false}={}){
 if(!validNativeSnapshot(snapshot))return fail('Native tools were not available for this frozen selection.');
 const envelope=validateInlineToolPlan(plan,{mode:'edit',selection:snapshot.selection,readOnly,adapters});
 if(!envelope.ok)return fail(envelope.reason);
 if(plan.steps.filter(step=>step.tool==='arrange_selection').length>1)return fail('Use one arrangement per preview.');
 for(const id of snapshot.ids){
  const entity=board[snapshot.lists[id]]?.find(item=>item.id===id);
  if(!entity||entity.locked||JSON.stringify(entity)!==JSON.stringify(snapshot.objects[id]))return fail('The selected object changed. Request a new preview.');
 }
 let working=structuredClone(board);const changes=new Map();
 for(const step of plan.steps){
  if(step.tool==='set_appearance'){
   if(Object.keys(step.input).some(key=>key!=='patch'))return fail('Unsupported appearance input.');
   const objects=Object.fromEntries(snapshot.ids.map(id=>[id,working[snapshot.lists[id]].find(item=>item.id===id)]));
   const result=previewNativeAppearance({ids:step.targetIds,patch:step.input.patch},{board:working,frozen:{...snapshot,objects},readOnly});
   if(!result.ok)return fail(result.reason);
   for(const change of result.changes){working[change.list]=working[change.list].map(item=>item.id===change.id?change.after:item);changes.set(change.id,{...change,before:snapshot.objects[change.id],field:'native'});}
  }else if(step.tool==='arrange_selection'){
   if(Object.keys(step.input).some(key=>key!=='how'))return fail('Unsupported arrangement input.');
   if(step.targetIds.some(id=>snapshot.lists[id]==='links'||(snapshot.lists[id]==='shapes'&&!BOXED.has(snapshot.objects[id].kind))))return fail('Arrange currently supports boxed shapes and standalone text or notes.');
   const units=step.targetIds.map(id=>({...snapshot.bounds[id],members:[id]}));
   const result=previewNativeArrangement({how:step.input.how,units},{frozen:snapshot,currentBounds,readOnly});
   if(!result.ok)return fail(result.reason);
   for(const move of result.moves)for(const id of move.ids){
    const list=snapshot.lists[id],entity=working[list].find(item=>item.id===id);
    const coordinates=list==='shapes'?['x1','y1','x2','y2']:['x','y'];
    if(coordinates.some(key=>!Number.isFinite(entity[key])))return fail('This object cannot be positioned independently.');
    const after=list==='shapes'?{...entity,x1:entity.x1+move.dx,x2:entity.x2+move.dx,y1:entity.y1+move.dy,y2:entity.y2+move.dy}:{...entity,x:entity.x+move.dx,y:entity.y+move.dy};
    working[list]=working[list].map(item=>item.id===id?after:item);changes.set(id,{id,list,field:'native',before:snapshot.objects[id],after});
   }
  }else return fail('The native tool adapter is unavailable.');
 }
 const result=[...changes.values()].filter(change=>JSON.stringify(change.before)!==JSON.stringify(change.after));
 return result.length?{ok:true,errors:[],changes:result}:fail('The native edit changed nothing.');
}
export function nativeSnapshotBoard(snapshot){
 if(!validNativeSnapshot(snapshot))return null;
 const board={shapes:[],items:[],links:[]};
 for(const id of snapshot?.ids||[]){const list=snapshot.lists?.[id];if(!board[list]||!snapshot.objects?.[id])return null;board[list].push(snapshot.objects[id]);}
 return board;
}
