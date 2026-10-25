// The dev worker behind the provider tripwire (provider-tripwire.js), for local gate stacks only.
import { tripwired } from './provider-tripwire.js';
import worker from '../dev-worker.js';
// Every Durable Object class the dev worker exports: a config binding one this entry dropped refuses to start (ExplainJobs, 2026-10-22).
export * from '../dev-worker.js';
// Spend enforcement for one browser context (credits-meter-check.mjs, allowance-enforcement-check.mjs). The keyless stack runs
// SMALL_ENV=test, where nothing is metered or refused, and every other check relies on that. A request carrying this header gets
// the environment a real deployment has instead: SMALL_ENV=dev (spendEnforced), a platform daily limit and a placeholder
// provider key that cannot reach anyone (the tripwire answers every provider host). Only the test stack and only this header;
// no wrangler config points at this file for a deployment.
const ENFORCE_SPEND = 'x-e2e-enforce-spend';
const enforcing = {
  ...worker,
  fetch: (req, env, ctx) => (req.headers.get(ENFORCE_SPEND) === '1' && env.SMALL_ENV === 'test'
    ? worker.fetch(req, { ...env, SMALL_ENV: 'dev', USAGE_PLATFORM_DAY_USD: '1000', ANTHROPIC_API_KEY: 'e2e-placeholder-not-a-key' }, ctx)
    : worker.fetch(req, env, ctx)),
};
export default tripwired(enforcing);
