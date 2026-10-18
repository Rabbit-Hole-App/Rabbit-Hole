import { validateEquationResult, previewEquationReplacement } from './inline-equation-result.js';
import { EQUATION_SIZE } from './canvas-equation.js';

// Both entry points use the existing atomic canvas edit transaction.
export function equationTransaction(result,{item=null,frozen=null,point=null,requestId,readOnly=false,taken=[]}={}){
 if(readOnly)return{ok:false,error:'This canvas is read-only.'};
 if(item||frozen){const checked=previewEquationReplacement(result,{item,frozen,readOnly});return checked.ok?{ok:true,tx:{kind:'edit',changes:checked.changes,additions:[],removals:[]}}:checked;}
 const {kind,...input}=result||{},checked=validateEquationResult(input);
 if(kind!=='equation'||!checked.ok||checked.result.kind!=='equation')return{ok:false,error:checked.error||'No valid equation is available.'};
 if(!point||![point.x,point.y].every(Number.isFinite)||typeof requestId!=='string'||!requestId.length||requestId.length>100)return{ok:false,error:'The equation insertion point is unavailable.'};
 const id=`equation-${requestId}`;if(taken.includes(id))return{ok:false,error:'This equation was already inserted.'};
 const after={id,kind:'equation',x:point.x,y:point.y,latex:checked.result.latex,size:EQUATION_SIZE};
 return{ok:true,tx:{kind:'edit',changes:[],additions:[{id,list:'items',after}],removals:[]}};
}
