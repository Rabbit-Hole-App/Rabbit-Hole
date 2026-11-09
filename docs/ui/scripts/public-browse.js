// Shared fixture data, canvas rendering, and menu behavior for Explore and public profiles.
const publicBrowse = (() => {
  const $ = id => document.getElementById(id);
  const clone = id => $(id).content.firstElementChild.cloneNode(true);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  // Weekly creator figures come from the app fixture. Board engagement is lifetime fixture data.
  const creatorFixtures = {
    ana: { name: 'Ana Lee', description: 'Visual explanations of science and machine learning.', projects: 1, canvases: 2, stars: 13, forks: 4 },
    ben: { name: 'Ben Ortiz', description: 'Small examples that make the math easier to follow.', canvases: 1, stars: 6, forks: 4 },
    cara: { canvases: 1, stars: 2, forks: 2 },
    dev: { name: 'Dev Patel', canvases: 1, stars: 0, forks: 1 },
    eli: { name: 'Eli Fox', canvases: 1, stars: 0, forks: 1 },
    fran: { name: 'Fran Rivers', canvases: 1 },
    grace: { name: 'Grace Park', canvases: 1 },
    hiro: { name: 'Hiro Mori', canvases: 1 },
    imani: { name: 'Imani Brooks', canvases: 1 },
    jules: { name: 'Jules Martin', canvases: 1 },
  };
  const canvasFixtures = [
    { id: 'ice', title: 'Why ice floats', handle: 'ana', description: 'See how hydrogen bonds make the solid form of water less dense than the liquid.', stars: 24, forks: 8, published: 2, updated: 5, age: '2h ago', cover: 'home-note-image' },
    { id: 'softmax', title: 'Softmax from scratch', handle: 'ben', description: 'Turn a vector of scores into probabilities and compare what happens when one score changes.', stars: 15, forks: 12, published: 5, updated: 4, age: '4h ago', cover: 'canvas-thumbnail-image' },
    { id: 'attention', title: 'Attention, drawn out', handle: 'ana', project: 'learning-lab/ml-notes', description: 'Follow the queries, keys, and values through one attention head.', stars: 18, forks: 7, published: 4, updated: 2, age: '1d ago', cover: 'home-note-image' },
    { id: 'fourier', title: 'A first look at Fourier series', handle: 'cara', description: 'Build a repeating signal by adding simple waves.', stars: 8, forks: 5, published: 3, updated: 3, age: '20h ago' },
    { id: 'photosynthesis', title: 'Photosynthesis in five cards', handle: 'dev', description: '', stars: 0, forks: 1, published: 1, updated: 1, age: '2d ago' },
    { id: 'sampling', title: 'Sampling distributions', handle: 'eli', description: 'See how sample size changes the spread of sample means.', stars: 3, forks: 2, published: 0, updated: 0, age: '3d ago' },
    { id: 'orbits', title: 'How orbits work', handle: 'fran', description: '', stars: 6, forks: 2, published: -1, updated: -1, age: '4d ago' },
    { id: 'tides', title: 'Why the tides change', handle: 'grace', description: '', stars: 2, forks: 1, published: -2, updated: -2, age: '5d ago' },
    { id: 'pendulum', title: 'The pendulum in motion', handle: 'hiro', description: '', stars: 4, forks: 1, published: -3, updated: -3, age: '6d ago' },
    { id: 'circuits', title: 'A first circuit', handle: 'imani', description: '', stars: 3, forks: 0, published: -4, updated: -4, age: '7d ago' },
    { id: 'waves', title: 'Reading a wave', handle: 'jules', description: '', stars: 1, forks: 0, published: -5, updated: -5, age: '8d ago' },
  ];

  const boardsBy = handle => canvasFixtures.filter(canvas => canvas.handle === handle);
  function engagementLabels(boards, starred) {
    const stars = boards.reduce((total, canvas) => total + canvas.stars + Number(starred.has(canvas.id)), 0);
    const forks = boards.reduce((total, canvas) => total + canvas.forks, 0);
    return [stars && plural(stars, 'star received', 'stars received'), forks && plural(forks, 'fork', 'forks')].filter(Boolean);
  }
  function setCover(target, cover, fallback) {
    if (cover) {
      const image = $('public-canvas-template').content.querySelector('.thumbnail-image').cloneNode(true);
      image.querySelector('use').setAttribute('href', '#' + cover);
      target.replaceChildren(image);
    } else {
      target.classList.add('explore-project-thumbnail');
      target.replaceChildren(fallback);
    }
  }

  function createCards(page, { openCanvas, profileLink, bindCardMenu, announce, starred = new Set(), onStarChange = () => {} }) {
    function cardFrame(item, id) {
      const frame = document.createElement('div');
      frame.className = 'canvas-card-frame';
      const card = clone('public-canvas-template');
      const title = card.querySelector('.canvas-title-link');
      const open = card.querySelector('.canvas-continue');
      title.textContent = item.title;
      open.className = 'button secondary home-open';
      open.firstChild.textContent = 'Open ';
      open.setAttribute('aria-label', 'Open ' + item.title);
      card.querySelector('.canvas-footer>span').textContent = 'Updated ' + item.age;
      card.querySelectorAll('[data-open-canvas]').forEach(button => { button.onclick = () => openCanvas(item); });
      card.onkeydown = event => {
        if (event.key === 'Enter' && event.target === card) {
          event.preventDefault();
          openCanvas(item);
        }
      };
      card.id = id;
      card.dataset.canvasId = item.id;
      frame.append(card);
      return { frame, card };
    }
    function setStar(button, canvas) {
      const active = starred.has(canvas.id);
      const count = canvas.stars + Number(active);
      const text = active ? 'Starred' : 'Star';
      const value = button.querySelector('[data-star-count]');
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', count ? text + ', ' + plural(count, 'star', 'stars') : text);
      button.querySelector('[data-star-label]').textContent = text;
      value.hidden = count === 0;
      value.textContent = count ? String(count) : '';
    }
    function refreshStar(canvas) {
      for (const button of page.querySelectorAll('[data-canvas-id="' + canvas.id + '"] [data-canvas-star]')) {
        setStar(button, canvas);
      }
    }
    function canvasCard(canvas, id, dataAttribute) {
      const { frame, card } = cardFrame(canvas, id);
      card.dataset[dataAttribute] = canvas.id;
      card.setAttribute('aria-label', canvas.title + ', public');
      card.classList.add('has-menu');
      setCover(card.querySelector('.canvas-thumbnail'), canvas.cover, card.querySelector('.canvas-type .icon').cloneNode(true));
      const creator = card.querySelector('.creator-link');
      const name = creatorFixtures[canvas.handle].name;
      if (name) creator.before(document.createTextNode(name + ' · '));
      creator.textContent = '@' + canvas.handle;
      creator.removeAttribute('target');
      creator.removeAttribute('rel');
      profileLink(creator, canvas.handle);
      if (canvas.project) {
        const project = document.createElement('a');
        project.className = 'creator-link';
        project.href = 'https://digrabbithole.com/explore?project=' + encodeURIComponent(canvas.project);
        project.textContent = canvas.project;
        project.onclick = event => {
          event.preventDefault();
          announce('Explore canvases from ' + canvas.project);
        };
        creator.after(document.createTextNode(' · '), project);
      }
      const heading = card.querySelector('.canvas-heading');
      const visibility = heading.querySelector('.visibility-pill');
      visibility.querySelector('use').setAttribute('href', '../../../icons/standards.svg#i-Globe');
      visibility.lastChild.textContent = 'Public';
      const more = clone('public-canvas-more-template');
      more.setAttribute('aria-label', 'Options for ' + canvas.title);
      const headActions = document.createElement('div');
      headActions.className = 'home-access';
      headActions.append(visibility, more);
      heading.append(headActions);
      bindCardMenu(more, canvas);
      if (canvas.description) {
        const description = document.createElement('p');
        description.className = 'canvas-note';
        description.textContent = canvas.description;
        heading.after(description);
      }
      const actions = card.querySelector('.canvas-actions');
      actions.append($('public-canvas-actions-template').content.cloneNode(true));
      const star = actions.querySelector('[data-canvas-star]');
      setStar(star, canvas);
      star.onclick = () => {
        if (starred.has(canvas.id)) starred.delete(canvas.id);
        else starred.add(canvas.id);
        refreshStar(canvas);
        onStarChange(canvas);
        announce(starred.has(canvas.id) ? 'Canvas starred' : 'Star removed');
      };
      actions.querySelector('[data-card-start-rabbit-hole]').onclick = () => announce('Start Rabbit Hole from ' + canvas.title);
      actions.querySelector('[data-explore-fork]').onclick = () => announce('Fork ' + canvas.title);
      actions.querySelector('[data-fork-count]').textContent = String(canvas.forks);
      return frame;
    }

    return { cardFrame, canvasCard, starred, refreshStar };
  }

  function createMenus(page, menus) {
    let activeMenu = null;
    let menuAnchor = null;
    function closeMenu(restoreFocus = true) {
      if (!activeMenu) return;
      activeMenu.hidden = true;
      menuAnchor.setAttribute('aria-expanded', 'false');
      if (restoreFocus) menuAnchor.focus();
      activeMenu = null;
      menuAnchor = null;
    }
    function openMenu(anchor) {
      const menu = $(anchor.getAttribute('aria-controls'));
      const alreadyOpen = menu === activeMenu;
      closeMenu(false);
      if (alreadyOpen) return;
      activeMenu = menu;
      menuAnchor = anchor;
      menu.hidden = false;
      anchor.setAttribute('aria-expanded', 'true');
      const box = anchor.getBoundingClientRect();
      const width = menu.offsetWidth || 240;
      const height = menu.offsetHeight || 0;
      menu.style.left = Math.max(12, Math.min(box.left, innerWidth - width - 12)) + 'px';
      menu.style.top = Math.max(12, Math.min(box.bottom + 6, innerHeight - height - 12)) + 'px';
      (menu.querySelector('[aria-checked="true"]') || menu.querySelector('button:not([hidden])')).focus();
    }
    function bindMenu(anchor, onOpen = () => {}) {
      const open = () => { onOpen(); openMenu(anchor); };
      anchor.onclick = open;
      anchor.onkeydown = event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          open();
        }
      };
    }
    for (const menu of menus) {
      menu.onkeydown = event => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault();
          closeMenu();
          return;
        }
        const options = Array.from(menu.querySelectorAll('button:not([hidden])'));
        const index = options.indexOf(document.activeElement);
        const next = { ArrowDown: (index + 1) % options.length, ArrowUp: (index + options.length - 1) % options.length, Home: 0, End: options.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        options[next].focus();
      };
    }
    document.addEventListener('pointerdown', event => {
      if (activeMenu && !activeMenu.contains(event.target) && !menuAnchor.contains(event.target)) closeMenu(false);
    });
    window.addEventListener('resize', () => closeMenu(false));
    page.addEventListener('scroll', () => closeMenu(false));
    return { bindMenu, closeMenu };
  }

  return { creatorFixtures, canvasFixtures, boardsBy, engagementLabels, setCover, createCards, createMenus };
})();
