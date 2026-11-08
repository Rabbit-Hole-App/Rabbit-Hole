
  (() => {
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

    const composer = document.getElementById('rh-composer');
    const form = document.getElementById('rh-composer-form');
    const message = document.getElementById('rh-message');
    const send = document.getElementById('rh-send');
    const depth = document.getElementById('rh-depth');
    const help = document.getElementById('rh-depth-help');
    const status = document.getElementById('rh-composer-status');
    const depthHelp = { Overview:'The central idea in a short explanation.', Standard:'A balanced explanation.', Deep:'Reasoning, a worked example and edge cases.' };
    let streaming = false;
    function updateSend() {
      send.disabled = !streaming && !message.value.trim();
      send.dataset.streaming = String(streaming);
      send.querySelector('span').textContent = streaming ? 'Stop' : 'Send';
      send.querySelector('use').setAttribute('href',streaming ? '../../../icons/source-headers.svg#i-Square' : '../../../icons/source-headers.svg#i-ArrowUp');
    }
    function fitMessage() {
      message.style.height = 'auto';
      const borderHeight = message.offsetHeight - message.clientHeight;
      message.style.height = `${message.scrollHeight + borderHeight}px`;
    }

    let messageWidth = message.clientWidth;
    new ResizeObserver(() => {
      if (messageWidth === message.clientWidth) return;
      messageWidth = message.clientWidth;
      fitMessage();
    }).observe(message);

    message.addEventListener('input',() => {
      fitMessage();
      updateSend();
    });
    depth.addEventListener('change',() => { help.textContent = depthHelp[depth.value]; });
    form.addEventListener('submit',event => {
      event.preventDefault();
      if (send.disabled) return;
      streaming = !streaming;
      updateSend();
      status.textContent = streaming ? 'Streaming preview.' : 'Preview stopped.';
    });
    for (const button of composer.querySelectorAll('[data-rh-demo]')) {
      button.addEventListener('click',() => { status.textContent = button.dataset.rhDemo; });
    }
    installResize(composer,composer.querySelector('.resize-handle'));
    fitMessage();
    updateSend();
  })();
