// Durable, single-attempt execution and a global reservation ceiling. This
// coordinator is unexposed until authenticated routing and a budget are configured.
// Reservations are never labelled actual cost or refunded after uncertainty.
const ID = /^cj_[a-f0-9]{32}$/;
const bytes = value => new TextEncoder().encode(value).byteLength;
const sameOwner = (a, b) => a?.org === b?.org && a?.email === b?.email;
const jobKey = id => `code:job:${id}`;
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
const publicJob = job => ({ id: job.id, scope: { ...job.scope }, phase: job.phase, sourceSha256: job.sourceSha256, inputSha256: job.inputSha256,
  reservedMicros: job.reservedMicros, actualCostUsd: null, createdAt: job.createdAt, result: job.result || null, reason: job.reason || null });

export function createInlineCodeCoordinator({ storage, execute, policy, now = Date.now }) {
  if (!policy || !['maxRuns', 'maxMicros', 'reserveMicros'].every(key => Number.isSafeInteger(policy[key]) && policy[key] > 0)
    || policy.reserveMicros > policy.maxMicros) throw Error('A bounded execution budget is required.');
  const limits = { maxRuns: policy.maxRuns, maxMicros: policy.maxMicros, reserveMicros: policy.reserveMicros };
  const running = new Map();
  const get = async (tx, id, owner) => {
    if (typeof id !== 'string' || !ID.test(id)) throw Error('Invalid job identity.');
    const job = await tx.get(jobKey(id));
    if (!job || !sameOwner(job.owner, owner)) throw Error('Job unavailable.');
    return job;
  };
  async function create({ id, owner, scope, language, code, input = null, executionConfirmed, maxReservedMicros }) {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope) || Object.keys(scope).some(key => !['app', 'board'].includes(key))
      || typeof scope.app !== 'string' || !/^[a-z0-9-]{1,100}$/.test(scope.app)
      || typeof scope.board !== 'string' || !/^[A-Za-z0-9:_-]{1,200}$/.test(scope.board)) throw Error('An explicit canvas scope is required.');
    if (typeof id !== 'string' || !ID.test(id) || !owner || !['org', 'email'].every(key => typeof owner[key] === 'string' && owner[key] && owner[key].length <= 200)
      || language !== 'javascript' || typeof code !== 'string' || !code.trim() || bytes(code) > 32768 || executionConfirmed !== true
      || !Number.isSafeInteger(maxReservedMicros) || maxReservedMicros < limits.reserveMicros) throw Error('Explicit bounded JavaScript execution consent is required.');
    let encoded;
    try { encoded = JSON.stringify(input); if (encoded === undefined || bytes(encoded) > 16384) throw Error(); }
    catch { throw Error('Use JSON input within 16 KiB.'); }
    const sourceSha256 = await hash(code), inputSha256 = await hash(encoded);
    return storage.transaction(async tx => {
      const old = await tx.get(jobKey(id));
      if (old) {
        if (!sameOwner(old.owner, owner) || old.scope.app !== scope.app || old.scope.board !== scope.board || old.sourceSha256 !== sourceSha256 || old.inputSha256 !== inputSha256) throw Error('Job identity conflicts with another request.');
        return publicJob(old);
      }
      const budget = await tx.get('code:budget') || { policy: limits, runs: 0, reservedMicros: 0 };
      if (JSON.stringify(budget.policy) !== JSON.stringify(limits)) throw Error('The durable budget policy changed; new admission is paused.');
      if (budget.runs >= limits.maxRuns || budget.reservedMicros + limits.reserveMicros > limits.maxMicros) throw Error('The execution allowance is exhausted.');
      const job = { id, owner: { org: owner.org, email: owner.email }, scope: { app: scope.app, board: scope.board }, language, code, input: JSON.parse(encoded), sourceSha256, inputSha256,
        phase: 'queued', reservedMicros: limits.reserveMicros, createdAt: now() };
      await tx.put('code:budget', { ...budget, runs: budget.runs + 1, reservedMicros: budget.reservedMicros + limits.reserveMicros });
      await tx.put(jobKey(id), job);
      return publicJob(job);
    });
  }
  async function perform(id, owner, controller) {
    const claimed = await storage.transaction(async tx => {
      const job = await get(tx, id, owner);
      if (job.phase === 'started') {
        const unknown = { ...job, phase: 'unknown', reason: 'Execution was interrupted; it will not be repeated automatically.' };
        await tx.put(jobKey(id), unknown); return { done: unknown };
      }
      if (job.phase !== 'queued') return { done: job };
      const started = { ...job, phase: 'started' };
      await tx.put(jobKey(id), started); return { job: started };
    });
    if (claimed.done) return publicJob(claimed.done);
    let result, reason;
    try {
      result = await execute({ language: claimed.job.language, code: claimed.job.code, input: claimed.job.input, signal: controller.signal });
      if (!result || !['ok', 'error', 'timeout', 'cancelled', 'unavailable'].includes(result.status) || bytes(JSON.stringify(result)) > 40960
        || result.sourceSha256 !== claimed.job.sourceSha256 || result.inputSha256 !== claimed.job.inputSha256) throw Error('Execution response could not be verified.');
    } catch { reason = 'Execution outcome is unknown; the reservation remains held and no retry was started.'; }
    return storage.transaction(async tx => {
      const current = await get(tx, id, owner);
      // Cancellation wins even if a late successful response arrives.
      if (current.phase === 'cancelled') return publicJob(current);
      const uncertain = reason || result.status === 'timeout' || result.status === 'cancelled';
      const next = { ...current, phase: uncertain ? 'unknown' : result.status === 'ok' ? 'succeeded' : 'failed',
        result: reason ? null : JSON.parse(JSON.stringify(result)), reason: reason || (uncertain ? 'Termination is not confirmed. No automatic retry.' : null) };
      await tx.put(jobKey(id), next); return publicJob(next);
    });
  }
  function run(id, owner) {
    const active = running.get(id);
    if (active) {
      if (!sameOwner(active.owner, owner)) return Promise.reject(Error('Job unavailable.'));
      return active.promise;
    }
    const controller = new AbortController();
    const promise = perform(id, owner, controller).finally(() => running.delete(id));
    running.set(id, { owner: { ...owner }, controller, promise });
    return promise;
  }
  async function cancel(id, owner) {
    const job = await storage.transaction(async tx => {
      const current = await get(tx, id, owner);
      if (!['queued', 'started'].includes(current.phase)) return current;
      const cancelled = { ...current, phase: 'cancelled', result: null, reason: current.phase === 'started' ? 'Cancellation requested; termination is not confirmed.' : 'Cancelled before execution.' };
      await tx.put(jobKey(id), cancelled); return cancelled;
    });
    if (job.phase === 'cancelled') running.get(id)?.controller.abort();
    return publicJob(job);
  }
  return { create, run, cancel, status: async (id, owner) => publicJob(await get(storage, id, owner)) };
}
