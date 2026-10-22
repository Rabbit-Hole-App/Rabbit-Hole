// Mounted notebook frames own these handles. No guessed cells or saved-copy fallback.
const editors=new Map();
// Transport correlation and trusted edit identity must never share a field.
export const notebookCellRequest=(extra,requestId)=>({...extra,operationId:extra.requestId,requestId});
export function registerNotebookEditor(id,editor){editors.set(id,editor);return()=>{if(editors.get(id)===editor)editors.delete(id);};}
export function notebookEditor(id){const editor=editors.get(id);if(!editor)throw new Error('Open this notebook and select its cells before editing.');return editor;}
// The same mounted handles for the canvas menu's Run all / Restart (UI-25): null while the card is not mounted.
export const notebookActions=id=>editors.get(id)||null;
