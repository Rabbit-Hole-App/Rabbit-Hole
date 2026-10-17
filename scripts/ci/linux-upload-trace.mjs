// Observe Node's existing transport without replacing fetch, touching bodies, or recording headers.
import { channel } from 'node:diagnostics_channel';
import { appendFileSync } from 'node:fs';
const output = process.env.UPLOAD_TRACE;
if (!output) throw Error('UPLOAD_TRACE is required');
const ids = new WeakMap(); let sequence = 0;
for (const phase of ['create', 'bodySent', 'headers', 'trailers', 'error']) {
  channel(`undici:request:${phase}`).subscribe(({ request, response, error }) => {
    if (!request || !request.path?.includes('/assets')) return;
    if (!ids.has(request)) ids.set(request, ++sequence);
    appendFileSync(output, JSON.stringify({ time: new Date().toISOString(), phase, id: ids.get(request), method: request.method,
      path: request.path.split('?')[0], status: response?.statusCode, errorCode: error?.code, errorName: error?.name }) + '\n');
  });
}
