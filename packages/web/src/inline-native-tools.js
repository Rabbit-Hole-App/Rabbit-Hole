// Pure preview foundations; callers still authorize/signed-bind scope and revalidate at Accept.
import {styleKeysFor,pasteStyle,DASH_STYLES,HEADS,TEXT_LEVELS} from './learn-style-panel.js';
import {hexColor,FONT_KEYS,SIZE_MIN,SIZE_MAX,ALIGNS,VALIGNS} from './learn-rich-text.js';
const fail=reason=>({ok:false,reason,changes:[]});
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const boolean=new Set(['bold','italic','underline','noStroke']);
function valid(key,value){
 if(['color','textColor'].includes(key))return typeof value==='string'&&hexColor(value)===value.toLowerCase();
 if(key==='fill')return value===null||(typeof value==='string'&&hexColor(value)===value.toLowerCase());
 if(boolean.has(key))return typeof value==='boolean';
 if(['opacity','fillOpacity'].includes(key))return finite(value)&&value>=0&&value<=1;
 if(key==='width')return finite(value)&&value>=1&&value<=12;
 if(key==='round')return typeof value==='boolean';
 if(key==='fontSize')return finite(value)&&value>=SIZE_MIN&&value<=SIZE_MAX;
 const enums={font:FONT_KEYS,align:ALIGNS,valign:VALIGNS,dash:DASH_STYLES,startHead:HEADS,endHead:HEADS,level:TEXT_LEVELS.map(level=>level.id)};
 return Object.hasOwn(enums,key)&&enums[key].includes(value);
}
export function previewNativeAppearance({ids,patch}, {board,frozen,readOnly=false}={}){
 if(readOnly)return fail('This canvas is read-only.');
 if(!Array.isArray(ids)||!ids.length||ids.length>20||new Set(ids).size!==ids.length||!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)return fail('Invalid appearance operation.');
 const changes=[];
 for(const id of ids){
  if(!frozen?.ids?.includes(id))return fail('Target is outside the frozen selection.');
  const candidates=['shapes','items','links'].flatMap(list=>(board?.[list]||[]).filter(entry=>entry.id===id).map(entity=>({list,entity})));
  if(candidates.length!==1)return fail('A native appearance target is missing or ambiguous.');
  const {list,entity}=candidates[0];
  if(entity.locked)return fail('A selected object is locked.');
  if(!Object.hasOwn(frozen.objects||{},id)||JSON.stringify(frozen.objects[id])!==JSON.stringify(entity))return fail('The selected object changed.');
  const allowed=styleKeysFor(entity,list==='links');
  for(const [key,value] of Object.entries(patch))if(!allowed.includes(key)||!valid(key,value))return fail(`Unsupported appearance property: ${key}.`);
  // Preserve words which previously inherited stroke colour, as the native panel does.
  const kept=patch.color&&!entity.textColor&&(entity.text||entity.label)&&list!=='items'?{...entity,textColor:entity.color||'#37352f'}:entity;
  const after=pasteStyle(kept,patch,list==='links');
  changes.push({id,list,field:'appearance',before:entity,after});
 }
 return{ok:true,changes};
}
const ALIGNMENTS=['left','center','right','top','middle','bottom','spread-x','spread-y'];
export function previewNativeArrangement({how,units},{frozen,currentBounds,locked=[],readOnly=false}={}){
 if(readOnly)return fail('This canvas is read-only.');
 if(!ALIGNMENTS.includes(how)||!Array.isArray(units)||units.length>20)return fail('Unsupported arrangement.');
 const spread=how.startsWith('spread-');if(units.length<(spread?3:2))return fail('Select more independently movable objects.');
 const all=units.flatMap(unit=>unit.members||[]);
 if(!all.length||new Set(all).size!==all.length||all.some(id=>!frozen?.ids?.includes(id)||locked.includes(id)))return fail('Arrangement targets are missing, locked or outside the selection.');
 for(const unit of units){
  if(!unit.members?.length||!['x','y','w','h'].every(key=>finite(unit[key]))||unit.w<0||unit.h<0)return fail('Measured bounds are unavailable.');
  for(const id of unit.members)if(!Object.hasOwn(currentBounds||{},id)||!Object.hasOwn(frozen.bounds||{},id)||JSON.stringify(currentBounds[id])!==JSON.stringify(frozen.bounds[id]))return fail('Measured layout changed.');
  const boxes=unit.members.map(id=>currentBounds[id]);
  if(boxes.some(box=>!['x','y','w','h'].every(key=>finite(box[key]))||box.w<0||box.h<0))return fail('Measured bounds are unavailable.');
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  if(unit.x!==x||unit.y!==y||unit.w!==Math.max(...boxes.map(b=>b.x+b.w))-x||unit.h!==Math.max(...boxes.map(b=>b.y+b.h))-y)return fail('Proposed layout does not match measured bounds.');
 }
 const left=Math.min(...units.map(u=>u.x)),right=Math.max(...units.map(u=>u.x+u.w)),top=Math.min(...units.map(u=>u.y)),bottom=Math.max(...units.map(u=>u.y+u.h));
 const moves=[];
 if(spread){
  const across=how==='spread-x',start=u=>across?u.x:u.y,size=u=>across?u.w:u.h;
  const sorted=[...units].sort((a,b)=>start(a)-start(b)),gap=((across?right-left:bottom-top)-sorted.reduce((sum,u)=>sum+size(u),0))/(sorted.length-1);
  let at=across?left:top;for(const unit of sorted){moves.push({ids:[...unit.members],dx:across?at-unit.x:0,dy:across?0:at-unit.y});at+=size(unit)+gap;}
 }else{
  const delta={left:u=>[left-u.x,0],center:u=>[(left+right)/2-u.x-u.w/2,0],right:u=>[right-u.x-u.w,0],top:u=>[0,top-u.y],middle:u=>[0,(top+bottom)/2-u.y-u.h/2],bottom:u=>[0,bottom-u.y-u.h]};
  for(const unit of units){const [dx,dy]=delta[how](unit);moves.push({ids:[...unit.members],dx,dy});}
 }
 if(moves.some(move=>!finite(move.dx)||!finite(move.dy)))return fail('Arrangement exceeds finite canvas coordinates.');
 return{ok:true,moves};
}
