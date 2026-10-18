// Mounted notebook frames own these handles. No guessed cells or saved-copy fallback.
const editors=new Map();
export function registerNotebookEditor(id,editor){editors.set(id,editor);return()=>{if(editors.get(id)===editor)editors.delete(id);};}
export function notebookEditor(id){const editor=editors.get(id);if(!editor)throw new Error('Open this notebook and select its cells before editing.');return editor;}
