// The control plane behind the provider tripwire (provider-tripwire.js), for local gate stacks only.
import { tripwired } from './provider-tripwire.js';
import worker from '../../control-plane/src/index.js';
export * from '../../control-plane/src/index.js';
export default tripwired(worker);
