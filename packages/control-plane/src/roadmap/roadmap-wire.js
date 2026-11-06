// R4 integration glue: assembles the injected interfaces the lanes expect from each other into the production dependencies of roadmapRoute and
// the outbox handlers. NOTHING here is mounted: the Lead mounts `roadmapRoute(path, req, env, roadmapDeps(env, ctx))`, calls registerRoadmapHandlers()
// once where RoadmapJobs is exported, and calls scheduledRoadmapKick(env) from the scheduled handler (docs/features/explain-on-canvas/lead-patches/).
// ROADMAP_ENABLED stays unset by default, so every route answers 404 until the owner's activation.
import { registerRoadmapHandler, boardsWithDueEvents, runDueRoadmapEvents } from './roadmap-events.js';
import { kickRoadmapJobs } from './roadmap-jobs.js';
import { makeReadSource } from './roadmap-source-read.js';
import { composeProposal } from './roadmap-compose.js';
import { mintStepRefs } from './roadmap-source-refs.js';
import { planningHandler } from './roadmap-planning.js';
import { generationHandler } from './roadmap-run.js';
import { sweepUndelivered } from './roadmap-sweep.js';
import { readAutoSuggest } from '../learn-user-settings.js';
import { AUTO_KINDS, autoProposalHandler, settingsFanoutHandler } from './roadmap-auto.js';

const scopeOf = access => ({ org: access.org, ownerUserId: access.actorUserId, boardId: access.boardId });

// Wake the learner's RoadmapJobs object for this board. Without the binding (a dev worker before the Lead adds it) the due events run inline in the
// request's waitUntil, so the same handlers work; the event rows are already durable either way.
export function roadmapKick(env, ctx) {
  return async (_env, access) => {
    if (env.ROADMAP_JOBS) return kickRoadmapJobs(env, scopeOf(access));
    const run = runDueRoadmapEvents(env, { scope: scopeOf(access) }).catch(() => 0);
    if (ctx?.waitUntil) ctx.waitUntil(run); else await run;
    return true;
  };
}

// The learner's own settings for roadmap invitations (R2): Auto-suggest per learner (learn_user_settings, on when unsaved) and the canvas's coaching mode
// (learn_coaching_state.mode, joined from the board id; no row yet = no stored mode, so the client hint applies). Read-only: never creates a coaching row.
export const learnerSettings = env => async (_db, access) => {
  const autoSuggest = await readAutoSuggest(env, { org: access.org, userId: access.actorUserId });
  let mode;
  try {
    mode = (await env.LEARN_DB.prepare('SELECT s.mode FROM learn_boards b JOIN learn_coaching_state s ON s.org = b.org AND s.app = b.app AND s.board = b.board AND s.owner_user_id = ? WHERE b.id = ? AND b.org = ?')
      .bind(access.actorUserId, access.boardId, access.org).first())?.mode;
  } catch { /* a database without learn_coaching_state: no stored mode */ }
  return { autoSuggest, mode };
};

// deps for roadmapRoute. `settings` is the reader seam (Auto-suggest, mode); the default reads the learner's saved settings (learnerSettings).
export function roadmapDeps(env, ctx = null, { settings = learnerSettings(env), readSourceOptions } = {}) {
  const kick = roadmapKick(env, ctx);
  return { readSource: makeReadSource(env, readSourceOptions), startPlanning: kick, onAccepted: kick, onFact: kick, compose: (roadmap, step) => composeProposal(env.LEARN_DB, roadmap, step),
    mintStepRefs: (e, access, roadmapId) => mintStepRefs(e, access, roadmapId), settings };
}

// The durable handlers. `deps` is the test/injection seam of the handlers (callModel, registry, transport, classify, base, ...). Idempotent.
// R6: the automatic-proposal handlers (roadmap-auto.js) are registered too; they do nothing unless ROADMAP_AUTO_ENABLED is 'true'.
export function registerRoadmapHandlers(deps = {}) {
  registerRoadmapHandler('plan_requested', (env, event, ctx) => planningHandler(env, event, ctx, deps));
  registerRoadmapHandler('step_accepted', (env, event, ctx) => generationHandler(env, event, ctx, deps));
  for (const kind of AUTO_KINDS) registerRoadmapHandler(kind, (env, event, ctx) => autoProposalHandler(env, event, ctx, deps));
  registerRoadmapHandler('settings_changed', (env, event, ctx) => settingsFanoutHandler(env, event, ctx, { kick: wakeBoard, ...deps }));
}
// Wake one board's RoadmapJobs after a fan-out wrote its event; without the binding (dev before the Lead adds it) run that board's due events inline.
const wakeBoard = (env, scope) => (env.ROADMAP_JOBS ? kickRoadmapJobs(env, scope) : runDueRoadmapEvents(env, { scope }).catch(() => 0));

// The bounded recurring scan that closes the commit-before-notify gap (R4.05): boards with due events get their object kicked.
export async function scheduledRoadmapKick(env, { limit = 50 } = {}) {
  let kicked = 0;
  // A learner-scope event (R6 Auto-suggest fan-out) names no board, so no object: run it here. Everything else wakes its board's object.
  for (const scope of await boardsWithDueEvents(env.LEARN_DB, { limit })) if (scope.boardId === '' ? await runDueRoadmapEvents(env, { scope }).catch(() => 0) : await kickRoadmapJobs(env, scope)) kicked += 1;
  await sweepUndelivered(env).catch(() => null); // the bounded delivery deadline: place-or-refund (roadmap-sweep.js)
  return kicked;
}
