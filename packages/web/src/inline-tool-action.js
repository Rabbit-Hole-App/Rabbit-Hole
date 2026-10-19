import {validInlineToolSnapshot} from './inline-tool-plan.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=()=>({ok:false,errors:['The action no longer matches this selection, mode or authorized scope.']});
export function validateToolAction(result,frozen,board,{mode,readOnly=false,locked=false,codeAvailable=false,repoScope=null}={}){
 try{
  const snapshot=frozen?.toolSnapshot;
  if(!result||result.kind!=='tool_action'||!['find_evidence','run_code'].includes(result.action)||typeof result.requestId!=='string'||!result.requestId||result.requestId!==frozen?.requestId||mode!==frozen.actionMode||!['edit','explain'].includes(mode)||!validInlineToolSnapshot(snapshot)||snapshot.intent!==mode||!Array.isArray(result.targetIds)||!same(result.targetIds,snapshot.ids)||Object.keys(result).some(key=>!['kind','action','requestId','targetIds','summary','query'].includes(key))||typeof result.summary!=='string'||!result.summary.trim()||result.summary.length>300)return fail();
  for(const id of snapshot.ids){const item=board[snapshot.lists[id]]?.find(item=>item.id===id);if(!item||!same(item,snapshot.objects[id]))return fail();}
  if(result.action==='run_code'){
   const item=snapshot.objects[snapshot.ids[0]];
   if(readOnly||locked||!codeAvailable||frozen.range||snapshot.ids.length!==1||snapshot.lists[item.id]!=='items'||item.kind!=='text'||item.mode!=='code'||item.lang!=='javascript'||item.locked||Object.hasOwn(result,'query'))return fail();
  }else{
   const scope=frozen.repoScope;
   if(!scope||!same(scope,repoScope)||typeof scope.app!=='string'||!scope.app||typeof scope.repo!=='string'||!scope.repo||!/^[a-f0-9]{40}$/.test(scope.commit)||Object.hasOwn(result,'query')&&(typeof result.query!=='string'||!result.query.trim()||result.query.length>200||/[\x00-\x1f\x7f]/.test(result.query)))return fail();
  }
  return{ok:true,preview:{action:result.action,targetIds:[...result.targetIds],summary:result.summary,...(Object.hasOwn(result,'query')?{query:result.query}:{}),raw:structuredClone(result)}};
 }catch{return fail();}
}
