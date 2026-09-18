// The whiteboard's "Ask selection" pill lives in the node header, while the
// tldraw editor lives in the block. This tiny registry joins them without
// pulling tldraw into the canvas chunk.
const asks = new Map();
export const registerBoardAsk = (id, controls) => { asks.set(id, controls); return () => asks.delete(id); };
export const boardAsk = id => asks.get(id);
