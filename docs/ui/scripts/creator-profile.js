const creatorProfilePreview = ({ explore, menus, bindCanvasMenu, starred, announce, viewer, onBack, onStarChange }) => {
  const page = document.getElementById('creator-profile-template').content.firstElementChild.cloneNode(true);
  explore.after(page);
  const $ = id => page.querySelector('#' + id);
  const search = $('profile-search');
  const tabs = [...page.querySelectorAll('[data-profile-tab]')];
  const sorts = [...document.querySelectorAll('[data-profile-sort]')];
  const back = $('profile-back');
  const copy = $('profile-copy');
  const copyLabel = copy.querySelector('span');
  const [linkIcon, checkIcon] = copy.querySelectorAll('use');
  let handle;
  let published = [];
  let query = '';
  let sort = 'newest';
  let searchTimer;
  let retryTimer;
  let copyTimer;

  back.onclick = event => { event.preventDefault(); onBack(); };
  page.addEventListener('scroll', () => menus.closeMenu(false));
  // Owner controls preview the existing profile actions. The app opens Settings and Analytics.
  $('profile-edit').onclick = () => announce('Edit profile');
  $('profile-analytics').onclick = () => announce('Creator analytics');

  const { canvasCard } = publicBrowse.createCards(page, {
    openCanvas: canvas => announce('Open ' + canvas.title),
    profileLink: (link, owner) => {
      link.href = owner === handle ? '#creator-profile' : 'https://digrabbithole.com/@' + owner;
      if (owner !== handle) link.onclick = event => {
        event.preventDefault();
        announce('View profile of @' + owner);
      };
    },
    bindCardMenu: button => bindCanvasMenu(button, '#' + button.closest('[data-canvas-id]').id),
    announce,
    starred,
    onStarChange: canvas => { updateStats(); onStarChange(canvas); },
  });

  function updateStats() {
    const count = published.length;
    const boards = count + ' public learning board' + (count === 1 ? '' : 's');
    $('profile-stats').textContent = [boards, ...publicBrowse.engagementLabels(published, starred)].join(' · ');
  }
  function setCopyLabel(label, copied = false) {
    copyLabel.textContent = label;
    linkIcon.toggleAttribute('hidden', copied);
    checkIcon.toggleAttribute('hidden', !copied);
  }
  copy.onclick = async () => {
    const requestedHandle = handle;
    clearTimeout(copyTimer);
    let copied = false;
    try {
      await window.navigator.clipboard.writeText(window.location.href.split('#')[0] + '#@' + requestedHandle);
      copied = true;
    } catch { /* The clipboard can be unavailable in the preview host. */ }
    if (page.hidden || handle !== requestedHandle) return;
    setCopyLabel(copied ? 'Profile link copied' : "Couldn't copy the link", copied);
    copyTimer = setTimeout(() => setCopyLabel('Copy profile link'), 1600);
  };

  function renderBoards() {
    const term = query.toLowerCase();
    const matches = text => text.toLowerCase().includes(term);
    const boards = published.filter(canvas => matches(canvas.title) || (canvas.project && matches(canvas.project)));
    boards.sort((a, b) => (sort === 'forks' ? b.forks - a.forks : 0) || b.published - a.published);
    const projects = new Map();
    for (const { project } of boards) {
      if (query && project && matches(project)) projects.set(project, (projects.get(project) || 0) + 1);
    }
    $('profile-projects').hidden = projects.size === 0;
    const projectTemplate = document.getElementById('profile-project-template');
    $('profile-project-list').replaceChildren(...[...projects].map(([project, count]) => {
      const link = projectTemplate.content.firstElementChild.cloneNode(true);
      link.href = 'https://digrabbithole.com/explore?project=' + encodeURIComponent(project);
      link.querySelector('[data-project-name]').textContent = project;
      link.querySelector('[data-project-count]').textContent = '· ' + count + ' canvas' + (count === 1 ? '' : 'es');
      link.onclick = event => { event.preventDefault(); announce('Explore canvases from ' + project); };
      return link;
    }));
    $('profile-matches-title').hidden = !query || boards.length === 0;
    const noMatches = $('profile-no-matches');
    noMatches.hidden = !query || boards.length > 0;
    noMatches.textContent = noMatches.hidden ? '' : 'No canvases or projects match “' + query + '”.';
    $('profile-clear-search').hidden = noMatches.hidden;
    $('profile-cards').replaceChildren(...boards.map(canvas => canvasCard(canvas, 'profile-card-' + canvas.id, 'profileCard')));
  }
  function clearSearch() {
    clearTimeout(searchTimer);
    search.value = query = '';
    renderBoards();
    search.focus();
  }

  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      menus.closeMenu(false);
      query = search.value.trim();
      renderBoards();
    }, 250);
  });
  search.onkeydown = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    clearSearch();
  };
  $('profile-clear-search').onclick = clearSearch;

  function setSort(next) {
    sort = next;
    for (const option of sorts) {
      const selected = option.dataset.profileSort === sort;
      option.setAttribute('aria-checked', String(selected));
      if (selected) $('profile-sort-label').textContent = 'Sort: ' + option.querySelector('.menu-label').textContent;
    }
  }
  menus.bindMenu($('profile-sort'));
  for (const button of sorts) {
    button.onclick = () => {
      setSort(button.dataset.profileSort);
      menus.closeMenu();
      renderBoards();
    };
  }

  function selectTab(next, focus = false) {
    menus.closeMenu(false);
    for (const tab of tabs) {
      const selected = tab.dataset.profileTab === next;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !selected;
      if (selected && focus) tab.focus();
    }
  }
  for (const tab of tabs) {
    tab.onclick = () => selectTab(tab.dataset.profileTab);
    tab.onkeydown = event => {
      const other = tab.dataset.profileTab === 'canvases' ? 'stars' : 'canvases';
      const next = { ArrowLeft: other, ArrowRight: other, Home: 'canvases', End: 'stars' }[event.key];
      if (!next) return;
      event.preventDefault();
      selectTab(next, true);
    };
  }

  function showState(state) {
    const loading = state === 'loading';
    const unavailable = state === 'error' || state === 'missing';
    $('profile-loading').hidden = !loading;
    $('profile-unavailable').hidden = !unavailable;
    $('profile-content').hidden = loading || unavailable;
    $('profile-retry').hidden = state !== 'error';
    $('profile-state-title').textContent = state === 'error' ? 'Couldn’t load profile' : 'Creator not found';
    const title = loading ? 'profile-loading-label' : unavailable ? 'profile-state-title' : 'profile-name';
    page.setAttribute('aria-labelledby', title);
    page.setAttribute('aria-busy', String(loading));
    return $(title);
  }

  function show(nextHandle, state, backLabel, focus = false) {
    handle = nextHandle;
    page.hidden = false;
    page.scrollTop = 0;
    $('profile-back-label').textContent = backLabel;
    const person = Object.hasOwn(publicBrowse.creatorFixtures, handle) ? publicBrowse.creatorFixtures[handle] : null;
    const title = showState(person ? state : 'missing');
    if (person && (state === 'ready' || state === 'empty')) {
      published = state === 'empty' ? [] : publicBrowse.boardsBy(handle);
      const savedStars = handle === 'ana' ? publicBrowse.boardsBy('ben') : [];
      const name = person.name || '@' + handle;
      $('profile-avatar').textContent = (person.name || handle)[0].toUpperCase();
      $('profile-name').textContent = name;
      $('profile-handle').textContent = '@' + handle;
      $('profile-handle').hidden = !person.name;
      const own = viewer === 'owner' && handle === 'ana';
      $('profile-owner').hidden = !own;
      $('profile-owner-actions').hidden = !own;
      $('profile-description').textContent = person.description || '';
      $('profile-description').hidden = !person.description;
      $('profile-starred-count').textContent = savedStars.length;
      $('profile-stars-empty').hidden = savedStars.length > 0;
      $('profile-empty').querySelector('p').textContent = '@' + handle + ' has no public learning boards yet.';
      $('profile-empty').hidden = published.length > 0;
      $('profile-search-field').hidden = published.length === 0;
      $('profile-sort').hidden = published.length < 2;
      search.value = query = '';
      setSort('newest');
      setCopyLabel('Copy profile link');
      updateStats();
      renderBoards();
      $('profile-starred-cards').replaceChildren(...savedStars.map(canvas => canvasCard(canvas, 'profile-starred-' + canvas.id, 'profileStarCard')));
      selectTab('canvases');
    }
    if (focus) title.focus({ preventScroll: true });
  }
  $('profile-retry').onclick = () => {
    showState('loading');
    back.focus({ preventScroll: true });
    retryTimer = setTimeout(() => show(handle, 'ready', $('profile-back-label').textContent, true), 350);
  };

  function hide() {
    clearTimeout(searchTimer);
    clearTimeout(retryTimer);
    clearTimeout(copyTimer);
    menus.closeMenu(false);
    page.hidden = true;
  }
  return { show, hide };
};
