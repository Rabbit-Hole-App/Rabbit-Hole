// The dev worker behind the provider tripwire (provider-tripwire.js), for local gate stacks only.
import { tripwired } from './provider-tripwire.js';
import worker from '../dev-worker.js';
// Every Durable Object class the dev worker exports: a config binding one this entry dropped refuses to start (ExplainJobs, 2026-10-22).
export * from '../dev-worker.js';
export default tripwired(worker);
