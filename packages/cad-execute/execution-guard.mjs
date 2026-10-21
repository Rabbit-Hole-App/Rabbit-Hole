// The one rule for every runner of CAD model source (owner decision 2026-10-21, item 8): model-generated Python runs only
// inside the Linux sandbox (sandbox/cad-sandbox: namespaces plus cgroup limits). A scrubbed environment, a timeout or an
// import allow-list is not isolation. A committed fixture (handwritten, deterministic fixtures/*/model.py) may still run on a
// developer host. Any new local executor or shim must call executionRefusal before it spawns python.
// shortcut: a fixture is recognised by the bytes of fixtures/*/model.py in this checkout, so a locally edited fixture is
// trusted; upgrade to a pinned hash manifest if fixtures ever load from outside the repository.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { detect } from './sandbox/resource-control.mjs';

const FIXTURES = new URL('./fixtures/', import.meta.url);
// No slashes: the control plane's diagnostic redaction would turn a path into [path].
export const REFUSAL = 'Model-generated CAD source runs only inside the Linux sandbox: use the cad-execute Linux image with cgroup resource controls, or run a committed fixture.';

export const sandboxHost = () => ({ platform: process.platform, backend: detect().backend });
export const sandboxReady = ({ platform, backend }) => platform === 'linux' && !!backend;

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function isFixtureSource(source, dir = FIXTURES) {
  const hash = sha(source);
  return readdirSync(dir, { withFileTypes: true }).some(entry => {
    try { return entry.isDirectory() && sha(readFileSync(new URL(`${entry.name}/model.py`, dir))) === hash; } catch { return false; }
  });
}

// Returns null when `source` may run, else the one-line refusal. `sandboxed` is true only for a caller that runs the
// source through sandbox/cad-sandbox (server.mjs); a caller that spawns python directly on the host (local-fixtures.mjs)
// leaves it false and gets fixtures only, because a detected cgroup backend does not isolate a direct spawn.
export function executionRefusal(source, { sandboxed = false, host = sandboxHost } = {}) {
  if (isFixtureSource(source)) return null;
  return sandboxed && sandboxReady(host()) ? null : REFUSAL;
}
