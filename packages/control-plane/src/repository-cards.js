// Repository-backed canvas cards (repo-canvas-graph.md Release 2, "Persistence and access" and Clarification section 10;
// lane contract C:/s/spec/repo-graph-r2-plan.md): a code card ({ type: 'repo-code', source: { kind: 'repository', app, repo,
// commit, path, ... } }) or a graph card ({ type: 'repo-graph', repository: { app, repo, commit }, scope, nodeIds }). A card is a
// reference, never a grant of anything the repository rule does not already allow (repositories.js readableVersion, owner
// ruling 2026-10-15): whoever can read the board - a share or publication viewer, a fork, a Rabbit Hole started from a
// share, the shared ask - sees the card in full when its repository is confirmed public, so a fork keeps it and can ask about
// it. Only a card whose repository is not confirmed public (private or gone since) is withheld from anyone but its importer:
// they get its place on the board and nothing of the repository.
export const repositoryCard = block => (block?.type === 'repo-code' && block.source?.kind === 'repository') || block?.type === 'repo-graph';
const cardApp = block => (block.type === 'repo-graph' ? block.repository?.app : block.source?.app);
// What a redacted card keeps: where it sits and what kind it is. A whitelist, so a field a later card version adds is
// withheld until someone decides it is safe to show.
const LAYOUT = ['id', 'type', 'x', 'y', 'dx', 'dy', 'w', 'h', 'width', 'height', 'z', 'rotation', 'groupId', 'locked'];
const redact = block => ({ ...Object.fromEntries(LAYOUT.filter(key => Object.hasOwn(block, key)).map(key => [key, block[key]])),
  redacted: true, ...(block.type === 'repo-code' ? { source: { kind: 'repository' } } : {}) });
// ponytail: one IN query for the repositories a board names, capped at 90 binds; past that the extra cards stay redacted.
const MAX_APPS = 90;

// The board as `viewer` ({ org, email }, or null signed out) may see it: `owned` holds the apps whose cards stay whole.
export async function redactRepositoryCards(db, state, viewer) {
  const blocks = state?.blocks;
  if (!Array.isArray(blocks) || !blocks.some(repositoryCard)) return state;
  const apps = [...new Set(blocks.filter(repositoryCard).map(cardApp).filter(app => typeof app === 'string' && /^repo-[a-z0-9-]{1,80}$/.test(app)))].slice(0, MAX_APPS);
  const owned = new Set();
  if (apps.length) {
    const own = viewer?.email && viewer.org ? [viewer.org, viewer.email] : ['', ''];
    const { results } = await db.prepare(`SELECT r.name FROM repository_apps r WHERE r.name IN (${apps.map(() => '?').join(', ')}) AND (EXISTS(SELECT 1 FROM repository_visibility p WHERE p.app_id = r.id AND p.visibility = 'public') OR (r.org = ? AND r.owner_email = ?))`)
      .bind(...apps, ...own).all();
    for (const row of results) owned.add(row.name);
  }
  return { ...state, blocks: blocks.map(block => (!repositoryCard(block) || owned.has(cardApp(block)) ? block : redact(block))) };
}

// A save never erases what a redacted copy withheld: a redacted card sent back for a card the stored board holds in full is
// stored in full again, taking only its new place on the board. A card deleted from the board stays deleted, and a redacted
// card with no full copy stays as it came.
export function restoreRedactedCards(storedText, state) {
  if (!storedText || !Array.isArray(state?.blocks) || !state.blocks.some(block => block?.redacted === true)) return state;
  let stored;
  try { stored = JSON.parse(storedText); } catch { return state; }
  const full = new Map((stored?.blocks || []).filter(block => repositoryCard(block) && block.redacted !== true).map(block => [block.id, block]));
  return { ...state, blocks: state.blocks.map(block => {
    const kept = block?.redacted === true && full.get(block.id);
    if (!kept || kept.type !== block.type) return block;
    return { ...kept, ...Object.fromEntries(LAYOUT.filter(key => key !== 'type' && Object.hasOwn(block, key)).map(key => [key, block[key]])) };
  }) };
}
