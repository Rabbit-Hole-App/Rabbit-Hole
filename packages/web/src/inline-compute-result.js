import {checkPolynomialDerivative} from './inline-polynomial-derivative.js';
import {computeTable} from './inline-compute.js';
import {cardEditSpec} from './inline-card-edit.js';
import {validInlineToolSnapshot} from './inline-tool-plan.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=reason=>({ok:false,errors:[reason||'The calculation no longer matches this table, request or permissions.']});
export function validateComputeResult(result,frozen,board,{mode,readOnly=false,locked=false}={}){
 try{
  const snapshot=frozen?.toolSnapshot,id=snapshot?.ids?.[0];
  if(readOnly||locked||mode!=='explain'||frozen.actionMode!=='explain'||!validInlineToolSnapshot(snapshot)||snapshot.intent!=='explain'||!result||result.kind!=='compute'||typeof result.requestId!=='string'||!/^[\w-]{1,80}$/.test(result.requestId)||result.requestId!==frozen.requestId||!same(result.targetIds,snapshot.ids)||typeof result.summary!=='string'||!result.summary.trim()||result.summary.length>300||Object.keys(result).some(key=>!['kind','requestId','targetIds','summary','operation'].includes(key)))return fail();
  if(result.operation?.type==='polynomial_derivative'){
   const op=result.operation;
   if(snapshot.ids.length!==2||op.sourceId===op.claimId||![op.sourceId,op.claimId].every(id=>snapshot.ids.includes(id))||Object.keys(op).some(key=>!['type','sourceId','claimId','variable'].includes(key)))return fail();
   const selected=snapshot.ids.map(id=>board.items?.find(item=>item.id===id));
   if(selected.some(item=>!item||item.kind!=='equation'||item.locked||snapshot.lists[item.id]!=='items'||!same(item,snapshot.objects[item.id])))return fail();
   const source=selected.find(item=>item.id===op.sourceId),claim=selected.find(item=>item.id===op.claimId);
   const checked=checkPolynomialDerivative({source:source.latex,claim:claim.latex,variable:op.variable});if(!checked.ok)return fail(checked.reason);
   const title=checked.equivalent?'Derivative verified for this polynomial':'Derivative does not match';
   const block={type:'explanation',title,body:`${title}. Exact derivative with respect to $${op.variable}$:\n\n$$${checked.derivativeLatex}$$\n\n${checked.assumptions.join(' ')}`,more:[]};
   return{ok:true,preview:{block,summary:title,operation:structuredClone(op),evidence:{...checked.evidence,sourceId:op.sourceId,claimId:op.claimId,equivalent:checked.equivalent,assumptions:checked.assumptions},limitations:checked.limitations,raw:structuredClone(result)}};
  }
  if(snapshot.ids.length!==1||snapshot.lists[id]!=='blocks'||result.operation?.targetId!==id)return fail();
  const table=board.blocks?.find(item=>item.id===id);
  if(table?.type!=='table'||!same(table,snapshot.objects[id])||!cardEditSpec(table).ok)return fail();
  const computed=computeTable(table,result.operation);if(!computed.ok)return fail(computed.reason);
  const block=computed.content.op==='interactive_plot'?{type:'graph',title:computed.content.title,brief:computed.content.concept,spec:{...computed.content,id:`computed-${result.requestId}`},state:{}}:{...computed.content,title:'Selected table summary'};
  return{ok:true,preview:{block,summary:result.summary,operation:structuredClone(result.operation),evidence:computed.evidence,limitations:computed.limitations,raw:structuredClone(result)}};
 }catch{return fail();}
}
export function stampComputation(tx,preview,frozen){
 const computation={operation:structuredClone(preview.operation),evidence:structuredClone(preview.evidence),limitations:[...preview.limitations],sourceFingerprint:frozen.prints?.target||null};
 const stamp=item=>({...item,inline:{...item.inline,tool:'compute',computation:structuredClone(computation)}});
 return{...tx,block:stamp(tx.block),links:(tx.links||[]).map(stamp)};
}
