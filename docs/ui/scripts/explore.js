(() => {
  const $ = id => document.getElementById(id);
  const previewCase = document.querySelector('[data-explore-case]')?.dataset.exploreCase;
  const profileEntry = document.querySelector('[data-profile-case]')?.dataset;
  const profileCase = profileEntry?.profileCase;
  const viewer = profileEntry?.profileViewer;
  const directHandle = /^#@([a-z0-9_]{1,40})$/i.exec(window.location?.hash || '')?.[1]?.toLowerCase();
  const empty = previewCase === 'empty';
  document.querySelector('.sidebar-canvas').replaceWith($('explore-page-template').content.cloneNode(true));

  const { creatorFixtures, boardsBy, engagementLabels, setCover } = publicBrowse;
  const visibleCreator = handle => profileCase !== 'empty' || handle !== 'ana';
  const canvasFixtures = publicBrowse.canvasFixtures.filter(canvas => visibleCreator(canvas.handle));
  const projectFixtures = [
    { id: 'math-notes', title: 'Math notes', repo: 'learning-lab/math-notes', boards: 2, forks: 4, published: 2, updated: 2, age: '1d ago' },
  ];
  const canvasRanks = [
    ['ice', 9, 3], ['softmax', 6, 4], ['attention', 6, 1], ['fourier', 2, 2], ['photosynthesis', 0, 1],
  ];
  // Sample responses exercise the existing Recommended UI without making model calls.
  const recommendationFixtures = new Map([
    ['show me how softmax works', { canvases: ['softmax'], creators: ['ben'] }],
    ['find creators who explain science', { canvases: ['ice'], creators: ['ana'] }],
  ]);

  const page = $('explore-page');
  const search = $('explore-search');
  const size = $('explore-size');
  const tabs = Array.from(page.querySelectorAll('[data-explore-tab]'));
  const filterOptions = Array.from(document.querySelectorAll('[data-explore-filter]'));
  const sortOptions = Array.from(document.querySelectorAll('[data-explore-sort]'));
  let tab = 'canvases';
  let filter = null;
  let sort = 'newest';
  const creatorList = $('explore-creator-list');
  const showMoreCreators = $('explore-show-more-creators');
  const creatorPageSize = 8;
  let creatorLimit = creatorPageSize;
  let matchingCreators = [];
  let canvasMenuHref;
  let exploreOrigin;
  let keyword = '';
  let keywordTimer;
  let recommendationTimer;
  let recommendation = null;

  const clone = id => $(id).content.firstElementChild.cloneNode(true);
  const announce = text => { $('preview-status').textContent = text; };
  const filterName = () => filter === 'projects' ? 'Projects' : 'Canvas';
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const term = () => keyword;
  const typedTerm = () => search.value.trim();
  const matches = (...fields) => fields.join(' ').toLocaleLowerCase().includes(term().toLocaleLowerCase());
  const canvasHref = id => '#explore-card-' + id;

  // ponytail: open, start, and fork are review actions. Production uses PublicCards and its existing routes and dialogs.
  function openCanvas(canvas) {
    $(canvasHref(canvas.id).slice(1))?.querySelector('.canvas-title-link').focus();
    announce('Open ' + canvas.title);
  }
  function previewLink(link, href, action) {
    link.href = href;
    link.onclick = event => { event.preventDefault(); action(); };
  }
  function profileLink(link, handle) {
    link.href = '#@' + handle;
    link.onclick = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openProfile(handle, link);
    };
  }

  function setTab(next, focus = false) {
    closeMenu(false);
    if (next !== tab) filter = null;
    tab = next;
    page.dataset.activeTab = tab;
    const creators = tab === 'creators';
    for (const button of tabs) {
      const selected = button.dataset.exploreTab === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    }
    $('explore-canvases-panel').hidden = creators;
    $('explore-creators-panel').hidden = !creators;
    $('explore-filter').hidden = creators;
    size.closest('label').hidden = creators;
    const label = creators ? 'Search creators' : 'Search canvases';
    search.placeholder = label;
    search.setAttribute('aria-label', label);
    renderResults();
  }
  for (const button of tabs) {
    button.onclick = () => setTab(button.dataset.exploreTab);
    button.onkeydown = event => {
      const choices = { ArrowLeft: tab === 'canvases' ? 'creators' : 'canvases', ArrowRight: tab === 'canvases' ? 'creators' : 'canvases', Home: 'canvases', End: 'creators' };
      const next = choices[event.key];
      if (!next) return;
      event.preventDefault();
      setTab(next, true);
    };
  }
  function updateSearch() {
    creatorLimit = creatorPageSize;
    clearTimeout(keywordTimer);
    clearTimeout(recommendationTimer);
    recommendation = null;
    if (!typedTerm()) {
      keyword = '';
      renderResults();
      return;
    }
    renderRecommended();
    renderWeekly();
    keywordTimer = setTimeout(() => {
      keyword = typedTerm();
      const phrase = keyword.replace(/\s+/g, ' ').slice(0, 300).toLocaleLowerCase();
      if (phrase.split(' ').length >= 4) {
        recommendation = 'loading';
        recommendationTimer = setTimeout(() => {
          recommendation = (!empty && recommendationFixtures.get(phrase)) || {};
          renderRecommended();
        }, 700);
      }
      renderResults();
    }, 250);
  }
  search.addEventListener('input', updateSearch);
  for (const button of page.querySelectorAll('[data-clear-explore-search]')) {
    button.onclick = () => {
      search.value = '';
      updateSearch();
      search.focus();
    };
  }

  const menus = publicBrowse.createMenus(page, [$('explore-filter-menu'), $('explore-sort-menu'), $('public-canvas-menu'), $('profile-sort-menu')]);
  const { bindMenu, closeMenu } = menus;
  const bindCanvasMenu = (button, href) => bindMenu(button, () => { canvasMenuHref = href; });
  bindMenu($('explore-filter'));
  bindMenu($('explore-sort'));
  $('explore-toolbar').addEventListener('scroll', () => closeMenu(false));

  function chooseFilter(next) {
    filter = next;
    closeMenu();
    renderCanvases();
    renderRecommended();
  }
  for (const button of filterOptions) {
    button.onclick = () => chooseFilter(filter === button.dataset.exploreFilter ? null : button.dataset.exploreFilter);
  }
  $('explore-filter-clear').onclick = () => chooseFilter(null);
  $('explore-filter-remove').onclick = () => { chooseFilter(null); $('explore-filter').focus(); };
  for (const button of sortOptions) {
    button.onclick = () => {
      sort = button.dataset.exploreSort;
      closeMenu();
      renderCanvases();
    };
  }
  $('public-canvas-copy').onclick = async () => {
    closeMenu();
    try {
      await window.navigator.clipboard.writeText(window.location.href.split('#')[0] + canvasMenuHref);
      announce('Link copied');
    } catch {
      announce('Could not copy the link');
    }
  };

  const sizeLabels = ['Small', 'Medium small', 'Medium large', 'Large'];
  const sizeWidths = ['220px', '300px', '460px', '100%'];
  const sizeKey = 'rabbit-hole.ui-preview.cardSize';
  try {
    const stored = window.localStorage.getItem(sizeKey);
    if (stored !== null && /^[0-3]$/.test(stored)) size.value = stored;
  } catch { /* Preview still resizes if storage is blocked. */ }
  function updateSize() {
    const index = Number(size.value);
    page.style.setProperty('--home-card-min', sizeWidths[index]);
    size.style.setProperty('--range-fill', (index / 3 * 100) + '%');
    size.setAttribute('aria-valuetext', sizeLabels[index]);
    $('explore-size-value').textContent = sizeLabels[index];
  }
  size.addEventListener('input', () => {
    updateSize();
    try { window.localStorage.setItem(sizeKey, size.value); } catch { /* Size applies for this visit. */ }
  });
  updateSize();

  const { cardFrame, canvasCard: publicCard, starred, refreshStar } = publicBrowse.createCards(page, {
    openCanvas, profileLink, announce,
    bindCardMenu: (button, canvas) => bindCanvasMenu(button, canvasHref(canvas.id)),
    onStarChange: updateCreatorCounts,
  });
  function canvasCard(canvas, recommended = false) {
    const id = recommended ? 'explore-recommended-card-' + canvas.id : canvasHref(canvas.id).slice(1);
    return publicCard(canvas, id, recommended ? 'recommendedCard' : 'exploreCard');
  }
  function projectCard(project) {
    const { frame, card } = cardFrame(project, canvasHref(project.id).slice(1));
    card.dataset.exploreProject = project.repo;
    card.setAttribute('aria-label', project.title + ', project');
    const type = card.querySelector('.canvas-type');
    type.setAttribute('aria-label', 'Project');
    type.querySelector('use').setAttribute('href', '../../../icons/library.svg#library-folder-git-2');
    setCover(card.querySelector('.canvas-thumbnail'), null, type.querySelector('.icon').cloneNode(true));
    card.querySelector('.canvas-creator').textContent = project.repo;
    card.querySelector('.visibility-pill').remove();
    card.querySelector('.canvas-actions').remove();
    card.querySelector('.canvas-footer>span').before(document.createTextNode(plural(project.boards, 'learning board', 'learning boards')));
    return frame;
  }
  function renderCanvases() {
    const projects = filter === 'projects';
    const source = empty ? [] : projects ? projectFixtures : canvasFixtures;
    const results = source.filter(item => projects ? matches(item.title, item.repo) : matches(item.title, item.description, item.handle, creatorFixtures[item.handle].name));
    results.sort((a, b) => {
      const newest = b.published - a.published;
      if (sort === 'updated') return b.updated - a.updated || newest;
      if (sort === 'forks') return b.forks - a.forks || newest;
      return newest;
    });
    $('explore-card-grid').replaceChildren(...results.map(item => projects ? projectCard(item) : canvasCard(item)));
    $('explore-sort').hidden = results.length === 0;
    const selectedSort = sortOptions.find(button => button.dataset.exploreSort === sort);
    $('explore-sort-label').textContent = 'Sort: ' + selectedSort.querySelector('.menu-label').textContent;
    for (const button of sortOptions) button.setAttribute('aria-checked', String(button === selectedSort));
    for (const button of filterOptions) button.setAttribute('aria-checked', String(button.dataset.exploreFilter === filter));
    $('explore-filter-label').textContent = filter ? 'Filters · 1' : 'Filters';
    $('explore-filter-chip').hidden = !filter;
    $('explore-filter-clear').hidden = !filter;
    $('explore-filter-chip-label').textContent = filter ? filterName() : '';
    $('explore-filter-remove').setAttribute('aria-label', 'Remove ' + filterName() + ' filter');
    const noResults = $('explore-no-canvases');
    noResults.hidden = results.length > 0 || !(filter || term());
    noResults.textContent = 'No ' + (projects ? 'projects' : 'canvases') + ' match' + (term() ? ' “' + term() + '”' : '') + '.';
    $('explore-clear-canvas-search').hidden = noResults.hidden || !term();
    $('explore-browse-canvases').hidden = results.length === 0 || projects || Boolean(term());
  }
  function avatar(handle, name) {
    const badge = document.createElement('span');
    badge.className = 'avatar';
    badge.textContent = (name || handle)[0].toUpperCase();
    badge.setAttribute('aria-hidden', 'true');
    return badge;
  }
  function creatorCard([handle, person], recommended = false) {
    const row = clone('explore-creator-template');
    row.id = (recommended ? 'explore-recommended-creator-' : 'explore-creator-') + handle;
    row.dataset.creatorCard = handle;
    row.querySelector('.avatar').textContent = (person.name || handle)[0].toUpperCase();
    const name = row.querySelector('[data-creator-name]');
    name.textContent = person.name || '';
    name.hidden = !person.name;
    const profile = row.querySelector('[data-creator-handle]');
    profile.textContent = '@' + handle;
    profileLink(profile, handle);
    profileLink(row.querySelector('[data-creator-view]'), handle);
    const description = row.querySelector('[data-creator-description]');
    description.textContent = person.description || '';
    description.hidden = !person.description;
    fillCreatorCounts(row, handle, person);
    return row;
  }
  function fillCreatorCounts(row, handle, person) {
    const counts = row.querySelector('[data-creator-counts]');
    counts.textContent = [
      person.projects && plural(person.projects, 'project', 'projects'),
      person.canvases && plural(person.canvases, 'canvas', 'canvases'),
      ...engagementLabels(boardsBy(handle), starred),
    ].filter(Boolean).join(' · ');
    counts.hidden = !counts.textContent;
  }
  function updateCreatorCounts({ handle }) {
    for (const row of page.querySelectorAll('[data-creator-card="' + handle + '"]')) {
      fillCreatorCounts(row, handle, creatorFixtures[handle]);
    }
  }
  function renderCreators() {
    matchingCreators = empty ? [] : Object.entries(creatorFixtures).filter(([handle, person]) => visibleCreator(handle) && matches(handle, person.name, person.description));
    const total = matchingCreators.length;
    $('explore-sort').hidden = true;
    creatorList.replaceChildren(...matchingCreators.slice(0, creatorLimit).map(person => creatorCard(person)));
    showMoreCreators.hidden = creatorLimit >= total;
    $('explore-creator-count').hidden = total === 0;
    $('explore-creator-count').textContent = plural(total, 'creator', 'creators');
    const noResults = $('explore-no-creators');
    noResults.hidden = total > 0 || !term();
    noResults.textContent = 'No creators match “' + term() + '”.';
    $('explore-clear-creator-search').hidden = noResults.hidden;
    $('explore-browse-creators').hidden = total === 0 || Boolean(term());
  }
  showMoreCreators.onclick = () => {
    const start = creatorLimit;
    creatorLimit += creatorPageSize;
    const rows = matchingCreators.slice(start, creatorLimit).map(person => creatorCard(person));
    creatorList.append(...rows);
    showMoreCreators.hidden = creatorLimit >= matchingCreators.length;
    rows[0]?.querySelector('[data-creator-view]').focus();
  };

  function countMetric(row, kind, value, label) {
    const metric = row.querySelector('[data-weekly-' + kind + ']');
    metric.title = label;
    metric.querySelector('[data-weekly-number]').textContent = String(value);
    metric.querySelector('.sr-only').textContent = label;
  }
  function weeklyRow(item, rank, creators) {
    const row = clone('explore-weekly-row-template');
    row.dataset.weeklyRow = String(rank);
    row.querySelector('[data-weekly-rank]').textContent = String(rank);
    const picture = row.querySelector('[data-weekly-picture]');
    const title = row.querySelector('[data-weekly-title]');
    const author = row.querySelector('[data-weekly-creator]');
    const action = row.querySelector('[data-weekly-action]');
    const name = creators ? item.name || '@' + item.handle : item.canvas.title;
    const target = creators ? 'profile' : 'canvas';
    for (const link of [picture, title, action]) {
      link.dataset.weeklyTarget = target;
      if (creators) profileLink(link, item.handle);
      else previewLink(link, canvasHref(item.canvas.id), () => openCanvas(item.canvas));
    }
    if (creators) picture.replaceChildren(avatar(item.handle, item.name));
    else if (item.canvas.cover) setCover(picture, item.canvas.cover);
    title.textContent = name;
    title.title = name;
    author.textContent = '@' + item.handle;
    author.hidden = creators && !item.name;
    profileLink(author, item.handle);
    action.querySelector('span').textContent = creators ? 'View profile' : 'Open';
    action.setAttribute('aria-label', creators ? 'View profile of @' + item.handle : 'Open ' + name);
    const stars = creators ? plural(item.stars, 'person', 'people') + ' starred' : plural(item.stars, 'new star', 'new stars');
    const forks = creators ? plural(item.forks, 'person', 'people') + ' forked' : plural(item.forks, 'fork', 'forks');
    countMetric(row, 'stars', item.stars, stars + ' this week');
    countMetric(row, 'forks', item.forks, forks + ' this week');
    return row;
  }
  function renderWeekly() {
    const section = $('explore-weekly');
    const list = $('explore-weekly-list');
    const creators = tab === 'creators';
    const entries = empty ? [] : creators
      ? Object.entries(creatorFixtures).filter(([handle, person]) => visibleCreator(handle) && Number.isFinite(person.stars)).map(([handle, person]) => ({ handle, ...person }))
      : canvasRanks.map(([id, stars, forks]) => {
        const canvas = publicBrowse.canvasFixtures.find(item => item.id === id);
        return { canvas, handle: canvas.handle, stars, forks };
      }).filter(entry => visibleCreator(entry.handle));
    section.hidden = Boolean(typedTerm()) || entries.length === 0;
    if (section.hidden) {
      section.removeAttribute('data-weekly-top');
      list.replaceChildren();
      return;
    }
    section.dataset.weeklyTop = tab;
    $('explore-weekly-heading').textContent = creators ? 'Top creators this week' : 'Top canvases this week';
    list.replaceChildren(...entries.slice(0, 5).map((item, index) => weeklyRow(item, index + 1, creators)));
  }
  function renderRecommended() {
    for (const section of page.querySelectorAll('[data-explore-recommended]')) {
      const kind = section.dataset.exploreRecommended;
      const items = section.querySelector('[data-recommended-items]');
      const status = section.querySelector('[data-recommended-status]');
      section.hidden = !recommendation || kind !== tab || (kind === 'canvases' && Boolean(filter));
      items.replaceChildren();
      if (section.hidden) continue;
      const picks = (recommendation[kind] || []).filter(id => kind === 'creators'
        ? visibleCreator(id) : canvasFixtures.some(canvas => canvas.id === id));
      status.hidden = picks.length > 0;
      status.textContent = recommendation === 'loading' ? 'Finding the best matches'
        : kind === 'creators' ? 'No creator fits that yet.' : 'Nothing published fits that yet.';
      for (const id of picks) {
        items.append(kind === 'creators'
          ? creatorCard([id, creatorFixtures[id]], true)
          : canvasCard(canvasFixtures.find(canvas => canvas.id === id), true));
      }
    }
  }
  function renderResults() {
    renderWeekly();
    if (tab === 'creators') renderCreators();
    else renderCanvases();
    renderRecommended();
  }

  function openProfile(handle, opener = null, state = 'ready') {
    closeMenu(false);
    exploreOrigin = opener ? { opener, scrollTop: page.scrollTop } : null;
    page.hidden = true;
    profile.show(handle, state, opener ? 'Back to Explore' : 'Browse creators', Boolean(opener));
  }
  function returnToExplore() {
    profile.hide();
    page.hidden = false;
    const origin = exploreOrigin;
    exploreOrigin = null;
    if (!origin) {
      search.value = keyword = '';
      creatorLimit = creatorPageSize;
      setTab('creators', true);
      page.scrollTop = 0;
      return;
    }
    const { opener, scrollTop } = origin;
    const focus = opener.isConnected && !opener.closest('[hidden]') && opener.getAttribute('aria-hidden') !== 'true' ? opener : search;
    page.scrollTop = scrollTop;
    focus.focus({ preventScroll: true });
  }
  const profile = creatorProfilePreview({
    explore: page, menus, bindCanvasMenu, starred, announce, viewer,
    onBack: returnToExplore,
    onStarChange: canvas => { refreshStar(canvas); updateCreatorCounts(canvas); },
  });

  document.querySelector('.sidebar-row[aria-current="page"]')?.removeAttribute('aria-current');
  const exploreSidebar = document.querySelector('.sidebar-row[data-label="Explore"]');
  exploreSidebar.setAttribute('aria-current', 'page');
  exploreSidebar.addEventListener('click', () => { if (page.hidden) returnToExplore(); });
  if (viewer === 'signed-out') {
    $('sidebar').hidden = true;
    const stage = page.parentElement;
    stage.dataset.profileViewer = viewer;
    stage.prepend($('profile-public-brand-template').content.cloneNode(true));
  } else if (matchMedia('(max-width:700px)').matches) $('collapse').click();
  const initialQueries = { 'canvas-search': 'softmax', 'creator-search': 'ana' };
  keyword = initialQueries[previewCase] || '';
  search.value = keyword;
  const openCreators = profileCase || directHandle || previewCase === 'creator-search' || new URLSearchParams(window.location?.search).get('tab') === 'creators';
  setTab(openCreators ? 'creators' : 'canvases');
  if (directHandle || profileCase) openProfile(directHandle || 'ana', null, profileCase || 'ready');
  else if (keyword) search.focus();
  if (previewCase === 'library-search') document.querySelector('.sidebar-row[data-label="Search"]').click();
})();
