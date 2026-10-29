// Busy-loop CPU load for the loaded-machine timing run: <workers> threads spinning for <seconds>, then exit. Owns nothing else.
import { Worker } from 'node:worker_threads';
const n = Number(process.argv[2] || 4), seconds = Number(process.argv[3] || 15);
const code = `const end = Date.now() + ${seconds * 1000}; let x = 0; while (Date.now() < end) x += Math.sqrt(x + 1);`;
const workers = Array.from({ length: n }, () => new Worker(code, { eval: true }));
await Promise.all(workers.map(w => new Promise(r => w.on('exit', r))));
