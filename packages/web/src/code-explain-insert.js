// Add as card for a code-explain answer (code-explain-card-spec.md section 3 step 4): the answer's message meta carries a `codeExplain` payload (control plane, learn-code-explain.js);
// this validates it with the contract's client validator and turns it into the primary card, its satellite code cards and the numbered connectors, placed together and
// inserted as ONE undo step by the canvas's insertCodeExplain (AdaptiveCanvas.jsx). Pure apart from `ops`; loaded lazily (ChatMessages.jsx) so the contract stays out of the main bundle.
import { validateCodeExplain } from '../../control-plane/src/code-explain-contract.js';
import { besideSpot } from './beside-placement.js';
import { GAP, freeSpot, placeNote } from './inline-ai-apply.js';
import { refCardSpot } from './canvas-refs-model.js';
import { CODE_CARD, repoCodeCard } from './code-card.js';
import { CODE_EXPLAIN_SIZE, hullOf } from './code-explain.js';
import { takeAskedFrom } from './code-explain-link.js';

// The fields of the saved card (spec 2a); the payload's own other keys never reach the board.
const KEYS = ['type', 'title', 'question', 'repo', 'commit', 'files', 'mentioned', 'depth', 'depths', 'figure', 'suggestions', 'evidence'];
const LINK_COLOR = '#2383e2'; // the default connector colour of a card (AdaptiveCanvas LINK_COLORS fallback)
const UNKNOWN_LINES = () => Number.MAX_SAFE_INTEGER; // no snapshot at this commit here: line counts are not checked (the server checked them)

// The blocks and connectors for one answer. id: the primary's card id (chat-<message id>, so the footer's Added state and a second click find it); satellites are
// <id>-file-<n> and the connectors <id>-link-<n>, so an insertion repeated for the same answer is recognised, never doubled.
// -> { ok: true, blocks: [primary, ...satellites], links } or { ok: false, errors }.
export function planCodeExplain({ id, payload, app = null, lines = UNKNOWN_LINES }) {
  if (!id || !payload || typeof payload !== 'object') return { ok: false, errors: ['codeExplain: nothing to insert'] };
  const files = Array.isArray(payload.files) ? payload.files : [];
  const satelliteIds = files.slice(1).map((_, index) => `${id}-file-${index + 1}`);
  const card = Object.fromEntries(KEYS.filter(key => key in payload).map(key => [key, payload[key]]));
  card.figure = payload.figure ?? null; // the server attaches it after the model call: absent means no figure
  card.files = files.map((file, index) => ({ ...file, cardId: index === 0 ? 'self' : satelliteIds[index - 1] }));
  const errors = validateCodeExplain(card, { mode: 'client', lines, boardCardIds: satelliteIds });
  if (errors.length) return { ok: false, errors };
  const primary = { id, ...card, dx: 0, dy: 0, ...(app ? { app } : {}) };
  // ponytail: a satellite is always a new card, even when the board already holds a code card of that file and lines (the Files reader's own insertCodeCard would reveal it instead);
  // the contract needs a card the connector and `from` can name, and one more card is cheaper than a second kind of satellite.
  // The satellite is the Files reader's code card (repoCodeCard, the same block Add to canvas makes) over the lines its ranges span, plus ranges and the back-reference (spec 2b).
  const satellites = card.files.slice(1).map((file, index) => ({
    ...repoCodeCard({ app, repo: card.repo, commit: card.commit, path: file.path, ...hullOf(file.ranges), ranges: file.ranges.map(({ id: rangeId, start, end }) => ({ id: rangeId, start, end })), from: `codeExplain:${id}` }),
    id: satelliteIds[index], dx: 0, dy: 0,
  }));
  const links = satelliteIds.map((to, index) => ({ id: `${id}-link-${index + 1}`, from: id, fromSide: 'right', to, toSide: 'left', color: LINK_COLOR, label: String(index + 1) }));
  return { ok: true, blocks: [primary, ...satellites], links };
}

// Where the cards stand, as the canvas's column offsets (dx, dy) in block order. env (AdaptiveCanvas insertCodeExplain): source (the card to stand beside, a measured box, or null),
// obstacles (every other box), visible (the world rectangle in view), point (the view's centre), column (the column's width) and flowY (where the next card joins the column).
// The primary goes beside the source (besideSpot, the placement of every card made from a card); with no free place there, placeNote's rings; with no source, the free space
// nearest the view's centre. The satellites then stand to its right in walk order, each one gap beyond the last, past anything in the way.
export function placeCodeExplain(env, sizes = []) {
  const { source = null, obstacles = [], visible = null, point = { x: 0, y: 0 }, column, flowY } = env;
  const size = sizes[0] || CODE_EXPLAIN_SIZE;
  const first = (source && (besideSpot(source, size, obstacles, { h: size.h }) || placeNote(source, size, obstacles, visible))) || refCardSpot(point, obstacles, visible, size);
  const spots = [{ x: Math.round(first.x), y: Math.round(first.y), ...size }], taken = [...obstacles, spots[0]];
  for (const own of sizes.slice(1)) {
    const box = { ...(own || CODE_CARD) }, previous = spots.at(-1);
    let spot = { x: previous.x + previous.w + GAP, y: spots[0].y, w: box.w, h: box.h };
    for (let k = 0; k < 6 && !freeSpot(spot, taken); k += 1) spot = { ...spot, x: spot.x + box.w + GAP };
    if (!freeSpot(spot, taken)) spot = { ...spot, x: Math.max(...taken.map(other => other.x + other.w)) + GAP };
    spots.push(spot); taken.push(spot);
  }
  let flow = flowY;
  return spots.map(spot => { const at = { dx: Math.round(spot.x - (column - spot.w) / 2), dy: Math.round(spot.y - flow) }; flow += spot.h + 20; return at; });
}

// The whole step, for the answer's Add as card: validate, then insert through the canvas (ops.insertCodeExplain, LearnPage canvasOps) in one undo step. Idempotent on `id`: the
// canvas finds the card it already holds and shows it. -> { ok: true, id } or { ok: false, errors } and the caller falls back to today's chat card.
export function addCodeExplain(ops, { id, payload }) {
  if (!ops?.insertCodeExplain) return { ok: false, errors: ['This canvas cannot take the card.'] };
  const here = ops.repositoryContext?.() ?? null, sameCommit = here && payload?.commit && here.commit === payload.commit;
  const plan = planCodeExplain({ id, payload, app: here?.app ?? null, lines: sameCommit ? here.lines : UNKNOWN_LINES });
  if (!plan.ok) return plan;
  const sizes = plan.blocks.map((_, index) => (index ? CODE_CARD : CODE_EXPLAIN_SIZE));
  const beside = takeAskedFrom(payload.question, ops.hasBlock);
  const placed = ops.insertCodeExplain({ blocks: plan.blocks, links: plan.links, beside, place: env => placeCodeExplain(env, sizes) });
  return placed ? { ok: true, id: placed } : { ok: false, errors: ['This canvas cannot take the card.'] };
}
