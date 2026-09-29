// ELK in a Web Worker (Tool Performance v1, docs/features/learn-tool-performance.md):
// the 1.4 MB layout engine parses and runs off the main thread, and every
// flow diagram shares the one worker. learn-warmup.js starts it on idle.
import ELK from 'elkjs/lib/elk-api.js';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';

let engine;
export const layoutEngine = () => (engine ??= new ELK({ workerUrl }));
