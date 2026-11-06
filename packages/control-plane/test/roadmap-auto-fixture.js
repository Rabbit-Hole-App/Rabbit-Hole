// Shared setup for the R6 tests (roadmap-auto.test.js, roadmap-auto-events.test.js): a roadmap whose first step is delivered through the real store
// (accept, generation settled by hand, acknowledgment), the automatic-proposal handlers registered with injectable doubles, and migration 0040 applied
// to the in-memory database only. No model, no provider, no network.
import { readFileSync } from 'node:fs';
import { acceptRoadmapStep, acknowledgeDelivery } from '../src/roadmap/roadmap-store.js';
import { registerRoadmapHandler, runDueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { autoProposalHandler, settingsFanoutHandler, AUTO_KINDS } from '../src/roadmap/roadmap-auto.js';
import { world, offered, accessFor, rows } from './roadmap-fixture.js';

export const MIGRATION_0040 = readFileSync(new URL('../learn-migrations/0040-roadmap-settings-facts.sql', import.meta.url), 'utf8');
export const T0 = Math.floor(Date.now() / 1000);

// Mutable doubles the registered handlers read at call time.
export const doubles = { autoSuggest: async () => true, revalidate: async () => ({ ok: true }), timings: [], kicks: [], compose: undefined };
export function registerAutoHandlers() {
  const deps = () => ({ autoSuggest: doubles.autoSuggest, revalidate: doubles.revalidate, compose: doubles.compose, timing: r => doubles.timings.push(r), kick: async (_env, scope) => doubles.kicks.push(scope) });
  for (const kind of AUTO_KINDS) registerRoadmapHandler(kind, (env, event, ctx) => autoProposalHandler(env, event, ctx, deps()));
  registerRoadmapHandler('settings_changed', (env, event, ctx) => settingsFanoutHandler(env, event, ctx, deps()));
}
export function resetDoubles() { doubles.autoSuggest = async () => true; doubles.revalidate = async () => ({ ok: true }); doubles.timings.length = 0; doubles.kicks.length = 0; doubles.compose = undefined; }

export const flags = (env, { roadmap = 'true', auto = 'true' } = {}) => ({ ...env, ROADMAP_ENABLED: roadmap ?? undefined, ROADMAP_AUTO_ENABLED: auto ?? undefined });

// A roadmap whose step 1 was accepted, generated (settled by hand: money is R4's concern) and delivered by acknowledgment. Step 2 is planned.
// The card_delivered event is left pending so a test decides when the handlers run. -> { w, access, o, env }
export async function delivered(t, { n = 1, boardId, userId = 'u-alice', withSettings = true, ack = true } = {}) {
  const w = world(t);
  if (withSettings) w.sqlite.exec(MIGRATION_0040);
  const access = boardId ? accessFor(userId, boardId) : w.access;
  if (boardId) w.sqlite.prepare("INSERT OR IGNORE INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES (?, 'team', ?, 'learn', ?, '{}', '2026-11-06')").run(boardId, access.actorEmail, `board-${n}`);
  const o = await offered(w, access, { n });
  const accepted = await acceptRoadmapStep(w.env, access, { roadmapId: o.roadmapId, revision: o.revision, proposalId: o.proposalId, proposalVersion: o.proposalVersion, actionKey: `accept-key-000${n}`, now: T0 });
  const slot = accepted.body.slots[0];
  w.sqlite.prepare("UPDATE learn_step_results SET generation = 'generated', validation = 'passed', billing = 'settled', primitive = 'explanation', body_json = '{}' WHERE id = ?").run(slot.resultId);
  const revision = rows(w.sqlite, 'SELECT revision FROM learn_roadmaps WHERE id = ?', o.roadmapId)[0].revision;
  if (ack) await acknowledgeDelivery(w.LEARN_DB, access, { roadmapId: o.roadmapId, resultId: slot.resultId, expectedRevision: revision, actionKey: `ack-key-0000${n}`, cardIds: [slot.cardId], boardVersion: 1, now: T0 });
  // The step_accepted event is not under test here: only the delivery's own event stays pending.
  w.sqlite.prepare("DELETE FROM learn_roadmap_outbox WHERE kind = 'step_accepted'").run();
  return { w, access, o, env: flags(w.env), slot };
}

export const scopeOf = access => ({ org: access.org, ownerUserId: access.actorUserId, boardId: access.boardId });
export const run = (env, access, now = T0 + 5) => runDueRoadmapEvents(env, { scope: scopeOf(access), now });
// Proposals made AFTER the fixture's delivered step 1 (its own accepted proposal is not counted).
export const proposals = (w, roadmapId) => rows(w.sqlite, 'SELECT p.step_id, p.version, p.state FROM learn_step_proposals p JOIN learn_roadmap_steps s ON s.id = p.step_id WHERE p.roadmap_id = ? AND s.position > 1 ORDER BY p.created_at, p.version', roadmapId);
export const offeredNow = (w, roadmapId) => proposals(w, roadmapId).filter(p => ['checking', 'held', 'pending'].includes(p.state));
// Everything money-shaped that proposal composition must never touch.
export const spendRows = w => ({
  authorizations: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_authorizations')[0].n,
  results: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_step_results')[0].n,
  calls: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM learn_roadmap_calls')[0].n,
  usage: rows(w.sqlite, 'SELECT COUNT(*) AS n FROM usage_attempts')[0].n,
});
