// Product-owned Learn experiences (docs/features/production-tutor-entry.md): the production allowlist.
// A learner reaches one from the product UI (the Tutor button on the supplied NanoGPT course), which sets
// ?experience=<name>. That name is not a board: only the names listed here open anything, each opens one
// fixed board on one fixed repository, and ?board= stays review tooling (flags.js reviewTools).
import { TUTOR_BOARD, tutorSliceBlocks } from './learn-tutor-claims.js';

// First launch: exactly the approved NanoGPT Tutor. `version` is the board's seed version, the same
// number demo-scenes.js BOARD_SEED_VERSIONS gives it, so the review board and the product share one canvas.
export const EXPERIENCES = Object.freeze({
  tutor: Object.freeze({ board: TUTOR_BOARD, repo: 'karpathy/nanoGPT', version: 1, seed: tutorSliceBlocks }),
});

// The experience this URL asks for, or null: a listed name, on its own repository, in a Rabbit Hole build.
export function experienceOf(app, search, enabled) {
  if (!enabled || app?.kind !== 'repository') return null;
  const name = new URLSearchParams(search).get('experience');
  const entry = name && Object.hasOwn(EXPERIENCES, name) ? EXPERIENCES[name] : null;
  return entry && app.repo === entry.repo ? name : null;
}

// The experience a board belongs to, so a Rabbit Hole climbs back through the product URL (dive.js levelHref).
export const experienceForBoard = board => Object.keys(EXPERIENCES).find(name => EXPERIENCES[name].board === board) || null;

// A repository's Learn tab, in an experience or (null) the normal lesson.
export const experienceHref = (app, name) => `/apps/${app}?tab=learn${name ? `&experience=${name}` : ''}`;
