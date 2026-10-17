// An upload's body for an R2 put with bounded memory and CPU (docs/features/canvas-file-imports.md section 7). On the Workers
// runtime a body with a Content-Length streams to R2 natively: the request body pipes into a FixedLengthStream of that length,
// so no chunk passes through JavaScript and nothing is held in the isolate. HTTP framing gives the Worker exactly the
// declared bytes, and FixedLengthStream errors on any other count, so the cap, checked against the declared length before a
// byte is read, holds on the bytes actually stored. A sniff reads only the first bytes, from one branch of a tee that is then
// cancelled. A body with no Content-Length (chunked) is read and counted, at most NO_LENGTH_LIMIT: past it the upload must
// say its length. Elsewhere (Node tests) every body is read and counted up to the cap.
// Measured on the dev clone 2026-10-16: the earlier JavaScript pass-through used 0.9-1.9 s of CPU per 50 MiB and was
// stopped with exceededCpu on 11 of 20 PUTs.
export const NO_LENGTH_LIMIT = 1024 * 1024;

async function readCounted(stream, limit) {
  const reader = stream.getReader(), chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  chunks.reduce((at, chunk) => { bytes.set(chunk, at); return at + chunk.byteLength; }, 0);
  return bytes;
}

async function readHead(stream, n) {
  const reader = stream.getReader(), chunks = [];
  let total = 0;
  while (total < n) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); total += value.byteLength; }
  // Not awaited: a tee branch's cancel settles only once the other branch is done too (the Streams spec), and the other
  // branch is the upload itself.
  reader.cancel().catch(() => {});
  const head = new Uint8Array(Math.min(total, n));
  let at = 0;
  for (const chunk of chunks) { const part = chunk.subarray(0, head.length - at); head.set(part, at); at += part.length; if (at >= head.length) break; }
  return head;
}

// { refused: 'over' | 'length' } or { head, body, length, streamed, piped }: `body` goes to R2 put as it is; `piped` settles
// when a streamed body has been fully handed over (it rejects when the client sent another count than it declared).
export async function uploadBody(req, { cap, sniffBytes = 0 }) {
  const declared = req.headers.get('content-length');
  const body = req.body || new Response(new Uint8Array(0)).body;
  if (declared !== null) {
    const length = Number(declared);
    if (!(Number.isInteger(length) && length >= 0 && length <= cap)) { await body.cancel().catch(() => {}); return { refused: 'over' }; }
    if (typeof FixedLengthStream === 'function') {
      let stream = body, head = new Uint8Array(0);
      if (sniffBytes) { const [peek, rest] = stream.tee(); head = await readHead(peek, sniffBytes); stream = rest; }
      const fixed = new FixedLengthStream(length);
      const piped = stream.pipeTo(fixed.writable);
      piped.catch(() => {});
      return { head, body: fixed.readable, length, streamed: true, piped };
    }
  }
  const limit = declared !== null ? cap : Math.min(cap, NO_LENGTH_LIMIT);
  const bytes = await readCounted(body, limit);
  if (!bytes) return { refused: limit === cap ? 'over' : 'length' };
  return { head: bytes.subarray(0, sniffBytes), body: bytes, length: bytes.byteLength, streamed: false, piped: Promise.resolve() };
}

// Whether a failed streamed put failed because the client's bytes did not match (not because R2 failed).
export const clientMismatch = async (got, error) => !!got?.streamed && (await got.piped.then(() => false, () => true) || /checksum|sha-?256|digest|length/i.test(String(error?.message)));
