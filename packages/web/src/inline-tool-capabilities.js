// Shared browser/worker capability contract. Registration is not execution authorization.
export const INLINE_TOOL_LIMITS = Object.freeze({ steps: 4, targets: 20 });
const ALL = ['shape','connector','card','text','image','equation','code','notebook','table','source'];
const define = (modes,kinds,reads,writes,output,runtime,spend='none',background=false) => Object.freeze({
  modes:Object.freeze(modes),kinds:Object.freeze(kinds),reads:Object.freeze(reads),writes:Object.freeze(writes),output,runtime,spend,
  execution:background?'background':'immediate',preview:'required-before-mutation',apply:'single-transaction',
  cancellation:background?'cancel-job-and-ignore-late-result':'discard-preview',recovery:background?'durable-job-and-immutable-artifact':'revalidate-frozen-selection',
});
export const INLINE_TOOLS = Object.freeze({
  inspect_selection:define(['edit','explain'],ALL,['selected-content','properties','connections'],[],'inspection','canvas'),
  read_source_range:define(['edit','explain'],['source','image','notebook','table','code'],['authorized-explicit-source-range'],[],'inspection','source-access'),
  set_appearance:define(['edit'],['shape','connector','text'],['selected-properties'],['appearance'],'selection-update','canvas'),
  arrange_selection:define(['edit'],['shape','connector','card','text','image','equation','code','notebook','table'],['measured-bounds','connections'],['layout'],'selection-update','canvas'),
  edit_diagram:define(['edit'],['shape','connector','card'],['selected-graph','dependencies'],['graph'],'graph-change','canvas'),
  remove_background:define(['edit'],['image'],['authorized-image','explicit-subject-region'],['image-revision'],'image-revision','background-removal','adapter-defined',true),
  edit_image:define(['edit'],['image'],['authorized-image','explicit-mask'],['image-revision'],'image-revision','image-edit','provider',true),
  transform_image:define(['edit'],['image'],['authorized-image'],['image-revision'],'image-revision','image-transform'),
  edit_notebook_cells:define(['edit'],['notebook'],['selected-cells'],['cell-content','output-staleness'],'cell-change','notebook'),
  transform_table:define(['edit'],['table'],['selected-table','declared-units'],['table-cells'],'table-change','table'),
  extract_content:define(['edit','explain'],['image','source'],['authorized-explicit-source-range'],['derived-content'],'derived-content','extraction','adapter-defined'),
  annotate_selection:define(['edit','explain'],ALL,['selected-content'],['annotations'],'annotations','canvas'),
  reconstruct_diagram:define(['edit','explain'],['image','source'],['authorized-image'],['derived-graph'],'graph-change','reconstruction','provider'),
  compare_selection:define(['explain'],ALL,['selected-content','authorized-explicit-source-range'],['derived-content'],'explanation','comparison','provider'),
  compute:define(['edit','explain'],['equation','code','table','text'],['selected-content','declared-units'],['derived-content'],'calculation','computation'),
  run_code:define(['edit','explain'],['code','notebook'],['selected-code','explicit-inputs'],['execution-result'],'execution-result','isolated-code','adapter-defined',true),
  find_evidence:define(['edit','explain'],ALL,['authorized-explicit-source-range'],['derived-evidence'],'evidence','evidence','adapter-defined'),
  create_learning_artifact:define(['explain'],ALL,['selected-content'],['derived-content'],'learning-artifact','existing-artifact','adapter-defined'),
});
const own = (object,key) => Object.hasOwn(object || {},key);
export function inlineToolAvailability(name,{mode,selection=[],readOnly=false,adapters={}}={}) {
  if(!own(INLINE_TOOLS,name))return {available:false,reason:'Unknown capability.'};
  const tool=INLINE_TOOLS[name];
  if(!tool.modes.includes(mode))return {available:false,reason:'This tool does not support the selected mode.'};
  if(!selection.length || selection.some(entry=>!tool.kinds.includes(entry.kind)))return {available:false,reason:'This tool does not support every selected object.'};
  if(tool.writes.length && readOnly)return {available:false,reason:'This canvas is read-only.'};
  if(tool.writes.length && mode==='edit' && selection.some(entry=>entry.locked))return {available:false,reason:'The selection contains a locked object.'};
  if(!own(adapters,name)||adapters[name]?.available!==true)return {available:false,reason:own(adapters,name)&&typeof adapters[name]?.reason==='string'?adapters[name].reason:'This tool is not configured.'};
  return {available:true};
}
// Envelope only: adapters must validate their own inputs and frozen revision/bounds
// preconditions, and the server must authorize every source before executing.
export function validateInlineToolPlan(plan,{mode,selection=[],readOnly=false,adapters={},executionRequested=false}={}) {
  const fail=reason=>({ok:false,reason});
  if(!plan||plan.mode!==mode||!['edit','explain'].includes(mode))return fail('The request mode changed.');
  if(!selection.length||selection.length>INLINE_TOOL_LIMITS.targets||new Set(selection.map(item=>item.id)).size!==selection.length||selection.some(item=>typeof item.id!=='string'||!item.id))return fail('Invalid frozen selection.');
  const ids=selection.map(item=>item.id);
  if(!Array.isArray(plan.targetIds)||plan.targetIds.length!==ids.length||new Set(plan.targetIds).size!==ids.length||plan.targetIds.some(id=>!ids.includes(id)))return fail('The request targets changed.');
  if(!Array.isArray(plan.steps)||!plan.steps.length||plan.steps.length>INLINE_TOOL_LIMITS.steps)return fail('The tool-step limit was exceeded.');
  for(const step of plan.steps){
    if(!step||!Array.isArray(step.targetIds)||!step.targetIds.length||new Set(step.targetIds).size!==step.targetIds.length||step.targetIds.some(id=>!ids.includes(id)))return fail('A tool targets material outside the frozen selection.');
    const result=inlineToolAvailability(step.tool,{mode,selection:selection.filter(item=>step.targetIds.includes(item.id)),readOnly,adapters});
    if(!result.available)return fail(result.reason);
    if(step.tool==='run_code'&&!executionRequested)return fail('Code execution requires an explicit execution request.');
    if(!step.input||typeof step.input!=='object'||Array.isArray(step.input))return fail('Tool input must be an object.');
  }
  return {ok:true};
}
