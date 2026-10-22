// The wheel and pinch over a card's own content (a captured webpage, a 3D viewport) belong to that content (owner, 2026-10-22):
// they never also pan or zoom the canvas, and never zoom the browser page. Chrome and Edge report a trackpad pinch as a
// Ctrl+wheel; Safari as gesturestart / gesturechange / gestureend (and may add Ctrl+wheels, ignored while a gesture runs).
//
// Native, non-passive listeners on the content element: the canvas's wheel listener is native on an ancestor, so in the bubble
// phase the content's runs first and its stopPropagation holds. React's onWheel cannot do this: React listens at its root,
// after the canvas has already moved (the 3D-and-canvas double zoom of 2026-10-22).
//
// wheel(event): handle the wheel (the content scrolls or zooms). Return false to let it go on to the canvas (a scroll-locked
// webpage's plain wheel). Every other wheel, and every gesture event, is held here: preventDefault and stopPropagation.
// scale(factor, clientX, clientY): a Safari pinch step, factor > 1 zooms in.
export function holdContentGestures(element, { wheel, scale }) {
  let pinch = null; // the gesture's scale at its last step, while a Safari pinch runs
  const hold = event => { event.preventDefault(); event.stopPropagation(); };
  const onWheel = event => {
    if (!((event.ctrlKey || event.metaKey) && pinch != null) && wheel(event) === false) return;
    hold(event);
  };
  const onGesture = event => {
    hold(event);
    if (event.type === 'gesturestart') pinch = 1;
    else if (event.type === 'gestureend') pinch = null;
    else if (pinch != null && event.scale > 0) { scale(event.scale / pinch, event.clientX, event.clientY); pinch = event.scale; }
  };
  const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
  element.addEventListener('wheel', onWheel, { passive: false });
  for (const type of gestures) element.addEventListener(type, onGesture, { passive: false });
  return () => {
    element.removeEventListener('wheel', onWheel);
    for (const type of gestures) element.removeEventListener(type, onGesture);
  };
}

// A wheel's vertical delta in pixels (line and page modes converted, as OrbitControls and browsers do).
export const wheelPixels = event => event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);

// A wheel as a 3D dolly factor (> 1 moves closer), as OrbitControls reads a wheel: 5% per 100 px; a trackpad pinch (Ctrl+wheel
// with small deltas) ten times stronger. shortcut: a real Ctrl+mouse wheel sends large deltas, so the size tells them apart.
export const dollyFactor = event => Math.pow(0.95, wheelPixels(event) * 0.01 * ((event.ctrlKey || event.metaKey) && Math.abs(event.deltaY) < 50 ? 10 : 1));

// A live 3D viewport: hover is enough. The wheel and pinch dolly the model (engine().zoom) and never reach the canvas. While the
// viewer is interacting, OrbitControls on its own canvas has taken the wheel already (it calls preventDefault): no second zoom.
export const holdViewerGestures = (element, engine) => holdContentGestures(element, {
  wheel: event => { if (!event.defaultPrevented) engine()?.zoom(dollyFactor(event)); },
  scale: factor => engine()?.zoom(factor),
});
