// The feature event registrations (docs/features/telemetry.md "Adding an event"). One file per feature, each a plain object with
// no imports: { namespace, events, errorCodes?, browser? }. An adapter adds ITS file, one import line and one list entry below,
// and touches nothing else in the contract. This file is merged with git's union driver (.gitattributes), so two adapters that
// each add a line here do not conflict; keep one entry per line. The contract owner reviews each addition.
import client from './client.js';
import support from './support.js';
import tutor from './tutor.js';

export const FEATURE_EVENTS = [
  client,
  support,
  tutor,
];
