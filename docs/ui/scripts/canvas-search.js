(() => {
  const get = id => document.getElementById(id);
  const clone = id => get(id).content.firstElementChild.cloneNode(true);
  const standard = name => '../../../icons/standards.svg#i-' + name;
  const kit = name => '../../../icons/icons.svg#icon-' + name;
  // A filter and its result type share one sprite entry.
  const typeIcons = {
    video: kit('Film'), pdf: standard('FileText'), paper: kit('ScrollText'),
    notebook: standard('NotebookPen'), code: kit('Code'), image: kit('Image'),
    whiteboard: kit('PenTool'), diagram: kit('Workflow'), graph: kit('ChartLine'),
    quiz: kit('ListChecks'), flashcards: kit('GalleryVerticalEnd'), challenge: kit('Dumbbell'),
    explanation: kit('Lightbulb'), table: kit('Table2'), cad: kit('Cuboid'),
    animation: kit('Clapperboard'), audio: kit('AudioLines'), slides: kit('Presentation'),
    document: kit('BookText'), 'other-cards': kit('Shapes'), arxiv: kit('FileCode'),
    wikipedia: kit('BookOpenText'), youtube: kit('Play'), web: standard('Globe'),
    repository: kit('GitBranch'), text: standard('Type'), comments: standard('MessageCircle'),
    references: kit('Paperclip'), links: standard('Link2'), 'rabbit-holes': kit('Waypoints')
  };
  const labels = new Map(searchFilterGroups.flatMap(group => group.items));
  const typeLabel = type => labels.get(type);
  const rows = [
    { id:'overfitting', type:'explanation', title:'What is Overfitting?', text:'Overfitting occurs when a model fits the training data too well, capturing noise along with the signal.' },
    { id:'mle', type:'explanation', title:'Maximum Likelihood Estimation', text:'Maximum likelihood estimation chooses the parameters that maximise the probability of the observed data.' },
    { id:'cross-validation', type:'explanation', title:'How Cross-Validation Works', text:'Cross-validation repeatedly splits the data into training and hold-out sets. Each split yields a validation error.' },
    { id:'text', type:'text', title:'Text', meta:'Text · Note', text:'Compare the training and validation curves before choosing a model.' },
    { id:'cross-entropy', type:'explanation', title:'Cross entropy loss', text:'Cross entropy measures how much probability a classifier assigns to the correct class.' },
    { id:'loss-code', type:'code', title:'loss.py', path:'src/loss.py', text:'Cross entropy from log probabilities.', line:14,
      code:['def cross_entropy(log_probs, target):', '    return -log_probs[target]', ''] },
    { id:'image-curve', type:'image', title:'Cross entropy loss curve', meta:'Image · loss-curve.png', text:'The penalty rises as the predicted probability of the correct class falls.' },
    { id:'image-fallback', type:'image', title:'Cross entropy class example', meta:'Image · class-example.png', text:'A worked example with three predicted probabilities.' },
    { id:'loss-pdf', type:'pdf', title:'Model evaluation notes.pdf', meta:'PDF · Page 7', text:'We report cross entropy alongside accuracy to compare how confident each model is.', also:['references'] },
    { id:'loss-comment', type:'comments', title:'Comment on Loss functions', text:'Can we show how cross entropy changes when the correct class gets only 10% probability?' },
    { id:'loss-note', type:'text', title:'Training notes', meta:'Text · Note', text:'Compare cross entropy on the training and validation sets after each epoch.' },
    { id:'video', type:'video', title:'Bias and variance explained', text:'A visual introduction to underfitting and overfitting.' },
    { id:'paper', type:'paper', title:'On calibration of modern neural networks', text:'A study of calibration and confidence in image classifiers.', also:['arxiv','references'] },
    { id:'notebook', type:'notebook', title:'evaluation.ipynb', text:'Compute validation metrics from saved predictions.' },
    { id:'whiteboard', type:'whiteboard', title:'Training loop sketch', text:'Predict, measure loss, and update the model.' },
    { id:'diagram', type:'diagram', title:'Model evaluation flow', text:'From data splits to metric reporting.' },
    { id:'graph', type:'graph', title:'Training and validation loss', text:'Compare the loss curves over 20 epochs.' },
    { id:'quiz', type:'quiz', title:'Check your understanding', text:'Which score exposes an overconfident wrong prediction?' },
    { id:'flashcards', type:'flashcards', title:'Classification metrics', text:'Flashcards for accuracy, precision, recall and F1.' },
    { id:'challenge', type:'challenge', title:'Choose a validation metric', text:'Explain your choice when the positive class is rare.' },
    { id:'table', type:'table', title:'Validation results', text:'Compare accuracy, recall and loss for three model variants.' },
    { id:'cad', type:'cad', title:'Classifier input scene', text:'A sample 3D model used in the course.' },
    { id:'animation', type:'animation', title:'Loss through training', text:'Watch predictions and error change over time.' },
    { id:'audio', type:'audio', title:'Evaluation walkthrough', text:'A short audio note on interpreting metrics.' },
    { id:'slides', type:'slides', title:'Classification slides', text:'Training objectives and evaluation metrics.' },
    { id:'document', type:'document', title:'metrics.md', text:'Definitions and conventions for the evaluation run.' },
    { id:'other', type:'other-cards', title:'Evaluation checkpoint', text:'Review the metrics before comparing models.' },
    { id:'arxiv', type:'arxiv', title:'Calibration paper on arXiv', text:'Source for the model calibration notes.' },
    { id:'wiki', type:'wikipedia', title:'Confusion matrix', text:'Wikipedia reference for the metric table.' },
    { id:'youtube', type:'youtube', title:'Bias–variance tradeoff on YouTube', text:'Video source for the evaluation walkthrough.', also:['video'] },
    { id:'web', type:'web', title:'Model evaluation guide', text:'Documentation for classifier scoring.' },
    { id:'repo', type:'repository', title:'Model evaluation repository', text:'Source files and examples for the workshop.' },
    { id:'refs', type:'references', title:'Sources for model calibration', text:'References used in the evaluation notes.' },
    { id:'links', type:'links', title:'Decision Trees', text:'Linked from this canvas.' },
    { id:'rabbit-hole', type:'rabbit-holes', title:'Why do models get overconfident?', text:'A follow-up on calibration.' }
  ];
  const panel = get('canvas-search-panel');
  const query = get('canvas-query');
  const resultsList = get('canvas-search-results');
  const matchCount = get('canvas-match-count');
  const previous = get('previous-match');
  const next = get('next-match');
  const filter = get('canvas-filter');
  const menu = get('canvas-filter-menu');
  const filterQuery = get('filter-query');
  const filterOptions = get('canvas-filter-options');
  const clearFilters = get('clear-canvas-filters');
  const selected = new Set();
  let matches = [];
  let resultButtons = [];
  let active = -1;

  const escapeRegex = value => value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
  const pattern = value => value.trim().split(/\s+/).map(escapeRegex).join('[\\s_-]+');
  const categories = row => [row.type, ...(row.also || [])];
  function highlight(node, value, expression) {
    if (!expression) {
      node.textContent = value;
      return;
    }
    let offset = 0;
    for (const hit of value.matchAll(new RegExp(expression, 'gi'))) {
      node.append(value.slice(offset, hit.index));
      const mark = document.createElement('mark');
      mark.textContent = hit[0];
      node.append(mark);
      offset = hit.index + hit[0].length;
    }
    node.append(value.slice(offset));
  }
  function iconFor(node, type) {
    node.querySelector('use').setAttribute('href', typeIcons[type]);
  }
  function showResult(row, index, expression) {
    const item = clone('canvas-search-result-template');
    const button = item.firstElementChild;
    button.dataset.searchResult = row.id;
    button.dataset.resultType = row.type;
    iconFor(item.querySelector('.canvas-result-heading .icon'), row.type);
    highlight(item.querySelector('[data-result-title]'), row.title, expression);
    item.querySelector('.canvas-result-meta').textContent = row.meta || (row.path ? typeLabel(row.type) + ' · ' + row.path + ' · Line ' + row.line : typeLabel(row.type));
    const snippet = item.querySelector('.canvas-result-snippet');
    if (row.code) {
      snippet.classList.add('is-code');
      row.code.forEach((line, position) => {
        const preview = document.createElement('span');
        preview.className = 'canvas-code-line';
        const number = document.createElement('span');
        number.setAttribute('aria-hidden', 'true');
        number.textContent = row.line + position;
        const code = document.createElement('code');
        highlight(code, line || ' ', expression);
        preview.append(number, code);
        snippet.append(preview);
      });
    } else highlight(snippet, row.text, expression);
    button.addEventListener('click', () => activate(index));
    button.addEventListener('keydown', event => {
      const position = {ArrowUp:index-1, ArrowDown:index+1, Home:0, End:resultButtons.length-1}[event.key];
      if (position === undefined) return;
      event.preventDefault();
      const target = Math.min(Math.max(position, 0), resultButtons.length-1);
      activate(target);
      resultButtons[target].focus();
    });
    return item;
  }
  function unfilteredMatches() {
    const expression = query.value.trim() ? pattern(query.value) : '';
    const test = expression ? new RegExp(expression, 'i') : null;
    if (!test) return { rows, expression };
    const title = [];
    const content = [];
    for (const row of rows) {
      if ([row.title, row.path].some(value => value && test.test(value))) title.push(row);
      else if ([row.text, ...(row.code || [])].some(value => test.test(value))) content.push(row);
    }
    return { rows:[...title, ...content], expression };
  }
  function updateCounter() {
    matchCount.textContent = active >= 0 ? (active+1) + ' of ' + matches.length
      : matches.length + (matches.length === 1 ? ' result' : ' results');
  }
  function activate(index) {
    if (!matches.length) return;
    if (active >= 0 && active !== index) resultButtons[active].removeAttribute('aria-current');
    active = index;
    const button = resultButtons[index];
    button.setAttribute('aria-current', 'true');
    const rowBounds = button.getBoundingClientRect();
    const listBounds = resultsList.getBoundingClientRect();
    if (rowBounds.top < listBounds.top || rowBounds.bottom > listBounds.bottom) button.scrollIntoView({ block:'nearest' });
    updateCounter();
  }
  function step(direction) {
    if (!matches.length) return;
    const start = active >= 0 ? active : direction > 0 ? -1 : 0;
    activate((start + direction + matches.length) % matches.length);
  }
  function renderResults() {
    const search = unfilteredMatches();
    matches = search.rows.filter(row => !selected.size || categories(row).some(type => selected.has(type)));
    active = -1;
    resultsList.replaceChildren(...matches.map((row, index) => showResult(row, index, search.expression)));
    resultButtons = Array.from(resultsList.querySelectorAll('button'));
    resultsList.scrollTop = 0;
    previous.disabled = next.disabled = matches.length === 0;
    get('canvas-search-empty').hidden = matches.length > 0;
    updateCounter();
  }
  function renderFilterOptions() {
    const search = filterQuery.value.trim().toLowerCase();
    const counts = new Map();
    for (const row of unfilteredMatches().rows) for (const type of categories(row)) counts.set(type, (counts.get(type) || 0) + 1);
    const groups = [];
    for (const { title, items } of searchFilterGroups) {
      const visible = items.filter(([,label]) => label.toLowerCase().includes(search));
      if (!visible.length) continue;
      const group = clone('canvas-filter-group-template');
      group.setAttribute('aria-label', title);
      group.querySelector('p').textContent = title;
      const body = group.querySelector('[data-filter-items]');
      for (const [id, label] of visible) {
        const row = clone('canvas-filter-row-template');
        row.dataset.filterRow = id;
        iconFor(row, id);
        row.querySelector('.menu-label').textContent = label;
        row.querySelector('.canvas-filter-count').textContent = counts.get(id) || 0;
        const input = row.querySelector('input');
        input.checked = selected.has(id);
        input.addEventListener('change', () => {
          if (input.checked) selected.add(id);
          else selected.delete(id);
          syncFilter();
          renderResults();
        });
        if (id === 'references') row.title = 'Cards on this canvas that cite a source';
        if (id === 'links') row.title = 'Other canvases this one links to or from';
        body.append(row);
      }
      groups.push(group);
    }
    filterOptions.replaceChildren(...groups);
    get('filter-no-results').hidden = groups.length > 0;
  }
  function syncFilter() {
    get('canvas-filter-label').textContent = selected.size ? 'Filter (' + selected.size + ')' : 'Filter';
    clearFilters.disabled = selected.size === 0;
  }
  function setMenu(open, focusTrigger = false) {
    menu.hidden = !open;
    filter.setAttribute('aria-expanded', String(open));
    if (open) {
      filterQuery.value = '';
      renderFilterOptions();
    }
    if (focusTrigger) filter.focus();
  }

  filter.addEventListener('click', () => setMenu(menu.hidden, true));
  filter.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    if (menu.hidden) setMenu(true);
    filterQuery.focus();
  });
  filterQuery.addEventListener('input', renderFilterOptions);
  clearFilters.addEventListener('click', () => {
    selected.clear();
    syncFilter();
    renderFilterOptions();
    renderResults();
    filterQuery.focus();
  });
  menu.addEventListener('keydown', event => {
    if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    if (event.target === filterQuery && ['Home','End'].includes(event.key)) return;
    const stops = [filterQuery, ...filterOptions.querySelectorAll('input')];
    if (!clearFilters.disabled) stops.push(clearFilters);
    const index = stops.indexOf(document.activeElement);
    const last = stops.length - 1;
    const target = {ArrowUp:Math.max(0, index-1), ArrowDown:Math.min(last,index+1), Home:1, End:last}[event.key];
    if (!stops[target]) return;
    event.preventDefault();
    stops[target].focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!menu.hidden && !menu.contains(event.target) && !filter.contains(event.target)) setMenu(false);
  });
  query.addEventListener('input', () => {
    renderResults();
    if (!menu.hidden) renderFilterOptions();
  });
  query.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    }
  });
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const reopen = get('reopen-canvas-search');
  function openSearch() {
    panel.hidden = false;
    reopen.hidden = true;
    query.focus();
  }
  panel.querySelector('[data-open-search]').addEventListener('click', openSearch);
  reopen.addEventListener('click', openSearch);
  panel.querySelector('[aria-label="Close panel"]').addEventListener('click', () => {
    setMenu(false);
    panel.hidden = true;
    reopen.hidden = false;
    reopen.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      hideTip();
      if (!menu.hidden) {
        event.preventDefault();
        setMenu(false, true);
      } else if (event.target === query && query.value) {
        event.preventDefault();
        query.value = '';
        renderResults();
      }
    }
    if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey
        && !event.target.matches('input, textarea, [contenteditable="true"]')) {
      event.preventDefault();
      openSearch();
    }
  });

  const tooltip = get('canvas-search-tooltip');
  let tipTimer;
  let tipTarget;
  function hideTip() {
    clearTimeout(tipTimer);
    tooltip.hidden = true;
    tipTarget?.removeAttribute('aria-describedby');
    tipTarget = null;
  }
  function showTip(target) {
    hideTip();
    tipTimer = setTimeout(() => {
      if (panel.hidden) return;
      tipTarget = target;
      tooltip.textContent = target.dataset.tooltipLabel;
      tooltip.hidden = false;
      target.setAttribute('aria-describedby', tooltip.id);
      const bounds = target.getBoundingClientRect();
      const left = bounds.left + (bounds.width - tooltip.offsetWidth) / 2;
      const below = bounds.bottom + 6;
      const top = below + tooltip.offsetHeight <= window.innerHeight - 8 ? below : bounds.top - tooltip.offsetHeight - 6;
      tooltip.style.left = Math.max(8, Math.min(left, window.innerWidth - tooltip.offsetWidth - 8)) + 'px';
      tooltip.style.top = Math.max(8, top) + 'px';
    }, 400);
  }
  for (const target of panel.querySelectorAll('[data-tooltip-label]')) {
    target.addEventListener('pointerenter', () => showTip(target));
    target.addEventListener('focus', () => { if (target.matches(':focus-visible')) showTip(target); });
    for (const event of ['pointerleave', 'blur', 'pointerdown', 'click']) target.addEventListener(event, hideTip);
  }
  window.addEventListener('resize', hideTip);

  const pin = panel.querySelector('[aria-label="Keep panel open"]');
  pin.addEventListener('click', () => pin.setAttribute('aria-pressed', String(pin.getAttribute('aria-pressed') !== 'true')));
  const viewer = get('search-viewer');
  const viewerButton = panel.querySelector('[data-viewer]');
  viewerButton.addEventListener('click', () => {
    viewer.hidden = !viewer.hidden;
    viewerButton.setAttribute('aria-pressed', String(!viewer.hidden));
  });
  viewer.addEventListener('click', event => {
    const choice = event.target.closest('button');
    if (choice) viewer.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === choice)));
  });

  // Left-edge version of the shared sidebar's pointer and keyboard width control.
  const edge = panel.querySelector('[role="separator"]');
  let drag;
  function resize(value) {
    const available = panel.parentElement.clientWidth - 40;
    const width = Math.max(320, Math.min(value, 800, available));
    panel.style.setProperty('--card-width', width + 'px');
    edge.setAttribute('aria-valuenow', String(width));
  }
  edge.onpointerdown = event => {
    if (event.button !== 0) return;
    drag = { x:event.clientX, width:panel.offsetWidth };
    edge.setPointerCapture(event.pointerId);
    panel.classList.add('resizing');
  };
  edge.onpointermove = event => { if (drag) resize(drag.width + drag.x - event.clientX); };
  function endResize() {
    drag = null;
    panel.classList.remove('resizing');
  }
  edge.onpointerup = edge.onpointercancel = edge.onlostpointercapture = endResize;
  edge.ondblclick = () => resize(510);
  edge.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 10;
    resize({ ArrowLeft:panel.offsetWidth + step, ArrowRight:panel.offsetWidth - step, Home:320, End:800 }[event.key]);
  };
  renderResults();
})();
