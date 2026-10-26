// The cutover switch for the native Whiteboard (docs/features/tldraw-removal.md, workstream X). Until X, the tldraw card is the
// default and the native card is opt-in: a build with VITE_NATIVE_WHITEBOARD=true, or one browser with localStorage
// 'rh.nativeWhiteboard' = '1' (how the browser check turns it on). X replaces this body with `true` and deletes WhiteboardBlock.jsx.
export const nativeWhiteboard = () => {
  if (import.meta.env.VITE_NATIVE_WHITEBOARD === 'true') return true;
  try { return localStorage.getItem('rh.nativeWhiteboard') === '1'; } catch { return false; }
};
