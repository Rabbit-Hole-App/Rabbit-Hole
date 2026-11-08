
  const toastRegion = document.getElementById('demo-toasts');
  const dialogOpeners = new WeakMap();
  const toneIcon = { success:'CircleCheck', info:'Info', warning:'TriangleAlert', error:'CircleAlert' };
  const toneMessage = { success:'Changes saved.', info:'Link copied.', warning:'Connection interrupted.', error:'Couldn’t save changes.' };

  function makeIcon(name) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace,'svg');
    const use = document.createElementNS(namespace,'use');
    svg.setAttribute('class','icon');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('aria-hidden','true');
    use.setAttribute('href',`../../../icons/standards.svg#i-${name}`);
    svg.append(use);
    return svg;
  }

  function showToast(tone, message) {
    if (!Object.hasOwn(toneIcon,tone)) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.tone = tone;
    toast.setAttribute('role',tone === 'error' ? 'alert' : 'status');
    const label = document.createElement('div');
    label.textContent = message || toneMessage[tone];
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'icon-button';
    dismiss.dataset.dismissToast = '';
    dismiss.setAttribute('aria-label','Dismiss toast');
    dismiss.append(makeIcon('X'));
    toast.append(makeIcon(toneIcon[tone]),label,dismiss);
    toastRegion.append(toast);
    if (tone !== 'error') setTimeout(() => toast.remove(),3000);
  }

  function updateRange(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value);
    input.style.setProperty('--range-fill',`${100 * (value-min) / Math.max(1,max-min)}%`);
    const output = input.closest('.sample-row')?.querySelector('[data-range-output]');
    if (output) output.textContent = `${value} of ${max}`;
  }

  function updateOutline(input) {
    const list = input.closest('.toc-list');
    if (!list) return;
    const row = input.closest('.toc-row');
    if (row.dataset.status !== 'active') {
      row.dataset.status = input.checked ? 'complete' : 'upcoming';
      row.querySelector('.status-text').textContent = input.checked ? 'Complete' : 'Upcoming';
    }
    const total = list.querySelectorAll('input[type="checkbox"]').length;
    const done = list.querySelectorAll('input[type="checkbox"]:checked').length;
    const progress = list.parentElement.querySelector('progress');
    progress.value = done;
    progress.previousElementSibling.querySelector('.status-text').textContent = `${done} of ${total} complete`;
  }

  document.addEventListener('input',event => {
    const input = event.target;
    if (input.matches('input[type="range"]')) updateRange(input);
  });
  document.addEventListener('change',event => {
    if (event.target.matches('.toc-completion input')) updateOutline(event.target);
  });
  document.addEventListener('click',event => {
    const target = event.target.closest('button');
    if (!target || target.disabled) return;
    const tooltip = target.closest('.tooltip-trigger');
    if (tooltip) tooltip.dataset.tooltipDismissed = '';
    if (target.dataset.openDialog) {
      const dialog = document.getElementById(target.dataset.openDialog);
      dialogOpeners.set(dialog,target);
      dialog.showModal();
    }
    if (target.dataset.closeDialog) document.getElementById(target.dataset.closeDialog).close();
    if (target.dataset.openToast) showToast(target.dataset.openToast,target.dataset.toastMessage);
    if (target.hasAttribute('data-dismiss-toast')) target.closest('.toast')?.remove();
    if (target.dataset.demoProposal) {
      const result = document.getElementById('t-proposal-result');
      result.textContent = target.dataset.demoProposal === 'accept' ? 'Proposal accepted' : 'Proposal canceled';
      result.hidden = false;
    }
    if (target.hasAttribute('data-preview-filter')) target.setAttribute('aria-pressed',String(target.getAttribute('aria-pressed') !== 'true'));
    if (target.hasAttribute('data-clear-preview-filters')) {
      for (const filter of target.closest('.specimen').querySelectorAll('[data-preview-filter]')) filter.setAttribute('aria-pressed','false');
    }
    const tools = target.closest('[aria-label="Canvas tool specimens"]');
    if (tools && target.hasAttribute('aria-pressed')) {
      for (const tool of tools.querySelectorAll('[aria-pressed]')) {
        tool.removeAttribute('data-demo-state');
        tool.setAttribute('aria-pressed',String(tool===target));
      }
    }
  });
  document.addEventListener('keydown',event => {
    if (event.key !== 'Escape') return;
    const tooltip = event.target.closest('.tooltip-trigger');
    if (tooltip) tooltip.dataset.tooltipDismissed = '';
    const details = event.target.closest('details.popover[open]');
    if (details) { details.open = false; details.querySelector('summary').focus(); }
  });
  for (const tooltip of document.querySelectorAll('.tooltip-trigger')) {
    const reset = () => { delete tooltip.dataset.tooltipDismissed; };
    tooltip.addEventListener('pointerleave',reset);
    tooltip.addEventListener('focusout',reset);
  }
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('close',() => dialogOpeners.get(dialog)?.focus());
  }
  for (const range of document.querySelectorAll('input[type="range"]')) updateRange(range);

