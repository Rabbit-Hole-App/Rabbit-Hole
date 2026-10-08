// The owner's Visibility menu (docs/features/visibility-menu.md): Private, Unlisted, Public for a top-level canvas,
// done through the routes that already own each state - Public is the Explore publication, Unlisted a share link,
// Private neither. Pure apart from `call`, so the transitions are tested without a page.
export const ACCESS = [
  { id: 'private', label: 'Private', hint: 'Only you' },
  { id: 'unlisted', label: 'Unlisted', hint: 'Anyone with the link' },
  { id: 'public', label: 'Public', hint: 'In Explore, under your @handle' },
];

// Going private takes access away from others, so it asks first - only when there is access to take away.
export const confirmsPrivate = (from, to) => to === 'private' && from !== 'private';
export const PRIVATE_CONFIRM = {
  title: 'Make this canvas private?',
  body: 'It will be visible only to you. Existing public and shared links will stop working. Existing forks will not be deleted.',
  action: 'Make private',
};

// `call(path, init)` is the app's api(); `state` is this browser's copy of the canvas (sharing or publishing a canvas
// that has no server copy yet sends it, as the Share panel does). Returns the steps it took, in order.
export async function setAccess(call, canvas, to, state = null) {
  const from = canvas.access || 'private';
  if (to === from) return [];
  const base = `/api/learn/boards/${canvas.name}/main`;
  const post = (path, body = {}) => call(path, { method: 'POST', body: JSON.stringify(body) });
  const steps = [];
  if (from === 'public') { await post(`/api/apps/${canvas.name}/unpublish`); steps.push('unpublish'); }
  if (to === 'unlisted' && !canvas.shared) { await post(`${base}/share`, { shared: true, view: true, ...(state ? { state } : {}) }); steps.push('share'); }
  if (to === 'private' && canvas.shared) { await post(`${base}/share`, { shared: false }); steps.push('unshare'); }
  if (to === 'public') {
    // Publishing needs the board on the server; its first copy is this browser's (never a meaningful change). Version 0 is a
    // canvas's empty board, made with its row: nothing saved on it yet either.
    const board = await call(base);
    if (!board.version && state) { await call(base, { method: 'PUT', body: JSON.stringify({ state }) }); steps.push('save'); }
    await post(`/api/apps/${canvas.name}/publish`); steps.push('publish');
  }
  return steps;
}
