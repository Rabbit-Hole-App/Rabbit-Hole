import {editableImage} from './inline-image-plan.js';
export function validateImageAction(result,frozen,board,{readOnly=false,locked=false}={}) {
  const snapshot=frozen?.toolSnapshot,id=result?.targetId,original=snapshot?.objects?.[id],current=board?.blocks?.find(block=>block.id===id);
  if(readOnly||locked||!result||result.kind!=='image_action'||!['remove_background','edit_image'].includes(result.action)||result.requestId!==frozen?.requestId||snapshot?.intent!=='edit'||snapshot.ids?.length!==1||snapshot.ids[0]!==id||!editableImage(original)||!editableImage(current)||JSON.stringify(original)!==JSON.stringify(current)||Object.keys(result).some(key=>!['kind','action','targetId','requestId','summary'].includes(key)))return{ok:false,errors:['The image action no longer matches this editable source.']};
  return{ok:true,preview:{action:result.action,targetId:id,summary:typeof result.summary==='string'?result.summary.slice(0,300):'',raw:structuredClone(result)}};
}
