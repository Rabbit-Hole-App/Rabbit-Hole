// Source-only notebook bridge operations. Never calls a kernel or command runner.
// Loaded before canvas-bridge.js; also exercised with a fake Jupyter model in tests.
(() => {
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const idsOK=ids=>Array.isArray(ids)&&ids.length>0&&ids.length<=20&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&/^[\w-]{1,64}$/.test(id));
 const error=message=>{throw new Error(message);};
 const transitions=new WeakMap();
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
 function proposal(snapshot,edits,{splits=[],requestId}={}){
  if(!idsOK(snapshot?.cellIds)||typeof snapshot.revision!=='string'||!Array.isArray(edits)||edits.length>20||new Set(edits.map(edit=>edit?.id)).size!==edits.length||!Array.isArray(splits)||splits.length>20||!edits.length&&!splits.length)error('Invalid selected-cell edit.');
  if(edits.some(edit=>!edit||Object.keys(edit).some(key=>!['id','source'].includes(key))||!snapshot.cellIds.includes(edit.id)||typeof edit.source!=='string'||edit.source.length>20000)||edits.reduce((sum,edit)=>sum+edit.source.length,0)>60000)error('The edit exceeds the selected cell scope.');
  const ipynb=JSON.parse(snapshot.revision),changes=new Map(edits.map(edit=>[edit.id,edit.source]));
  const partitions=new Map(),addedCellIds=[],allIds=ipynb.cells.map(cell=>cell.id),usedIds=new Set(allIds);
  if(splits.length&&(typeof requestId!=='string'||!/^[\w-]{8,80}$/.test(requestId)))error('Notebook splitting needs a stable request identity.');
  for(const split of splits){
   if(!split||Object.keys(split).some(key=>!['id','offsets'].includes(key))||!snapshot.cellIds.includes(split.id)||changes.has(split.id)||partitions.has(split.id)||!Array.isArray(split.offsets)||!split.offsets.length||split.offsets.length>3)error('Invalid selected-cell split.');
   const cell=ipynb.cells.find(value=>value.id===split.id);
   if(!cell||!['code','markdown'].includes(cell.cell_type))error('Only code and Markdown cells can be split.');
   if(!(typeof cell.source==='string'||Array.isArray(cell.source)&&cell.source.every(line=>typeof line==='string')))error('Cell source must contain only text.');
   const source=Array.isArray(cell.source)?cell.source.join(''):cell.source;
   if(typeof source!=='string'||split.offsets.some((offset,index)=>!Number.isSafeInteger(offset)||offset<=(index?split.offsets[index-1]:0)||offset>=source.length||/[\uD800-\uDBFF]/.test(source[offset-1])&&/[\uDC00-\uDFFF]/.test(source[offset])))error('Split boundaries must preserve nonempty source and Unicode characters.');
   const bounds=[0,...split.offsets,source.length];
   partitions.set(split.id,bounds.slice(1).map((end,index)=>{
    const id=index===0?cell.id:`split_${requestId.slice(0,40)}_${allIds.indexOf(cell.id)}_${index}`;
    if(index&&usedIds.has(id))error('A split cell identity already exists.');
    if(index){usedIds.add(id);addedCellIds.push(id);}
    return {...cell,id,source:source.slice(bounds[index],end),metadata:index?{}:cell.metadata};
   }));
  }
  if(addedCellIds.length>20||ipynb.cells.length+addedCellIds.length>1000)error('The split exceeds the notebook cell limit.');
  let stale=false;const staleCellIds=[];
  const cells=ipynb.cells.flatMap(cell=>{
   if(partitions.has(cell.id)){
    if(cell.cell_type==='code')stale=true;
    return partitions.get(cell.id).map(part=>{
     if(part.cell_type!=='code')return part;
     staleCellIds.push(part.id);return {...part,outputs:[],execution_count:null};
    });
   }
   let next=cell;
   if(changes.has(cell.id)){
    if(!['code','markdown'].includes(cell.cell_type))error('Only code and Markdown source can be edited.');
    const source=Array.isArray(cell.source)?cell.source.join(''):cell.source;
    if(source!==changes.get(cell.id)){next={...cell,source:changes.get(cell.id)};if(cell.cell_type==='code')stale=true;}
   }
   if(stale&&cell.cell_type==='code'){staleCellIds.push(cell.id);next={...next,outputs:[],execution_count:null};}
   return next;
  });
  const after={...ipynb,cells};
  if(JSON.stringify(after).length>1000000)error('The split exceeds the notebook document limit.');
  return {ipynb:after,staleCellIds,addedCellIds};
 }
 async function apply(widget,input){
  const current=capture(widget);
  if(input?.path!==current.path||input.expectedRevision!==current.revision||!same(input.cellIds,current.cellIds))error('The notebook or selected cells changed. Request a new preview.');
  const result=proposal(current,input.edits,{splits:input.splits,requestId:input.requestId});
  widget.context.model.fromJSON(result.ipynb);
  // Existing workspace persistence only; no kernel/execution API is used.
  try{await widget.context.save();}catch{
   if(JSON.stringify(widget.context.model.toJSON())===JSON.stringify(result.ipynb))widget.context.model.fromJSON(current.ipynb);
   error('The notebook workspace could not save the edit.');
  }
  if(!same(widget.context.model.toJSON(),result.ipynb))error('The notebook changed while saving. Request a new preview.');
  if(result.addedCellIds.length){
   const held=transitions.get(widget)||[];
   held.push({path:current.path,before:current.revision,after:JSON.stringify(result.ipynb)});
   if(held.length>20)held.shift();
   transitions.set(widget,held);
  }
  return {...result,path:current.path,cellIds:current.cellIds,revision:JSON.stringify(result.ipynb)};
 }
 async function restore(widget,input){
  const current=capture(widget,{requireSelection:false}),next=input?.ipynb;
  if(current.path!==input.path||current.revision!==input.expectedRevision)error('The live notebook changed; its saved canvas revision was not substituted.');
  if(!next||next.nbformat!==4||!Array.isArray(next.cells)||JSON.stringify(next).length>1000000)error('The notebook revision is incompatible.');
  if(!same(next.cells.map(cell=>cell.id),current.ipynb.cells.map(cell=>cell.id))){
   const revision=JSON.stringify(next);
   const known=(transitions.get(widget)||[]).some(entry=>entry.path===current.path&&(entry.before===current.revision&&entry.after===revision||entry.after===current.revision&&entry.before===revision));
   if(!known)error('This notebook topology change has no matching edit receipt.');
  }
  widget.context.model.fromJSON(next);
  try{await widget.context.save();}catch{if(same(widget.context.model.toJSON(),next))widget.context.model.fromJSON(current.ipynb);error('The notebook revision could not be saved.');}
  if(!same(widget.context.model.toJSON(),next))error('The notebook changed while restoring.');
  return {path:current.path,cellIds:current.cellIds,ipynb:next,revision:JSON.stringify(next)};
 }
 globalThis.RHNotebookCells=Object.freeze({capture,proposal,apply,restore});
})();
