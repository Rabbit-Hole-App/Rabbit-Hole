// "Mention a canvas" (the Chat composer's + menu): the context ref a mention attaches, shared by the browser and the server
// (control-plane chat-modes.js, canvases.js, canvas-refs.js). The ref is the canvas's main board id and nothing else: the
// server reads the title and content under the asker's access at Send, and the pill reads its title the same way, so a
// title is never stored in a ref and an unavailable canvas never shows one.
export const CANVAS_SOURCE = /^canvas:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const CANVAS_MENTIONS = 3; // canvases one question reads at most
export const CANVAS_REF_NAME = 'Canvas'; // every canvas ref's stored name
export const canvasMentionRef = boardId => ({ sourceId: `canvas:${String(boardId).toLowerCase()}`, kind: 'canvas', name: CANVAS_REF_NAME, version: '', range: null });
export const canvasBoardId = sourceId => (CANVAS_SOURCE.test(String(sourceId)) ? sourceId.slice('canvas:'.length) : null);
