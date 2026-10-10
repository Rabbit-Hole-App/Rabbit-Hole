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

// A project's visibility (owner, 2026-10-09; visibility-menu.md "Projects") is all of its canvases set at once, each through
// its own routes (setAccess), and its Main canvas board's link, which is the project's link: off for Private, on for
// Unlisted, on and open signed out for Public (a project itself is never in Explore). Nothing is stored on the project:
// the server reads its state back from these (repositories.js projectAccess), Mixed when its parts differ. A project whose
// repository is not confirmed public is never made Public. `canvases`: its live canvases; `stateOf(x)`: this browser's copy
// of a canvas or of the Main canvas. Returns the steps taken, by name.
export const PRIVATE_REPOSITORY = "Private repository: can't be public";
export async function setProjectAccess(call, project, canvases, to, stateOf = () => null) {
  if (to === 'public' && !project.repo_public) throw Error(PRIVATE_REPOSITORY);
  const steps = {};
  for (const canvas of canvases) steps[canvas.name] = await setAccess(call, canvas, to, stateOf(canvas));
  const main = stateOf(project);
  await call(`/api/learn/boards/${project.name}/main/share`, { method: 'POST', body: JSON.stringify(to === 'private' ? { shared: false } : { shared: true, view: true, public_view: to === 'public', ...(main ? { state: main } : {}) }) });
  steps[project.name] = [to === 'private' ? 'unshare' : 'share'];
  return steps;
}
// A project's canvases are counted as its card counts them: the Main canvas and each live canvas in it.
export const projectConfirm = (count, to) => ({
  title: `Make ${count} ${count === 1 ? 'canvas' : 'canvases'} ${to}?`,
  body: to === 'public' ? 'Each canvas goes to Explore under your @handle, and the project link opens for anyone, signed out too.'
    : 'Anyone with a link can open them. Each canvas keeps its own link, and the project link lists the ones a viewer may open.',
  action: `Make ${to}`,
});

// Copy link (owner, 2026-10-08): the link that matches what the card is. Public: its Explore page /e/<token>. Unlisted: its
// share link /b/<view token> (`view`, read from the board when copying). Private, a project, or an unlisted board whose view
// link is off: its own page /apps/<name>, which opens only for its owner. `copied` is the button's own confirmation.
export function copyLinkFor(card, { origin, view = null }) {
  if (card.kind === 'canvas' && card.access === 'public' && card.publication_token) return { url: `${origin}/e/${card.publication_token}`, copied: 'Public link copied' };
  if (card.kind === 'canvas' && card.access === 'unlisted' && view) return { url: `${origin}/b/${view}`, copied: 'Share link copied' };
  // A project's link is its Main canvas board's (setProjectAccess), while it is on.
  if (card.kind === 'repository' && card.access && card.access !== 'private' && view) return { url: `${origin}/b/${view}`, copied: 'Project link copied' };
  return { url: `${origin}/apps/${card.name}`, copied: 'Private link copied, opens only for you' };
}
