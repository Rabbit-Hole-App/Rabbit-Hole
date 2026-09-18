// Browser Python for canvas code exercises (spec §16: Pyodide for lightweight
// Python). Loaded once from the CDN on first Run; each run gets a fresh
// globals dict so exercises cannot leak state into each other.
// ponytail: main-thread execution with no timeout - an infinite loop hangs the
// tab; move to a worker with interrupts when exercises grow beyond checks.

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
let loading = null;

function ensurePyodide() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${PYODIDE}pyodide.js`;
      script.onload = () => globalThis.loadPyodide({ indexURL: PYODIDE }).then(resolve, reject);
      script.onerror = () => reject(new Error('Could not load the Python runtime. Check your connection and retry.'));
      document.head.appendChild(script);
    });
    loading.catch(() => { loading = null; }); // allow a retry after a failed load
  }
  return loading;
}

export async function runPython(source) {
  const pyodide = await ensurePyodide();
  const out = [];
  pyodide.setStdout({ batched: line => out.push(line) });
  pyodide.setStderr({ batched: line => out.push(line) });
  const namespace = pyodide.globals.get('dict')();
  try {
    await pyodide.runPythonAsync(source, { globals: namespace });
    return { ok: true, output: out.join('\n') };
  } catch (error) {
    const lines = String(error?.message || error).split('\n').filter(Boolean);
    return { ok: false, output: out.join('\n'), error: lines.slice(-3).join('\n') };
  } finally {
    namespace.destroy();
  }
}
