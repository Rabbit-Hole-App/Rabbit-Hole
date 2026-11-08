import { STATEFUL_SCHEMA_VERSION, resolveInputs } from './explain-program/contract.js';
import { normalizeFrame } from './explain-program/frame.js';
import { resolveProgram } from './explain-program/program-card.js';
import { snapshotKey } from './interact-card-layout.js';

// INT-04-C14 / INT-06-C18 (docs/features/interact.md): a supporting panel is a read-only snapshot, not a player. The page keeps the existing
// two-Worker limit (explain-program/limits.js activeRuntimes) because a snapshot never holds a Worker: each one is made by a transient host
// (the existing createProgramHost and its shared pool), one at a time, and the host is disposed as soon as the frame is back.
// Pure of React; the hosts are injected so the rules are tested without a Worker.

// One frame of a support program at time zero with the bound inputs. -> { scene, state, readouts }. Throws the contract error on failure.
// The host is always disposed, on success, failure and cancellation.
export async function programSnapshot({ artifact, inputs, createHost }) {
  const host = createHost({ artifact });
  try {
    const manifest = artifact.manifest, resolved = resolveInputs(manifest, inputs);
    let state = null;
    if (artifact.schemaVersion === STATEFUL_SCHEMA_VERSION) state = (await host.initialize({ requestId: 'support-init', inputs: resolved, seed: 0 })).state;
    // supersede: false, so a waiting frame of this snapshot is not dropped by another card asking for the pool.
    const reply = await host.evaluate({ requestId: 'support-frame', inputs: resolved, time: 0, seed: 0, state }, { supersede: false });
    const out = normalizeFrame(reply.frame, manifest);
    if (!out.ok) throw out.error;
    return { scene: out.scene, state: out.state, readouts: out.readouts };
  } finally {
    host.dispose('support snapshot done');
  }
}

// The accepted artifact of one support panel, through the same authorized result route as the main program. The panel names its own program
// the way a block does ({ bundleHash } or a dev fixture); the route is asked for that panel by id.
// ponytail: the third argument (the panel id) is the contract the server lane must honour on the result route; until it does a support
// program cannot be resolved and the panel says so instead of drawing nothing.
export function resolveSupportArtifact(panel, { block, client, fixtures = false, stamps = null }) {
  const program = panel.artifact.program;
  const asked = client ? { result: (resultId, cardId) => client.result(resultId, cardId, panel.id) } : null;
  return resolveProgram({ ...block, program }, { client: asked, fixtures, stamps });
}
export const artifactKey = panel => (panel.artifact.kind === 'spec' ? `spec:${panel.id}` : `program:${panel.artifact.program?.bundleHash ?? panel.artifact.program?.fixtureId ?? panel.id}`);

// One service per page: snapshots run strictly one after another, and a finished snapshot is cached by artifact and bound inputs, so
// re-drawing the card (or a Current/Proposed switch back) does not re-run a program. A request whose card has gone away (live() is false
// when its turn comes) never creates a host, and its result is dropped by the caller's own fence.
export function createSnapshotService({ size = 16 } = {}) {
  const cache = new Map();
  let tail = Promise.resolve(), active = 0, peak = 0;
  const keep = (key, value) => { cache.delete(key); cache.set(key, value); if (cache.size > size) cache.delete(cache.keys().next().value); };
  return {
    // run: () => Promise<value>. -> the value, or null when it was cancelled before its turn.
    request({ artifact, inputs, live = () => true, run }) {
      const key = snapshotKey(artifact, inputs);
      if (cache.has(key)) { const hit = cache.get(key); keep(key, hit); return Promise.resolve(hit); }
      const job = tail.then(async () => {
        if (!live()) return null;
        if (cache.has(key)) return cache.get(key);
        active += 1; peak = Math.max(peak, active);
        try { const value = await run(); keep(key, value); return value; } finally { active -= 1; }
      });
      tail = job.catch(() => {}); // one failure never blocks the next panel
      return job;
    },
    clear: () => cache.clear(),
    stats: () => ({ active, peak, cached: cache.size }),
  };
}
export const supportSnapshots = createSnapshotService();
