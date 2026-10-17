// Test double for child.mjs (service.test.mjs only): the same job-directory protocol with no
// conversion, so the service's HTTP, idempotency, limits, uploads and cleanup test in seconds.
//   node stub-child.mjs <jobDir> ready | slow | sleep | failed | crash | undeclared
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, mode] = process.argv.slice(2);
const out = join(dir, 'out');
const job = JSON.parse(readFileSync(join(dir, 'job.json'), 'utf8'));
const source = readFileSync(join(dir, 'in', 'source'));
const result = r => writeFileSync(join(out, 'result.json'), JSON.stringify({ sandbox: { mode: process.env.CONVERT_SANDBOX, env_keys: Object.keys(process.env).sort() }, ...r }));
const ready = () => {
  writeFileSync(join(out, 'preview.pdf'), Buffer.concat([Buffer.from('%PDF-1.7 stub '), source.subarray(0, 16)]));
  writeFileSync(join(out, 'text.json'), JSON.stringify({ units: [{ page: 1, text: 'stub' }], chars: 4 }));
  result({ status: 'ready', source_kind: 'doc', outputs: [
    { name: 'preview.pdf', kind: 'preview', media_type: 'application/pdf', meta: { pages: 1 } },
    { name: 'text.json', kind: 'text', media_type: 'application/json', meta: { units: 'pages' } },
  ], coverage: { text: 'extracted' }, limitations: [], metrics: { stub: true, converter: job.converter } });
};
if (mode === 'ready') ready();
else if (mode === 'slow') setTimeout(ready, 600);
else if (mode === 'sleep') setInterval(() => {}, 1000);
else if (mode === 'failed') result({ status: 'failed', error: 'invalid_source', detail: 'stub says the source is broken' });
else if (mode === 'crash') process.exit(3);
else if (mode === 'undeclared') {
  writeFileSync(join(out, 'evil.sh'), '#!/bin/sh');
  result({ status: 'ready', outputs: [{ name: 'evil.sh', kind: 'x', media_type: 'text/plain' }] });
}
