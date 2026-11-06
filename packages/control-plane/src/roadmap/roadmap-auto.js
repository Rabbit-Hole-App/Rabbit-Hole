// R6 automatic next proposals (checklist R6.01-R6.02): when a card is delivered, or Ask/Tutor or Auto-suggest changes, the roadmap offers its next
// step by itself. This composes METADATA only: it reuses the R4 composer (roadmap-compose.js, deterministic, no model call) and the R4 manual offer
// (proposeNextStep), so there is no card generation, no authorization, no hold and no learner charge here, by construction. It is not R5 (editing)
// and not R11 (preparing results before acceptance): nothing is generated until the learner accepts.
// Triggers are outbox events (card_delivered, mode_changed, autosuggest_changed per roadmap; settings_changed per learner, expanded below). Every
// handler re-reads the CURRENT roadmap, mode and preference before acting, so an old Tutor event cannot resume work after a newer Ask.
// Gate: ROADMAP_ENABLED and ROADMAP_AUTO_ENABLED both 'true'. Unset, handlers do nothing and the manual Propose next step is unchanged.
import { StateError } from './roadmap-contract.js';
import { readRoadmap } from './roadmap-store.js';
import { proposeNextStep } from './roadmap-lifecycle.js';
import { composeProposal } from './roadmap-compose.js';
import { accessForRoadmap, revalidateSourceAsJob } from './roadmap-access.js';
import { AUTO_FACT, roadmapAutoEnabled } from './roadmap-settings-events.js';
import { readAutoSuggest } from '../learn-user-settings.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
export const AUTO_KINDS = Object.freeze(['card_delivered', 'mode_changed', 'autosuggest_changed']);
const FANOUT_PAGE = 25, FANOUT_PAGES = 8; // a run expands at most 200 roadmaps, then yields; the retry continues from what is left
const newEventId = () => `ev_${crypto.randomUUID().replace(/-/g, '')}`;

// -> a reason the roadmap must not get an unsolicited proposal right now, or null. Everything is read from D1 at the moment of deciding.
async function ineligible(db, access, roadmap, { autoSuggest, revalidate }) {
  if (!roadmap) return 'gone';
  if (roadmap.state !== 'active') return 'not_active'; // paused (Cancel), completed, ended, failed or not yet accepted: nothing unsolicited
  if (roadmap.mode === 'ask') return 'ask';
  if (!autoSuggest) return 'auto_suggest_off';
  // The first proposal after Accept plan stays the learner's (Propose next step); automatic ones follow a step that was delivered or omitted.
  const finished = await db.prepare("SELECT 1 AS n FROM learn_roadmap_steps WHERE roadmap_id = ? AND plan_version = ? AND state IN ('delivered', 'skipped') LIMIT 1").bind(roadmap.id, roadmap.plan_version).first();
  if (!finished) return 'nothing_delivered';
  const source = await revalidate(db, access, roadmap);
  if (!source.ok) return source.code || 'source_unavailable'; // the manual Propose next step and the plan revision flow own the recovery
  return null;
}

// ponytail: no pre-composition of the successor while the accepted step finishes (R6.02 allows it): composing is instant and deterministic, so it is done at reveal. No model-written proposal either (R5 or later).
// ensureNextProposal: one guarded coordinator action. -> { status: 'offered'|'completed'|'skipped', reason?, body?, replayed? }.
// An offered proposal occupies the roadmap's single proposal position (checking, held or pending) in the same batch as the action, so a concurrent
// manual Next, an event replay and a second device converge on one proposal or a skipped conflict, never two offers. The action key derives from the
// trigger event, so a replay of that event returns the recorded outcome. Pausing (Cancel, End, Ask, Auto-suggest off) is read here, not remembered.
export async function ensureNextProposal(env, access, { roadmapId, triggerEventId, autoSuggest, compose, revalidate = revalidateSourceAsJob, now = nowSeconds() }) {
  const db = env.LEARN_DB;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const roadmap = await readRoadmap(db, access, roadmapId);
    const reason = await ineligible(db, access, roadmap, { autoSuggest, revalidate });
    if (reason) return { status: 'skipped', reason };
    try {
      const done = await proposeNextStep(db, access, { roadmapId, expectedRevision: roadmap.revision, actionKey: `rmauto_${triggerEventId}`, compose: compose || ((rm, step) => composeProposal(db, rm, step)), now });
      return { status: done.body.state === 'completed' ? 'completed' : 'offered', body: done.body, replayed: !!done.replayed };
    } catch (error) {
      if (!(error instanceof StateError)) throw error;
      if (error.code === 'stale_revision' && attempt === 0) continue; // the roadmap moved under us: decide again from the new state
      return { status: 'skipped', reason: error.code }; // proposal_not_pending, roadmap_not_active, action_key_reused...: someone else already decided
    }
  }
  return { status: 'skipped', reason: 'stale_revision' };
}

// The handler for card_delivered, mode_changed and autosuggest_changed. deps: { autoSuggest?(env, access), compose?, revalidate?, timing?(record), ignoreFlag? }.
export async function autoProposalHandler(env, event, { now = nowSeconds() } = {}, deps = {}) {
  if (!roadmapAutoEnabled(env) && !deps.ignoreFlag) return { done: true };
  const db = env.LEARN_DB;
  const access = await accessForRoadmap(db, event);
  if (!access) return { done: true }; // unknown roadmap or revoked access: stop, spend nothing
  if (event.kind === 'autosuggest_changed') {
    const latest = await db.prepare('SELECT revision FROM learn_roadmap_settings_facts WHERE org = ? AND owner_user_id = ?').bind(access.org, access.actorUserId).first();
    if (latest && latest.revision > event.fact_revision) return { done: true }; // a newer preference has its own event
  }
  if (event.kind === 'mode_changed') {
    const roadmap = await readRoadmap(db, access, event.roadmap_id);
    if (roadmap && roadmap.mode_revision > event.fact_revision) return { done: true };
  }
  const autoSuggest = deps.autoSuggest ? await deps.autoSuggest(env, access) : await readAutoSuggest(env, { org: access.org, userId: access.actorUserId });
  const startedAt = Date.now();
  const result = await ensureNextProposal(env, access, { roadmapId: event.roadmap_id, triggerEventId: event.event_id, autoSuggest, compose: deps.compose, revalidate: deps.revalidate, now });
  // Timing for the receipt (R6.03): the event's creation is the delivery acknowledgment; the client adds the moment the proposal became visible.
  deps.timing?.({ eventId: event.event_id, kind: event.kind, status: result.status, reason: result.reason ?? null, ackedAt: event.created_at * 1000, composeStartedAt: startedAt, composeEndedAt: Date.now() });
  return { done: true };
}

// settings_changed (learner scope) -> one autosuggest_changed per unfinished roadmap of that learner, in bounded pages. The children are the cursor:
// a roadmap that already has this fact's child is not selected again, so a restart after a crash resumes where it stopped and omits no canvas, and
// the unique event identity makes a repeated insert a no-op. The parent is marked processed (by the runner) only after the last page.
export async function settingsFanoutHandler(env, event, { leaseToken, now = nowSeconds() } = {}, deps = {}) {
  if (!roadmapAutoEnabled(env) && !deps.ignoreFlag) return { done: true };
  const db = env.LEARN_DB;
  const factId = event.fact_id || AUTO_FACT;
  const lease = { sql: 'EXISTS (SELECT 1 FROM learn_roadmap_outbox WHERE event_id = ? AND lease_token = ? AND processed_at IS NULL)', binds: [event.event_id, leaseToken] };
  const boards = new Set();
  const wake = async () => { for (const boardId of boards) await deps.kick?.(env, { org: event.org, ownerUserId: event.owner_user_id, boardId }); };
  for (let page = 0; page < FANOUT_PAGES; page += 1) {
    const { results } = await db.prepare(`SELECT r.id, r.board_id FROM learn_roadmaps r WHERE r.org = ? AND r.owner_user_id = ? AND r.state IN ('draft', 'questioning', 'proposed', 'active', 'paused')
      AND NOT EXISTS (SELECT 1 FROM learn_roadmap_outbox o WHERE o.org = r.org AND o.owner_user_id = r.owner_user_id AND o.scope = 'roadmap' AND o.board_id = r.board_id AND o.roadmap_id = r.id AND o.kind = 'autosuggest_changed' AND o.fact_id = ? AND o.fact_revision = ?)
      ORDER BY r.id LIMIT ?`).bind(event.org, event.owner_user_id, factId, event.fact_revision, FANOUT_PAGE).all();
    if (!results?.length) break;
    await db.batch(results.map(r => db.prepare(`INSERT OR IGNORE INTO learn_roadmap_outbox (event_id, org, owner_user_id, scope, board_id, roadmap_id, kind, fact_id, fact_revision, payload_json, next_at, attempts, deadline_at, created_at)
      SELECT ?, ?, ?, 'roadmap', ?, ?, 'autosuggest_changed', ?, ?, ?, ?, 0, ?, ? WHERE ${lease.sql}`)
      .bind(newEventId(), event.org, event.owner_user_id, r.board_id, r.id, factId, event.fact_revision, event.payload_json, now, now + 300, now, ...lease.binds)));
    results.forEach(r => boards.add(r.board_id));
    if (page === FANOUT_PAGES - 1) { await wake(); return { retry: true }; } // more may remain: yield, then continue from the children already written
  }
  await wake();
  return { done: true };
}
