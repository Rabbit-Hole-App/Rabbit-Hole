// After `npm ci`: install this machine's native builds that package-lock.json leaves out.
//   node scripts/ensure-natives.mjs
// A lockfile written on Windows records only the Windows builds of packages such as rolldown, lightningcss,
// @tailwindcss/oxide and workerd (npm/cli#4828), so `npm ci` on Linux installs none and vite cannot load its bundler.
// For every installed package, each optionalDependency built for this OS, CPU and libc that does not resolve from it is
// fetched with `npm pack` at the exact version the package pins, and unpacked into that package's own node_modules,
// so two versions of one parent (lightningcss at the root and under vite) each get their own build.
// No lockfile change, so the gated dependency set is unchanged. Where nothing is missing (Windows here) it does nothing.
// Since the r34 audit the lock pins every platform build (scripts/lock-natives.mjs), so this is a fallback that should
// find nothing; it prints what it added so a regression of the lock is visible in the run log. npm ci also drops an
// optional build silently when its download fails (gate run 38624979369, workerd on Windows); anything still missing
// after the fetch exits 1 naming the package and version.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Whether a native package's name targets this machine: its OS (workerd writes win32 as "windows"), its CPU (workerd
// writes x64 as "64") and its libc.
export const forThisMachine = (name, { platform, arch, musl }) => {
  const t = name.toLowerCase().split(/[-/@._]/);
  return (t.includes(platform) || (platform === 'win32' && t.includes('windows')))
    && (t.includes(arch) || (arch === 'x64' && t.includes('64'))) && t.includes('musl') === musl;
};

// packages: package-lock.json "packages"; has(dir, name): the name resolves from dir (its node_modules or an ancestor's).
export function missingNatives(packages, has, machine) {
  const out = [];
  for (const [dir, p] of Object.entries(packages))
    for (const [name, version] of Object.entries(p.optionalDependencies || {}))
      if (forThisMachine(name, machine) && !has(dir, name)) out.push({ dir, name, version });
  return out;
}

export function ensureNatives(root) {
  const machine = { platform: process.platform, arch: process.arch, musl: process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime };
  const has = (dir, name) => {
    for (let d = dir; ; d = d.includes('/node_modules/') ? d.slice(0, d.lastIndexOf('/node_modules/')) : '') {
      if (existsSync(join(root, d, 'node_modules', name, 'package.json'))) return true;
      if (!d) return false;
    }
  };
  const packages = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages;
  const missing = missingNatives(packages, has, machine);
  if (!missing.length) return [];
  const tmp = mkdtempSync(join(tmpdir(), 'natives-'));
  const errors = [];
  try {
    for (const { dir, name, version } of missing) {
      try {
        // execSync runs npm through a shell, so npm.cmd resolves on Windows. Git Bash's GNU tar reads "D:\..." after -f
        // as a remote host and cannot open a backslashed -C, so the archive stays relative to tmp and -C uses "/".
        const file = execSync(`npm pack ${name}@${version} --silent`, { cwd: tmp, encoding: 'utf8' }).trim().split('\n').at(-1);
        const into = join(root, dir, 'node_modules', name);
        mkdirSync(into, { recursive: true });
        execFileSync('tar', ['-xzf', file, '-C', into.replaceAll('\\', '/'), '--strip-components=1'], { cwd: tmp });
      } catch (e) { errors.push(`${name}@${version}: ${e.message.split('\n')[0]}`); }
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const left = missingNatives(packages, has, machine);
  if (left.length) throw new Error(`natives missing after install: ${left.map(m => `${m.name}@${m.version} (${m.dir || 'root'})`).join(', ')}${errors.length ? `; fetch failed: ${errors.join('; ')}` : ''}`);
  return missing;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const added = ensureNatives(fileURLToPath(new URL('..', import.meta.url)));
    console.log(added.length ? `✓ natives added: ${added.map(m => `${m.name}@${m.version} (${m.dir || 'root'})`).join(', ')}` : '✓ natives: nothing missing');
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  }
}
