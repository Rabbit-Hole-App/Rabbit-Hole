// parse(kind, bytes, options): lane 2's parsers in a worker, so a 20,000-row workbook or a long document never blocks the
// canvas. One worker for the page, started on first use; where a worker cannot start (an old browser, a test), the same
// parser runs here instead. A parse error comes back as the parser's own visible line (and its code, e.g. 'encoding').
let worker = null, broken = false, next = 0;
const waiting = new Map();

function start() {
  if (worker || broken || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./file-parse.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const pending = waiting.get(data.id);
      if (!pending) return;
      waiting.delete(data.id);
      if (data.error != null) pending.reject(Object.assign(Error(data.error), data.code ? { code: data.code } : {}));
      else pending.resolve(data.result);
    };
    worker.onerror = () => {
      // A worker that fails to load answers nothing: everything waiting runs here, and so does what comes later.
      broken = true; worker = null;
      for (const [, pending] of waiting) pending.fallback();
      waiting.clear();
    };
  } catch { broken = true; worker = null; }
  return worker;
}

const here = async (kind, bytes, options) => (await import('./file-parse-core.js')).parseFile(kind, bytes, options);

export function parse(kind, bytes, options = {}) {
  const copy = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  if (!start()) return here(kind, copy, options);
  return new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, { resolve, reject, fallback: () => here(kind, copy, options).then(resolve, reject) });
    worker.postMessage({ id, kind, bytes: copy, options });
  });
}
