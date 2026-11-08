
function cardSize(width, height, availableWidth) {
  const maxWidth = Math.max(0, availableWidth);
  return {
    width: Math.min(maxWidth, Math.max(300, width)),
    height: Math.min(760, Math.max(245, height)),
  };
}

function installResize(card, handle) {
  let drag = null;

  function setSize(width, height) {
    const parent = card.parentElement;
    const style = getComputedStyle(parent);
    const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const size = cardSize(width, height, parent.clientWidth - padding);
    card.style.setProperty('--card-width', `${size.width}px`);
    card.style.setProperty('--card-height', `${size.height}px`);
  }

  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    const { width, height } = card.getBoundingClientRect();
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width, height };
    handle.setPointerCapture(event.pointerId);
    card.classList.add('is-resizing');
    handle.focus({ preventScroll: true });
    event.preventDefault();
  });

  handle.addEventListener('pointermove', event => {
    if (drag?.pointerId !== event.pointerId) return;
    setSize(drag.width + event.clientX - drag.x, drag.height + event.clientY - drag.y);
  });

  function finish(event) {
    if (drag?.pointerId !== event.pointerId) return;
    drag = null;
    card.classList.remove('is-resizing');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }

  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);

  handle.addEventListener('keydown', event => {
    const axes = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const axis = axes[event.key];
    if (!axis) return;
    const { width, height } = card.getBoundingClientRect();
    const step = event.shiftKey ? 48 : 16;
    setSize(width + step * axis[0], height + step * axis[1]);
    event.preventDefault();
  });
}

