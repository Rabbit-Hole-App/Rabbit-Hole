// R4.05 RoadmapJobs: one Durable Object per learner and board (name `org:ownerUserId:boardId`). D1 is the authority; the object only wakes up.
// An alarm rereads the outbox for this scope, claims due events, runs the registered handler for each kind, and re-arms itself for the earliest
// remaining wake. With no pending work it sets no alarm. A stale or duplicate kick is harmless: the handler decides from D1 what still applies.
// NOT BOUND: the Lead adds the binding and its migration tag to the wrangler configs (exact patch in the hand-back) and mounts roadmapRoute.
import { dueRoadmapEvents, claimRoadmapEvent, commitRoadmapEventEffect, retryRoadmapEvent, nextRoadmapWake, roadmapHandler, LEASE_SECONDS } from './roadmap-events.js';

const nowSeconds = () => Math.floor(Date.now() / 1000);
export const jobName = access => `${access.org}:${access.actorUserId}:${access.boardId}`;

// Wake the object for an access scope. Best effort by design: the commit already made the event durable, and the object's alarm plus the
// scheduler scan (boardsWithDueEvents) recover a lost kick.
export async function kickRoadmapJobs(env, scope) {
  if (!env.ROADMAP_JOBS) return false;
  const name = `${scope.org}:${scope.ownerUserId ?? scope.actorUserId}:${scope.boardId}`;
  try { await env.ROADMAP_JOBS.get(env.ROADMAP_JOBS.idFromName(name)).fetch('https://roadmap/kick', { method: 'POST', body: JSON.stringify(scope) }); return true; } catch { return false; }
}

export class RoadmapJobs {
  constructor(state, env, { clock = nowSeconds } = {}) { this.state = state; this.env = env; this.clock = clock; }

  async fetch(req) {
    // A kick carries the scope it concerns; the object stores it (the only thing it remembers) so its alarm can scan the same scope.
    const scope = await req.json().catch(() => null);
    if (scope?.org && scope.boardId) await this.state.storage.put('scope', { org: scope.org, ownerUserId: scope.ownerUserId ?? scope.actorUserId, boardId: scope.boardId });
    await this.arm(this.clock());
    return Response.json({ ok: true });
  }

  async arm(now) {
    const scope = await this.state.storage.get('scope');
    if (!scope) return;
    const at = await nextRoadmapWake(this.env.LEARN_DB, { scope });
    if (at == null) { await this.state.storage.deleteAlarm?.(); return; }
    await this.state.storage.setAlarm(Math.max(at, now) * 1000);
  }

  // Claim and run what is due. The effect and the processed marker commit together when the handler returns { effects }, otherwise (external work)
  // the handler marks its own durable outcome and returns { done: true }. A throw or { retry: true } releases the lease with a backoff.
  async alarm() {
    const now = this.clock(), db = this.env.LEARN_DB;
    const scope = await this.state.storage.get('scope');
    if (!scope) return;
    for (const event of await dueRoadmapEvents(db, { now, scope })) {
      const leaseToken = crypto.randomUUID();
      if (!await claimRoadmapEvent(db, { eventId: event.event_id, leaseToken, leaseUntil: now + LEASE_SECONDS, now })) continue;
      const handler = roadmapHandler(event.kind);
      let outcome = { done: true };
      try { outcome = handler ? await handler(this.env, event, { leaseToken, now }) || { done: true } : { done: true }; } catch { outcome = { retry: true }; }
      if (outcome.retry) await retryRoadmapEvent(db, { eventId: event.event_id, leaseToken, now });
      else await commitRoadmapEventEffect(db, { eventId: event.event_id, leaseToken, effects: outcome.effects || (() => []), now });
    }
    await this.arm(now);
  }
}
