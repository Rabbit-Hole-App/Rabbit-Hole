// Start Rabbit Hole on a shared canvas (docs/features/shared-canvas-rabbit-hole.md): the origin the browser sends,
// the call, and the sign-in round trip that finishes it. Generic: any shared canvas, any card. Pure but for fetch.
import { resolveTarget } from './learn-target.js';

const ROOT = 'root';

// The origin the server checks against the shared board: the selected card's identities (learn-target.js, as /dive
// records them), or null - the shared canvas itself. `describe` (LearningBlocks describeBlock, passed in so this stays
// pure) names the card the way every canvas surface does, kind first; the server names it when there is none.
export function rabbitOrigin(state, cardId, describe = null) {
  if (!cardId) return null;
  const entry = [...(state?.blocks || []), ...(state?.exchanges || [])].find(item => item?.id === cardId) || { id: cardId };
  const { block_id, scene_id, card_id, part_id, concept_ids, selected_object, depth } = resolveTarget(entry);
  let named = null;
  try { named = describe?.(entry) || null; } catch { /* an entry describeBlock does not know: the server names it */ }
  const title = named?.title ? (named.kind ? `${named.kind}: ${named.title}` : named.title) : null;
  return { block_id, scene_id, card_id, part_id, concept_ids, selected_object, depth, ...(title ? { title } : {}) };
}

// Signed out: the existing sign-in, back to this page with ?rabbit=<card id | root>, which finishes the start.
export const resumeHref = (pathname, cardId) => `/login?next=${encodeURIComponent(`${pathname}?rabbit=${encodeURIComponent(cardId || ROOT)}`)}`;
// Read once and dropped from the address, so Back never starts a second time. undefined: nothing to resume;
// null: the canvas root; else the card id.
export function takeResume(location, history) {
  const value = new URLSearchParams(location.search).get('rabbit');
  if (value === null) return undefined;
  history.replaceState(null, '', location.pathname);
  return value === ROOT ? null : value;
}

// POST the start. Resolves to { url } to open, { signIn } to sign in first, or throws the server's reason.
export async function requestRabbitHole(token, origin, { fetchImpl = (...args) => fetch(...args), headers = {} } = {}) {
  const response = await fetchImpl(`/api/learn/boards/shared/${encodeURIComponent(token)}/rabbit-hole`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ origin }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && data.signIn) return { signIn: true };
  if (!response.ok || !data.url) throw new Error(data.error || 'The Rabbit Hole could not be started.');
  return { url: data.url, existing: !!data.existing };
}
