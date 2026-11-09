function splitPreviewCommand(picker, line) {
  const prefix = line.match(/^\/([\w-]+)(?=\s|$)\s*/i);
  if (!prefix) return { command: '', text: line };

  const name = prefix[1].toLowerCase();
  const row = [...picker.querySelectorAll('[data-command]')].find(option =>
    option.dataset.command === '/' + name || option.dataset.commandAliases?.split(' ').includes(name));
  return row
    ? { command: row.dataset.command, text: line.slice(prefix[0].length) }
    : { command: '', text: line };
}

(() => {
  const picker = document.querySelector('[data-slash-picker]');
  const search = picker.querySelector('input');
  const results = picker.querySelector('.rh-command-results');
  const groups = [...picker.querySelectorAll('.rh-command-group')];
  const rows = [...picker.querySelectorAll('[data-command]')];
  const empty = picker.querySelector('.rh-command-empty');
  const guideButton = picker.querySelector('[data-open-command-guide]');
  const guide = picker.querySelector('.rh-command-guide');
  const examples = guide.querySelector('.rh-command-examples');
  let active = rows[0];

  function highlight(row) {
    active?.setAttribute('aria-selected', 'false');
    active = row;
    if (active) {
      active.setAttribute('aria-selected', 'true');
      search.setAttribute('aria-activedescendant', active.id);
    } else {
      search.removeAttribute('aria-activedescendant');
    }
  }

  function filter() {
    const query = search.value.trim().replace(/^\//, '').toLowerCase();
    for (const row of rows) {
      const words = [row.dataset.command, row.dataset.commandTitle, row.dataset.commandAliases, row.textContent].join(' ').toLowerCase();
      row.hidden = !words.includes(query);
    }
    for (const group of groups) {
      group.hidden = !group.querySelector('[data-command]:not([hidden])');
    }
    highlight(rows.find(row => !row.hidden));
    empty.hidden = Boolean(active);
    results.hidden = !active;
    search.setAttribute('aria-expanded', String(Boolean(active)));
    results.scrollTop = 0;
  }

  function pick(row) {
    highlight(row);
    picker.dispatchEvent(new CustomEvent('chat-command-pick', {
      bubbles: true,
      detail: row.dataset.command,
    }));
  }

  guideButton.addEventListener('click', () => {
    if (!examples.firstElementChild) {
      for (const row of rows) {
        const item = document.createElement('div');
        const title = document.createElement('dt');
        const description = document.createElement('dd');
        const prompt = document.createElement('code');
        title.textContent = row.dataset.commandTitle;
        prompt.textContent = row.dataset.commandExample;
        description.append(prompt);
        item.append(title, description);
        examples.append(item);
      }
    }
    guide.showModal();
  });
  guide.querySelector('[data-close-command-guide]').addEventListener('click', () => guide.close());
  guide.addEventListener('close', () => guideButton.focus());
  guide.addEventListener('keydown', event => {
    if (event.key === 'Escape') event.stopPropagation();
  });

  search.addEventListener('input', filter);
  search.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && search.value) {
      event.preventDefault();
      event.stopPropagation();
      search.value = '';
      filter();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (active) pick(active);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const visible = rows.filter(row => !row.hidden);
    if (!visible.length) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const index = visible.indexOf(active);
    highlight(visible[(index + step + visible.length) % visible.length]);
    active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  picker.addEventListener('click', event => {
    const row = event.target.closest('[data-command]');
    if (row) pick(row);
  });
})();
