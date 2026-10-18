// Pure native annotation preview. The controller calls this again at Accept
// against the same frozen selection and fresh measured world bounds. No saved
// board is changed here; the shared transaction owns persistence and Undo.
import {explainTx,explainConnects,noteSize,inside} from './inline-ai-apply.js';
const LISTS=['shapes','items','links','blocks'];
const fail=reason=>({ok:false,changes:[],additions:[],removals:[],dependencies:[],errors:[reason],limitations:[]});
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const bound=box=>record(box)&&['x','y','w','h'].every(key=>typeof box[key]==='number'&&Number.isFinite(box[key])&&Math.abs(box[key])<=10000000)&&box.w>0&&box.h>0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>structuredClone(value);
const label=value=>typeof value==='string'&&value.trim().length>0&&value.length<=300&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const keys=(value,allowed)=>record(value)&&Object.keys(value).every(key=>allowed.includes(key));

// Explain: {targetId,text,highlight?:{x,y,w,h}} creates a new anchored callout.
// Edit: {annotationId,text} changes only an already-selected supported callout.
// Highlight coordinates are world coordinates inside the measured target, never
// replacement source content. Optional measure is the existing text measurer.
export function previewAnnotations(input,{board,frozen,currentBounds,obstacles=[],visible=null,measure=null,readOnly=false}={}){
 if(readOnly)return fail('This canvas is read-only.');
 if(!keys(input,['requestId','mode','annotations'])||!['explain','edit'].includes(input.mode)||typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.requestId)||
   !Array.isArray(input.annotations)||!input.annotations.length||input.annotations.length>10)return fail('Use one to ten bounded annotation requests.');
 if(!record(board)||!Array.isArray(frozen?.ids)||!frozen.ids.length||frozen.ids.length>20||new Set(frozen.ids).size!==frozen.ids.length||!record(frozen.objects)||!record(frozen.lists)||!record(frozen.bounds)||!record(currentBounds))return fail('A complete frozen selection and measured bounds are required.');
 const dependencies=[];
 for(const id of frozen.ids){
  if(typeof id!=='string'||!id||id.length>200||!Object.hasOwn(frozen.objects,id)||!Object.hasOwn(frozen.lists,id)||!Object.hasOwn(frozen.bounds,id)||!Object.hasOwn(currentBounds,id))return fail('The selected target is missing.');
  const list=frozen.lists[id];if(!LISTS.includes(list))return fail('The target has no supported native list.');
  const found=LISTS.flatMap(name=>(board[name]||[]).filter(entity=>entity.id===id).map(entity=>({list:name,entity})));
  if(found.length!==1||found[0].list!==list||!same(found[0].entity,frozen.objects[id]))return fail('The selected object changed. Request a new preview.');
  if(!bound(currentBounds[id])||!bound(frozen.bounds[id])||!same(currentBounds[id],frozen.bounds[id]))return fail('The measured target bounds changed or are unavailable.');
  dependencies.push({id,list,before:clone(found[0].entity),bounds:clone(currentBounds[id])});
 }
 if(!Array.isArray(obstacles)||obstacles.length>10000||obstacles.some(box=>!bound(box))||(visible!==null&&!bound(visible)))return fail('Valid measured placement bounds are required.');
 const additions=[],changes=[],limitations=[],edited=new Set();
 const occupied=[...Object.values(currentBounds).filter(bound).map(clone),...obstacles.map(clone)];
 const ids=new Set(LISTS.flatMap(list=>(board[list]||[]).map(entity=>entity.id)));
 const add=(list,entity)=>{if(ids.has(entity.id))return false;ids.add(entity.id);additions.push({id:entity.id,list,after:clone(entity)});return true;};
 for(const [index,annotation] of input.annotations.entries()){
  if(!keys(annotation,input.mode==='edit'?['annotationId','text']:['targetId','text','highlight'])||!label(annotation.text))return fail('Annotation labels must be plain text of at most 300 characters.');
  const id=input.mode==='edit'?annotation.annotationId:annotation.targetId;
  if(!frozen.ids.includes(id))return fail('An annotation target is outside the frozen selection.');
  const entity=frozen.objects[id],list=frozen.lists[id];
  if(input.mode==='edit'){
   if(edited.has(id))return fail('Use one label update per annotation.');edited.add(id);
   if(list!=='shapes'||entity.kind!=='rect'||entity.locked||!record(entity.inline)||!['note','annotate'].includes(entity.inline.route)||!['edit','explain'].includes(entity.inline.mode)||!Array.isArray(entity.inline.sources)||!entity.inline.sources.length||entity.inline.annotationType==='highlight'||typeof entity.text!=='string')return fail('Edit supports only selected, unlocked native annotation callouts.');
   const after={...clone(entity),text:annotation.text};
   if(!same(entity,after))changes.push({id,list,before:clone(entity),after});
   continue;
  }
  if(!explainConnects([id],board))return fail('This target has no supported native annotation anchor.');
  const box=currentBounds[id],size=noteSize(annotation.text,measure);
  if(!Number.isFinite(size.w)||!Number.isFinite(size.h)||size.w<=0||size.h<=0||size.h>2000)return fail('The annotation could not be sized safely.');
  const tx=explainTx({requestId:`${input.requestId}-${index}`,text:annotation.text,frozen:{ids:[id]},board,boxes:{target:box,obstacles:occupied},size,visible,route:'annotate'});
  const note=tx.shapes[0],arrow=tx.links[0];
  if(!arrow||!bound({x:note.x1,y:note.y1,w:note.x2-note.x1,h:note.y2-note.y1}))return fail('The annotation could not be placed safely.');
  if(!add('shapes',note)||!add('links',arrow))return fail('An annotation identifier already exists. Request a new preview.');
  occupied.push({x:note.x1,y:note.y1,w:size.w,h:size.h});
  if(tx.place.offscreen)limitations.push('An annotation lies outside the current viewport; the shared preview must reveal it before acceptance.');
  if(annotation.highlight!==undefined){
   const area=annotation.highlight;
   if(!keys(area,['x','y','w','h'])||!bound(area)||!inside(area,box))return fail('A highlight must stay inside its measured target bounds.');
   const highlight={id:`inline-${input.requestId}-${index}-highlight`,kind:'rect',x1:area.x,y1:area.y,x2:area.x+area.w,y2:area.y+area.h,color:'#facc15',width:1,fill:'#fef08a',opacity:0.25,noStroke:true,
    inline:{...clone(note.inline),annotationType:'highlight'}};
   if(!add('shapes',highlight))return fail('An annotation identifier already exists. Request a new preview.');
  }
 }
 if(!additions.length&&!changes.length)return fail('The annotation request changed nothing.');
 return{ok:true,changes,additions,removals:[],dependencies,errors:[],limitations};
}
