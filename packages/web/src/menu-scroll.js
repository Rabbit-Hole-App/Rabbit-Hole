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
