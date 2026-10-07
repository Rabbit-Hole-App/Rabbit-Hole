// The app worker behind the provider tripwire (provider-tripwire.js), for local gate stacks only.
import { tripwired } from './provider-tripwire.js';
import worker from '../app-worker.js';
export { RepositoryImports, LearnScenes, LearnVideos } from '../app-worker.js';
export default tripwired(worker);
