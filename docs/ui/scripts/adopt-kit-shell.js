/* Compose the existing kit slots into the shared resizable card frame.
   Existing controls and scene nodes are moved, preserving their listeners. */
for (const card of document.querySelectorAll('#example-cards > .card')) {
  const header = card.querySelector('.card-header');
  const title = card.querySelector('h3');
  const top = document.createElement('div');
  top.className = 'card-top';
  const pill = header.querySelector('.badge');
  pill.classList.add('card-pill');
  top.append(pill);
  header.replaceChildren(top, title);
  title.className = 'card-title';
  const body = document.createElement('div');
  body.className = 'card-body';
  body.tabIndex = 0;
  body.setAttribute('role', 'region');
  body.setAttribute('aria-label', `${title.textContent} content`);
  for (const child of [...card.children]) if (child !== header) body.append(child);
  card.append(body);
  card.classList.replace('card', 'teaching-card');
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'resize-handle';
  handle.setAttribute('aria-label', `Resize ${title.textContent}`);
  handle.setAttribute('aria-describedby','clean-resize-help');
  handle.title = 'Resize card';
  handle.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 12 12 3M8 12 12 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  card.append(handle);
  installResize(card, handle);
}
