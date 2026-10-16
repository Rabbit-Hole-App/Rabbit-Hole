// A portaled menu (ui.jsx Menu) is placed where its anchor was when it opened. A scroll that moves the anchor would leave
// it floating, so that scroll closes it; a scroll that does not move the anchor (the one the opening click itself caused
// before the menu measured it, or one elsewhere on the page) leaves it open. Without an anchor, any scroll closes it.
export function closeOnAnchorScroll(anchor, onClose) {
  const at = anchor?.getBoundingClientRect();
  return () => {
    const now = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    if (!now || Math.abs(now.top - at.top) > 1 || Math.abs(now.left - at.left) > 1) onClose();
  };
}

// Where a portaled menu moves to stay inside the window (owner bug, 2026-10-16: the project ⋯ beside a short project name
// opened 100px past the window's left edge, its labels cut off). `box` is its measured rectangle where its caller put it
// (menuAt: right edge on the button's, below or above it); the result is the shift that keeps every edge `pad` inside the
// window, the left and top edges winning when it is wider or taller than the window. The caller's above/below choice
// stays: the menu only slides, and Menu caps the height of one taller than the window first.
export function menuShift(box, width, height, pad = 8) {
  return {
    x: Math.max(pad - box.left, Math.min(0, width - pad - box.right)),
    y: Math.max(pad - box.top, Math.min(0, height - pad - box.bottom)),
  };
}
