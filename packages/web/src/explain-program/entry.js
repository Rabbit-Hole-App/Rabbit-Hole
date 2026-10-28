// Bundle entry for the generated-program runtime Worker (Task 1 proof). host.js (Task 3) replaces this as the Vite input.
export const createRuntimeWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
