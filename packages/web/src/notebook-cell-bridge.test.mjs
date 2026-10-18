import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {previewNotebookCellEdit} from './inline-notebook-edit.js';
const scope=vm.createContext({});vm.runInContext(readFileSync(new URL('../notebook-canvas/cell-tools.js',import.meta.url),'utf8'),scope);const tools=scope.RHNotebookCells;
const original={nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'a',cell_type:'code',source:'x=1',outputs:[{text:'old'}],execution_count:1,metadata:{}},{id:'b',cell_type:'code',source:'x+1',outputs:[{text:'2'}],execution_count:2,metadata:{}}]};
function fixture(){let value=structuredClone(original),saved=0;const widget={context:{path:'notebook.ipynb',model:{toJSON:()=>structuredClone(value),fromJSON:next=>{value=structuredClone(next);}},save:async()=>{saved++;}},content:{model:{cells:{}},widgets:[{model:{id:'a'}},{model:{id:'b'}}],isSelectedOrActive:cell=>cell.model.id==='a'}};return{widget,get:()=>value,saved:()=>saved};}
test('captures actual explicit cell selection and refuses missing selection',()=>{const {widget}=fixture();assert.equal(JSON.stringify(tools.capture(widget).cellIds),'["a"]');widget.content.isSelectedOrActive=()=>false;assert.throws(()=>tools.capture(widget),/Select one/);});
test('guarded apply edits selected source, invalidates downstream outputs and saves without execution',async()=>{const f=fixture(),before=tools.capture(f.widget);const result=await tools.apply(f.widget,{path:before.path,cellIds:before.cellIds,expectedRevision:before.revision,edits:[{id:'a',source:'x=3'}]});assert.equal(f.get().cells[0].source,'x=3');assert.equal(f.get().cells[1].source,'x+1');assert.equal(JSON.stringify(result.staleCellIds),'["a","b"]');assert.ok(f.get().cells.every(cell=>cell.outputs.length===0&&cell.execution_count===null));assert.equal(f.saved(),1);});
test('stale document, changed selection and out-of-scope source fail without saving',async()=>{for(const mutation of ['document','selection','scope']){const f=fixture(),before=tools.capture(f.widget);if(mutation==='document')f.widget.context.model.fromJSON({...original,metadata:{changed:true}});if(mutation==='selection')f.widget.content.isSelectedOrActive=cell=>cell.model.id==='b';await assert.rejects(()=>tools.apply(f.widget,{path:before.path,cellIds:before.cellIds,expectedRevision:before.revision,edits:[{id:mutation==='scope'?'b':'a',source:'new'}]}));assert.equal(f.saved(),0);}});

test('Undo restores guarded source and outputs without requiring a current cell selection',async()=>{const f=fixture(),before=tools.capture(f.widget);const applied=await tools.apply(f.widget,{path:before.path,cellIds:before.cellIds,expectedRevision:before.revision,edits:[{id:'a',source:'x=3'}]});f.widget.content.isSelectedOrActive=()=>false;await tools.restore(f.widget,{path:before.path,expectedRevision:applied.revision,ipynb:original});assert.deepEqual(f.get(),original);assert.equal(f.saved(),2);});
test('save failure restores original source, but never overwrites concurrent changes',async()=>{for(const concurrent of [false,true]){const f=fixture(),before=tools.capture(f.widget);f.widget.context.save=async()=>{if(concurrent)f.widget.context.model.fromJSON({...original,metadata:{live:true}});throw new Error('disk');};await assert.rejects(()=>tools.apply(f.widget,{path:before.path,cellIds:before.cellIds,expectedRevision:before.revision,edits:[{id:'a',source:'new'}]}),/could not save/);assert.deepEqual(f.get(),concurrent?{...original,metadata:{live:true}}:original);}});
test('changes during successful save refuse stale parent publication',async()=>{const f=fixture(),before=tools.capture(f.widget);f.widget.context.save=async()=>f.widget.context.model.fromJSON({...original,metadata:{live:true}});await assert.rejects(()=>tools.apply(f.widget,{path:before.path,cellIds:before.cellIds,expectedRevision:before.revision,edits:[{id:'a',source:'new'}]}),/changed while saving/);assert.deepEqual(f.get().metadata,{live:true});});
test('split bridge and pure preview agree exactly and known topology supports guarded Undo/Redo',async()=>{
 const f=fixture(),before=tools.capture(f.widget),requestId='request-split-123',splits=[{id:'a',offsets:[2]}];
 const block={id:'block',type:'notebook',notebook_id:'workspace',active_path:before.path,ipynb_path:before.path,ipynb:structuredClone(original)};
 const frozen={id:block.id,notebookId:block.notebook_id,path:before.path,cellIds:['a'],revision:before.revision};
 const preview=previewNotebookCellEdit({targetId:block.id,cellIds:['a'],edits:[],splits},{block,frozen,requestId});assert.equal(preview.ok,true);
 const applied=await tools.apply(f.widget,{path:before.path,cellIds:before.cellIds,expectedRevision:before.revision,edits:[],splits,requestId});
 assert.equal(JSON.stringify(applied.ipynb),JSON.stringify(preview.changes[0].after.ipynb));
 f.widget.content.isSelectedOrActive=()=>false;
 await tools.restore(f.widget,{path:before.path,expectedRevision:applied.revision,ipynb:original});assert.deepEqual(f.get(),original);
 await tools.restore(f.widget,{path:before.path,expectedRevision:JSON.stringify(original),ipynb:applied.ipynb});assert.equal(JSON.stringify(f.get()),applied.revision);assert.equal(f.saved(),3);
});
test('arbitrary topology cannot use split Undo permission',async()=>{
 const f=fixture(),before=tools.capture(f.widget);
 const arbitrary={...original,cells:[...original.cells,{id:'extra',cell_type:'markdown',source:'injected',metadata:{}}]};
 await assert.rejects(()=>tools.restore(f.widget,{path:before.path,expectedRevision:before.revision,ipynb:arbitrary}),/matching edit receipt/);assert.equal(f.saved(),0);
});
test('failed split save preserves concurrent work and creates no topology receipt',async()=>{
 const f=fixture(),before=tools.capture(f.widget);f.widget.context.save=async()=>{f.widget.context.model.fromJSON({...original,metadata:{live:true}});throw Error('disk');};
 await assert.rejects(()=>tools.apply(f.widget,{path:before.path,cellIds:before.cellIds,expectedRevision:before.revision,edits:[],splits:[{id:'a',offsets:[2]}],requestId:'request-split-123'}),/could not save/);
 assert.deepEqual(f.get(),{...original,metadata:{live:true}});
});
test('malformed imported source arrays are rejected by both split paths without saving',async()=>{
 const f=fixture();f.widget.context.model.fromJSON({...original,cells:[{...original.cells[0],source:['x',42]},original.cells[1]]});
 const before=tools.capture(f.widget),requestId='request-malformed',splits=[{id:'a',offsets:[1]}];
 const block={id:'block',type:'notebook',notebook_id:'workspace',active_path:before.path,ipynb_path:before.path,ipynb:f.get()};
 const frozen={id:block.id,notebookId:block.notebook_id,path:before.path,cellIds:['a'],revision:before.revision};
 assert.equal(previewNotebookCellEdit({targetId:block.id,cellIds:['a'],edits:[],splits},{block,frozen,requestId}).ok,false);
 await assert.rejects(()=>tools.apply(f.widget,{path:before.path,cellIds:before.cellIds,expectedRevision:before.revision,edits:[],splits,requestId}),/only text/);assert.equal(f.saved(),0);
});
