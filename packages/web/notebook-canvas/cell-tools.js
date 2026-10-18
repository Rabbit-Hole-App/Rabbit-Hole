// Source-only notebook bridge operations. Never calls a kernel or command runner.
// Loaded before canvas-bridge.js; also exercised with a fake Jupyter model in tests.
(() => {
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const idsOK=ids=>Array.isArray(ids)&&ids.length>0&&ids.length<=20&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&/^[\w-]{1,64}$/.test(id));
 const error=message=>{throw new Error(message);};
 function capture(widget,{requireSelection=true}={}){
  if(!widget?.context?.model||!widget?.content?.model?.cells||typeof widget.content.isSelectedOrActive!=='function')error('The active document is not a supported notebook.');
  if(widget.context.model.readOnly)error('This notebook is read-only.');
  if(widget.sessionContext?.session?.kernel?.status==='busy')error('Wait for the running notebook cell to finish.');
  const ipynb=widget.context.model.toJSON(),path=widget.context.path;
  if(typeof path!=='string'||!path.endsWith('.ipynb')||ipynb.nbformat!==4||!Array.isArray(ipynb.cells)||ipynb.cells.length>1000)error('Unsupported notebook document.');
  const all=ipynb.cells.map(cell=>cell.id);
  if(new Set(all).size!==all.length||all.some(id=>typeof id!=='string'||!/^[\w-]{1,64}$/.test(id)))error('Notebook cells need stable unique IDs.');
  const cellIds=(widget.content.widgets||[]).filter(cell=>widget.content.isSelectedOrActive(cell)).map(cell=>cell.model.id);
  if(requireSelection&&(!idsOK(cellIds)||cellIds.some(id=>!all.includes(id))))error('Select one to twenty notebook cells first.');
  const revision=JSON.stringify(ipynb);
  if(revision.length>1000000)error('This notebook is too large for a guarded edit.');
  return {path,cellIds,revision,ipynb};
 }
 function proposal(snapshot,edits){
  if(!idsOK(snapshot?.cellIds)||typeof snapshot.revision!=='string'||!Array.isArray(edits)||!edits.length||edits.length>20||new Set(edits.map(edit=>edit?.id)).size!==edits.length)error('Invalid selected-cell edit.');
  if(edits.some(edit=>!edit||Object.keys(edit).some(key=>!['id','source'].includes(key))||!snapshot.cellIds.includes(edit.id)||typeof edit.source!=='string'||edit.source.length>20000)||edits.reduce((sum,edit)=>sum+edit.source.length,0)>60000)error('The edit exceeds the selected cell scope.');
  const ipynb=JSON.parse(snapshot.revision),changes=new Map(edits.map(edit=>[edit.id,edit.source]));
  let stale=false;const staleCellIds=[];
  const cells=ipynb.cells.map(cell=>{
   let next=cell;
   if(changes.has(cell.id)){
    if(!['code','markdown'].includes(cell.cell_type))error('Only code and Markdown source can be edited.');
    const source=Array.isArray(cell.source)?cell.source.join(''):cell.source;
    if(source!==changes.get(cell.id)){next={...cell,source:changes.get(cell.id)};if(cell.cell_type==='code')stale=true;}
   }
   if(stale&&cell.cell_type==='code'){staleCellIds.push(cell.id);next={...next,outputs:[],execution_count:null};}
   return next;
  });
  return {ipynb:{...ipynb,cells},staleCellIds};
 }
 async function apply(widget,input){
  const current=capture(widget);
  if(input?.path!==current.path||input.expectedRevision!==current.revision||!same(input.cellIds,current.cellIds))error('The notebook or selected cells changed. Request a new preview.');
  const result=proposal(current,input.edits);
  widget.context.model.fromJSON(result.ipynb);
  // Existing workspace persistence only; no kernel/execution API is used.
  try{await widget.context.save();}catch{
   if(JSON.stringify(widget.context.model.toJSON())===JSON.stringify(result.ipynb))widget.context.model.fromJSON(current.ipynb);
   error('The notebook workspace could not save the edit.');
  }
  if(!same(widget.context.model.toJSON(),result.ipynb))error('The notebook changed while saving. Request a new preview.');
  return {...result,path:current.path,cellIds:current.cellIds,revision:JSON.stringify(result.ipynb)};
 }
 async function restore(widget,input){
  const current=capture(widget,{requireSelection:false}),next=input?.ipynb;
  if(current.path!==input.path||current.revision!==input.expectedRevision)error('The live notebook changed; its saved canvas revision was not substituted.');
  if(!next||next.nbformat!==4||!Array.isArray(next.cells)||JSON.stringify(next).length>1000000||!same(next.cells.map(cell=>cell.id),current.ipynb.cells.map(cell=>cell.id)))error('The notebook revision is incompatible.');
  widget.context.model.fromJSON(next);
  try{await widget.context.save();}catch{if(same(widget.context.model.toJSON(),next))widget.context.model.fromJSON(current.ipynb);error('The notebook revision could not be saved.');}
  return {path:current.path,cellIds:current.cellIds,ipynb:next,revision:JSON.stringify(next)};
 }
 globalThis.RHNotebookCells=Object.freeze({capture,proposal,apply,restore});
})();
