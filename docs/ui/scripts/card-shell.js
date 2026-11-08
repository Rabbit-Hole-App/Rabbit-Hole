
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

    const getTemplate = id => document.getElementById(id).content.firstElementChild.cloneNode(true);
    let cardId = 0;

    // The visual and the controls are independent slots. The shell owns dimensions and scroll.
    function createCard({ type, title, subtitle = '', concept, instruction = '', visual = null, caption = '' }) {
      const node = getTemplate('card-shell');
      const slot = name => node.querySelector(`[data-slot="${name}"]`);
      const titleId = `card-title-${++cardId}`;
      slot('title').id = titleId;
      slot('title').textContent = title;
      slot('subtitle').textContent = subtitle;
      slot('subtitle').hidden = !subtitle;
      node.setAttribute('aria-labelledby', titleId);
      node.dataset.command = type === 'explain' ? '/explain' : '/interactive';
      slot('pill').classList.add(type);
      slot('pill').textContent = type === 'explain' ? 'Explanation' : 'Interactive';
      slot('body').setAttribute('aria-label', `${title} content`);
      slot('concept').textContent = concept;
      slot('instruction').textContent = instruction;
      slot('instruction').hidden = !instruction;
      const handle = node.querySelector('.resize-handle');
      handle.setAttribute('aria-label', `Resize ${title}`);
      installResize(node, handle);
      function setVisual(element, text = '') {
        slot('visual').replaceChildren(...(element ? [element] : []));
        slot('figure').hidden = !element;
        slot('caption').textContent = text;
        slot('caption').hidden = !text;
      }
      setVisual(visual, caption);
      return {
        node,
        setVisual,
        headerActions: slot('header-actions'),
        controls: slot('controls'),
        showReason(message, decision) {
          slot('why').dataset.decision = decision;
          slot('why').hidden = !message;
          slot('reason').textContent = message;
        },
      };
    }

    function showExample(label, card) {
      const demo = document.createElement('section');
      demo.className = 'demo';
      const name = document.createElement('p');
      name.className = 'demo-label';
      name.textContent = label;
      demo.append(name, card.node);
      document.getElementById('examples').append(demo);
    }

