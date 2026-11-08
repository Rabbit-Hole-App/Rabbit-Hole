/* Shared behavior for the source templates; no network or upload side effects. */
(() => {
  const sprite = {
    file: '../../../icons/standards.svg#i-FileText',
    link: '../../../icons/standards.svg#i-Link2',
    repo: '../../../icons/icons.svg#icon-GitBranch',
  };
  window.makeSourceRow = function(source, remove) {
    const row = document.getElementById('added-source-row').content.firstElementChild.cloneNode(true);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', sprite[source.type] || sprite.file); svg.append(use);
    row.querySelector('[data-source-icon]').append(svg);
    row.querySelector('[data-source-name]').textContent = source.name;
    row.querySelector('[data-source-detail]').textContent = source.detail;
    const button = row.querySelector('[data-remove-source]');
    button.setAttribute('aria-label', 'Remove ' + source.name); button.addEventListener('click', remove);
    return row;
  };
  document.querySelectorAll('[data-source-tabs]').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    function select(tab) {
      for (const other of tabs) {
        const active = other === tab;
        other.setAttribute('aria-selected', String(active)); other.tabIndex = active ? 0 : -1;
        document.getElementById(other.getAttribute('aria-controls')).hidden = !active;
      }
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        const next = {ArrowRight:(index+1)%tabs.length, ArrowLeft:(index+tabs.length-1)%tabs.length, Home:0, End:tabs.length-1}[event.key];
        if (next === undefined) return;
        event.preventDefault(); select(tabs[next]); tabs[next].focus();
      });
    });
  });
  document.querySelectorAll('[data-source-upload]').forEach(root => {
    const button = root.querySelector('.dropzone'), input = root.querySelector('input');
    let depth = 0;
    function accept(files) {
      root.dispatchEvent(new CustomEvent('sourcefiles', {bubbles:true, detail:[...files]}));
      const status = document.getElementById('upload-demo-status');
      if (status) status.textContent = [...files].map(file => file.name).join(', ') || 'No files selected.';
    }
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { accept(input.files); input.value = ''; });
    button.addEventListener('dragenter', e => {e.preventDefault(); if (!button.disabled) { depth++; button.classList.add('dragging'); }});
    button.addEventListener('dragover', e => e.preventDefault());
    button.addEventListener('dragleave', () => {if (--depth <= 0) button.classList.remove('dragging');});
    button.addEventListener('drop', e => {e.preventDefault(); depth=0; button.classList.remove('dragging'); if (!button.disabled) accept(e.dataTransfer.files);});
  });
  // Prevent accidental navigation when a file misses the drop zone in this specimen.
  if (document.querySelector('[data-source-upload]')) {
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => e.preventDefault());
  }
  const demo = document.getElementById('source-row-demo');
  if (demo) {
    const examples = [
      {type:'file',name:'Decision trees.md',detail:'12.4 KB'},
      {type:'link',name:'https://example.com/decision-trees',detail:'Link'},
      {type:'repo',name:'https://github.com/owner/repository',detail:'Repository'},
    ];
    function restore() {
      demo.replaceChildren(); document.getElementById('row-demo-status').textContent = '';
      document.getElementById('restore-source-examples').hidden = true;
      examples.forEach(source => {
        const row = window.makeSourceRow(source, () => {
          const next = row.nextElementSibling || row.previousElementSibling; row.remove();
          document.getElementById('row-demo-status').textContent = source.name + ' removed from this preview.';
          const restoreButton = document.getElementById('restore-source-examples'); restoreButton.hidden = false;
          (next?.querySelector('button') || restoreButton).focus();
        }); demo.append(row);
      });
    }
    document.getElementById('restore-source-examples').onclick = restore; restore();
  }
})();
