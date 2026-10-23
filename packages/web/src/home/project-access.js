// Share window logic shared by canvases and projects (owner brief 2026-10-22, items 4 and 5). Pure apart from `call`
// (the app's api()), so the breakdown, the bulk change and its partial failures are tested without a page.
//
// Three link modes are the share route's own fields: shared, view (the link's token) and public_view. Invited people only is
// shared: false. The Explore publication is a separate row the share route never touches.
export const MODES = [
  ['invited', 'Invited people only'],
  ['signin', 'Anyone with the link · sign-in required'],
  ['public', 'Anyone with the link · no sign-in'],
];
export const PATCH = {
  invited: { shared: false },
  signin: { shared: true, view: true, public_view: false },
  public: { shared: true, view: true, public_view: true },
};
// A shared canvas whose view link is off opens for nobody by link, so it reads as invited only.
export const accessMode = sharing => (!sharing?.shared || !sharing.view ? 'invited' : sharing.public_view ? 'public' : 'signin');
export const modeLabel = mode => MODES.find(([id]) => id === mode)[1];

// One row per canvas of a project, its Main canvas first: the authoritative state read from each board's own route.
// `canvases`: the project's live canvases ({ name, title }); a board that cannot be read keeps its row with the reason.
export async function loadRows(call, project, canvases) {
  const read = async (item, main) => {
    try {
      const { sharing } = await call(`/api/learn/boards/${item.name}/main`);
      return { name: item.name, title: main ? 'Main canvas' : item.title, main, mode: accessMode(sharing), published: !!sharing?.published, error: null };
    } catch (error) { return { name: item.name, title: main ? 'Main canvas' : item.title, main, mode: null, published: false, error: error.message }; }
  };
  return Promise.all([read(project, true), ...canvases.map(c => read(c, false))]);
}

// "Varies by canvas" is true only when the rows differ in link access or in publication. A project with one row never varies.
export const varies = rows => new Set(rows.filter(r => !r.error).map(r => `${r.mode}:${r.published}`)).size > 1;

// "Apply to all canvases": the link mode for every canvas of the project except its Main canvas, whose link is the project link
// and has its own setting. Only the canvases whose mode differs are written; a canvas's Explore publication is never touched.
export const affected = (rows, mode) => rows.filter(r => !r.main && !r.error && r.mode !== mode);
// `stateOf(name)`: this browser's copy of a canvas, sent with a first share like the Share panel does (null: none).
// Returns { changed, failed: [{ name, title, message }] }. It never stops at the first failure and never claims a canvas it
// did not change; the caller reloads the authoritative rows afterwards.
export async function applyToAll(call, rows, mode, stateOf = () => null) {
  const changed = [], failed = [];
  for (const row of affected(rows, mode)) {
    const state = stateOf(row.name);
    try {
      await call(`/api/learn/boards/${row.name}/main/share`, { method: 'POST', body: JSON.stringify({ ...PATCH[mode], ...(state ? { state } : {}) }) });
      changed.push(row.name);
    } catch (error) { failed.push({ name: row.name, title: row.title, message: error.message }); }
  }
  return { changed, failed };
}
