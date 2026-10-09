// The root package-lock.json must pin every platform's native build, with its registry integrity, so `npm ci` installs
// and verifies the right one on Windows and on the Linux runner alike. A lockfile written on Windows over an existing
// node_modules records only Windows builds (npm/cli#4828); re-resolving from scratch would move hundreds of versions.
// This adds exactly the missing platform packages at the versions their parents pin, from the registry's own metadata.
//   node scripts/lock-natives.mjs --check   exit 1 and list what is missing
//   node scripts/lock-natives.mjs --write   add the missing entries (network: registry GET only)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LOCK = fileURLToPath(new URL('../package-lock.json', import.meta.url));
const PLATFORM = /(^|[-/])(linux|darwin|win32|freebsd|android|openbsd|netbsd|sunos|aix|openharmony)([-_]|$)/;

// Node's resolution from a package at `key`: its own node_modules, then each enclosing node_modules up to the root.
const lookups = (key, name) => {
  const out = [`${key}/node_modules/${name}`];
  for (let k = key; k.includes('node_modules/');) { k = k.slice(0, k.lastIndexOf('node_modules/')).replace(/\/$/, ''); out.push(`${k ? `${k}/` : ''}node_modules/${name}`); }
  if (!out.includes(`node_modules/${name}`)) out.push(`node_modules/${name}`); // a workspace package resolves from the root too
  return out;
};

// -> [{ key, name, version, parent, dev }]: every platform optional dependency of a locked package that does not
// resolve to its pinned version. Where nothing of that name resolves, the entry is hoisted to the root; where another
// version would resolve first, it goes inside the parent, the nearest place, so the parent always gets its own.
export function missingNatives(packages) {
  const out = [];
  for (const [key, pkg] of Object.entries(packages)) {
    if (!key || !pkg.optionalDependencies) continue;
    for (const [name, version] of Object.entries(pkg.optionalDependencies)) {
      if (!PLATFORM.test(name)) continue;
      const places = lookups(key, name);
      const found = places.find(p => packages[p]);
      if (found && packages[found].version === version) continue;
      // Two parents pinning different versions of one missing package: the second goes inside its parent.
      const taken = m => m.key === places.at(-1);
      const at = found || out.some(m => taken(m) && m.version !== version) ? places[0] : places.at(-1);
      if (!out.some(m => m.key === at)) out.push({ key: at, name, version, parent: key, dev: !!pkg.dev });
    }
  }
  return out;
}

// The lock entry npm writes for an optional platform package, from the registry's version document.
export const lockEntry = (doc, { dev }) => Object.fromEntries(Object.entries({
  version: doc.version, resolved: doc.dist.tarball, integrity: doc.dist.integrity,
  cpu: doc.cpu, ...(dev ? { dev: true } : {}), license: doc.license, optional: true, os: doc.os, libc: doc.libc, engines: doc.engines,
}).filter(([, v]) => v !== undefined));

async function main() {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const missing = missingNatives(lock.packages).filter(m => /^\d+\.\d+\.\d+/.test(m.version));
  if (process.argv.includes('--check')) {
    for (const m of missing) console.error(`missing ${m.key}@${m.version} (optional dependency of ${m.parent})`);
    process.exitCode = missing.length ? 1 : 0;
    return;
  }
  for (const m of missing) {
    const r = await fetch(`https://registry.npmjs.org/${m.name.replace('/', '%2f')}/${m.version}`);
    if (!r.ok) throw new Error(`${m.name}@${m.version}: registry ${r.status}`);
    lock.packages[m.key] = lockEntry(await r.json(), m);
    console.log(`+ ${m.key}@${m.version}`);
  }
  lock.packages = Object.fromEntries(Object.entries(lock.packages).sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
