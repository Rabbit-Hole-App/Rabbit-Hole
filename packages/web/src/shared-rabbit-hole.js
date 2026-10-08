// Start Rabbit Hole on a shared canvas (docs/features/shared-canvas-rabbit-hole.md): the origin the browser sends,
// the call, and the sign-in round trip that finishes it. Generic: any shared canvas, any card. Pure but for fetch.
import { resolveTarget } from './learn-target.js';

const ROOT = 'root';
// Blank (owner, 2026-10-08): the popup's other choice - a new empty private canvas linked to the source, nothing copied. In
// the address it is ?rabbit=blank, so the choice survives sign-in as ?rabbit=root does.
export const BLANK = ':blank';
const BLANK_PARAM = 'blank';

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

// Signed out: the existing sign-in, back to this page with ?rabbit=<card id | root>, which finishes the start. hookId: a
// Professor Next Steps hook clicked while signed out (docs/features/professor-next-steps.md §1.4) rides along as &hook=<id>.
export const resumeHref = (pathname, cardId, hookId = null) => `/login?next=${encodeURIComponent(`${pathname}?rabbit=${cardId === BLANK ? BLANK_PARAM : encodeURIComponent(cardId || ROOT)}${hookId ? `&hook=${encodeURIComponent(hookId)}` : ''}`)}`;
// The page an Explore card's choice opens, to start there (or sign in and start there).
export const startHref = (url, choice) => `${url}?rabbit=${choice === BLANK ? BLANK_PARAM : ROOT}`;
// Read once and dropped from the address, so Back never starts a second time. undefined: nothing to resume;
// null: the canvas root; else the card id. { hook: true }: { origin, hook } instead (hook null when none came back).
export function takeResume(location, history, { hook = false } = {}) {
  const params = new URLSearchParams(location.search), value = params.get('rabbit');
  if (value === null) return undefined;
  history.replaceState(null, '', location.pathname);
  const origin = value === ROOT ? null : value === BLANK_PARAM ? BLANK : value;
  return hook ? { origin, hook: params.get('hook') } : origin;
}

// POST the start. Resolves to { url } to open, { signIn } to sign in first, or throws the server's reason. step: a clicked
// hook's selected_next_step; the reply then adds the hole's name and the server-checked next_step (for carryStep), and a
// stale hook resolves to { stale: true }, so the page starts again without it.
// origin BLANK: the empty canvas, which carries no card and no step.
export async function requestRabbitHole(token, origin, { fetchImpl = (...args) => fetch(...args), headers = {}, step = null } = {}) {
  const body = origin === BLANK ? { origin: null, blank: true } : { origin, ...(step ? { selected_next_step: step } : {}) };
  const response = await fetchImpl(`/api/learn/boards/shared/${encodeURIComponent(token)}/rabbit-hole`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && data.signIn) return { signIn: true };
  if (response.status === 409 && data.error === 'stale_hook') return { stale: true };
  if (!response.ok || !data.url) throw new Error(data.error || 'The Rabbit Hole could not be started.');
  return { url: data.url, existing: !!data.existing, ...(data.next_step ? { name: data.name, next_step: data.next_step } : {}) };
}
