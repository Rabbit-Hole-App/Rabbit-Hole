import {activePath,ipynbPath} from './learn-notebook.js';
const revision=block=>JSON.stringify(block.ipynb);
export const changedNotebooks=(before,after)=>(before.blocks||[]).filter(block=>block.type==='notebook').flatMap(block=>{
 const target=(after.blocks||[]).find(value=>value.id===block.id&&value.type==='notebook');
 return target&&revision(block)!==revision(target)?[{before:block,after:target}]:[];
});
// The canvas publishes its history step only after the live workspace saved it.
// Separate frames cannot provide one atomic transaction, so refuse that case.
export function notebookHistoryController(){
 let pending=false;
 return {
  get pending(){return pending;},
  run({before,after,editor,current,commit}){
   if(pending)return Promise.resolve(false);
   const changes=changedNotebooks(before,after);
   if(!changes.length){commit();return true;}
   pending=true;
   return (async()=>{
    if(changes.length!==1)throw Error('This history step changes multiple live notebooks and cannot be restored together.');
    const change=changes[0],from=change.before,to=change.after,path=ipynbPath(from);
    if(from.notebook_id!==to.notebook_id||path!==ipynbPath(to)||activePath(from)!==path||activePath(to)!==path)throw Error('The notebook workspace or document changed.');
    const handle=editor(from.id),expectedRevision=revision(from),targetRevision=revision(to);
    const restored=await handle.restore({path,expectedRevision,ipynb:to.ipynb});
    if(restored.revision!==targetRevision)throw Error('The notebook returned a different restored revision. Canvas history was kept.');
    if(!current()){
     try{await handle.restore({path,expectedRevision:targetRevision,ipynb:from.ipynb});}
     catch{throw Error('The canvas changed during notebook history. History was kept, but the notebook rollback was refused; newer workspace content was not overwritten.');}
     throw Error('The canvas changed during notebook history. The notebook was restored and history was kept.');
    }
    commit();return true;
   })().finally(()=>{pending=false;});
  },
 };
}
