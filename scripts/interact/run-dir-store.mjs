// The run-directory store of scripts/interact/run.mjs (INT-07B-C06 to C08): the runner's store contract on plain files, with atomic writes.
//   load(runId) -> state | null        save(runId, expectedRevision, next) -> revision, refused when the stored revision is not the expected one
//   putArtifact(hash, bytes, kind)     getArtifact(hash)                     applyEffect(effect): idempotent by effect.key
// state.json is the one source of truth; request.json, profile.json (no credentials), plan.json, approval.json, composition.json, checks.json,
// calls.jsonl and result.json are written from it after each save so a run reads like its record. A plan-only run is not labelled a built card.
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StaleRevisionError } from '../../packages/control-plane/src/interact-runner.js';

const exists = async file => readFile(file).then(() => true, () => false);
async function atomic(file, data) { const tmp = `${file}.${process.pid}.tmp`; await writeFile(tmp, data); await rename(tmp, file); }
const json = value => `${JSON.stringify(value, null, 2)}\n`;

export function createRunDirStore(dir) {
  const at = (...parts) => join(dir, ...parts);
  const store = {
    dir,
    async load() {
      try { return JSON.parse(await readFile(at('state.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async save(runId, expectedRevision, next) {
      await mkdir(dir, { recursive: true });
      const current = await store.load(), have = current?.revision ?? 0;
      if (current ? have !== expectedRevision : expectedRevision !== 0) throw new StaleRevisionError(runId, expectedRevision, have);
      const saved = { ...next, revision: expectedRevision + 1 };
      await atomic(at('state.json'), json(saved));
      await store.materialize(saved);
      return saved.revision;
    },
    async materialize(state) {
      const files = {
        'request.json': { runId: state.runId, flowVersion: state.flowVersion, ...state.request }, 'profile.json': state.profile,
        ...(state.plan ? { 'plan.json': { planHash: state.planHash, plan: state.plan, design: state.design } } : {}),
        ...(state.approval ? { 'approval.json': state.approval } : {}),
        ...(state.composition ? { 'composition.json': state.composition } : {}),
        ...(state.check ? { 'checks.json': { check: state.check, review: state.review, captures: state.captures } } : {}),
        'result.json': { status: state.result?.status ?? state.stage, stage: state.stage, builtCard: state.stage === 'card_ready', planHash: state.planHash ?? null, ...(state.result ?? {}), failure: state.failure ?? null, rounds: state.round, calls: state.calls.length, paidCalls: state.request.fixture ? 0 : undefined },
      };
      for (const [name, value] of Object.entries(files)) await atomic(at(name), json(value));
      await atomic(at('calls.jsonl'), state.calls.map(c => JSON.stringify(c)).join('\n') + (state.calls.length ? '\n' : ''));
    },
    async putArtifact(hash, bytes, kind = 'artifact') {
      await mkdir(at('blobs'), { recursive: true });
      const png = bytes instanceof Uint8Array, file = at('blobs', `${hash}.${png ? 'png' : 'json'}`);
      if (!(await exists(file))) await atomic(file, png ? bytes : json({ kind, hash, value: bytes }));
    },
    async getArtifact(hash) {
      try { return new Uint8Array(await readFile(at('blobs', `${hash}.png`))); } catch { /* not a capture */ }
      try { return JSON.parse(await readFile(at('blobs', `${hash}.json`), 'utf8')).value; } catch { return null; }
    },
    // The CLI's effect adapter: record each effect once, by its persisted key, however many times it is replayed.
    async applyEffect(effect) {
      await mkdir(dir, { recursive: true });
      const log = at('effects.jsonl'), seen = new Set((await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(line => JSON.parse(line).key));
      if (!seen.has(effect.key)) await appendFile(log, `${JSON.stringify({ type: effect.type, key: effect.key, payload: effect.payload })}\n`);
    },
  };
  return store;
}
