(() => {
  const composer = document.getElementById('rh-composer');
  const form = composer.querySelector('form');
  const message = document.getElementById('rh-message');
  const draftField = message.closest('.rh-draft');
  const send = document.getElementById('rh-send');
  const status = document.getElementById('rh-composer-status');
  const reasoning = composer.querySelector('[data-reason-more]');
  const depthMenu = composer.querySelector('[data-composer-menu="depth"]');
  const depthTrigger = depthMenu.querySelector('summary');
  const depthChoices = [...depthMenu.querySelectorAll('[data-depth]')];
  const slashMenu = composer.querySelector('[data-composer-menu="slash"]');
  const picker = slashMenu.querySelector('[data-slash-picker]');
  const search = picker.querySelector('input');
  const menus = [...composer.querySelectorAll('.rh-menu')];
  let streaming = false;

  function updateSend() {
    const label = streaming ? 'Stop' : 'Send';
    send.disabled = !streaming && !message.value.trim();
    send.dataset.streaming = String(streaming);
    send.setAttribute('aria-label', label);
    send.title = label;
    send.querySelector('use').setAttribute('href', '../../../icons/source-headers.svg#i-' + (streaming ? 'Square' : 'ArrowUp'));
  }

  function fitMessage() {
    message.style.height = 'auto';
    message.style.height = message.scrollHeight + 'px';
  }

  function updateDraft() {
    fitMessage();
    updateSend();
  }

  message.addEventListener('input', updateDraft);
  let width = draftField.clientWidth;
  new ResizeObserver(() => {
    if (width === draftField.clientWidth) return;
    width = draftField.clientWidth;
    fitMessage();
  }).observe(draftField);

  message.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!streaming && !send.disabled) form.requestSubmit();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (send.disabled) return;
    const draft = message.value.trim();
    if (!streaming && !form.dispatchEvent(new CustomEvent('chat-send', { detail: draft, bubbles: true, cancelable: true }))) return;
    streaming = !streaming;
    updateSend();
    status.textContent = streaming ? 'Streaming preview.' : 'Preview stopped.';
  });

  function closeMenu(menu) {
    menu.open = false;
    menu.querySelector('summary').focus();
  }

  menus.forEach(menu => menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    menus.forEach(other => { if (other !== menu) other.open = false; });
    if (menu === slashMenu) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
      search.focus();
    } else if (menu === depthMenu && document.activeElement === depthTrigger) {
      depthMenu.querySelector('[aria-checked="true"]').focus();
    }
  }));
  document.addEventListener('click', event => {
    const clickedMenu = event.target.closest('.rh-menu');
    menus.forEach(menu => { if (menu !== clickedMenu) menu.open = false; });
  });
  composer.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const open = menus.find(menu => menu.open);
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(open);
    }
  });
  composer.querySelectorAll('[data-rh-demo]').forEach(button => button.addEventListener('click', () => {
    status.textContent = button.dataset.rhDemo + ' preview.';
    const menu = button.closest('details');
    if (menu) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  }));

  depthChoices.forEach(button => button.addEventListener('click', () => {
    depthChoices.forEach(choice => choice.setAttribute('aria-checked', String(choice === button)));
    depthTrigger.querySelector('[data-depth-label]').textContent = button.dataset.depth;
    depthTrigger.querySelector('.rh-depth-glyph use').setAttribute('href', button.querySelector('.rh-depth-glyph use').getAttribute('href'));
    depthTrigger.setAttribute('aria-label', 'Answer detail: ' + button.dataset.depth);
    depthTrigger.title = 'Answer detail: ' + button.dataset.depth;
    closeMenu(depthMenu);
  }));

  depthMenu.addEventListener('keydown', event => {
    if (event.key === 'Tab' && depthMenu.open) {
      closeMenu(depthMenu);
      return;
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = depthChoices.indexOf(event.target);
    const size = depthChoices.length;
    depthMenu.open = true;
    if (event.key === 'Home') depthChoices[0].focus();
    else if (event.key === 'End') depthChoices[size - 1].focus();
    else if (current < 0) depthMenu.querySelector('[aria-checked="true"]').focus();
    else {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      depthChoices[(current + step + size) % size].focus();
    }
  });

  picker.addEventListener('chat-command-pick', event => {
    const { text } = splitPreviewCommand(picker, message.value);
    message.value = event.detail + ' ' + text;
    slashMenu.open = false;
    updateDraft();
    message.focus();
  });

  reasoning.addEventListener('click', () => {
    reasoning.setAttribute('aria-pressed', String(reasoning.getAttribute('aria-pressed') !== 'true'));
  });

  updateDraft();
})();
