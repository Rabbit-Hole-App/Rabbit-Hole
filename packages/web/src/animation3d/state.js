// The one atomic commit rule for an /animation simulation (plan section 5 "State and recovery rules", AN-04). Pure.
// A record is { artifact, snapshot, frame }: the validated artifact, the durable snapshot (contract.js SNAPSHOT_SCHEMA) and the
// frame that snapshot draws. Nothing replaces the committed record unless the candidate was computed from it (stamp) and both its
// snapshot and its frame validate: a stale or invalid result changes nothing, so the last good state, inputs and frame survive.
//   commitAnimationStep(previous, candidate, stamp) -> { ok: true, value: record } | { ok: false, reason: 'stale' | 'invalid', issues? }
//     previous   the committed record, or null for the first commit (initial state or a hydrated snapshot)
//     candidate  { artifact?, snapshot: { inputs, state, seed, time, tick, paused, stamp? }, frame }; artifact only for the first commit
//     stamp      previous.snapshot.stamp as it was when the candidate's computation started (null for the first commit)
// Stamps only grow: each commit is previous stamp + 1, a reset included, so a reply computed before it can never match again.
import { SNAPSHOT_SCHEMA, validateAnimationFrame, validateAnimationSnapshot } from './contract.js';

export function commitAnimationStep(previous, candidate, stamp) {
  const artifact = previous ? previous.artifact : candidate?.artifact;
  if (previous && (stamp !== previous.snapshot.stamp || (candidate.artifact && candidate.artifact !== artifact))) return { ok: false, reason: 'stale' };
  if (!artifact) return { ok: false, reason: 'invalid', issues: [{ path: 'artifact', code: 'invalid_value', message: 'the first commit needs its artifact' }] };
  // A snapshot that names another artifact or revision (a saved one, say) never commits into this one.
  const { artifactId = artifact.artifactId, revision = artifact.revision } = candidate.snapshot;
  if (artifactId !== artifact.artifactId || revision !== artifact.revision) return { ok: false, reason: 'stale' };
  const snapshot = validateAnimationSnapshot({
    ...candidate.snapshot, schema: SNAPSHOT_SCHEMA, artifactId: artifact.artifactId, revision: artifact.revision,
    stamp: previous ? previous.snapshot.stamp + 1 : candidate.snapshot.stamp ?? 0,
  }, artifact);
  if (!snapshot.ok) return { ok: false, reason: 'invalid', issues: snapshot.issues };
  const frame = validateAnimationFrame(candidate.frame, artifact);
  if (!frame.ok) return { ok: false, reason: 'invalid', issues: frame.issues };
  return { ok: true, value: Object.freeze({ artifact, snapshot: snapshot.value, frame: frame.value }) };
}
