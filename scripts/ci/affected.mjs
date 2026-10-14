// scripts/ci/affected.mjs - fast-tier selection. Compares HEAD with the newest green fast-tier run that is an ancestor
// (so pushes whose runs were cancelled are included), or the merge-base with main. Renames count both paths, deletes
// count the old path. An executable path with no class fails selection; it is never silently skipped.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
// Tokenized so an inserted `.*` is never rewritten by a later replacement.
const rx = g => new RegExp('^' + g.split(/(\*\*\/|\*\*|\*)/).map(t => t === '**/' ? '(?:.*/)?' : t === '**' ? '.*' : t === '*' ? '[^/]*'
  : t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
const any = (globs, p) => globs.some(g => rx(g).test(p));
export function classify(p, map) {
  if (any(map.docs, p)) return 'docs';
  if (any(map.broad, p)) return 'broad';
  if (Object.keys(map.mapped).some(g => rx(g).test(p)) || /^packages\/web\/e2e\/[^/]+-check\.mjs$/.test(p)) return 'mapped';
  if (any(map.none, p)) return 'none';
  return any(map.executable, p) ? 'unmapped' : 'none';
}
export function select(changes, map) {
  const linux = Object.keys(map.checks).filter(c => map.checks[c].runner !== 'windows-only');
  const checks = new Set(), reasons = [], unmapped = []; let broad = false;
  for (const c of changes) for (const p of [c.path, c.oldPath].filter(Boolean)) {
    const k = classify(p, map);
    if (k === 'broad') { broad = true; reasons.push(`${p}: broad`); }
    else if (k === 'unmapped') unmapped.push(p);
    else if (k === 'mapped') {
      const own = /^packages\/web\/e2e\/([^/]+-check\.mjs)$/.exec(p)?.[1];
      const hits = own ? [own] : Object.entries(map.mapped).filter(([g]) => rx(g).test(p)).flatMap(([, v]) => v);
      for (const h of hits) { checks.add(h); reasons.push(`${h}: ${p}`); }
    }
  }
  if (broad) linux.forEach(c => checks.add(c));
  return { checks: [...checks].filter(c => map.checks[c]?.runner !== 'windows-only').sort(), reasons, unmapped, broad,
    notCovered: [...checks, ...(broad ? Object.keys(map.checks) : [])].filter(c => map.checks[c]?.runner === 'windows-only').filter((c, i, a) => a.indexOf(c) === i) };
}
export function baseline({ head, greenShas, isAncestor, mergeBaseMain }) {
  return greenShas.find(s => s !== head && isAncestor(s, head)) ?? mergeBaseMain;
}
export function parts(checks, map, n) {
  const out = Array.from({ length: n }, () => []), load = Array(n).fill(0);
  for (const c of [...checks].sort((a, b) => (map.checks[b]?.seconds ?? 60) - (map.checks[a]?.seconds ?? 60) || a.localeCompare(b))) {
    const i = load.indexOf(Math.min(...load)); out[i].push(c); load[i] += map.checks[c]?.seconds ?? 60;
  }
  return out;
}
if (process.argv[1] && basename(process.argv[1]) === 'affected.mjs') {
  const arg = k => process.argv[process.argv.indexOf(k) + 1];
  const map = JSON.parse(readFileSync(new URL('./check-map.json', import.meta.url), 'utf8'));
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
  const head = git('rev-parse', 'HEAD');
  const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', 'fast-e2e.yml', '--branch', process.env.GITHUB_REF_NAME, '--status', 'success', '--limit', '30', '--json', 'headSha'], { encoding: 'utf8' }));
  const isAncestor = (a, b) => { try { execFileSync('git', ['merge-base', '--is-ancestor', a, b]); return true; } catch { return false; } };
  const base = baseline({ head, greenShas: runs.map(r => r.headSha), isAncestor, mergeBaseMain: git('merge-base', head, 'origin/main') });
  const changes = git('diff', '--name-status', '-M', base, head).split('\n').filter(Boolean).map(l => { const [s, a, b] = l.split('\t'); return s.startsWith('R') ? { status: 'R', oldPath: a, path: b } : { status: s[0], path: a }; });
  const s = select(changes, map);
  const mine = parts(s.checks, map, Number(arg('--of')))[Number(arg('--part')) - 1];
  console.log(JSON.stringify({ part: Number(arg('--part')), checks: mine, reasons: s.reasons, notCovered: s.notCovered, baseline: base, unmapped: s.unmapped }));
  if (s.unmapped.length) { console.error(`add ${s.unmapped.join(', ')} to scripts/ci/check-map.json (or mark it broad)`); process.exit(2); }
}
