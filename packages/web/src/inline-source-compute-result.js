import {computeRecognizedSourcePlot} from './inline-source-compute.js';
import {validateSourceReadings} from './inline-source-readings.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateSourceCompute(result,frozen,board,{mode,readOnly=false,locked=false}={}){
 const fail=error=>({ok:false,errors:[error||'The selected pages or calculation request changed.']});
 try{
  if(readOnly||locked||mode!=='explain'||frozen.actionMode!=='explain'||!same(frozen.sourceComputation,{type:'table_plot'})||result?.kind!=='source_compute'||result.requestId!==frozen.requestId||!same(result.targetIds,frozen.ids)||typeof result.summary!=='string'||!result.summary.trim()||result.summary.length>300||Object.keys(result).some(key=>!['kind','requestId','targetIds','summary','table','operation','uncertainties','sourceReadings'].includes(key)))return fail();
  const receipt=validateSourceReadings(result.sourceReadings,frozen.sourceRanges);if(!receipt.ok)return fail(receipt.error);
  if(frozen.ids.length!==frozen.sourceRanges.length||frozen.ids.some(id=>!frozen.sourceRanges.some(entry=>entry.targetId===id)||!same(board.blocks.find(block=>block.id===id),frozen.sourceBlocks[id])))return fail();
  const computed=computeRecognizedSourcePlot({table:result.table,operation:result.operation,uncertainties:result.uncertainties});if(!computed.ok)return fail(computed.reason);
  return{ok:true,preview:{raw:structuredClone(result),block:{type:'graph',title:computed.content.title,brief:computed.content.concept,spec:{...computed.content,id:`source-plot-${result.requestId}`},state:{}},summary:result.summary,operation:computed.operation,table:computed.table,uncertainties:computed.uncertainties,limitations:computed.limitations,evidence:{...computed.evidence,recognizedTable:computed.table,uncertainties:computed.uncertainties},sourceReadings:receipt.readings}};
 }catch{return fail();}
}
