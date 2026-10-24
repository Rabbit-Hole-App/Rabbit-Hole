// How canvas-file-drop-check.mjs reads one raw upload's answer: pass, transport-limited or fail. Pure, so it is unit tested
// (src/upload-response.test.mjs). A transport-limited answer never demonstrates the refusal; the caller says so.

// Fetch rejections with these undici cause codes are treated as a lost connection: UND_ERR_SOCKET "other side closed" on
// this local stack (webpage-card-check.mjs, CI run 39742142945) and ECONNRESET, Node's code for a TCP reset (58c185f6
// saw resets on these uploads but did not log their code). Any other rejection, EPIPE included, fails.
const LOST_CODES = new Set(['ECONNRESET', 'UND_ERR_SOCKET']);
// wrangler 4.150.0 ProxyWorker.js rejects a non-GET request when its forward to the user Worker drops ("Error inside
// ProxyWorker ... (failed after 1 attempt): Network connection lost." in app.log, gate run 40061648039 job 120776286858),
// and miniflare's entry.worker.js answers that rejection with new Response(e?.stack ?? String(e), { status: 500 }). Only
// that exact 500 text/plain body counts; any other 500 is a server failure.
const PROXY_LOST = /^Error: Network connection lost\.(\r?\n|$)/;

const excerptOf = text => (text || '').slice(0, 300);

// input: { status, contentType, text } for a response read in full; { error } for a rejected fetch; { status, contentType,
// error } when the headers arrived and reading the body failed. expected: { status, error } where error is the exact
// `error` field (string) or a RegExp for it; omit error to require only the status and a JSON body.
// -> { outcome: 'pass' | 'transport-limited' | 'fail', status, body, detail }
export function classifyUpload({ status, contentType = '', text = '', error }, expected) {
  const result = (outcome, reason, body) => ({ outcome, status, body,
    detail: `${status ?? 'no status'} ${contentType || 'no content-type'} ${reason}${text ? `: ${JSON.stringify(excerptOf(text))}` : ''}` });
  if (error) {
    const code = error.cause?.code || error.code;
    const where = status === undefined ? 'fetch rejected' : 'body read failed';
    return LOST_CODES.has(code) ? result('transport-limited', `${where} (${code})`) : result('fail', `${where} (${code || error.message})`);
  }
  if (status === 500 && /^text\/plain\b/i.test(contentType) && PROXY_LOST.test(text)) return result('transport-limited', 'wrangler ProxyWorker lost the connection to the Worker');
  // The expected status with its body cut short in transit (58c185f6): the status is seen, the error text is not.
  if (status === expected.status && text === '') return result('transport-limited', 'expected status, empty body');
  let body;
  try { body = JSON.parse(text); } catch { return result('fail', 'body is not JSON'); }
  if (status !== expected.status) return result('fail', `expected ${expected.status}`, body);
  const want = expected.error;
  if (want !== undefined && !(want instanceof RegExp ? want.test(body?.error ?? '') : body?.error === want)) return result('fail', 'unexpected error text', body);
  return result('pass', 'as expected', body);
}
